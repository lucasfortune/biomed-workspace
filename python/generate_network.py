#!/usr/bin/env python3
"""
Generate filament network from segmentation + direction volume.

Skeletonizes the filament class mask and builds a graph with direction-based
coloring (DTI convention: |dx|→R, |dy|→G, |dz|→B). Outputs network_data.json
for Three.js LineSegments visualization.

Usage:
    python generate_network.py --input <seg_tiff> --direction_vol <dir_tiff> \
        --output_dir <dir> --mesh_id <id> [--filament_class 2]

Output Protocol:
    NETWORK_PROGRESS:{"progress_percent": 50, "status": "Skeletonizing..."}
    NETWORK_RESULT:{"success": true, "output_path": "...", "statistics": {...}}
"""

import sys
import os
import json
import argparse
import numpy as np
import tifffile

try:
    from skimage.morphology import skeletonize
except ImportError:
    print("NETWORK_RESULT:" + json.dumps({
        "success": False,
        "error": "scikit-image not installed. Run: pip install scikit-image"
    }))
    sys.exit(1)


def emit_progress(progress_percent, status):
    """Emit progress update to stdout for Socket.IO."""
    progress = {
        "progress_percent": progress_percent,
        "status": status
    }
    print(f"NETWORK_PROGRESS:{json.dumps(progress)}", flush=True)


def emit_result(success, **kwargs):
    """Emit final result to stdout."""
    result = {"success": success, **kwargs}
    print(f"NETWORK_RESULT:{json.dumps(result)}", flush=True)


def load_volumes(seg_path, dir_path):
    """Load segmentation and direction volume TIFFs."""
    print(f"Loading segmentation from: {seg_path}", flush=True)
    seg = tifffile.imread(seg_path)
    if len(seg.shape) == 2:
        seg = seg[np.newaxis, :, :]
    print(f"Segmentation shape: {seg.shape}", flush=True)

    print(f"Loading direction volume from: {dir_path}", flush=True)
    dir_vol = tifffile.imread(dir_path)
    print(f"Direction volume shape: {dir_vol.shape}", flush=True)

    # Direction volume should be (Z, H, W, 3) or (3, Z, H, W)
    if dir_vol.ndim == 4:
        if dir_vol.shape[-1] == 3:
            pass  # already (Z, H, W, 3)
        elif dir_vol.shape[0] == 3:
            dir_vol = np.transpose(dir_vol, (1, 2, 3, 0))  # (3,Z,H,W) -> (Z,H,W,3)
        else:
            print(f"Warning: Unexpected direction volume shape {dir_vol.shape}, assuming last dim is direction", flush=True)
    else:
        print(f"Warning: Direction volume has {dir_vol.ndim} dimensions, expected 4", flush=True)
        dir_vol = None

    return seg, dir_vol


def build_network(skeleton, dir_vol, shape):
    """
    Build graph edges from skeleton voxels using 26-connectivity.

    Returns positions (flat [x0,y0,z0, x1,y1,z1, ...]) and colors
    (flat [r0,g0,b0, r1,g1,b1, ...]) for each line segment endpoint pair.
    Also returns per-slice bucket info.
    """
    Z, H, W = shape

    # Get skeleton voxel coordinates as a set for O(1) neighbor lookup
    skel_coords = np.argwhere(skeleton > 0)  # (N, 3) as [z, y, x]
    print(f"Skeleton voxels: {len(skel_coords)}", flush=True)

    if len(skel_coords) == 0:
        return [], [], {}, 0, 0

    skel_set = set(map(tuple, skel_coords))

    # 13 forward offsets for 26-connectivity (avoids duplicate edges)
    offsets = []
    for dz in range(-1, 2):
        for dy in range(-1, 2):
            for dx in range(-1, 2):
                if (dz, dy, dx) == (0, 0, 0):
                    continue
                # Only keep forward half: lexicographic (dz,dy,dx) > (0,0,0)
                if (dz, dy, dx) > (0, 0, 0):
                    offsets.append((dz, dy, dx))

    # Build edges: for each voxel, check forward neighbors
    edges = []

    for z, y, x in skel_coords:
        for dz, dy, dx in offsets:
            nz, ny, nx = z + dz, y + dy, x + dx
            if (nz, ny, nx) in skel_set:
                edges.append(((z, y, x), (nz, ny, nx)))

    print(f"Network edges: {len(edges)}", flush=True)

    if len(edges) == 0:
        return [], [], {}, len(skel_coords), 0

    # Build position and color arrays
    # Each edge = 2 endpoints, each with (x, y, z) position and (r, g, b) color
    # Positions stored as [x0,y0,z0, x1,y1,z1, ...] for LineSegments geometry
    positions = []
    colors = []

    # Per-slice buckets: bucket by midpoint z
    slice_edges = {}  # z_slice -> list of edge indices

    for edge_idx, ((z0, y0, x0), (z1, y1, x1)) in enumerate(edges):
        # Positions: use (x=col, y=row, z=slice) convention matching mesh voxels
        positions.extend([float(x0), float(y0), float(z0)])
        positions.extend([float(x1), float(y1), float(z1)])

        # Color from direction at midpoint (or average of endpoints)
        if dir_vol is not None:
            # Sample direction at both endpoints and average
            d0 = dir_vol[z0, y0, x0]  # (3,) = (dx, dy, dz)
            d1 = dir_vol[z1, y1, x1]
            d_avg = (d0 + d1) / 2.0
            # DTI coloring: |dx|→R, |dy|→G, |dz|→B
            abs_d = np.abs(d_avg)
            norm = np.linalg.norm(abs_d)
            if norm > 0:
                abs_d = abs_d / norm
            r, g, b = float(abs_d[0]), float(abs_d[1]), float(abs_d[2])
        else:
            # Fallback: uniform white
            r, g, b = 1.0, 1.0, 1.0

        # Both endpoints get the same color (per-edge coloring)
        colors.extend([r, g, b])
        colors.extend([r, g, b])

        # Bucket by midpoint z-slice
        mid_z = int(round((z0 + z1) / 2.0))
        mid_z = max(0, min(Z - 1, mid_z))
        if mid_z not in slice_edges:
            slice_edges[mid_z] = []
        slice_edges[mid_z].append(edge_idx)

    # Convert slice_edges to sliceBuckets format
    # Each edge contributes 2 vertices (6 float values in positions, 6 in colors)
    # sliceBuckets maps z -> {start: vertex_index, count: num_vertices}
    slice_buckets = {}
    # We need to reorder positions/colors by z-bucket for efficient slicing
    sorted_positions = []
    sorted_colors = []
    current_start = 0

    for z_slice in range(Z):
        if z_slice in slice_edges:
            edge_indices = slice_edges[z_slice]
            count = len(edge_indices) * 2  # 2 vertices per edge
            slice_buckets[str(z_slice)] = {
                "start": current_start,
                "count": count
            }
            for ei in edge_indices:
                # Each edge has 2 vertices at positions[ei*6 : ei*6+6]
                base = ei * 6
                sorted_positions.extend(positions[base:base + 6])
                sorted_colors.extend(colors[base:base + 6])
            current_start += count

    return sorted_positions, sorted_colors, slice_buckets, len(skel_coords), len(edges)


