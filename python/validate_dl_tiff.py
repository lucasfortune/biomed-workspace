#!/usr/bin/env python3
"""
TIFF Validation for Deep Learning Denoising Module

Validates TIFF files for compatibility with DL denoising:
- Checks dimensions (minimum 10 slices for training)
- Validates bit depth (8-bit or 16-bit)
- Returns image metadata for display

Usage:
    python validate_dl_tiff.py --input <path_to_tiff>

Output:
    JSON to stdout with validation result and image info.
"""

import argparse
import json
import sys
import os

from utils import format_size


def validate_tiff(input_path):
    """
    Validate a TIFF file for DL denoising.

    Args:
        input_path: Path to the TIFF file

    Returns:
        dict: Validation result with image info
    """
    result = {
        'valid': False,
        'errors': [],
        'warnings': [],
        'info': {
            'path': input_path,
            'filename': os.path.basename(input_path),
            'dimensions': None,
            'num_slices': None,
            'bit_depth': None,
            'dtype': None,
            'file_size': None,
            'file_size_formatted': None
        }
    }

    # Check file exists
    if not os.path.exists(input_path):
        result['errors'].append(f'File not found: {input_path}')
        return result

    # Get file size
    file_size = os.path.getsize(input_path)
    result['info']['file_size'] = file_size
    result['info']['file_size_formatted'] = format_size(file_size)

    try:
        import tifffile
        import numpy as np

        from tiff_validation_utils import safe_imread

        # Read TIFF file (safe_imread handles OME metadata mismatches)
        data = safe_imread(input_path)

        # Handle different dimensionalities
        if data.ndim == 2:
            # Single 2D image
            height, width = data.shape
            num_slices = 1
        elif data.ndim == 3:
            # 3D stack (slices, height, width)
            num_slices, height, width = data.shape
        elif data.ndim == 4:
            # 4D with channels (slices, channels, height, width) or similar
            # Take first interpretation
            num_slices = data.shape[0]
            height, width = data.shape[-2], data.shape[-1]
            result['warnings'].append(
                f'4D image detected with shape {data.shape}. '
                f'Using first axis as slices.'
            )
        else:
            result['errors'].append(
                f'Unsupported image dimensions: {data.ndim}D. '
                f'Expected 2D or 3D TIFF stack.'
            )
            return result

        # Store dimensions
        result['info']['dimensions'] = {
            'width': int(width),
            'height': int(height),
            'slices': int(num_slices)
        }
        result['info']['num_slices'] = int(num_slices)

        # Get dtype info
        dtype = data.dtype
        result['info']['dtype'] = str(dtype)

        # Determine bit depth
        if dtype == np.uint8:
            result['info']['bit_depth'] = 8
        elif dtype == np.uint16:
            result['info']['bit_depth'] = 16
        elif dtype == np.float32:
            result['info']['bit_depth'] = 32
            result['warnings'].append(
                'Float32 data detected. Will be normalized for training.'
            )
        elif dtype == np.float64:
            result['info']['bit_depth'] = 64
            result['warnings'].append(
                'Float64 data detected. Will be converted to float32.'
            )
        else:
            result['errors'].append(
                f'Unsupported data type: {dtype}. '
                f'Expected uint8, uint16, float32, or float64.'
            )
            return result

        # Validate minimum slices for training
        min_slices = 10
        if num_slices < min_slices:
            result['errors'].append(
                f'Insufficient slices for training: {num_slices}. '
                f'Minimum required: {min_slices} slices.'
            )

        # Validate minimum dimensions
        min_dim = 64
        if width < min_dim or height < min_dim:
            result['errors'].append(
                f'Image dimensions too small: {width}x{height}. '
                f'Minimum required: {min_dim}x{min_dim} pixels.'
            )

        # Add recommendations based on image size
        if num_slices >= min_slices:
            # Estimate patches per image based on dimensions
            patch_size = 64
            patches_x = max(1, width // patch_size)
            patches_y = max(1, height // patch_size)
            estimated_patches = patches_x * patches_y * num_slices

            result['info']['estimated_patches'] = estimated_patches
            result['info']['recommended_patches_per_image'] = min(
                200, max(50, estimated_patches // num_slices)
            )

        # Check if valid
        if not result['errors']:
            result['valid'] = True

    except ImportError as e:
        result['errors'].append(f'Missing required library: {e}')
    except Exception as e:
        result['errors'].append(f'Error reading TIFF file: {str(e)}')

    return result


def main():
    parser = argparse.ArgumentParser(
        description='Validate TIFF file for DL denoising'
    )
    parser.add_argument(
        '--input', '-i',
        required=True,
        help='Path to input TIFF file'
    )

    args = parser.parse_args()

    result = validate_tiff(args.input)

    # Output as JSON
    print(json.dumps(result, indent=2))

    # Exit with appropriate code
    sys.exit(0 if result['valid'] else 1)


if __name__ == '__main__':
    main()
