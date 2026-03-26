#!/usr/bin/env python3
"""
Downsample TIFF stack for web visualization
Creates a lightweight version optimized for browser display
"""

import sys
import tifffile
import numpy as np
from tiff_validation_utils import safe_imread
from PIL import Image
import os

def downsample_tiff_for_web(input_path, output_path, downsample_factor=0.5, slice_interval=5):
    """
    Downsample TIFF stack for efficient web rendering
    
    Args:
        input_path: Path to original TIFF stack
        output_path: Path to save downsampled TIFF
        downsample_factor: Factor to downsample spatial dimensions (0.25 = 25% of original)
        slice_interval: Take every Nth slice (5 = every 5th slice)
    
    Returns:
        dict: Information about the downsampled data
    """
    try:
        print(f"Loading original TIFF from: {input_path}", flush=True)
        original_stack = safe_imread(input_path)
        
        print(f"Original shape: {original_stack.shape}", flush=True)
        print(f"Original dtype: {original_stack.dtype}", flush=True)
        
        # Get dimensions
        if len(original_stack.shape) == 3:
            depth, height, width = original_stack.shape
        else:
            raise ValueError(f"Expected 3D stack, got shape: {original_stack.shape}")
        
        # Calculate new dimensions
        new_height = max(32, int(height * downsample_factor))
        new_width = max(32, int(width * downsample_factor))
        
        print(f"Target spatial size: {new_height}x{new_width}", flush=True)
        
        # Select slices at intervals
        selected_indices = range(0, depth, slice_interval)
        num_slices = len(selected_indices)
        
        print(f"Selecting {num_slices} slices (every {slice_interval}th slice)", flush=True)
        
        # Create downsampled stack
        downsampled_stack = np.zeros((num_slices, new_height, new_width), dtype=np.uint8)
        
        for i, slice_idx in enumerate(selected_indices):
            # Get original slice
            original_slice = original_stack[slice_idx]
            
            # Normalize to 0-255 range for display
            slice_min, slice_max = original_slice.min(), original_slice.max()
            if slice_max > slice_min:
                normalized = ((original_slice - slice_min) / (slice_max - slice_min) * 255).astype(np.uint8)
            else:
                normalized = np.zeros_like(original_slice, dtype=np.uint8)
            
            # Downsample using PIL for high-quality resampling
            pil_image = Image.fromarray(normalized)
            downsampled_pil = pil_image.resize((new_width, new_height), Image.LANCZOS)
            downsampled_stack[i] = np.array(downsampled_pil)
            
            # Progress indicator
            if (i + 1) % 10 == 0 or (i + 1) == num_slices:
                progress = (i + 1) / num_slices * 100
                print(f"Progress: {progress:.1f}% ({i+1}/{num_slices} slices)", flush=True)
        
        # Save downsampled stack
        print(f"Saving downsampled TIFF to: {output_path}", flush=True)
        tifffile.imwrite(output_path, downsampled_stack)
        
        # Calculate file sizes
        original_size_mb = os.path.getsize(input_path) / (1024 * 1024)
        downsampled_size_mb = os.path.getsize(output_path) / (1024 * 1024)
        compression_ratio = original_size_mb / downsampled_size_mb if downsampled_size_mb > 0 else 0
        
        info = {
            'success': True,
            'original_shape': list(original_stack.shape),
            'downsampled_shape': list(downsampled_stack.shape),
            'downsample_factor': downsample_factor,
            'slice_interval': slice_interval,
            'original_size_mb': round(original_size_mb, 2),
            'downsampled_size_mb': round(downsampled_size_mb, 2),
            'compression_ratio': round(compression_ratio, 1)
        }
        
        print("=" * 50, flush=True)
        print("DOWNSAMPLING SUMMARY:", flush=True)
        print(f"  Original: {original_stack.shape} ({original_size_mb:.2f} MB)", flush=True)
        print(f"  Downsampled: {downsampled_stack.shape} ({downsampled_size_mb:.2f} MB)", flush=True)
        print(f"  Compression: {compression_ratio:.1f}x smaller", flush=True)
        print(f"  Saved to: {output_path}", flush=True)
        print("=" * 50, flush=True)
        
        return info
        
    except Exception as e:
        print(f"Error during downsampling: {str(e)}", flush=True)
        return {
            'success': False,
            'error': str(e)
        }

def main():
    if len(sys.argv) < 3:
        print("Usage: python downsample_for_web.py <input_tiff> <output_tiff> [downsample_factor] [slice_interval]")
        sys.exit(1)
    
    input_path = sys.argv[1]
    output_path = sys.argv[2]
    downsample_factor = float(sys.argv[3]) if len(sys.argv) > 3 else 0.5
    slice_interval = int(sys.argv[4]) if len(sys.argv) > 4 else 5
    
    result = downsample_tiff_for_web(input_path, output_path, downsample_factor, slice_interval)
    
    # Output JSON result for server to parse
    import json
    print(f"DOWNSAMPLE_RESULT:{json.dumps(result)}", flush=True)
    
    sys.exit(0 if result['success'] else 1)

if __name__ == "__main__":
    main()