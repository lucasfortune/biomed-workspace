"""
Data preparation functions for the denoising package.

Handles TIFF stack extraction and input directory preparation
for both 2D and 2.5D training modes.
"""

import os

import numpy as np
import tifffile
from tiff_validation_utils import safe_imread

from .utils import emit_progress


def extract_tiff_stack_to_directory(input_path: str, output_dir: str) -> tuple:
    """
    Extract a TIFF stack to individual 2D TIF files in a directory.

    The autoStructN2V library expects a directory of individual 2D images,
    not a single TIFF stack file.

    Args:
        input_path: Path to TIFF stack file
        output_dir: Base output directory for the experiment

    Returns:
        tuple: (path to directory containing extracted images, number of slices)
    """
    emit_progress('data', {"status": "extracting_stack"})

    # Read the stack
    stack = safe_imread(input_path)

    # Handle 2D images (single slice)
    if stack.ndim == 2:
        stack = stack[np.newaxis, ...]

    # Create output directory for extracted images
    extracted_dir = os.path.join(output_dir, 'extracted_images')
    os.makedirs(extracted_dir, exist_ok=True)

    # Extract each slice
    num_slices = len(stack)
    for i, slice_img in enumerate(stack):
        output_path = os.path.join(extracted_dir, f'slice_{i:04d}.tif')
        tifffile.imwrite(output_path, slice_img)

        # Emit progress every 10 slices
        if (i + 1) % 10 == 0 or i == num_slices - 1:
            emit_progress('data', {
                "status": "extracting_stack",
                "current": i + 1,
                "total": num_slices
            })

    emit_progress('data', {
        "status": "extraction_complete",
        "numSlices": num_slices,
        "extractedDir": extracted_dir
    })

    return extracted_dir, num_slices


def prepare_input_directory(config: dict) -> tuple:
    """
    Prepare input directory for training.

    For 2D mode:
        - If input_dir points to a single TIFF file (stack), extract it to individual slices.
        - If input_dir is already a directory, use it as-is.

    For 2.5D mode:
        - Pass the TIFF stack path directly (no extraction).
        - The new library handles stack loading natively.

    Args:
        config: Training configuration dictionary

    Returns:
        tuple: (path to directory/file for training, extracted_images_dir or None, num_slices or None)

    Raises:
        ValueError: If input path is invalid for the specified mode
    """
    input_dir = config.get('input_dir', '')
    output_dir = config.get('output_dir', '')
    mode = config.get('mode', '2d')

    # For 2.5D mode, pass the TIFF stack directly - no extraction needed
    if mode == '2.5d':
        # Find the TIFF stack file
        if os.path.isfile(input_dir):
            stack_path = input_dir
        elif os.path.isdir(input_dir):
            tif_files = [f for f in os.listdir(input_dir) if f.lower().endswith(('.tif', '.tiff'))]
            if len(tif_files) == 1:
                stack_path = os.path.join(input_dir, tif_files[0])
            else:
                raise ValueError(f"2.5D mode requires a single TIFF stack, found {len(tif_files)} files in {input_dir}")
        else:
            raise ValueError(f"Invalid input path for 2.5D mode: {input_dir}")

        # Get stack info for logging
        stack = safe_imread(stack_path)
        if stack.ndim == 2:
            num_slices = 1
        else:
            num_slices = stack.shape[0]

        emit_progress('data', {
            "status": "stack_detected",
            "mode": "2.5d",
            "numSlices": num_slices,
            "stackPath": stack_path
        })

        # Return the stack path directly - the library will load it
        return stack_path, None, num_slices

    # 2D mode: extract TIFF stack to individual slices
    # Check if input_dir is a file (TIFF stack)
    if os.path.isfile(input_dir):
        # It's a file - extract the stack
        extracted_dir, num_slices = extract_tiff_stack_to_directory(input_dir, output_dir)
        return extracted_dir, extracted_dir, num_slices

    # Check if input_dir contains a single TIFF file
    if os.path.isdir(input_dir):
        tif_files = [f for f in os.listdir(input_dir) if f.lower().endswith(('.tif', '.tiff'))]
        if len(tif_files) == 1:
            # Single file in directory - might be a stack
            single_file = os.path.join(input_dir, tif_files[0])
            stack = safe_imread(single_file)
            if stack.ndim == 3 and stack.shape[0] > 1:
                # It's a stack - extract it
                extracted_dir, num_slices = extract_tiff_stack_to_directory(single_file, output_dir)
                return extracted_dir, extracted_dir, num_slices

    # input_dir is a directory with multiple images - use as-is
    return input_dir, None, None
