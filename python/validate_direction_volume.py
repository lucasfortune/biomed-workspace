#!/usr/bin/env python3
"""
Validate Direction Volume

Validates a direction vector volume TIFF against its class mask.

Checks:
- Shape (Z, Y, X, 3) matches class mask (Z, Y, X)
- Non-zero vectors have norm in [0.95, 1.05]
- Sign convention: dz >= 0
- Per-class coverage statistics

Usage:
    python validate_direction_volume.py --direction_volume <path> --class_mask <path>

Output:
    JSON to stdout (matches validate_tiff.py pattern)
"""

import sys
import json
import argparse
import numpy as np

try:
    import tifffile
except ImportError:
    print(json.dumps({
        'valid': False,
        'error': 'tifffile package not installed'
    }))
    sys.exit(1)


def validate_direction_volume(direction_volume_path, class_mask_path):
    """
    Validate a direction volume against its class mask.

    Returns dict with validation results.
    """
    result = {
        'valid': True,
        'errors': [],
        'warnings': [],
        'stats': {}
    }

    # Load direction volume
    try:
        dv = tifffile.imread(direction_volume_path)
    except Exception as e:
        result['valid'] = False
        result['errors'].append(f'Failed to load direction volume: {e}')
        return result

    # Load class mask
    try:
        cm = tifffile.imread(class_mask_path)
    except Exception as e:
        result['valid'] = False
        result['errors'].append(f'Failed to load class mask: {e}')
        return result

    # Check direction volume shape
    if dv.ndim != 4 or dv.shape[3] != 3:
        result['valid'] = False
        result['errors'].append(
            f'Direction volume must have shape (Z, Y, X, 3), got {dv.shape}'
        )
        return result

    # Check class mask shape
    if cm.ndim != 3:
        result['valid'] = False
        result['errors'].append(
            f'Class mask must have shape (Z, Y, X), got {cm.shape}'
        )
        return result

    # Check spatial dimensions match
    if dv.shape[:3] != cm.shape:
        result['valid'] = False
        result['errors'].append(
            f'Shape mismatch: direction volume {dv.shape[:3]} vs class mask {cm.shape}'
        )
        return result

    result['stats']['shape'] = list(dv.shape)
    result['stats']['dtype'] = str(dv.dtype)

    # Find non-zero vectors
    norms = np.linalg.norm(dv, axis=3)  # (Z, Y, X)
    nonzero_mask = norms > 1e-6
    nonzero_count = int(np.sum(nonzero_mask))

    result['stats']['total_voxels'] = int(np.prod(dv.shape[:3]))
    result['stats']['nonzero_vectors'] = nonzero_count

    if nonzero_count == 0:
        result['warnings'].append('Direction volume has no non-zero vectors')
        return result

    # Check unit norms for non-zero vectors
    nonzero_norms = norms[nonzero_mask]
    norm_min = float(np.min(nonzero_norms))
    norm_max = float(np.max(nonzero_norms))
    norm_mean = float(np.mean(nonzero_norms))

    result['stats']['norm_min'] = round(norm_min, 6)
    result['stats']['norm_max'] = round(norm_max, 6)
    result['stats']['norm_mean'] = round(norm_mean, 6)

    out_of_range = int(np.sum((nonzero_norms < 0.95) | (nonzero_norms > 1.05)))
    if out_of_range > 0:
        pct = round(100.0 * out_of_range / nonzero_count, 2)
        result['errors'].append(
            f'{out_of_range} vectors ({pct}%) have norm outside [0.95, 1.05]'
        )
        result['valid'] = False

    # Check sign convention: dz >= 0 for non-zero vectors
    dz = dv[:, :, :, 2]  # z-component
    sign_violations = int(np.sum(nonzero_mask & (dz < -1e-6)))
    if sign_violations > 0:
        pct = round(100.0 * sign_violations / nonzero_count, 2)
        result['errors'].append(
            f'{sign_violations} vectors ({pct}%) violate dz >= 0 sign convention'
        )
        result['valid'] = False

    # Per-class coverage
    unique_classes = np.unique(cm)
    unique_classes = unique_classes[unique_classes > 0]  # Exclude background

    per_class = {}
    for cls in unique_classes:
        cls_mask = cm == cls
        cls_voxels = int(np.sum(cls_mask))
        cls_assigned = int(np.sum(cls_mask & nonzero_mask))
        per_class[str(int(cls))] = {
            'total_voxels': cls_voxels,
            'assigned_voxels': cls_assigned,
            'coverage_percent': round(100.0 * cls_assigned / cls_voxels, 1) if cls_voxels > 0 else 0.0
        }

    result['stats']['per_class'] = per_class
    result['stats']['coverage_percent'] = round(
        100.0 * nonzero_count / int(np.sum(cm > 0)), 1
    ) if int(np.sum(cm > 0)) > 0 else 0.0

    return result


def main():
    parser = argparse.ArgumentParser(
        description='Validate direction volume TIFF'
    )
    parser.add_argument(
        '--direction_volume',
        required=True,
        help='Path to direction volume TIFF'
    )
    parser.add_argument(
        '--class_mask',
        required=True,
        help='Path to class mask TIFF'
    )

    args = parser.parse_args()
    result = validate_direction_volume(args.direction_volume, args.class_mask)
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
