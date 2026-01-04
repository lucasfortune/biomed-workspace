# datasets/validation.py
import random
import numpy as np
import torch

from .base import BaseNoiseDataset


class ValidationDataset(BaseNoiseDataset):
    """
    Dataset for validating Noise2Void models during training.

    Supports both 2D and 2.5D processing modes, and both path-based and stack-based input.

    Args:
        image_paths (list, optional): List of paths to validation images (legacy mode).
        stack (numpy.ndarray, optional): Pre-loaded TIFF stack of shape (num_slices, H, W).
        slice_indices (list, optional): List of z-indices to use from the stack.
        mode (str, optional): Processing mode - '2d' or '2.5d'. Defaults to '2d'.
        patch_size (int): Size of image patches to extract.
        patches_per_image (int): Number of patches to extract per image/slice.
        use_roi (bool, optional): Whether to use ROI selection. Defaults to False.
        scale_factor (float, optional): Factor for ROI detection. Defaults to 0.25.
        roi_threshold (float, optional): Threshold for ROI detection. Defaults to 0.5.
        select_background (bool, optional): If True, selects background patches. Defaults to True.
    """

    def __init__(self, image_paths=None, stack=None, slice_indices=None, mode='2d',
                 patch_size=None, patches_per_image=50, use_roi=False, scale_factor=0.25,
                 roi_threshold=0.5, select_background=True):
        # Initialize base class
        super().__init__(
            image_paths=image_paths,
            stack=stack,
            slice_indices=slice_indices,
            mode=mode,
            patch_size=patch_size,
            patches_per_image=patches_per_image
        )

        self.use_roi = use_roi
        self.scale_factor = scale_factor
        self.roi_threshold = roi_threshold
        self.select_background = select_background

        # Pre-compute ROI patches only for path-based mode
        self.roi_patches = []
        if self.use_roi and not self.use_stack:
            for img_path in image_paths:
                preprocessed_img = self.preprocess_for_roi(img_path, scale_factor)
                patches = self.get_roi_patches(
                    preprocessed_img,
                    patch_size,
                    threshold=roi_threshold,
                    above_threshold=select_background,
                    scale_factor=scale_factor
                )
                self.roi_patches.append(patches)

    def __getitem__(self, idx):
        """
        Get a validation sample.

        Returns input patch, target patch (identical), and a ones mask.
        No masking is applied for validation.

        Returns:
            tuple: (input_tensor, target_tensor, mask_tensor)
                - 2D mode: All tensors have shape (1, H, W)
                - 2.5D mode: Tensors have shape (3, H, W)
        """
        item_idx = idx // self.patches_per_image

        # Get data using the appropriate method
        data = self.get_data(item_idx)

        # Get spatial dimensions
        if self.mode == '2.5d':
            _, h, w = data.shape
        else:
            h, w = data.shape

        # Select patch location
        if not self.use_stack and self.use_roi and self.roi_patches[item_idx]:
            top, left = random.choice(self.roi_patches[item_idx])
            if top + self.patch_size > h or left + self.patch_size > w:
                top = np.random.randint(0, h - self.patch_size)
                left = np.random.randint(0, w - self.patch_size)
        else:
            top = np.random.randint(0, h - self.patch_size)
            left = np.random.randint(0, w - self.patch_size)

        # Extract the patch
        if self.mode == '2.5d':
            patch = data[:, top:top + self.patch_size, left:left + self.patch_size]
            input_tensor = torch.from_numpy(patch.copy()).float()
        else:
            patch = data[top:top + self.patch_size, left:left + self.patch_size]
            input_tensor = self.to_tensor(patch)

        return input_tensor, input_tensor.clone(), torch.ones_like(input_tensor)