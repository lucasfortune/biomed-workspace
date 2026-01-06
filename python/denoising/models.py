"""
Model wrappers and utilities for the denoising package.

Includes:
- CenterChannelWrapper: Extracts center channel from 3-channel output models
- extract_triplet_patches: Extract triplet patches for 2.5D mask extraction
"""

import torch
import torch.nn as nn
import numpy as np


class CenterChannelWrapper(nn.Module):
    """
    Wrapper that extracts only the center channel from a 3-channel output model.

    In 2.5D mode, Stage 1 models for autoStructN2V are trained with out_channels=3
    (for 3D autocorrelation analysis). During inference, we only need the center
    channel (index 1) which predicts the center slice of the triplet.

    This wrapper makes a 3-channel output model compatible with the predictor
    which expects 1-channel output.

    Args:
        model: The underlying model to wrap
        output_channels: Expected number of output channels (default: 3)
    """

    def __init__(self, model, output_channels=3):
        super().__init__()
        self.model = model
        self.output_channels = output_channels

    def forward(self, x):
        output = self.model(x)
        # If model outputs 3 channels, extract only the center channel (index 1)
        if output.shape[1] == 3:
            return output[:, 1:2, :, :]  # Keep dims: (B, 1, H, W)
        return output


def extract_triplet_patches(stack, patch_size, num_patches, seed=None):
    """
    Extract random triplet patches from a 3D stack for 2.5D mask extraction.

    Each triplet consists of 3 consecutive slices (z-1, z, z+1) centered
    at a random position. Used for 3D autocorrelation analysis in mask extraction.

    Args:
        stack (numpy.ndarray): Input stack of shape (Z, H, W)
        patch_size (int): Size of square patches to extract
        num_patches (int): Number of triplet patches to extract
        seed (int, optional): Random seed for reproducibility

    Returns:
        numpy.ndarray: Array of triplet patches of shape (num_patches, 3, patch_size, patch_size)

    Raises:
        ValueError: If stack is too shallow (<3 slices) or image too small for patch_size
    """
    if seed is not None:
        np.random.seed(seed)

    num_slices, height, width = stack.shape

    # Valid ranges for center slice (must be able to form triplet)
    min_z = 1
    max_z = num_slices - 2  # Exclusive upper bound for center slice

    if max_z < min_z:
        raise ValueError(f"Stack too shallow for triplet extraction: {num_slices} slices, need at least 3")

    # Valid ranges for patch position
    max_y = height - patch_size
    max_x = width - patch_size

    if max_y < 0 or max_x < 0:
        raise ValueError(f"Image too small for patch_size={patch_size}: {height}x{width}")

    triplet_patches = []

    for _ in range(num_patches):
        # Random center slice index
        z = np.random.randint(min_z, max_z + 1)

        # Random patch position
        y = np.random.randint(0, max_y + 1)
        x = np.random.randint(0, max_x + 1)

        # Extract triplet patch: (3, patch_size, patch_size)
        triplet = stack[z-1:z+2, y:y+patch_size, x:x+patch_size]
        triplet_patches.append(triplet)

    return np.array(triplet_patches)
