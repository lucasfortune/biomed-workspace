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
import tifffile

from utils import extract_middle_slice, extract_slice, save_thumbnail_jpeg


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
