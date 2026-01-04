# datasets/testing.py
import torch
import numpy as np

from .base import BaseNoiseDataset


class TestDataset(BaseNoiseDataset):
    """
    Dataset for testing trained Noise2Void models on complete images/slices.

    Supports both 2D and 2.5D processing modes, and both path-based and stack-based input.

    For 2.5D mode, each item returns a full triplet (3 consecutive slices).
    The model is expected to predict the center slice from the triplet input.

    Args:
        image_paths (list, optional): List of paths to test images (legacy mode).
        stack (numpy.ndarray, optional): Pre-loaded TIFF stack of shape (num_slices, H, W).
        slice_indices (list, optional): List of z-indices to use from the stack.
        mode (str, optional): Processing mode - '2d' or '2.5d'. Defaults to '2d'.

    Unlike training and validation datasets, this dataset:
    1. Processes entire images/slices instead of patches
    2. Returns one image/triplet per __getitem__ call
    3. Uses the same tensor for input and target (for evaluation)
    4. Provides a full mask (all ones) since no masking is needed for testing
    """

    def __init__(self, image_paths=None, stack=None, slice_indices=None, mode='2d'):
        # For test dataset, patches_per_image is None (full images)
        super().__init__(
            image_paths=image_paths,
            stack=stack,
            slice_indices=slice_indices,
            mode=mode,
            patch_size=None,
            patches_per_image=None
        )

    def __getitem__(self, idx):
        """
        Get a test sample consisting of a full image or triplet.

        Returns:
            tuple: (input_tensor, target_tensor, mask_tensor)
                - 2D mode: All tensors have shape (1, H, W)
                - 2.5D mode: input has shape (3, H, W), target/mask have shape (1, H, W)
                  (target is center slice only)
        """
        # Get data using the appropriate method
        data = self.get_data(idx)

        if self.mode == '2.5d':
            # data shape: (3, H, W)
            input_tensor = torch.from_numpy(data.copy()).float()
            # Target is the center slice only
            center_slice = data[1:2]  # Keep dims: (1, H, W)
            target_tensor = torch.from_numpy(center_slice.copy()).float()
            mask_tensor = torch.ones_like(target_tensor)
        else:
            # data shape: (H, W)
            input_tensor = self.to_tensor(data)
            target_tensor = input_tensor.clone()
            mask_tensor = torch.ones_like(input_tensor)

        return input_tensor, target_tensor, mask_tensor

    def get_center_z_index(self, idx):
        """
        Get the z-index of the center slice for a given dataset index.

        Useful for tracking which slice is being processed in 2.5D mode.

        Args:
            idx (int): Dataset index.

        Returns:
            int: Z-index of the center slice (for stack mode) or idx (for path mode).
        """
        if self.use_stack:
            return self.slice_indices[idx]
        else:
            return idx