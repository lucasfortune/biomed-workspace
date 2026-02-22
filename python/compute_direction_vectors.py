#!/usr/bin/env python3
"""
Compute Direction Vectors

Converts filament centerpoint annotations into a float32 direction vector volume
(Z, Y, X, 3) for training a direction-aware U-Net.

Algorithm:
1. Load filaments from JSON, filter to those with points
2. For each filament: interpolate gaps, compute tangent vectors via finite differences
3. For each z-slice: assign nearest centerline tangent to each class-mask voxel
4. Write float32 TIFF (Z, Y, X, 3)

Usage:
    python compute_direction_vectors.py --filaments_json <path> --class_mask <path> --output <path> [--smoothing_k 2]

Output protocol (matches create_annotation_tiff.py):
    SUCCESS:<path>
    STATS:<json>
    ERROR:<message>
"""

import sys
import json
import argparse
import numpy as np

try:
    import tifffile
except ImportError:
    print("ERROR:tifffile package not installed. Run: pip install tifffile")
    sys.exit(1)

try:
    from scipy.spatial import cKDTree
except ImportError:
    print("ERROR:scipy package not installed. Run: pip install scipy")
    sys.exit(1)


def normalize(v):
    """Normalize a vector, returning zero vector if norm is zero."""
    norm = np.linalg.norm(v)
    if norm < 1e-12:
        return np.zeros_like(v)
    return v / norm


def orient_tangent(t):
    """Orient tangent so dz >= 0. Tie-break: dy >= 0, then dx >= 0."""
    if t[2] < 0:
        t = -t
    elif t[2] == 0:
        if t[1] < 0:
            t = -t
        elif t[1] == 0 and t[0] < 0:
            t = -t
    return t


def interpolate_filament(points_dict):
    """
    Interpolate gaps between annotated z-slices with linear interpolation.

    Args:
        points_dict: dict mapping z-index (int) to (x, y) coords

    Returns:
        dict mapping z-index (int) to (x, y) for all z in range [min_z, max_z]
    """
    if len(points_dict) <= 1:
        return dict(points_dict)

    z_sorted = sorted(points_dict.keys())
    interpolated = {}

    for i in range(len(z_sorted)):
        z = z_sorted[i]
        interpolated[z] = points_dict[z]

        # Interpolate gap to next annotated z
        if i < len(z_sorted) - 1:
            z_next = z_sorted[i + 1]
            if z_next - z > 1:
                x0, y0 = points_dict[z]
                x1, y1 = points_dict[z_next]
                for z_mid in range(z + 1, z_next):
                    t = (z_mid - z) / (z_next - z)
                    interpolated[z_mid] = (
                        x0 + t * (x1 - x0),
                        y0 + t * (y1 - y0)
                    )

    return interpolated


def compute_tangents(interpolated_points, smoothing_k):
    """
    Compute tangent vectors via finite differences with smoothing window.

    Args:
        interpolated_points: dict mapping z (int) to (x, y)
        smoothing_k: smoothing window half-width

    Returns:
        dict mapping z (int) to normalized tangent vector (dx, dy, dz)
    """
    if len(interpolated_points) == 0:
        return {}

    z_sorted = sorted(interpolated_points.keys())
    tangents = {}

    if len(z_sorted) == 1:
        # Single point: default tangent along z-axis
        tangents[z_sorted[0]] = np.array([0.0, 0.0, 1.0])
        return tangents

    for idx, z in enumerate(z_sorted):
        # Find the furthest reachable indices within smoothing_k
        lo = max(0, idx - smoothing_k)
        hi = min(len(z_sorted) - 1, idx + smoothing_k)

        # Ensure we have two distinct points for a difference
        if lo == hi:
            if lo > 0:
                lo = lo - 1
            else:
                hi = hi + 1

        z_lo = z_sorted[lo]
        z_hi = z_sorted[hi]
        x_lo, y_lo = interpolated_points[z_lo]
        x_hi, y_hi = interpolated_points[z_hi]

        raw = np.array([x_hi - x_lo, y_hi - y_lo, float(z_hi - z_lo)])
        t = normalize(raw)

        # Handle degenerate case (all zeros after normalize)
        if np.linalg.norm(t) < 0.5:
            t = np.array([0.0, 0.0, 1.0])

        t = orient_tangent(t)
        tangents[z] = t

    return tangents


