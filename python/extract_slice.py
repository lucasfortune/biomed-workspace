#!/usr/bin/env python3
"""
Extract slice from TIFF as JPEG for Image Viewer module.

Usage:
    python extract_slice.py <input_tiff> <slice_index> <output_jpeg> [--size SIZE]
    python extract_slice.py <input_tiff> --info [--no-classes]

Outputs:
    SUCCESS:<output_path> on success
    INFO:<json> for --info mode
    ERROR:<message> on failure

Size options:
    icon    - 128px (for thumbnail grid)
    gallery - 512px (for gallery view)
    <number> - Custom size in pixels

Info options:
    --no-classes  Skip class detection (faster, use for continuous-valued images like denoised data)
"""

import sys
import json
import numpy as np
from PIL import Image
import tifffile
from tiff_validation_utils import safe_imread


def read_voxel_size(tif):
    """
    Physical voxel size from TIFF metadata, if present (ADR-008).

    Sources, in priority order: OME-XML PhysicalSize*, ImageJ metadata
    (spacing for z, unit) + resolution tags, plain resolution tags.

    Returns:
        {"x": float, "y": float, "z": float|None, "unit": str} or None
    """
    x = y = z = None
    unit = None

    # OME-XML
    try:
        if tif.ome_metadata:
            import re
            ome = tif.ome_metadata
            def attr(name):
                m = re.search(rf'{name}="([\d.eE+-]+)"', ome)
                return float(m.group(1)) if m else None
            def attr_unit(name):
                m = re.search(rf'{name}Unit="([^"]+)"', ome)
                return m.group(1) if m else None
            x, y, z = attr("PhysicalSizeX"), attr("PhysicalSizeY"), attr("PhysicalSizeZ")
            unit = attr_unit("PhysicalSizeX") or unit
    except Exception:
        pass

    # Resolution tags (pixels per unit -> size = denominator/numerator)
    if x is None or y is None:
        try:
            page = tif.pages[0]
            xres = page.tags.get("XResolution")
            yres = page.tags.get("YResolution")
            def res_to_size(tag):
                num, den = tag.value
                return den / num if num else None
            if xres and yres:
                x = x if x is not None else res_to_size(xres)
                y = y if y is not None else res_to_size(yres)
        except Exception:
            pass

    # ImageJ metadata: z spacing + unit
    try:
        ij = tif.imagej_metadata or {}
        if z is None and ij.get("spacing"):
            z = float(ij["spacing"])
        if unit is None and ij.get("unit"):
            unit = ij["unit"]
    except Exception:
        pass

    if x is None and y is None:
        return None
    if x is None:
        x = y
    if y is None:
        y = x
    # normalize the micron aliases
    if unit in ("micron", "microns", "µm", "um"):
        unit = "um"
    return {
        "x": float(x), "y": float(y),
        "z": float(z) if z is not None else None,
        "unit": unit or "px",
    }


def get_tiff_info(input_path, detect_classes=True):
    """
    Get TIFF metadata, optionally detecting unique classes.

    Args:
        input_path: Path to input TIFF file
        detect_classes: If True, load data to detect unique class values

    Returns:
        dict with sliceCount, width, height, dtype, optional voxelSize,
        and optionally classes
    """
    with tifffile.TiffFile(input_path) as tif:
        n_pages = len(tif.pages)

        # Get shape from first page or series
        if tif.series:
            shape = tif.series[0].shape
            dtype = str(tif.series[0].dtype)
        else:
            # Fallback: read first page
            page = tif.pages[0]
            shape = (n_pages, page.shape[0], page.shape[1])
            dtype = str(page.dtype)

        # Fix OME-TIFFs with incorrect metadata (declares fewer frames
        # than actually exist). If the series says 2D but there are
        # multiple pages, use page count instead.
        if len(shape) == 2 and n_pages > 1:
            shape = (n_pages, shape[0], shape[1])

        # Handle different dimensionalities
        if len(shape) == 2:
            # 2D image
            info = {
                "sliceCount": 1,
                "width": int(shape[1]),
                "height": int(shape[0]),
                "dtype": dtype
            }
        elif len(shape) == 3:
            # 3D stack
            info = {
                "sliceCount": int(shape[0]),
                "width": int(shape[2]),
                "height": int(shape[1]),
                "dtype": dtype
            }
        else:
            raise ValueError(f"Unexpected image shape: {shape}")

        voxel_size = read_voxel_size(tif)
        if voxel_size:
            info["voxelSize"] = voxel_size

    # Detect unique classes if requested
    if detect_classes:
        try:
            data = safe_imread(input_path)
            unique_values = np.unique(data)
            # Convert to Python ints and include all values (including 0 for background)
            info["classes"] = [int(v) for v in unique_values]
            # Also provide class counts
            class_counts = {}
            for val in unique_values:
                class_counts[str(int(val))] = int(np.sum(data == val))
            info["class_counts"] = class_counts
        except Exception as e:
            # Fall back to default if class detection fails
            info["classes"] = [0, 1]
            info["class_counts"] = {}

    return info


