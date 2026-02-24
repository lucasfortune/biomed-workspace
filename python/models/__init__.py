"""
Shared model architectures for segmentation pipeline.

- UNet: Standard 2D U-Net (single-head, class labels only)
- UNet25D: Direction-aware 2.5D U-Net (dual-head: segmentation + direction)
"""

from .unet import UNet, UNet25D

__all__ = ['UNet', 'UNet25D']
