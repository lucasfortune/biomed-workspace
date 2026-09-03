#!/usr/bin/env python3
"""
Filter-based denoising for TIFF stacks.
Uses scipy and skimage for Gaussian and Non-Local Means filtering.

Usage:
    python filter_denoising.py --input <path> --output <path> --method <gaussian|nlm> [options]

Options:
    --sigma <float>     Gaussian sigma (default: 1.5)
    --kernel <int>      Gaussian kernel size (default: 5)
    --h <float>         NLM filter strength (default: 10)
    --template <int>    NLM template window size (default: 7)
    --search <int>      NLM search window size (default: 21)
"""

import sys
import json
import argparse
import numpy as np
from tiff_validation_utils import safe_imread
import tifffile
from scipy.ndimage import gaussian_filter


def emit_progress(current, total, message="Processing..."):
    """Emit progress update to stdout."""
    data = {
        "current": current,
        "total": total,
        "percent": round((current / total) * 100, 1) if total > 0 else 0,
        "message": message
    }
    print(f"FILTER_PROGRESS:{json.dumps(data)}", flush=True)


def emit_result(data):
    """Emit final result to stdout."""
    print(f"FILTER_RESULT:{json.dumps(data)}", flush=True)


def emit_error(message):
    """Emit error to stdout."""
    print(f"FILTER_ERROR:{json.dumps({'error': message})}", flush=True)


def apply_gaussian(stack, sigma, kernel_size):
    """
    Apply Gaussian filter to each slice of the stack.

    Args:
        stack: Input image stack (Z, Y, X)
        sigma: Gaussian sigma (blur strength)
        kernel_size: Width of the filter window in pixels (odd). Mapped to
                    scipy's ``truncate`` so the kernel spans exactly
                    kernel_size x kernel_size pixels; scipy renormalises the
                    truncated weights, so a small window with a large sigma
                    behaves like a box-limited Gaussian.

    Returns:
        Filtered stack with same dtype as input
    """
    original_dtype = stack.dtype
    result = np.zeros_like(stack, dtype=np.float64)

    # scipy builds a kernel of 2 * int(truncate * sigma + 0.5) + 1 taps;
    # solve for truncate so the window is exactly kernel_size wide
    radius = max(1, (int(kernel_size) - 1) // 2)
    truncate = radius / sigma if sigma > 0 else 4.0

    total_slices = stack.shape[0]
    for i in range(total_slices):
        emit_progress(i + 1, total_slices, f"Applying Gaussian filter to slice {i + 1}/{total_slices}")
        result[i] = gaussian_filter(stack[i].astype(np.float64), sigma=sigma, truncate=truncate)

    # Convert back to original dtype
    if np.issubdtype(original_dtype, np.integer):
        # Clip to valid range for integer dtypes
        info = np.iinfo(original_dtype)
        result = np.clip(result, info.min, info.max)

    return result.astype(original_dtype)


def apply_nlm(stack, h, template_size, search_size):
    """
    Apply Non-Local Means filter to each slice of the stack.

    Args:
        stack: Input image stack (Z, Y, X)
        h: Filter strength (higher = more denoising)
        template_size: Patch size to compare
        search_size: Area to search for similar patches

    Returns:
        Filtered stack with same dtype as input
    """
    # Import here to avoid loading if not needed
    from skimage.restoration import denoise_nl_means

    # Try to import estimate_sigma, fallback to simple estimation if PyWavelets not installed
    try:
        from skimage.restoration import estimate_sigma as sk_estimate_sigma
        use_estimate_sigma = True
    except ImportError:
        print("Warning: PyWavelets not installed, using fixed sigma estimation", file=sys.stderr)
        use_estimate_sigma = False

    original_dtype = stack.dtype
    result = np.zeros_like(stack, dtype=np.float64)

    total_slices = stack.shape[0]
    for i in range(total_slices):
        emit_progress(i + 1, total_slices, f"Applying NLM filter to slice {i + 1}/{total_slices}")

        # Normalize slice for NLM (works best with float in [0, 1])
        slice_data = stack[i].astype(np.float64)
        slice_max = slice_data.max()

        if slice_max > 0:
            slice_norm = slice_data / slice_max
        else:
            slice_norm = slice_data

        # Estimate sigma from the normalized image
        if use_estimate_sigma:
            sigma_est = sk_estimate_sigma(slice_norm)
        else:
            # Simple fallback: estimate sigma as std of image / 2
            # This is a rough approximation but works for many cases
            sigma_est = np.std(slice_norm) * 0.5
            sigma_est = max(sigma_est, 0.01)  # Ensure minimum value

        # Apply NLM
        # patch_size is the size of patches used for denoising
        # patch_distance is how far to search for similar patches
        denoised = denoise_nl_means(
            slice_norm,
            h=h * sigma_est,  # Scale h by estimated noise
            patch_size=template_size,
            patch_distance=search_size // 2,
            fast_mode=True,
            channel_axis=None  # 2D image
        )

        # Scale back to original range
        if slice_max > 0:
            result[i] = denoised * slice_max
        else:
            result[i] = denoised

    # Convert back to original dtype
    if np.issubdtype(original_dtype, np.integer):
        info = np.iinfo(original_dtype)
        result = np.clip(result, info.min, info.max)

    return result.astype(original_dtype)


def main():
    parser = argparse.ArgumentParser(description='Filter-based denoising for TIFF stacks')
    parser.add_argument('--input', required=True, help='Input TIFF file path')
    parser.add_argument('--output', required=True, help='Output TIFF file path')
    parser.add_argument('--method', required=True, choices=['gaussian', 'nlm'],
                        help='Denoising method')

    # Gaussian parameters
    parser.add_argument('--sigma', type=float, default=1.5,
                        help='Gaussian sigma (default: 1.5)')
    parser.add_argument('--kernel', type=int, default=5,
                        help='Gaussian kernel size (default: 5)')

    # NLM parameters
    parser.add_argument('--h', type=float, default=10,
                        help='NLM filter strength (default: 10)')
    parser.add_argument('--template', type=int, default=7,
                        help='NLM template window size (default: 7)')
    parser.add_argument('--search', type=int, default=21,
                        help='NLM search window size (default: 21)')

    args = parser.parse_args()

    try:
        # Load input stack
        emit_progress(0, 1, "Loading input file...")
        stack = safe_imread(args.input)

        # Ensure 3D
        if stack.ndim == 2:
            stack = stack[np.newaxis, ...]  # Add Z dimension

        print(f"Input shape: {stack.shape}, dtype: {stack.dtype}", file=sys.stderr)

        # Apply denoising
        if args.method == 'gaussian':
            result = apply_gaussian(stack, args.sigma, args.kernel)
        else:
            result = apply_nlm(stack, args.h, args.template, args.search)

        # Save output
        emit_progress(1, 1, "Saving output file...")
        tifffile.imwrite(args.output, result)

        # Emit success result
        emit_result({
            'success': True,
            'slices_processed': stack.shape[0],
            'method': args.method,
            'input_shape': list(stack.shape),
            'input_dtype': str(stack.dtype),
            'output_dtype': str(result.dtype)
        })

    except Exception as e:
        emit_error(str(e))
        sys.exit(1)


if __name__ == '__main__':
    main()
