#!/usr/bin/env python3
"""
Create Annotation TIFF

Creates a TIFF file from annotation data provided as a JSON config.
The config contains base64-encoded annotation data for each annotated slice.

Usage:
    python create_annotation_tiff.py --config <config.json> --output <output.tif>

Config JSON structure:
{
    "width": 512,
    "height": 512,
    "slices": 64,
    "sliceData": {
        "0": "<base64 encoded Uint8Array>",
        "5": "<base64 encoded Uint8Array>",
        ...
    }
}

Output:
    SUCCESS:<path> - on success
    ERROR:<message> - on failure
"""

import sys
import json
import base64
import argparse
import numpy as np

# Try to import tifffile
try:
    import tifffile
except ImportError:
    print("ERROR:tifffile package not installed. Run: pip install tifffile")
    sys.exit(1)


def create_annotation_tiff(config_path: str, output_path: str) -> None:
    """
    Create an annotation TIFF from config JSON.

    Args:
        config_path: Path to the config JSON file
        output_path: Path to save the output TIFF
    """
    # Read config
    try:
        with open(config_path, 'r') as f:
            config = json.load(f)
    except FileNotFoundError:
        print(f"ERROR:Config file not found: {config_path}")
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"ERROR:Invalid JSON in config file: {e}")
        sys.exit(1)

    # Extract dimensions
    width = config.get('width')
    height = config.get('height')
    slices = config.get('slices')
    slice_data = config.get('sliceData', {})

    # Validate dimensions
    if not all([width, height, slices]):
        print("ERROR:Config missing required fields: width, height, slices")
        sys.exit(1)

    if width <= 0 or height <= 0 or slices <= 0:
        print(f"ERROR:Invalid dimensions: {width}x{height}x{slices}")
        sys.exit(1)

    # Create empty volume (slices, height, width) initialized to 0
    # Use uint8 for class IDs (0-255 classes supported)
    volume = np.zeros((slices, height, width), dtype=np.uint8)

    # Fill in annotated slices
    for slice_idx_str, b64_data in slice_data.items():
        try:
            slice_idx = int(slice_idx_str)
        except ValueError:
            print(f"ERROR:Invalid slice index: {slice_idx_str}")
            sys.exit(1)

        if slice_idx < 0 or slice_idx >= slices:
            print(f"ERROR:Slice index out of range: {slice_idx} (max: {slices - 1})")
            sys.exit(1)

        try:
            # Decode base64 to bytes
            raw_bytes = base64.b64decode(b64_data)

            # Convert to numpy array
            slice_array = np.frombuffer(raw_bytes, dtype=np.uint8)

            # Verify size matches
            expected_size = width * height
            if len(slice_array) != expected_size:
                print(f"ERROR:Slice {slice_idx} data size mismatch. "
                      f"Expected {expected_size}, got {len(slice_array)}")
                sys.exit(1)

            # Reshape and assign to volume
            volume[slice_idx] = slice_array.reshape((height, width))

        except Exception as e:
            print(f"ERROR:Failed to decode slice {slice_idx}: {e}")
            sys.exit(1)

    # Save as TIFF
    try:
        # Use bigtiff=True for large files, compression for space savings
        tifffile.imwrite(
            output_path,
            volume,
            photometric='minisblack',
            compression='zlib',
            bigtiff=volume.nbytes > 2**31 - 1  # Use bigtiff for files > 2GB
        )
    except Exception as e:
        print(f"ERROR:Failed to save TIFF: {e}")
        sys.exit(1)

    # Count non-empty slices
    non_empty_slices = len(slice_data)

    print(f"SUCCESS:{output_path}")
    print(f"INFO:Created annotation TIFF with {non_empty_slices} annotated slices "
          f"({width}x{height}x{slices})")


def main():
    parser = argparse.ArgumentParser(
        description='Create annotation TIFF from JSON config'
    )
    parser.add_argument(
        '--config', '-c',
        required=True,
        help='Path to config JSON file'
    )
    parser.add_argument(
        '--output', '-o',
        required=True,
        help='Path for output TIFF file'
    )

    args = parser.parse_args()

    create_annotation_tiff(args.config, args.output)


if __name__ == '__main__':
    main()
