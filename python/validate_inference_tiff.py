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
            tiff_data = tifffile.imread(file_path)
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
        if tiff_data.dtype not in [np.uint8, np.uint16, np.float32, np.float64]:
            return {
                "valid": False,
                "error": f"Unsupported data type: {tiff_data.dtype}. Supported types: uint8, uint16, float32, float64"
            }
        
        # Check for reasonable dimensions
        if any(dim > 4096 for dim in tiff_data.shape):
            return {
                "valid": False,
                "error": f"Image dimensions too large: {tiff_data.shape}. Maximum dimension: 4096 pixels"
            }
        
        if any(dim < 32 for dim in tiff_data.shape[1:]):  # Skip the first dimension (slices)
            return {
                "valid": False,
                "error": f"Image dimensions too small: {tiff_data.shape}. Minimum slice size: 32x32 pixels"
            }
        
        # Check for empty or invalid data
        if tiff_data.size == 0:
            return {
                "valid": False,
                "error": "Empty TIFF file"
            }
        
        if np.all(tiff_data == 0):
            return {
                "valid": False,
                "error": "TIFF file contains only zero values"
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
        
        # Calculate statistics
        data_stats = {
            "min": float(tiff_data.min()),
            "max": float(tiff_data.max()),
            "mean": float(tiff_data.mean()),
            "std": float(tiff_data.std())
        }
        
        # Check for reasonable value ranges
        if data_stats["max"] == data_stats["min"]:
            return {
                "valid": False,
                "error": "Image has no contrast (all pixels have same value)"
            }
        
        # Estimate memory usage for processing
        estimated_memory_mb = (tiff_data.nbytes * 4) / (1024 * 1024)  # Rough estimate for processing
        
        return {
            "valid": True,
            "info": {
                "shape": list(tiff_data.shape),
                "num_slices": tiff_data.shape[0] if len(tiff_data.shape) == 3 else 1,
                "slice_dimensions": list(tiff_data.shape[1:]) if len(tiff_data.shape) == 3 else list(tiff_data.shape),
                "dtype": str(tiff_data.dtype),
                "file_size_mb": round(file_size_mb, 2),
                "estimated_memory_mb": round(estimated_memory_mb, 2),
                "data_stats": data_stats,
                "warnings": generate_warnings(tiff_data, file_size_mb, estimated_memory_mb)
            }
        }
        
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