def main():
    parser = argparse.ArgumentParser(description='Generate filament network from segmentation + direction volume')
    parser.add_argument('--input', required=True, help='Path to segmentation TIFF')
    parser.add_argument('--direction_vol', required=True, help='Path to direction volume TIFF')
    parser.add_argument('--output_dir', required=True, help='Output directory')
    parser.add_argument('--mesh_id', required=True, help='Mesh ID')
    parser.add_argument('--filament_class', type=int, default=2, help='Filament class ID (default: 2)')

    args = parser.parse_args()

    try:
        # Create output directory
        os.makedirs(args.output_dir, exist_ok=True)

        # Load volumes
        emit_progress(5, "Loading volumes...")
        seg, dir_vol = load_volumes(args.input, args.direction_vol)

        # Extract filament mask
        emit_progress(10, f"Extracting filament class {args.filament_class}...")
        mask = (seg == args.filament_class).astype(np.uint8)
        filament_voxels = int(np.sum(mask))
        print(f"Filament voxels (class {args.filament_class}): {filament_voxels}", flush=True)

        if filament_voxels == 0:
            emit_result(False, error=f"No voxels found for filament class {args.filament_class}")
            return

        # Skeletonize
        emit_progress(20, "Skeletonizing filament mask...")
        skeleton = skeletonize(mask)
        skeleton_voxels = int(np.sum(skeleton > 0))
        print(f"Skeleton voxels: {skeleton_voxels}", flush=True)

        if skeleton_voxels == 0:
            emit_result(False, error="Skeletonization produced empty result")
            return

        # Build network graph
        emit_progress(50, "Building network graph...")
        positions, colors, slice_buckets, node_count, edge_count = build_network(
            skeleton, dir_vol, seg.shape
        )

        if edge_count == 0:
            print("Warning: No edges found, network may be too sparse", flush=True)

        # Build output JSON
        emit_progress(80, "Writing network data...")
        network_data = {
            "metadata": {
                "type": "FilamentNetwork",
                "version": "1.0",
                "nodeCount": node_count,
                "edgeCount": edge_count,
                "filamentClass": args.filament_class,
                "shape": list(seg.shape),
                "sliceCount": int(seg.shape[0])
            },
            "positions": positions,
            "colors": colors,
            "sliceBuckets": slice_buckets
        }

        output_path = os.path.join(args.output_dir, 'network_data.json')
        with open(output_path, 'w') as f:
            json.dump(network_data, f)

        file_size = os.path.getsize(output_path)
        print(f"Network data written: {output_path} ({file_size / 1024 / 1024:.1f} MB)", flush=True)

        emit_progress(100, "Complete")
        emit_result(
            True,
            output_path=output_path,
            statistics={
                "nodeCount": node_count,
                "edgeCount": edge_count,
                "filamentVoxels": filament_voxels,
                "skeletonVoxels": skeleton_voxels,
                "fileSizeMB": round(file_size / 1024 / 1024, 2)
            }
        )

    except Exception as e:
        import traceback
        traceback.print_exc()
        emit_result(False, error=str(e))
        sys.exit(1)


if __name__ == "__main__":
    main()
