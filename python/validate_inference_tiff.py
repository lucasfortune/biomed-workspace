#!/usr/bin/env python3
"""
Validation Script for Inference TIFF Data
Validates single TIFF stack for inference
"""

import sys
import json
import tifffile
import numpy as np
from pathlib import Path
from tiff_validation_utils import (
    safe_imread,
    convert_signed_integer_to_uint16,
    create_preview_image,
    validate_tiff_data_type,
    validate_tiff_dimensions,
    validate_tiff_data_content,
    calculate_data_statistics
)

def validate_inference_tiff(file_path):
    """
    Validate TIFF file for inference
    
    Returns:
        dict: Validation result with detailed information
    """
    try:
        # Check if file exists
        if not Path(file_path).exists():
            return {
                "valid": False,
                "error": f"File not found: {file_path}"
            }
        
        # Read TIFF file
        try:
            tiff_data = safe_imread(file_path)
        except Exception as e:
            return {
                "valid": False,
                "error": f"Failed to read TIFF file: {str(e)}"
            }

        # Check if data is 3D (stack of images)
        if len(tiff_data.shape) < 2:
            return {
                "valid": False,
                "error": f"Invalid dimensions: expected at least 2D, got {len(tiff_data.shape)}D"
            }
        
        # Handle both 2D single images and 3D stacks
        if len(tiff_data.shape) == 2:
            # Single 2D image - convert to 3D stack with one slice
            tiff_data = np.expand_dims(tiff_data, axis=0)
            print("Converted 2D image to 3D stack with 1 slice", flush=True)

        # Validate data type
        is_valid_type, type_error = validate_tiff_data_type(tiff_data)
        if not is_valid_type:
            return {
                "valid": False,
                "error": type_error
            }

        # Convert signed integer types to uint16 if needed
        original_dtype = str(tiff_data.dtype)
        tiff_data, conversion_applied, _, data_min, data_max = convert_signed_integer_to_uint16(tiff_data, file_path)

        if tiff_data is None:
            return {
                "valid": False,
                "error": "Failed to convert signed integer format"
            }

        # Validate dimensions (check reasonable size limits)
        is_valid_dim, dim_error = validate_tiff_dimensions(tiff_data, min_dimension=32, max_dimension=4096)
        if not is_valid_dim:
            return {
                "valid": False,
                "error": dim_error
            }

        # Validate data content (not empty, not all zeros, has contrast)
        is_valid_content, content_error = validate_tiff_data_content(tiff_data)
        if not is_valid_content:
            return {
                "valid": False,
                "error": content_error
            }
        
        # Calculate file size
        file_size_mb = Path(file_path).stat().st_size / (1024 * 1024)
        
        # Check file size (warn if too large)
        max_size_mb = 500  # 500MB limit
        if file_size_mb > max_size_mb:
            return {
                "valid": False,
                "error": f"File too large: {file_size_mb:.1f}MB. Maximum allowed: {max_size_mb}MB"
            }

        # Calculate statistics using shared utility
        data_stats = calculate_data_statistics(tiff_data)
        
        # Estimate memory usage for processing
        estimated_memory_mb = (tiff_data.nbytes * 4) / (1024 * 1024)  # Rough estimate for processing
        
        # Generate preview image
        preview_data = generate_inference_preview(file_path)

        result = {
            "valid": True,
            "info": {
                "shape": list(tiff_data.shape),
                "num_slices": tiff_data.shape[0] if len(tiff_data.shape) == 3 else 1,
                "slice_dimensions": list(tiff_data.shape[1:]) if len(tiff_data.shape) == 3 else list(tiff_data.shape),
                "dtype": str(tiff_data.dtype),
                "dtype_original": original_dtype if conversion_applied else str(tiff_data.dtype),
                "file_size_mb": round(file_size_mb, 2),
                "estimated_memory_mb": round(estimated_memory_mb, 2),
                "data_stats": data_stats,
                "bit_depth_conversion_applied": conversion_applied,
                "warnings": generate_warnings(tiff_data, file_size_mb, estimated_memory_mb)
            }
        }

        # Add preview data if generation was successful
        if preview_data:
            result["preview"] = preview_data

        return result
        
    except Exception as e:
        return {
            "valid": False,
            "error": f"Unexpected error during validation: {str(e)}"
        }

def generate_warnings(tiff_data, file_size_mb, estimated_memory_mb):
    """Generate warnings for potential issues"""
    warnings = []
    
    # Large file warning
    if file_size_mb > 100:
        warnings.append(f"Large file size ({file_size_mb:.1f}MB) may take longer to process")
    
    # High memory usage warning
    if estimated_memory_mb > 2048:  # 2GB
        warnings.append(f"High memory usage estimated ({estimated_memory_mb:.1f}MB)")
    
    # Many slices warning
    if len(tiff_data.shape) == 3 and tiff_data.shape[0] > 200:
        warnings.append(f"Large number of slices ({tiff_data.shape[0]}) may take longer to process")
    
    # Data type warnings
    if tiff_data.dtype == np.float64:
        warnings.append("Float64 data type detected - consider converting to float32 for better performance")
    
    # Check for potential bit depth issues
    if tiff_data.dtype in [np.uint8, np.uint16]:
        if tiff_data.max() < (np.iinfo(tiff_data.dtype).max * 0.1):
            warnings.append("Image appears to use only a small portion of the available bit depth")
    
    return warnings

def generate_inference_preview(file_path):
    """Generate preview image for inference data"""
    try:
        # Read first slice from the stack
        tiff_data = safe_imread(file_path)

        # Handle both 2D and 3D data
        if len(tiff_data.shape) == 2:
            first_slice = tiff_data
        else:
            first_slice = tiff_data[0]  # First slice

        # Generate preview using shared utility
        preview = create_preview_image(first_slice, is_annotation=False)

        if preview:
            return {'inference_preview': preview}
        else:
            return None

    except Exception as e:
        print(f"Inference preview generation failed: {str(e)}", flush=True)
        return None

def main():
    if len(sys.argv) != 2:
        print(json.dumps({
            "valid": False,
            "error": "Usage: python validate_inference_tiff.py <tiff_file_path>"
        }))
        sys.exit(1)
    
    file_path = sys.argv[1]
    
    result = validate_inference_tiff(file_path)
    print(json.dumps(result, indent=2))
    
    # Exit with appropriate code
    sys.exit(0 if result["valid"] else 1)

if __name__ == "__main__":
    main()