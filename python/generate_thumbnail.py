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
from PIL import Image
import tifffile

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

    # Handle 3D: extract slice
    if len(img.shape) == 3:
        if slice_index is None:
            slice_index = img.shape[0] // 2
        img = img[slice_index]

    # Handle 2D images
    if len(img.shape) != 2:
        raise ValueError(f"Expected 2D or 3D image, got shape {img.shape}")

    # Normalize to 0-255
    img_min = img.min()
    img_max = img.max()

    if img_max > img_min:
        img = ((img - img_min) / (img_max - img_min) * 255).astype(np.uint8)
    else:
        img = np.zeros_like(img, dtype=np.uint8)

    # Convert to PIL Image
    pil_img = Image.fromarray(img)

    # Resize to 120x120 (maintain aspect ratio, crop if needed)
    pil_img.thumbnail((120, 120), Image.Resampling.LANCZOS)

    # Save as JPEG
    pil_img.save(output_path, "JPEG", quality=85)

    return output_path

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
