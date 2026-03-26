#!/usr/bin/env python3
"""
Shared TIFF Validation Utilities

Common validation and conversion functions used by both
validate_tiff.py and validate_inference_tiff.py
"""

import sys
import numpy as np
import tifffile
import base64
import io
from PIL import Image


def safe_imread(path):
    """
    Read a TIFF file, handling OME-TIFFs with incorrect metadata.

    Some OME-TIFF files declare fewer frames in their OME XML metadata than
    actually exist in the file. tifffile.imread() trusts that metadata and
    returns only the declared frames. This function detects the mismatch and
    re-reads with OME parsing disabled so all pages are returned.

    Args:
        path: Path to the TIFF file

    Returns:
        numpy.ndarray: Image data with all pages/slices
    """
    with tifffile.TiffFile(path) as tif:
        n_pages = len(tif.pages)
        data = tif.asarray()

        # If the file has multiple pages but the array is only 2D,
        # the OME metadata likely under-reports the frame count.
        if n_pages > 1 and data.ndim == 2:
            print(
                f"[safe_imread] OME metadata mismatch: {n_pages} pages but "
                f"shape={data.shape}. Re-reading with is_ome=False.",
                file=sys.stderr, flush=True
            )
            with tifffile.TiffFile(path, is_ome=False) as tif2:
                data = tif2.asarray()

    return data


def get_supported_types():
    """Return list of supported TIFF data types"""
    return [np.uint8, np.uint16, np.int16, np.int32, np.float32, np.float64]


def convert_signed_integer_to_uint16(tiff_data, file_path):
    """
    Convert signed integer TIFF data to uint16

    Args:
        tiff_data: NumPy array with int16 or int32 dtype
        file_path: Path to TIFF file (for saving converted data)

    Returns:
        tuple: (converted_data, success, original_dtype, data_min, data_max)
    """
    if tiff_data.dtype not in [np.int16, np.int32]:
        return (tiff_data, False, str(tiff_data.dtype), None, None)

    original_dtype = str(tiff_data.dtype)

    # Normalize to [0, 1] range based on actual data range
    data_min = tiff_data.min()
    data_max = tiff_data.max()

    if data_max > data_min:
        tiff_data = ((tiff_data.astype(np.float32) - data_min) / (data_max - data_min))
    else:
        tiff_data = np.zeros_like(tiff_data, dtype=np.float32)

    # Scale to uint16 range for consistency
    tiff_data = (tiff_data * 65535).astype(np.uint16)

    # Save the converted file back
    try:
        tifffile.imwrite(file_path, tiff_data)
        print(f"[Bit Depth Conversion] Conversion successful! Original range: [{data_min}, {data_max}]",
              file=sys.stderr, flush=True)
        print(f"[Bit Depth Conversion] Converted from {original_dtype} to uint16",
              file=sys.stderr, flush=True)
        return (tiff_data, True, original_dtype, data_min, data_max)
    except Exception as e:
        return (None, False, original_dtype, data_min, data_max)


def create_preview_image(image_slice, is_annotation=False, target_size=(256, 256)):
    """
    Create downsampled preview image

    Args:
        image_slice: 2D NumPy array containing image data
        is_annotation: If True, use NEAREST resampling and scale annotation values
        target_size: Target preview size (width, height)

    Returns:
        str: Base64-encoded PNG image
    """
    try:
        # Normalize the image data for display
        if is_annotation:
            # For annotations, preserve exact values
            display_image = image_slice.astype(np.uint8)
            # Scale annotation values for better visibility (0=black, 1=gray, 2=white)
            display_image = (display_image * 127).astype(np.uint8)
            resample_method = Image.NEAREST
        else:
            # For raw images, normalize to 0-255 range
            image_min, image_max = image_slice.min(), image_slice.max()
            if image_max > image_min:
                display_image = ((image_slice - image_min) / (image_max - image_min) * 255).astype(np.uint8)
            else:
                display_image = np.zeros_like(image_slice, dtype=np.uint8)
            resample_method = Image.LANCZOS

        # Create PIL image and resize
        pil_image = Image.fromarray(display_image)
        downsampled = pil_image.resize(target_size, resample_method)

        # Convert to base64 PNG
        buffer = io.BytesIO()
        downsampled.save(buffer, format='PNG', optimize=True)
        base64_string = base64.b64encode(buffer.getvalue()).decode('utf-8')

        return base64_string
    except Exception as e:
        print(f"Preview generation failed: {str(e)}", file=sys.stderr, flush=True)
        return None


def validate_tiff_data_type(tiff_data):
    """
    Validate TIFF data type

    Args:
        tiff_data: NumPy array

    Returns:
        tuple: (is_valid, error_message)
    """
    supported_types = get_supported_types()

    if tiff_data.dtype not in supported_types:
        type_names = ', '.join([str(t).replace('numpy.', '') for t in supported_types])
        return (False, f"Unsupported data type: {tiff_data.dtype}. Supported types: {type_names}")

    return (True, None)


def validate_tiff_dimensions(tiff_data, min_dimension=None, max_dimension=None, expected_ndim=None):
    """
    Validate TIFF dimensions

    Args:
        tiff_data: NumPy array
        min_dimension: Minimum dimension size (optional)
        max_dimension: Maximum dimension size (optional)
        expected_ndim: Expected number of dimensions (optional)

    Returns:
        tuple: (is_valid, error_message)
    """
    if expected_ndim is not None and len(tiff_data.shape) != expected_ndim:
        return (False, f"Expected {expected_ndim}D array, got {len(tiff_data.shape)}D")

    if max_dimension is not None:
        if any(dim > max_dimension for dim in tiff_data.shape):
            return (False, f"Image dimensions too large: {tiff_data.shape}. Maximum dimension: {max_dimension} pixels")

    if min_dimension is not None:
        # Skip the first dimension (slices) for 3D arrays
        dims_to_check = tiff_data.shape[1:] if len(tiff_data.shape) == 3 else tiff_data.shape
        if any(dim < min_dimension for dim in dims_to_check):
            return (False, f"Image dimensions too small: {tiff_data.shape}. Minimum slice size: {min_dimension}x{min_dimension} pixels")

    return (True, None)


def validate_tiff_data_content(tiff_data):
    """
    Validate TIFF data content (not empty, not all zeros, has contrast)

    Args:
        tiff_data: NumPy array

    Returns:
        tuple: (is_valid, error_message)
    """
    if tiff_data.size == 0:
        return (False, "Empty TIFF file")

    if np.all(tiff_data == 0):
        return (False, "TIFF file contains only zero values")

    if tiff_data.max() == tiff_data.min():
        return (False, "Image has no contrast (all pixels have same value)")

    return (True, None)


def calculate_data_statistics(tiff_data):
    """
    Calculate basic statistics for TIFF data

    Args:
        tiff_data: NumPy array

    Returns:
        dict: Statistics dictionary with min, max, mean, std
    """
    return {
        "min": float(tiff_data.min()),
        "max": float(tiff_data.max()),
        "mean": float(tiff_data.mean()),
        "std": float(tiff_data.std())
    }
