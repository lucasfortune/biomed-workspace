#!/usr/bin/env python3
"""
TIFF Stack Validation Script
Validates compatibility between raw images and annotations
"""

import sys
import json
import tifffile
import numpy as np
from pathlib import Path
from convert_annotations import convert_annotation_values, validate_annotation_classes
from tiff_validation_utils import (
    convert_signed_integer_to_uint16,
    create_preview_image,
    validate_tiff_data_type,
    validate_tiff_dimensions,
    validate_tiff_data_content,
    calculate_data_statistics,
    get_supported_types
)

def validate_tiff_stacks(raw_path, annotation_path):
    """
    Validate TIFF stack compatibility
    
    Returns:
        dict: Validation result with detailed information
    """
    try:
        # Check if files exist
        if not Path(raw_path).exists():
            return {
                "valid": False,
                "error": f"Raw images file not found: {raw_path}"
            }
        
        if not Path(annotation_path).exists():
            return {
                "valid": False,
                "error": f"Annotations file not found: {annotation_path}"
            }
        
        # Read TIFF files
        try:
            raw_stack = tifffile.imread(raw_path)
            annotation_stack = tifffile.imread(annotation_path)
        except Exception as e:
            return {
                "valid": False,
                "error": f"Failed to read TIFF files: {str(e)}"
            }
        
        # Validate dimensions
        if raw_stack.shape != annotation_stack.shape:
            return {
                "valid": False,
                "error": f"Shape mismatch: raw={raw_stack.shape}, annotations={annotation_stack.shape}"
            }
        
        # Validate dimensions - expect 3D stack
        is_valid_dim, dim_error = validate_tiff_dimensions(raw_stack, expected_ndim=3)
        if not is_valid_dim:
            return {
                "valid": False,
                "error": f"Raw images: {dim_error}"
            }

        # Validate data type
        is_valid_type, type_error = validate_tiff_data_type(raw_stack)
        if not is_valid_type:
            return {
                "valid": False,
                "error": f"Raw images: {type_error}"
            }

        # Convert signed integer types to uint16 if needed
        original_dtype = str(raw_stack.dtype)
        raw_stack, conversion_applied, _, data_min, data_max = convert_signed_integer_to_uint16(raw_stack, raw_path)

        if raw_stack is None:
            return {
                "valid": False,
                "error": "Failed to convert signed integer format"
            }
        
        # Check annotation values and convert if necessary
        unique_values = np.unique(annotation_stack)
        expected_values = {0, 1, 2}
        
        # First, validate that the number of classes is reasonable
        is_valid_count, count_error = validate_annotation_classes(unique_values, max_classes=10)
        if not is_valid_count:
            return {
                "valid": False,
                "error": count_error
            }
        
        # Check if values need conversion
        value_mapping = None
        conversion_performed = False
        
        if not set(unique_values).issubset(expected_values):
            # Values are not 0,1,2 - need to convert them
            print(f"[Annotation Conversion] Original values detected: {unique_values.tolist()}", file=sys.stderr, flush=True)
            print(f"[Annotation Conversion] Converting to sequential 0,1,2,...", file=sys.stderr, flush=True)
            
            # Convert the annotation stack
            annotation_stack, value_mapping = convert_annotation_values(annotation_stack)
            
            # Save the converted annotations back to the original file
            # This overwrites the uploaded file with the converted version
            try:
                tifffile.imwrite(annotation_path, annotation_stack)
                conversion_performed = True
                print(f"[Annotation Conversion] Conversion successful!", file=sys.stderr, flush=True)
                print(f"[Annotation Conversion] Mapping applied: {value_mapping}", file=sys.stderr, flush=True)
            except Exception as e:
                return {
                    "valid": False,
                    "error": f"Failed to save converted annotations: {str(e)}"
                }
            
            # Update unique_values for statistics calculation
            unique_values = np.unique(annotation_stack)
        else:
            # Values are already 0,1,2 - no conversion needed
            print("[Annotation Conversion] Values are already in expected format (0,1,2)", file=sys.stderr, flush=True)
            conversion_performed = False
        
        # Calculate file sizes
        raw_size_mb = Path(raw_path).stat().st_size / (1024 * 1024)
        annotation_size_mb = Path(annotation_path).stat().st_size / (1024 * 1024)

        # Calculate statistics using shared utility
        raw_stats = calculate_data_statistics(raw_stack)
        
        # Detect number of classes from annotations
        num_classes = len(unique_values)
        
        annotation_stats = {
            "unique_values": unique_values.tolist(),
            "num_classes": num_classes,
            "class_counts": {
                int(val): int(np.sum(annotation_stack == val)) 
                for val in unique_values
            }
        }
        
        # Generate preview images
        preview_data = generate_training_preview(raw_path, annotation_path)

        result = {
            "valid": True,
            "num_classes": num_classes,
            "info": {
                "shape": raw_stack.shape,
                "num_slices": raw_stack.shape[0],
                "slice_dimensions": raw_stack.shape[1:],
                "raw_dtype": str(raw_stack.dtype),
                "raw_dtype_original": original_dtype if conversion_applied else str(raw_stack.dtype),
                "annotation_dtype": str(annotation_stack.dtype),
                "raw_size_mb": round(raw_size_mb, 2),
                "annotation_size_mb": round(annotation_size_mb, 2),
                "raw_stats": raw_stats,
                "annotation_stats": annotation_stats,
                "conversion_performed": conversion_performed,
                "value_mapping": value_mapping if value_mapping else None,
                "bit_depth_conversion_applied": conversion_applied
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
    
def generate_training_preview(raw_path, annotation_path):
    """Generate preview images for training data"""
    try:
        # Read first slice from each stack
        raw_stack = tifffile.imread(raw_path)
        annotation_stack = tifffile.imread(annotation_path)

        raw_slice = raw_stack[0]  # First slice
        annotation_slice = annotation_stack[0]  # First slice

        # Generate previews using shared utility
        raw_preview = create_preview_image(raw_slice, is_annotation=False)
        ann_preview = create_preview_image(annotation_slice, is_annotation=True)

        if raw_preview and ann_preview:
            return {
                'raw_preview': raw_preview,
                'annotation_preview': ann_preview
            }
        else:
            return None

    except Exception as e:
        print(f"Preview generation failed: {str(e)}", file=sys.stderr, flush=True)
        return None

def main():
    if len(sys.argv) != 3:
        print(json.dumps({
            "valid": False,
            "error": "Usage: python validate_tiff.py <raw_images_path> <annotations_path>"
        }))
        sys.exit(1)
    
    raw_path = sys.argv[1]
    annotation_path = sys.argv[2]
    
    result = validate_tiff_stacks(raw_path, annotation_path)
    print(json.dumps(result, indent=2))
    
    # Exit with appropriate code
    sys.exit(0 if result["valid"] else 1)

if __name__ == "__main__":
    main()