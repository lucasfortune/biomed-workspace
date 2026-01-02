#!/usr/bin/env python3
"""
Image Utilities - Common image processing functions for viz_app Python scripts.

Provides consistent image normalization, preview generation, and slice extraction.
"""

import numpy as np
from PIL import Image


def normalize_to_uint8(image_data):
    """
    Normalize image data to 0-255 uint8 range.

    Handles any numeric dtype by normalizing based on min/max values.
    Zero-range images (constant value) return all zeros.

    Args:
        image_data: NumPy array of any numeric dtype.

    Returns:
        np.ndarray: uint8 array with values in [0, 255].

    Examples:
        >>> img = np.array([[0, 1000], [500, 2000]], dtype=np.uint16)
        >>> normalize_to_uint8(img)
        array([[  0, 127], [ 63, 255]], dtype=uint8)
    """
    img_min = float(image_data.min())
    img_max = float(image_data.max())

    if img_max > img_min:
        normalized = ((image_data - img_min) / (img_max - img_min) * 255)
        return normalized.astype(np.uint8)
    else:
        return np.zeros_like(image_data, dtype=np.uint8)


def extract_middle_slice(stack):
    """
    Extract the middle slice from a 3D image stack.

    For 2D images, returns the image unchanged.

    Args:
        stack: NumPy array, 2D or 3D.

    Returns:
        np.ndarray: 2D slice from the middle of the stack.

    Raises:
        ValueError: If array has more than 3 dimensions.
    """
    if stack.ndim == 2:
        return stack
    elif stack.ndim == 3:
        middle_idx = stack.shape[0] // 2
        return stack[middle_idx]
    else:
        raise ValueError(f"Expected 2D or 3D image, got {stack.ndim}D")


def extract_slice(stack, slice_index):
    """
    Extract a specific slice from a 3D image stack.

    For 2D images, only slice_index=0 is valid.

    Args:
        stack: NumPy array, 2D or 3D.
        slice_index: Index of slice to extract (0-based).

    Returns:
        np.ndarray: 2D slice from the stack.

    Raises:
        ValueError: If slice_index is out of range or array has invalid dimensions.
    """
    if stack.ndim == 2:
        if slice_index != 0:
            raise ValueError(f"2D image only has slice 0, requested {slice_index}")
        return stack
    elif stack.ndim == 3:
        if slice_index < 0 or slice_index >= stack.shape[0]:
            raise ValueError(
                f"Slice index {slice_index} out of range (0-{stack.shape[0]-1})"
            )
        return stack[slice_index]
    else:
        raise ValueError(f"Expected 2D or 3D image, got {stack.ndim}D")


def create_thumbnail(image_2d, size=120, quality=85, resampling=Image.Resampling.LANCZOS):
    """
    Create a thumbnail from a 2D image.

    Normalizes the image to uint8, resizes maintaining aspect ratio,
    and returns a PIL Image ready for saving.

    Args:
        image_2d: 2D NumPy array.
        size: Target size in pixels (thumbnail will fit within size x size).
        quality: JPEG quality (1-100, only used when saving).
        resampling: PIL resampling method.

    Returns:
        PIL.Image: Thumbnail image ready for saving.
    """
    # Normalize to uint8
    normalized = normalize_to_uint8(image_2d)

    # Convert to PIL and resize
    pil_img = Image.fromarray(normalized)
    pil_img.thumbnail((size, size), resampling)

    return pil_img


def save_thumbnail_jpeg(image_2d, output_path, size=120, quality=85):
    """
    Create and save a thumbnail as JPEG.

    Convenience function combining create_thumbnail and save.

    Args:
        image_2d: 2D NumPy array.
        output_path: Path to save JPEG file.
        size: Target size in pixels.
        quality: JPEG quality (1-100).

    Returns:
        str: Output path.
    """
    thumbnail = create_thumbnail(image_2d, size=size, quality=quality)
    thumbnail.save(output_path, "JPEG", quality=quality)
    return output_path
