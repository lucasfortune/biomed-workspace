#!/usr/bin/env python3
"""
TIFF Stack Validation Script
Validates compatibility between raw images and annotations, for one pair
(positional arguments) or for several training pairs (--pairs <json>).
"""

import sys
import json
import tifffile
import numpy as np
from pathlib import Path
from convert_annotations import convert_annotation_values, validate_annotation_classes
from tiff_validation_utils import (
    safe_imread,
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
            raw_stack = safe_imread(raw_path)
            annotation_stack = safe_imread(annotation_path)
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
        is_valid_count, count_error = validate_annotation_classes(unique_values, max_classes=100)
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
        raw_stack = safe_imread(raw_path)
        annotation_stack = safe_imread(annotation_path)

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
        print(f"Preview generation failed: {str(e)}", flush=True)
        return None

# =============================================================================
# MULTI-PAIR VALIDATION (training on several raw/annotation pairs)
# =============================================================================

def _labelled_slices(annotation_stack):
    """Indices of slices with at least one non-zero label (rule R1)."""
    flat = annotation_stack.reshape(annotation_stack.shape[0], -1)
    return [int(i) for i in np.flatnonzero(flat.any(axis=1))]


def _check_pair(index, raw_path, annotation_path):
    """
    Validate one pair the way validate_tiff_stacks does (existence, shape,
    dtype, signed-integer conversion) and return the loaded stacks with
    their facts, or an error string.
    """
    label = f"Pair {index + 1}"
    if not Path(raw_path).exists():
        return None, f"{label}: raw images file not found: {raw_path}"
    if not Path(annotation_path).exists():
        return None, f"{label}: annotations file not found: {annotation_path}"
    try:
        raw_stack = safe_imread(raw_path)
        annotation_stack = safe_imread(annotation_path)
    except Exception as e:
        return None, f"{label}: failed to read TIFF files: {e}"
    if raw_stack.ndim == 2:
        raw_stack = raw_stack[np.newaxis, ...]
    if annotation_stack.ndim == 2:
        annotation_stack = annotation_stack[np.newaxis, ...]
    if raw_stack.shape != annotation_stack.shape:
        return None, (f"{label}: shape mismatch raw={list(raw_stack.shape)} "
                      f"annotations={list(annotation_stack.shape)}")
    is_valid_dim, dim_error = validate_tiff_dimensions(raw_stack, expected_ndim=3)
    if not is_valid_dim:
        return None, f"{label}: raw images: {dim_error}"
    is_valid_type, type_error = validate_tiff_data_type(raw_stack)
    if not is_valid_type:
        return None, f"{label}: raw images: {type_error}"
    original_dtype = str(raw_stack.dtype)
    raw_stack, bit_conversion, _, _, _ = convert_signed_integer_to_uint16(raw_stack, raw_path)
    if raw_stack is None:
        return None, f"{label}: failed to convert signed integer format"
    unique_values = np.unique(annotation_stack)
    ok, count_error = validate_annotation_classes(unique_values, max_classes=100)
    if not ok:
        return None, f"{label}: {count_error}"
    return {
        'raw': raw_stack,
        'annotations': annotation_stack,
        'unique_values': [int(v) for v in unique_values],
        'raw_dtype_original': original_dtype,
        'bit_depth_conversion_applied': bit_conversion,
    }, None


def validate_pairs(pairs):
    """
    Validate several raw/annotation pairs for one training run.

    Every pair is checked like a single pair. Label values are then mapped
    to sequential ids ONCE over the union of all pairs (rule R4), so a class
    that is absent from one stack keeps its id everywhere; annotation files
    whose values change are rewritten in place, like the single-pair path.
    Per pair the labelled slices (rule R1) are counted for the UI and the
    training script.

    pairs: [{"raw": path, "annotations": path}]
    """
    if not isinstance(pairs, list) or not pairs:
        return {"valid": False, "error": "No training pairs given"}

    loaded = []
    for i, pair in enumerate(pairs):
        facts, error = _check_pair(i, pair.get('raw', ''), pair.get('annotations', ''))
        if error:
            return {"valid": False, "error": error}
        loaded.append(facts)

    # Global class map over the union of label values (0 stays 0)
    union = sorted({0} | {v for f in loaded for v in f['unique_values']})
    class_map = {int(v): idx for idx, v in enumerate(union)}
    num_classes = len(union)

    warnings = []
    per_pair = []
    total_slices = total_labelled = 0
    min_dimension = None
    label_sets = []
    for i, (pair, facts) in enumerate(zip(pairs, loaded)):
        ann = facts['annotations']
        needs_remap = any(class_map[v] != v for v in facts['unique_values'])
        if needs_remap:
            lut = np.zeros(int(max(union)) + 1, dtype=np.uint8)
            for orig, new in class_map.items():
                lut[orig] = new
            ann = lut[ann.astype(np.int64)]
            try:
                tifffile.imwrite(pair['annotations'], ann)
                print(f"[Annotation Conversion] Pair {i + 1}: remapped labels with {class_map}",
                      file=sys.stderr, flush=True)
            except Exception as e:
                return {"valid": False, "error": f"Pair {i + 1}: failed to save converted annotations: {e}"}
        elif ann.dtype != np.uint8:
            ann = ann.astype(np.uint8)

        labelled = _labelled_slices(ann)
        mapped_values = sorted({class_map[v] for v in facts['unique_values']})
        label_sets.append(tuple(v for v in mapped_values if v != 0))
        num_slices = int(ann.shape[0])
        total_slices += num_slices
        total_labelled += len(labelled)
        dims = [int(ann.shape[1]), int(ann.shape[2])]
        min_dimension = min(dims) if min_dimension is None else min(min_dimension, *dims)
        if len(labelled) == 0:
            return {"valid": False,
                    "error": f"Pair {i + 1} ({Path(pair['annotations']).name}) has no labelled slices"}
        if len(labelled) < 2:
            warnings.append(f"Pair {i + 1} has a single labelled slice; it is used for training only")
        per_pair.append({
            "index": i,
            "raw_path": pair['raw'],
            "annotations_path": pair['annotations'],
            "shape": [int(x) for x in ann.shape],
            "num_slices": num_slices,
            "slice_dimensions": dims,
            "labelled_slices": len(labelled),
            "labelled_indices": labelled,
            "unique_values": mapped_values,
            "class_counts": {int(v): int(np.sum(ann == v)) for v in mapped_values},
            "raw_dtype": str(facts['raw'].dtype),
            "raw_dtype_original": facts['raw_dtype_original'],
            "bit_depth_conversion_applied": facts['bit_depth_conversion_applied'],
            "conversion_performed": bool(needs_remap),
        })

    if len(set(label_sets)) > 1:
        warnings.append("The pairs do not all contain the same classes; "
                        "a class missing from a stack is treated as absent there, not as background")
    if total_labelled < 2:
        return {"valid": False,
                "error": "Need at least two labelled slices in total (one for training, one for validation)"}

    result = {
        "valid": True,
        "num_classes": num_classes,
        "class_map": {str(k): v for k, v in class_map.items()},
        "classes": list(range(num_classes)),
        "pairs": per_pair,
        "totals": {"pairs": len(per_pair), "slices": total_slices, "labelled_slices": total_labelled},
        "min_dimension": min_dimension,
        "warnings": warnings,
        # Kept for callers that read the single-pair layout
        "info": {
            "num_slices": total_slices,
            "slice_dimensions": per_pair[0]["slice_dimensions"],
            "annotation_stats": {"unique_values": list(range(num_classes)), "num_classes": num_classes},
        },
    }
    preview = generate_training_preview(pairs[0]['raw'], pairs[0]['annotations'])
    if preview:
        result["preview"] = preview
    return result


def main():
    # Multi-pair mode: validate_tiff.py --pairs <json file>
    if len(sys.argv) == 3 and sys.argv[1] == '--pairs':
        try:
            with open(sys.argv[2]) as fh:
                pairs = json.load(fh)
            result = validate_pairs(pairs)
        except Exception as e:
            result = {"valid": False, "error": f"Unexpected error during validation: {e}"}
        print(json.dumps(result, indent=2))
        sys.exit(0 if result["valid"] else 1)

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