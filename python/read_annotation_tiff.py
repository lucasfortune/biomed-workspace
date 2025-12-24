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
        "0": "<base64 encoded Uint8Array>",
        "5": "<base64 encoded Uint8Array>"
    }
}

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
        volume = tifffile.imread(input_path)
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

    for i in range(slices):
        slice_array = volume[i]

        # Check if slice has any non-zero values
        if np.any(slice_array):
            # Flatten to 1D and encode as base64
            flat_array = slice_array.flatten()
            b64_data = base64.b64encode(flat_array.tobytes()).decode('ascii')
            slice_data[str(i)] = b64_data

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
          f"({width}x{height}x{slices})")


def main():
    if len(sys.argv) != 3:
        print("Usage: python read_annotation_tiff.py <input.tif> <output.json>")
        sys.exit(1)

    input_path = sys.argv[1]
    output_path = sys.argv[2]

    read_annotation_tiff(input_path, output_path)


if __name__ == '__main__':
    main()
