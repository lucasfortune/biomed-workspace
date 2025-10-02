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
import base64
import io
from PIL import Image
from convert_annotations import convert_annotation_values, validate_annotation_classes

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
        
        # Check if stacks are 3D (multiple slices)
        if len(raw_stack.shape) != 3:
            return {
                "valid": False,
                "error": f"Expected 3D stack, got {len(raw_stack.shape)}D"
            }
        
        # Validate data types
        if raw_stack.dtype not in [np.uint8, np.uint16, np.float32, np.float64]:
            return {
                "valid": False,
                "error": f"Unsupported raw image data type: {raw_stack.dtype}"
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
        
        # Calculate statistics
        raw_stats = {
            "min": float(raw_stack.min()),
            "max": float(raw_stack.max()),
            "mean": float(raw_stack.mean()),
            "std": float(raw_stack.std())
        }
        
        annotation_stats = {
            "unique_values": unique_values.tolist(),
            "class_counts": {
                int(val): int(np.sum(annotation_stack == val)) 
                for val in unique_values
            }
        }
        
        # Generate preview images
        preview_data = generate_training_preview(raw_path, annotation_path)

        result = {
            "valid": True,
            "info": {
                "shape": raw_stack.shape,
                "num_slices": raw_stack.shape[0],
                "slice_dimensions": raw_stack.shape[1:],
                "raw_dtype": str(raw_stack.dtype),
                "annotation_dtype": str(annotation_stack.dtype),
                "raw_size_mb": round(raw_size_mb, 2),
                "annotation_size_mb": round(annotation_size_mb, 2),
                "raw_stats": raw_stats,
                "annotation_stats": annotation_stats,
                "conversion_performed": conversion_performed,
                "value_mapping": value_mapping if value_mapping else None
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
    
def create_downsampled_preview(image_slice, is_annotation=False, target_size=(256, 256)):
    """Create downsampled preview with appropriate resampling method"""
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

def generate_training_preview(raw_path, annotation_path):
    """Generate preview images for training data"""
    try:
        # Read first slice from each stack
        raw_stack = tifffile.imread(raw_path)
        annotation_stack = tifffile.imread(annotation_path)
        
        raw_slice = raw_stack[0]  # First slice
        annotation_slice = annotation_stack[0]  # First slice
        
        # Generate previews
        raw_preview = create_downsampled_preview(raw_slice, is_annotation=False)
        ann_preview = create_downsampled_preview(annotation_slice, is_annotation=True)
        
        return {
            'raw_preview': raw_preview,
            'annotation_preview': ann_preview
        }
        
    except Exception as e:
        print(f"Preview generation failed: {str(e)}", flush=True)
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