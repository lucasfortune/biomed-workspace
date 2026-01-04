# datasets/training.py
import random
import numpy as np
import torch

from .base import BaseNoiseDataset


class TrainingDataset(BaseNoiseDataset):
    """
    Dataset for training Noise2Void with blind-spot masking.

    Supports both 2D and 2.5D processing modes:
    - 2D mode: Single slice input/output
    - 2.5D mode: 3-slice triplet input, with masking applied across all slices

    Can use either path-based (legacy) or stack-based (new) input.

    Args:
        image_paths (list, optional): List of paths to input images (legacy mode).
        stack (numpy.ndarray, optional): Pre-loaded TIFF stack of shape (num_slices, H, W).
        slice_indices (list, optional): List of z-indices to use from the stack.
        mode (str, optional): Processing mode - '2d' or '2.5d'. Defaults to '2d'.
        patch_size (int): Size of image patches to extract.
        kernel_size (int): Size of the kernel for blind-spot masking.
        mask (numpy.ndarray): Boolean mask array. Shape (H, W) for 2D, (3, H, W) for 2.5D.
        mask_percentage (float): Percentage of pixels to mask in each patch.
        mask_strat (int): Masking strategy (0: local mean, 1: zeros, 2: random).
        prediction_kernel (numpy.ndarray): Kernel indicating prediction positions.
        patches_per_image (int): Number of patches to extract per image/slice.
        use_roi (bool, optional): Whether to use ROI-based patch selection. Defaults to True.
        scale_factor (float, optional): Factor for ROI detection. Defaults to 0.25.
        roi_threshold (float, optional): Threshold for ROI detection. Defaults to 0.5.
        select_background (bool, optional): If True, selects background patches. Defaults to True.
        use_augmentation (bool, optional): Whether to apply data augmentation. Defaults to True.
    """

    def __init__(self, image_paths=None, stack=None, slice_indices=None, mode='2d',
                 patch_size=None, kernel_size=3, mask=None, mask_percentage=0.15, mask_strat=0,
                 prediction_kernel=None, patches_per_image=100, use_roi=True, scale_factor=0.25,
                 roi_threshold=0.5, select_background=True, use_augmentation=True):
        # Initialize base class with appropriate input mode
        super().__init__(
            image_paths=image_paths,
            stack=stack,
            slice_indices=slice_indices,
            mode=mode,
            patch_size=patch_size,
            patches_per_image=patches_per_image
        )

        self.kernel_size = kernel_size
        self.mask_percentage = mask_percentage
        self.mask_strat = mask_strat
        self.prediction_kernel = prediction_kernel
        self.use_roi = use_roi
        self.scale_factor = scale_factor
        self.roi_threshold = roi_threshold
        self.select_background = select_background
        self.mask = mask
        self.use_augmentation = use_augmentation

        # Pre-compute ROI patches only for path-based mode with ROI selection
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
    
    def apply_augmentation(self, data):
        """
        Apply random data augmentation to image data.

        Augmentations include:
        - Horizontal flip (50% chance)
        - Vertical flip (50% chance)
        - 90-degree rotations (25% chance for each of 90, 180, 270 degrees)

        Works for both 2D (H, W) and 3D (C, H, W) data.

        Args:
            data (numpy.ndarray): Input data to augment. Shape (H, W) or (C, H, W).

        Returns:
            numpy.ndarray: Augmented data with same shape as input.
        """
        augmented = data.copy()
        is_3d = data.ndim == 3

        # Random horizontal flip (50% chance)
        if random.random() > 0.5:
            if is_3d:
                augmented = np.flip(augmented, axis=2)  # Flip along W
            else:
                augmented = np.fliplr(augmented)

        # Random vertical flip (50% chance)
        if random.random() > 0.5:
            if is_3d:
                augmented = np.flip(augmented, axis=1)  # Flip along H
            else:
                augmented = np.flipud(augmented)

        # Random rotation (25% chance each for 90, 180, 270 degrees)
        k = random.choice([0, 1, 2, 3])  # 0: no rotation, 1: 90°, 2: 180°, 3: 270°
        if k > 0:
            if is_3d:
                # Rotate each slice in the triplet
                augmented = np.rot90(augmented, k=k, axes=(1, 2))
            else:
                augmented = np.rot90(augmented, k=k)

        return np.ascontiguousarray(augmented)
        
    def __getitem__(self, idx):
        """
        Get a training sample consisting of an input patch, target patch, and mask.

        The input patch has some pixels masked according to the noise2void strategy.
        Applies random augmentation if enabled.

        Returns:
            tuple: (input_tensor, target_tensor, mask_tensor)
                - 2D mode: All tensors have shape (1, H, W)
                - 2.5D mode: input/target have shape (3, H, W), mask has shape (3, H, W)
        """
        # Calculate which image/slice and which patch within that image
        item_idx = idx // self.patches_per_image

        # Get data using the appropriate method (handles both path and stack modes)
        data = self.get_data(item_idx)

        # Apply augmentation if enabled
        if self.use_augmentation:
            data = self.apply_augmentation(data)

        # Get spatial dimensions (works for both 2D and 3D data)
        if self.mode == '2.5d':
            _, h, w = data.shape  # (3, H, W)
        else:
            h, w = data.shape  # (H, W)

        # Select patch location
        if not self.use_stack and self.use_roi and self.roi_patches[item_idx]:
            # Choose random coordinates from pre-computed ROI patches (path mode only)
            top, left = random.choice(self.roi_patches[item_idx])

            # Check bounds after augmentation
            if top + self.patch_size > h or left + self.patch_size > w:
                top = np.random.randint(0, h - self.patch_size)
                left = np.random.randint(0, w - self.patch_size)
        else:
            # Random selection
            top = np.random.randint(0, h - self.patch_size)
            left = np.random.randint(0, w - self.patch_size)

        # Extract the patch
        if self.mode == '2.5d':
            # Extract patch from all 3 slices: (3, patch_size, patch_size)
            patch = data[:, top:top + self.patch_size, left:left + self.patch_size]
        else:
            # Extract 2D patch: (patch_size, patch_size)
            patch = data[top:top + self.patch_size, left:left + self.patch_size]

        # Apply masking to create input
        input_patch, _ = self.apply_mask(
            patch,
            mask_percentage=self.mask_percentage,
            mask_strat=self.mask_strat,
            kernel_size=self.kernel_size,
            mask=self.mask
        )

        # Create target patch (original, unmasked patch)
        target_patch = patch.copy()

        # Convert to tensors
        if self.mode == '2.5d':
            # Already (3, H, W), convert directly
            input_tensor = torch.from_numpy(input_patch).float()
            target_tensor = torch.from_numpy(target_patch).float()
        else:
            # Use to_tensor which adds channel dim: (H, W) -> (1, H, W)
            input_tensor = self.to_tensor(input_patch)
            target_tensor = self.to_tensor(target_patch)

        # Mask tensor
        mask_tensor = torch.from_numpy(self.prediction_kernel).float()

        return input_tensor, target_tensor, mask_tensor
        
    def apply_mask(self, patch, mask_percentage, mask_strat, kernel_size, mask):
        """
        Apply masking kernel to an image patch using various strategies.

        Supports both 2D patches (H, W) and 3D patches (C, H, W) for 2.5D mode.

        Args:
            patch (numpy.ndarray): Input patch. Shape (H, W) for 2D or (C, H, W) for 2.5D.
            mask_percentage (float): Percentage of patch to mask (0-100).
            mask_strat (int): Masking strategy:
                0: Replace with local mean of unmasked neighbors
                1: Replace with zero
                2: Replace with random unmasked value
            kernel_size (int): Size of mask kernel for non-structured masking.
            mask (numpy.ndarray): Boolean mask. Shape (H, W) for 2D or (C, H, W) for 2.5D.

        Returns:
            tuple:
                masked_patch (numpy.ndarray): Patch with masking applied (same shape as input)
                mask (numpy.ndarray): Boolean array showing masked positions
        """
        if mask.shape != patch.shape:
            raise ValueError(f"Mask shape {mask.shape} doesn't match patch shape {patch.shape}")

        masked_patch = patch.copy()

        if patch.ndim == 3:
            # 3D patch (C, H, W) - apply masking to each channel
            return self._apply_mask_3d(masked_patch, mask, mask_strat)
        else:
            # 2D patch (H, W)
            return self._apply_mask_2d(masked_patch, mask, mask_strat)

    def _apply_mask_2d(self, patch, mask, mask_strat):
        """Apply masking to a 2D patch."""
        h, w = patch.shape
        masked_patch = patch.copy()

        if mask_strat == 1:  # Zero
            masked_patch[mask] = 0
        elif mask_strat == 2:  # Random
            unmasked_values = patch[~mask]
            if len(unmasked_values) > 0:
                masked_patch[mask] = np.random.choice(unmasked_values, size=np.sum(mask))
        else:  # Local mean
            for i in range(h):
                for j in range(w):
                    if mask[i, j]:
                        i_start, i_end = max(0, i - 1), min(h, i + 2)
                        j_start, j_end = max(0, j - 1), min(w, j + 2)

                        neighborhood = patch[i_start:i_end, j_start:j_end]
                        neighborhood_mask = mask[i_start:i_end, j_start:j_end]
                        unmasked_values = neighborhood[~neighborhood_mask]

                        if len(unmasked_values) > 0:
                            masked_patch[i, j] = np.mean(unmasked_values)
                        else:
                            unmasked_values = patch[~mask]
                            if len(unmasked_values) > 0:
                                masked_patch[i, j] = np.random.choice(unmasked_values)

        return masked_patch, mask

    def _apply_mask_3d(self, patch, mask, mask_strat):
        """
        Apply masking to a 3D patch (C, H, W).

        For each masked position, uses values from the same spatial location
        across all channels when computing replacements.
        """
        c, h, w = patch.shape
        masked_patch = patch.copy()

        if mask_strat == 1:  # Zero
            masked_patch[mask] = 0
        elif mask_strat == 2:  # Random
            # For each channel, replace with random unmasked value from same channel
            for ch in range(c):
                ch_mask = mask[ch]
                unmasked_values = patch[ch][~ch_mask]
                if len(unmasked_values) > 0:
                    masked_patch[ch][ch_mask] = np.random.choice(
                        unmasked_values, size=np.sum(ch_mask)
                    )
        else:  # Local mean
            for ch in range(c):
                ch_mask = mask[ch]
                ch_patch = patch[ch]
                for i in range(h):
                    for j in range(w):
                        if ch_mask[i, j]:
                            i_start, i_end = max(0, i - 1), min(h, i + 2)
                            j_start, j_end = max(0, j - 1), min(w, j + 2)

                            neighborhood = ch_patch[i_start:i_end, j_start:j_end]
                            neighborhood_mask = ch_mask[i_start:i_end, j_start:j_end]
                            unmasked_values = neighborhood[~neighborhood_mask]

                            if len(unmasked_values) > 0:
                                masked_patch[ch, i, j] = np.mean(unmasked_values)
                            else:
                                unmasked_values = ch_patch[~ch_mask]
                                if len(unmasked_values) > 0:
                                    masked_patch[ch, i, j] = np.random.choice(unmasked_values)

        return masked_patch, mask