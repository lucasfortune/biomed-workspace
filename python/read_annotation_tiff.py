#!/usr/bin/env python3
"""
Read Annotation TIFF

Reads an annotation TIFF file and extracts non-empty slices as base64-encoded data.
This is used to load unfinished annotations for resuming work.

Usage:
    python read_annotation_tiff.py <input.tif> <output.json>

Output JSON structure:
{
    "success": true,
    "width": 512,
    "height": 512,
    "slices": 64,
    "sliceData": {
        "0": {"encoding": "sparse", "pixels": "<base64>"},
        "5": {"encoding": "dense", "pixels": "<base64>"}
    }
}

Sparse encoding: 5 bytes per pixel (x_lo, x_hi, y_lo, y_hi, classId)
Used when: nonZeroPixels * 5 < width * height

Output:
    SUCCESS:<path> - on success
    ERROR:<message> - on failure
"""

import sys
import json
import base64
import numpy as np

# Try to import tifffile
try:
    import tifffile
    from tiff_validation_utils import safe_imread
except ImportError:
    print("ERROR:tifffile package not installed. Run: pip install tifffile")
    sys.exit(1)


def read_annotation_tiff(input_path: str, output_path: str) -> None:
    """
    Read annotation TIFF and output slice data as JSON.

    Args:
        input_path: Path to the annotation TIFF file
        output_path: Path to save the output JSON
    """
    try:
        # Read TIFF
        volume = safe_imread(input_path)
    except FileNotFoundError:
        print(f"ERROR:File not found: {input_path}")
        sys.exit(1)
    except Exception as e:
        print(f"ERROR:Failed to read TIFF: {e}")
        sys.exit(1)

    # Handle 2D case (single slice)
    if volume.ndim == 2:
        volume = volume[np.newaxis, ...]

    if volume.ndim != 3:
        print(f"ERROR:Unexpected TIFF dimensions: {volume.ndim}")
        sys.exit(1)

    slices, height, width = volume.shape

    # Ensure uint8
    if volume.dtype != np.uint8:
        # Clip to 0-255 and convert
        volume = np.clip(volume, 0, 255).astype(np.uint8)

    # Extract non-empty slices
    slice_data = {}
    sparse_count = 0
    dense_count = 0

    for i in range(slices):
        slice_array = volume[i]

        # Check if slice has any non-zero values
        if not np.any(slice_array):
            continue

        # Find non-zero pixels
        ys, xs = np.nonzero(slice_array)
        non_zero_count = len(xs)

        # Calculate sizes
        sparse_size = non_zero_count * 5
        dense_size = width * height

        if sparse_size < dense_size:
            # Use sparse encoding
            packed = bytearray()
            for x, y in zip(xs, ys):
                packed.extend([
                    x & 0xFF, x >> 8,
                    y & 0xFF, y >> 8,
                    slice_array[y, x]
                ])
            b64_data = base64.b64encode(bytes(packed)).decode('ascii')
            slice_data[str(i)] = {
                "encoding": "sparse",
                "pixels": b64_data
            }
            sparse_count += 1
        else:
            # Use dense encoding
            flat_array = slice_array.flatten()
            b64_data = base64.b64encode(flat_array.tobytes()).decode('ascii')
            slice_data[str(i)] = {
                "encoding": "dense",
                "pixels": b64_data
            }
            dense_count += 1

    # Create output JSON
    result = {
        "success": True,
        "width": width,
        "height": height,
        "slices": slices,
        "sliceData": slice_data,
        "annotatedSlices": len(slice_data)
    }

    try:
        with open(output_path, 'w') as f:
            json.dump(result, f)
    except Exception as e:
        print(f"ERROR:Failed to write output JSON: {e}")
        sys.exit(1)

    print(f"SUCCESS:{output_path}")
    print(f"INFO:Read annotation TIFF with {len(slice_data)} non-empty slices "
          f"({width}x{height}x{slices}), encoding: {sparse_count} sparse, {dense_count} dense")


def main():
    if len(sys.argv) != 3:
        print("Usage: python read_annotation_tiff.py <input.tif> <output.json>")
        sys.exit(1)

    input_path = sys.argv[1]
    output_path = sys.argv[2]

    read_annotation_tiff(input_path, output_path)


if __name__ == '__main__':
    main()