def extract_slice(input_path, slice_index, output_path, size=512):
    """
    Extract a single slice from TIFF and save as JPEG.

    Args:
        input_path: Path to input TIFF file
        slice_index: Index of slice to extract (0-based)
        output_path: Path to output JPEG file
        size: Target size in pixels (maintains aspect ratio)

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

    # Normalize to 0-255
    img_min = float(img.min())
    img_max = float(img.max())

    if img_max > img_min:
        img = ((img - img_min) / (img_max - img_min) * 255).astype(np.uint8)
    else:
        img = np.zeros_like(img, dtype=np.uint8)

    # Convert to PIL Image
    pil_img = Image.fromarray(img)

    # Resize maintaining aspect ratio
    pil_img.thumbnail((size, size), Image.Resampling.LANCZOS)

    # Save as JPEG
    pil_img.save(output_path, "JPEG", quality=85)

    return output_path


def parse_size(size_arg):
    """Parse size argument to integer pixels."""
    if size_arg == "icon":
        return 128
    elif size_arg == "gallery":
        return 512
    else:
        try:
            return int(size_arg)
        except ValueError:
            raise ValueError(f"Invalid size: {size_arg}. Use 'icon', 'gallery', or a number.")


def main():
    if len(sys.argv) < 2:
        print("ERROR:Missing arguments. Usage: extract_slice.py <input> <slice_index> <output> [--size SIZE] OR extract_slice.py <input> --info")
        sys.exit(1)

    input_path = sys.argv[1]

    # Check for --info mode
    if len(sys.argv) >= 3 and sys.argv[2] == "--info":
        try:
            # Check for --no-classes flag (skips expensive class detection)
            detect_classes = "--no-classes" not in sys.argv
            info = get_tiff_info(input_path, detect_classes=detect_classes)
            print(f"INFO:{json.dumps(info)}")
        except Exception as e:
            print(f"ERROR:{str(e)}")
            sys.exit(1)
        return

    # Extract slice mode
    if len(sys.argv) < 4:
        print("ERROR:Missing arguments. Usage: extract_slice.py <input> <slice_index> <output> [--size SIZE]")
        sys.exit(1)

    try:
        slice_index = int(sys.argv[2])
    except ValueError:
        print(f"ERROR:Invalid slice index: {sys.argv[2]}")
        sys.exit(1)

    output_path = sys.argv[3]

    # Parse optional size argument
    size = 512  # default to gallery size
    if len(sys.argv) >= 6 and sys.argv[4] == "--size":
        try:
            size = parse_size(sys.argv[5])
        except ValueError as e:
            print(f"ERROR:{str(e)}")
            sys.exit(1)

    try:
        result = extract_slice(input_path, slice_index, output_path, size)
        print(f"SUCCESS:{result}")
    except Exception as e:
        print(f"ERROR:{str(e)}")
        sys.exit(1)


if __name__ == "__main__":
    main()
