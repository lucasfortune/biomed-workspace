#!/usr/bin/env python3
"""
Annotation Value Conversion Script
Converts arbitrary annotation values to sequential 0, 1, 2, ...
This allows the system to accept annotations with any integer values
"""

import numpy as np

def convert_annotation_values(annotation_stack):
    """
    Convert arbitrary annotation values to sequential 0, 1, 2, ...
    
    The conversion maintains consistency by sorting unique values first,
    so the smallest value becomes 0, next becomes 1, etc.
    
    Args:
        annotation_stack (numpy.ndarray): Annotation array with arbitrary class values
    
    Returns:
        tuple: (converted_stack, value_mapping_dict)
            - converted_stack: numpy array with sequential values 0, 1, 2, ...
            - value_mapping_dict: dictionary mapping original values to new values
                                 Example: {0: 0, 255: 1} means original 255 becomes 1
    
    Example:
        >>> annotations = np.array([0, 255, 255, 0, 127])
        >>> converted, mapping = convert_annotation_values(annotations)
        >>> print(converted)  # [0, 2, 2, 0, 1]
        >>> print(mapping)    # {0: 0, 127: 1, 255: 2}
    """
    
    # Get unique values from the annotation stack
    unique_values = np.unique(annotation_stack)
    
    # Sort the unique values to ensure consistency
    # Smallest value will become 0, next becomes 1, etc.
    sorted_values = np.sort(unique_values)
    
    # Create mapping dictionary: original_value -> new_sequential_value
    value_mapping = {
        int(old_val): new_idx 
        for new_idx, old_val in enumerate(sorted_values)
    }
    
    # Create a new array to hold the converted values
    # Use uint8 since class indices will be small (0, 1, 2, ...)
    converted_stack = np.zeros_like(annotation_stack, dtype=np.uint8)
    
    # Apply the mapping to convert all values
    # This loops through each unique value and replaces it
    for old_val, new_val in value_mapping.items():
        mask = (annotation_stack == old_val)
        converted_stack[mask] = new_val
    
    return converted_stack, value_mapping


def validate_annotation_classes(unique_values, max_classes=10):
    """
    Validate that the number of annotation classes is reasonable
    
    Args:
        unique_values (numpy.ndarray): Array of unique annotation values
        max_classes (int): Maximum allowed number of classes (default: 10)
    
    Returns:
        tuple: (is_valid, error_message)
            - is_valid: True if validation passes, False otherwise
            - error_message: None if valid, error string if invalid
    """
    
    num_classes = len(unique_values)
    
    # Check if there are too many classes
    if num_classes > max_classes:
        return False, (
            f"Too many annotation classes detected ({num_classes}). "
            f"Maximum supported: {max_classes}. "
            f"Please verify your annotation file contains only class labels."
        )
    
    # Check if there is at least one class (should have at least background)
    if num_classes == 0:
        return False, "No annotation classes found. Annotation file may be empty."
    
    # Check if all values are integers (even if stored as floats)
    if not np.all(np.equal(np.mod(unique_values, 1), 0)):
        return False, (
            "Annotation values must be integers. "
            f"Found non-integer values: {unique_values[~np.equal(np.mod(unique_values, 1), 0)]}"
        )
    
    return True, None