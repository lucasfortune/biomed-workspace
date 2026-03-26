#!/usr/bin/env python3
"""
Extract full-resolution slice from TIFF as PNG for Annotation module.

Unlike extract_slice.py which scales images for display, this script
preserves the original resolution for pixel-perfect annotation.

Usage:
    python extract_raw_slice.py <input_tiff> <slice_index> <output_png>

Outputs:
    SUCCESS:<output_path> on success
    ERROR:<message> on failure

Notes:
    - Output is always PNG (lossless compression)
    - No resizing is applied - original dimensions preserved
    - Data is normalized to 8-bit (0-255) for display
"""

import sys
import numpy as np
from PIL import Image
import tifffile
from tiff_validation_utils import safe_imread


def extract_raw_slice(input_path, slice_index, output_path):
    """
    Extract a single slice from TIFF at full resolution and save as PNG.

    Args:
        input_path: Path to input TIFF file
        slice_index: Index of slice to extract (0-based)
        output_path: Path to output PNG file

    Returns:
        Output path on success

    Raises:
        Exception on any error
    """
    # Load TIFF
    img = safe_imread(input_path)

    # Handle 3D: extract slice
    if len(img.shape) == 3:
        if slice_index < 0 or slice_index >= img.shape[0]:
            raise ValueError(f"Slice index {slice_index} out of range (0-{img.shape[0]-1})")
        img = img[slice_index]
    elif len(img.shape) == 2:
        if slice_index != 0:
            raise ValueError(f"2D image only has slice 0, requested {slice_index}")
    else:
        raise ValueError(f"Expected 2D or 3D image, got shape {img.shape}")

    # Normalize to 0-255 for display
    img_min = float(img.min())
    img_max = float(img.max())

    if img_max > img_min:
        img_normalized = ((img - img_min) / (img_max - img_min) * 255).astype(np.uint8)
    else:
        # Handle constant images (all same value)
        img_normalized = np.zeros_like(img, dtype=np.uint8)

    # Convert to PIL Image
    pil_img = Image.fromarray(img_normalized)

    # Save as PNG (lossless, no resizing)
    pil_img.save(output_path, "PNG", compress_level=6)

    return output_path


def main():
    if len(sys.argv) < 4:
        print("ERROR:Missing arguments. Usage: extract_raw_slice.py <input_tiff> <slice_index> <output_png>")
        sys.exit(1)

    input_path = sys.argv[1]

    try:
        slice_index = int(sys.argv[2])
    except ValueError:
        print(f"ERROR:Invalid slice index: {sys.argv[2]}")
        sys.exit(1)

    output_path = sys.argv[3]

    try:
        result = extract_raw_slice(input_path, slice_index, output_path)
        print(f"SUCCESS:{result}")
    except FileNotFoundError:
        print(f"ERROR:Input file not found: {input_path}")
        sys.exit(1)
    except Exception as e:
        print(f"ERROR:{str(e)}")
        sys.exit(1)


if __name__ == "__main__":
    main()
