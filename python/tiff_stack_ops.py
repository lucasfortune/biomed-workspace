#!/usr/bin/env python3
"""
TIFF Stack Operations - Duplicate and Split

Usage:
    python tiff_stack_ops.py duplicate <input> <output>
    python tiff_stack_ops.py split <input> <output1> <output2> <split_at>
    python tiff_stack_ops.py info <input>

Outputs:
    SUCCESS:<json> on success
    ERROR:<message> on failure
    INFO:<json> for info mode
"""

import sys
import json
import shutil
from pathlib import Path

import tifffile
import numpy as np


def get_info(input_path):
    """
    Get TIFF stack info (slice count, dimensions).

    Args:
        input_path: Path to input TIFF file

    Returns:
        dict with sliceCount, width, height, dtype
    """
    with tifffile.TiffFile(input_path) as tif:
        if tif.series:
            shape = tif.series[0].shape
            dtype = str(tif.series[0].dtype)
        else:
            page = tif.pages[0]
            shape = (len(tif.pages), page.shape[0], page.shape[1])
            dtype = str(page.dtype)

    if len(shape) == 2:
        # Single 2D image
        return {
            "sliceCount": 1,
            "width": int(shape[1]),
            "height": int(shape[0]),
            "dtype": dtype
        }
    elif len(shape) == 3:
        # 3D stack
        return {
            "sliceCount": int(shape[0]),
            "width": int(shape[2]),
            "height": int(shape[1]),
            "dtype": dtype
        }
    else:
        raise ValueError(f"Unexpected TIFF shape: {shape}")


def duplicate_stack(input_path, output_path):
    """
    Duplicate a TIFF file by copying it.

    Args:
        input_path: Path to input TIFF file
        output_path: Path for the duplicate

    Returns:
        dict with output_path and sliceCount
    """
    # Ensure output directory exists
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)

    # Copy the file
    shutil.copy2(input_path, output_path)

    # Get info about the copy
    info = get_info(output_path)

    return {
        "output_path": str(output_path),
        "sliceCount": info["sliceCount"],
        "size": Path(output_path).stat().st_size
    }


def split_stack(input_path, output1_path, output2_path, split_at):
    """
    Split a TIFF stack at the specified slice index.

    Args:
        input_path: Path to input TIFF file
        output1_path: Path for part 1 (slices 0 to split_at-1)
        output2_path: Path for part 2 (slices split_at to end)
        split_at: Slice index to split at (1-indexed for user, converted internally)

    Returns:
        dict with part1 and part2 info
    """
    # Load the TIFF data
    data = tifffile.imread(input_path)

    if data.ndim != 3:
        raise ValueError("Split requires a 3D TIFF stack (multiple slices)")

    total_slices = data.shape[0]

    # Validate split point (split_at is 1-indexed from user perspective)
    # Split at N means: part1 = slices 1 to N, part2 = slices N+1 to end
    if split_at <= 0 or split_at >= total_slices:
        raise ValueError(f"Split point must be between 1 and {total_slices - 1}")

    # Split the data
    # part1: indices 0 to split_at-1 (N slices)
    # part2: indices split_at to end
    part1 = data[:split_at]
    part2 = data[split_at:]

    # Ensure output directories exist
    Path(output1_path).parent.mkdir(parents=True, exist_ok=True)
    Path(output2_path).parent.mkdir(parents=True, exist_ok=True)

    # Save both parts
    tifffile.imwrite(output1_path, part1)
    tifffile.imwrite(output2_path, part2)

    return {
        "part1": {
            "path": str(output1_path),
            "sliceCount": int(part1.shape[0]),
            "size": Path(output1_path).stat().st_size
        },
        "part2": {
            "path": str(output2_path),
            "sliceCount": int(part2.shape[0]),
            "size": Path(output2_path).stat().st_size
        },
        "originalSliceCount": int(total_slices)
    }


def main():
    if len(sys.argv) < 3:
        print("ERROR:Missing arguments. Usage: tiff_stack_ops.py <command> <args>")
        sys.exit(1)

    command = sys.argv[1]

    try:
        if command == "info":
            input_path = sys.argv[2]
            result = get_info(input_path)
            print(f"INFO:{json.dumps(result)}")

        elif command == "duplicate":
            if len(sys.argv) < 4:
                print("ERROR:Missing output path for duplicate")
                sys.exit(1)
            input_path = sys.argv[2]
            output_path = sys.argv[3]
            result = duplicate_stack(input_path, output_path)
            print(f"SUCCESS:{json.dumps(result)}")

        elif command == "split":
            if len(sys.argv) < 6:
                print("ERROR:Missing arguments for split. Usage: split <input> <output1> <output2> <split_at>")
                sys.exit(1)
            input_path = sys.argv[2]
            output1_path = sys.argv[3]
            output2_path = sys.argv[4]
            split_at = int(sys.argv[5])
            result = split_stack(input_path, output1_path, output2_path, split_at)
            print(f"SUCCESS:{json.dumps(result)}")

        else:
            print(f"ERROR:Unknown command: {command}")
            sys.exit(1)

    except FileNotFoundError as e:
        print(f"ERROR:File not found: {e}")
        sys.exit(1)
    except ValueError as e:
        print(f"ERROR:{str(e)}")
        sys.exit(1)
    except Exception as e:
        print(f"ERROR:Unexpected error: {str(e)}")
        sys.exit(1)


if __name__ == "__main__":
    main()
