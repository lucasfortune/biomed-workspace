#!/usr/bin/env python3
"""
Generate 120x120px JPEG thumbnail from TIFF file.
Extracts middle slice from 3D TIFF stacks.

Usage:
    python generate_thumbnail.py <input_tiff> <output_jpeg> [slice_index]

Outputs:
    SUCCESS:<output_path> on success
    ERROR:<message> on failure
"""

import sys
import numpy as np
import tifffile
from PIL import Image

from utils import extract_middle_slice, extract_slice, save_thumbnail_jpeg


def generate_direction_volume_thumbnail(img, output_path, slice_index=None, size=120):
    """
    Generate an RGB thumbnail from a 4D direction volume (Z, Y, X, 3).

    Uses DTI colormap convention: |dx| → Red, |dy| → Green, |dz| → Blue.

    Args:
        img: 4D NumPy array with shape (Z, Y, X, 3)
        output_path: Path to output JPEG file
        slice_index: Optional slice index (default: middle slice)
        size: Target thumbnail size in pixels

    Returns:
        Output path on success
    """
    if slice_index is not None:
        if slice_index < 0 or slice_index >= img.shape[0]:
            raise ValueError(f"Slice index {slice_index} out of range (0-{img.shape[0]-1})")
        direction_slice = img[slice_index]
    else:
        middle_idx = img.shape[0] // 2
        direction_slice = img[middle_idx]

    # DTI colormap: |dx|, |dy|, |dz| → R, G, B
    abs_dirs = np.abs(direction_slice).astype(np.float64)
    max_val = abs_dirs.max()
    if max_val > 0:
        abs_dirs = abs_dirs / max_val
    rgb = (abs_dirs * 255).astype(np.uint8)

    pil_img = Image.fromarray(rgb, mode='RGB')
    pil_img.thumbnail((size, size), Image.Resampling.LANCZOS)
    pil_img.save(output_path, "JPEG", quality=85)
    return output_path


def generate_thumbnail(input_path, output_path, slice_index=None):
    """
    Generate 120x120px JPEG thumbnail from TIFF.

    Args:
        input_path: Path to input TIFF file
        output_path: Path to output JPEG file
        slice_index: Optional slice index (default: middle slice for 3D)

    Returns:
        Output path on success

    Raises:
        Exception on any error
    """
    # Load TIFF
    img = tifffile.imread(input_path)

    # Handle 4D direction volumes (Z, Y, X, 3)
    if img.ndim == 4 and img.shape[-1] == 3:
        return generate_direction_volume_thumbnail(img, output_path, slice_index)

    # Extract appropriate slice
    if slice_index is not None:
        img_2d = extract_slice(img, slice_index)
    else:
        img_2d = extract_middle_slice(img)

    # Create and save thumbnail using shared utility
    return save_thumbnail_jpeg(img_2d, output_path, size=120, quality=85)

def main():
    if len(sys.argv) < 3:
        print("ERROR:Missing arguments. Usage: generate_thumbnail.py <input> <output> [slice]")
        sys.exit(1)

    input_path = sys.argv[1]
    output_path = sys.argv[2]
    slice_index = int(sys.argv[3]) if len(sys.argv) > 3 else None

    try:
        result = generate_thumbnail(input_path, output_path, slice_index)
        print(f"SUCCESS:{result}")
    except Exception as e:
        print(f"ERROR:{str(e)}")
        sys.exit(1)

if __name__ == "__main__":
    main()