def compute_direction_volume(filaments_json_path, class_mask_path, output_path, smoothing_k=2):
    """
    Main computation: filaments JSON + class mask -> direction volume TIFF.

    Args:
        filaments_json_path: Path to _filaments.json
        class_mask_path: Path to class mask TIFF (Z, Y, X) uint8
        output_path: Path for output float32 TIFF (Z, Y, X, 3)
        smoothing_k: Smoothing window half-width for tangent computation
    """
    # Load filaments
    try:
        with open(filaments_json_path, 'r') as f:
            fil_data = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError) as e:
        print(f"ERROR:Failed to load filaments JSON: {e}")
        sys.exit(1)

    filaments = fil_data.get('filaments', [])
    if not filaments:
        print("ERROR:No filaments found in JSON")
        sys.exit(1)

    # Filter to filaments with points
    filaments_with_points = [f for f in filaments if f.get('points') and len(f['points']) > 0]
    if not filaments_with_points:
        print("ERROR:No filaments with centerpoints found")
        sys.exit(1)

    # Load class mask
    try:
        class_mask = tifffile.imread(class_mask_path)
    except Exception as e:
        print(f"ERROR:Failed to load class mask TIFF: {e}")
        sys.exit(1)

    if class_mask.ndim != 3:
        print(f"ERROR:Class mask must be 3D (Z, Y, X), got shape {class_mask.shape}")
        sys.exit(1)

    nz, ny, nx = class_mask.shape

    # Build per-filament centerline data: interpolated points + tangents
    # Group by classId
    class_centerlines = {}  # classId -> list of (z, x, y, tangent)

    for fil in filaments_with_points:
        class_id = fil.get('classId', 0)
        points_raw = fil['points']

        # Parse points: keys are string z-indices, values are {x, y}
        points_dict = {}
        for z_str, coord in points_raw.items():
            try:
                z = int(z_str)
                x = float(coord['x'])
                y = float(coord['y'])
                points_dict[z] = (x, y)
            except (ValueError, KeyError, TypeError):
                continue

        if not points_dict:
            continue

        # Interpolate gaps
        interpolated = interpolate_filament(points_dict)

        # Compute tangents
        tangents = compute_tangents(interpolated, smoothing_k)

        # Collect centerline points for this class
        if class_id not in class_centerlines:
            class_centerlines[class_id] = []

        for z in interpolated:
            if z in tangents:
                x, y = interpolated[z]
                class_centerlines[class_id].append((z, x, y, tangents[z]))

    # Create output volume (Z, Y, X, 3) float32
    direction_volume = np.zeros((nz, ny, nx, 3), dtype=np.float32)

    stats = {
        'total_filaments': len(filaments_with_points),
        'classes_processed': 0,
        'total_voxels_assigned': 0,
        'total_class_voxels': 0,
        'per_class': {}
    }

    # For each class, assign tangent vectors to mask voxels
    for class_id, centerline_points in class_centerlines.items():
        if not centerline_points:
            continue

        stats['classes_processed'] += 1

        # Group centerline points by z-slice for efficient lookup
        centerline_by_z = {}
        for z, x, y, tangent in centerline_points:
            if z not in centerline_by_z:
                centerline_by_z[z] = []
            centerline_by_z[z].append((x, y, tangent))

        class_voxels_total = 0
        class_voxels_assigned = 0

        # Process each z-slice
        for z in range(nz):
            # Find voxels in class mask matching this classId
            mask_slice = class_mask[z]
            vy, vx = np.where(mask_slice == class_id)

            if len(vy) == 0:
                continue

            class_voxels_total += len(vy)

            # Find centerline points on this slice
            if z not in centerline_by_z:
                # No centerline on this slice - skip (leave as zero)
                continue

            cl_points = centerline_by_z[z]
            cl_coords = np.array([[p[0], p[1]] for p in cl_points])  # (N, 2) x,y
            cl_tangents = np.array([p[2] for p in cl_points])        # (N, 3)

            # Build KD-tree from centerline points on this slice
            tree = cKDTree(cl_coords)

            # Query nearest centerline point for each mask voxel
            voxel_coords = np.column_stack([vx, vy]).astype(float)  # (M, 2) x,y
            _, indices = tree.query(voxel_coords)

            # Assign tangent vectors
            assigned_tangents = cl_tangents[indices]  # (M, 3)
            direction_volume[z, vy, vx] = assigned_tangents
            class_voxels_assigned += len(vy)

        stats['per_class'][str(class_id)] = {
            'total_voxels': int(class_voxels_total),
            'assigned_voxels': int(class_voxels_assigned),
            'coverage_percent': round(
                100.0 * class_voxels_assigned / class_voxels_total, 1
            ) if class_voxels_total > 0 else 0.0,
            'centerline_points': len(centerline_points)
        }
        stats['total_voxels_assigned'] += class_voxels_assigned
        stats['total_class_voxels'] += class_voxels_total

    # Compute overall coverage
    stats['coverage_percent'] = round(
        100.0 * stats['total_voxels_assigned'] / stats['total_class_voxels'], 1
    ) if stats['total_class_voxels'] > 0 else 0.0

    # Write output TIFF
    try:
        tifffile.imwrite(
            output_path,
            direction_volume,
            photometric='minisblack',
            bigtiff=direction_volume.nbytes > 2**31 - 1
        )
    except Exception as e:
        print(f"ERROR:Failed to write direction volume TIFF: {e}")
        sys.exit(1)

    print(f"SUCCESS:{output_path}")
    print(f"STATS:{json.dumps(stats)}")


def main():
    parser = argparse.ArgumentParser(
        description='Compute direction vectors from filament centerpoints'
    )
    parser.add_argument(
        '--filaments_json',
        required=True,
        help='Path to filaments JSON sidecar'
    )
    parser.add_argument(
        '--class_mask',
        required=True,
        help='Path to class mask TIFF (Z, Y, X)'
    )
    parser.add_argument(
        '--output',
        required=True,
        help='Path for output direction volume TIFF'
    )
    parser.add_argument(
        '--smoothing_k',
        type=int,
        default=2,
        help='Smoothing window half-width for tangent computation (default: 2)'
    )

    args = parser.parse_args()
    compute_direction_volume(args.filaments_json, args.class_mask, args.output, args.smoothing_k)


if __name__ == '__main__':
    main()
