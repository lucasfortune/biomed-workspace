"""
Utility functions for the denoising package.

Includes:
- Safe model loading
- Data type conversion
- Config sanitization
- Progress/result/error emission for Node.js Socket.IO integration
- Pattern detection for mask analysis
"""

import json
import warnings

import torch
import numpy as np


def safe_load_checkpoint(model_path, device='cpu'):
    """
    Safely load a PyTorch checkpoint with fallback for legacy models.

    Tries weights_only=True first for security, falls back to weights_only=False
    only if necessary (e.g., for models containing numpy objects).

    Args:
        model_path: Path to the model checkpoint file
        device: Device to load the model onto ('cpu' or 'cuda')

    Returns:
        The loaded checkpoint dictionary
    """
    try:
        return torch.load(model_path, map_location=device, weights_only=True)
    except Exception:
        warnings.warn(
            f"Loading checkpoint with weights_only=False. Ensure {model_path} is from a trusted source.",
            UserWarning
        )
        return torch.load(model_path, map_location=device, weights_only=False)


def convert_to_original_dtype(data: np.ndarray, original_dtype) -> np.ndarray:
    """
    Convert normalized float32 data back to the original dtype.

    Args:
        data: Normalized float32 data in range [0, 1]
        original_dtype: Original numpy dtype to convert to

    Returns:
        Data converted back to original dtype
    """
    # Clip to valid range first
    data = np.clip(data, 0, 1)

    if original_dtype == np.uint8:
        return (data * 255.0).astype(np.uint8)
    elif original_dtype == np.uint16:
        return (data * 65535.0).astype(np.uint16)
    elif np.issubdtype(original_dtype, np.floating):
        # Keep as float, but use the original float type
        return data.astype(original_dtype)
    else:
        # For other types, return float32
        return data.astype(np.float32)


def sanitize_config(config: dict) -> dict:
    """
    Recursively sanitize config values, converting strings to appropriate types.

    This is necessary because JSON values from the frontend may be strings
    when they should be numbers or booleans.

    Args:
        config: Configuration dictionary with potentially string values

    Returns:
        Sanitized configuration dictionary with proper types
    """
    result = {}
    for key, value in config.items():
        if isinstance(value, dict):
            result[key] = sanitize_config(value)
        elif isinstance(value, str):
            # Try to convert to number
            if value.lower() == 'true':
                result[key] = True
            elif value.lower() == 'false':
                result[key] = False
            elif value.lower() == 'null' or value.lower() == 'none':
                result[key] = None
            else:
                try:
                    # Try integer first
                    if '.' in value:
                        result[key] = float(value)
                    else:
                        result[key] = int(value)
                except ValueError:
                    # Keep as string if conversion fails
                    result[key] = value
        else:
            result[key] = value
    return result


def emit_progress(stage: str, data: dict):
    """
    Emit progress message for Node.js to parse.

    Args:
        stage: Current stage name (e.g., 'stage1', 'stage2', 'mask')
        data: Dictionary with progress information
    """
    message = {"stage": stage, **data}
    print(f"DENOISING_PROGRESS:{json.dumps(message)}", flush=True)


def emit_result(stage: str, data: dict):
    """
    Emit result message for Node.js to parse.

    Args:
        stage: Current stage name
        data: Dictionary with result information
    """
    message = {"stage": stage, **data}
    print(f"DENOISING_RESULT:{json.dumps(message)}", flush=True)


def emit_error(stage: str, message: str, details: str = None):
    """
    Emit error message for Node.js to parse.

    Args:
        stage: Stage where error occurred
        message: Error message
        details: Optional detailed error information (e.g., traceback)
    """
    data = {"stage": stage, "message": message}
    if details:
        data["details"] = details
    print(f"DENOISING_ERROR:{json.dumps(data)}", flush=True)


def detect_pattern(mask: np.ndarray) -> str:
    """
    Detect the pattern type of a mask kernel.

    Analyzes the spatial structure of active pixels in the mask
    to classify the pattern type.

    Args:
        mask: 2D numpy array representing the structural mask kernel

    Returns:
        Pattern type string: 'empty', 'single_pixel', 'horizontal_line',
        'vertical_line', 'cross', 'diagonal', or 'irregular'
    """
    if mask.size == 0:
        return "empty"

    active = np.sum(mask)
    if active == 0:
        return "empty"
    if active == 1:
        return "single_pixel"

    h, w = mask.shape
    center = (h // 2, w // 2)

    # Check for cross pattern
    horizontal = mask[center[0], :].sum()
    vertical = mask[:, center[1]].sum()

    if horizontal > active * 0.6 or vertical > active * 0.6:
        if horizontal > vertical:
            return "horizontal_line"
        elif vertical > horizontal:
            return "vertical_line"
        else:
            return "cross"

    # Check for diagonal
    diag1 = np.trace(mask)
    diag2 = np.trace(np.fliplr(mask))

    if diag1 > active * 0.5 or diag2 > active * 0.5:
        return "diagonal"

    return "irregular"


# Backwards compatibility alias
_detect_pattern = detect_pattern
