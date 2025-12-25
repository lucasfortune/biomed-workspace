#!/usr/bin/env python3
"""
GPU Detection Utility for Deep Learning Denoising Module

Detects CUDA availability and returns GPU information as JSON.
Used by the web application to determine if GPU acceleration is available.
"""

import json
import sys


def check_gpu():
    """
    Check GPU/CUDA availability and return device information.

    Returns:
        dict: GPU information including:
            - available: bool - whether GPU is available
            - device: str - device name ('cuda' or 'cpu')
            - device_name: str - GPU model name (if available)
            - device_count: int - number of GPUs
            - memory_total: int - total GPU memory in bytes (if available)
            - memory_free: int - free GPU memory in bytes (if available)
            - cuda_version: str - CUDA version (if available)
            - warning: str - warning message if CPU-only (optional)
    """
    result = {
        'available': False,
        'device': 'cpu',
        'device_name': None,
        'device_count': 0,
        'memory_total': None,
        'memory_free': None,
        'cuda_version': None,
        'warning': None
    }

    try:
        import torch

        if torch.cuda.is_available():
            result['available'] = True
            result['device'] = 'cuda'
            result['device_count'] = torch.cuda.device_count()
            result['cuda_version'] = torch.version.cuda

            # Get details for the first GPU
            if result['device_count'] > 0:
                result['device_name'] = torch.cuda.get_device_name(0)

                # Get memory info
                try:
                    memory_info = torch.cuda.mem_get_info(0)
                    result['memory_free'] = memory_info[0]
                    result['memory_total'] = memory_info[1]
                except Exception:
                    # Fallback for older PyTorch versions
                    props = torch.cuda.get_device_properties(0)
                    result['memory_total'] = props.total_memory
                    result['memory_free'] = None
        else:
            result['warning'] = (
                'No GPU detected. Training will run on CPU, which may be '
                'significantly slower (10-50x). Consider using a machine with '
                'a CUDA-capable GPU for faster training.'
            )

    except ImportError:
        result['warning'] = (
            'PyTorch is not installed. Please install PyTorch with CUDA support '
            'for GPU acceleration.'
        )
    except Exception as e:
        result['warning'] = f'Error checking GPU: {str(e)}'

    return result


def format_memory(bytes_value):
    """Format bytes as human-readable string."""
    if bytes_value is None:
        return None

    for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
        if bytes_value < 1024:
            return f'{bytes_value:.1f} {unit}'
        bytes_value /= 1024
    return f'{bytes_value:.1f} PB'


def main():
    """Main entry point - outputs JSON to stdout."""
    result = check_gpu()

    # Add formatted memory for convenience
    if result['memory_total']:
        result['memory_total_formatted'] = format_memory(result['memory_total'])
    if result['memory_free']:
        result['memory_free_formatted'] = format_memory(result['memory_free'])

    print(json.dumps(result, indent=2))

    # Exit with code 0 for GPU available, 1 for CPU-only
    sys.exit(0 if result['available'] else 1)


if __name__ == '__main__':
    main()
