#!/usr/bin/env python3
"""
Format Utilities - Common formatting functions for BioMed Workspace Python scripts.

Provides consistent formatting for file sizes, memory values, and other display values.
"""


def format_size(size_bytes):
    """
    Format bytes as human-readable string.

    Args:
        size_bytes: Size in bytes (int or float). None values return None.

    Returns:
        str: Formatted string like "1.5 MB" or None if input is None.

    Examples:
        >>> format_size(1024)
        '1.0 KB'
        >>> format_size(1536000)
        '1.5 MB'
        >>> format_size(None)
        None
    """
    if size_bytes is None:
        return None

    for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
        if size_bytes < 1024:
            return f'{size_bytes:.1f} {unit}'
        size_bytes /= 1024
    return f'{size_bytes:.1f} PB'


# Alias for backwards compatibility with gpu_check.py naming
format_memory = format_size
