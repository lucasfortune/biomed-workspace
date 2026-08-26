# datasets/base.py
import os
import numpy as np
import torch
from torch.utils.data import Dataset
from torchvision import transforms

from ..utils.image import load_and_normalize_image, load_and_preprocess_image
from ..utils.patching import find_roi_patches


class BaseNoiseDataset(Dataset):
    """
    Base dataset class that implements common functionality for all Noise2Void datasets.

    This class serves as a foundation for different types of Noise2Void datasets (training,
    validation, and testing). It handles basic operations like image loading, tensor
    conversion, and dataset length calculation.

    Supports two input modes:
    1. **Path-based (legacy)**: `image_paths` - list of paths to individual TIFF files
    2. **Stack-based (new)**: `stack` + `slice_indices` - pre-loaded TIFF stack with z-indices

    Also supports two processing modes:
    1. **2D mode**: Each sample is a single 2D slice
    2. **2.5D mode**: Each sample is a triplet of 3 consecutive slices (z-1, z, z+1)

    Args:
        image_paths (list, optional): List of paths to input images (legacy mode).
        stack (numpy.ndarray, optional): Pre-loaded TIFF stack of shape (num_slices, H, W).
        slice_indices (list, optional): List of z-indices to use from the stack.
        mode (str, optional): Processing mode - '2d' or '2.5d'. Defaults to '2d'.
        patch_size (int, optional): Size of image patches to extract.
        patches_per_image (int, optional): Number of patches to extract per image/slice.

    Note:
        Must provide either `image_paths` OR (`stack` + `slice_indices`), not both.
        In 2.5D mode with stack input, boundary slices (first and last) are automatically
        excluded from `slice_indices` since they cannot form complete triplets.
    """

    def __init__(self, image_paths=None, stack=None, slice_indices=None,
                 mode='2d', patch_size=None, patches_per_image=None):
        # Validate input mode
        has_paths = image_paths is not None and len(image_paths) > 0
        has_stack = stack is not None and slice_indices is not None

        if has_paths and has_stack:
            raise ValueError("Cannot specify both image_paths and stack/slice_indices")
        if not has_paths and not has_stack:
            raise ValueError("Must specify either image_paths or stack/slice_indices")

        self.use_stack = has_stack
        self.mode = mode
        self.patch_size = patch_size
        self.patches_per_image = patches_per_image
        self.to_tensor = transforms.ToTensor()

        if self.use_stack:
            self.stack = stack
            self.image_paths = None
            # Filter out boundary slices for 2.5D mode
            if mode == '2.5d':
                num_slices = stack.shape[0]
                self.slice_indices = [z for z in slice_indices if 0 < z < num_slices - 1]
                if len(self.slice_indices) < len(slice_indices):
                    excluded = len(slice_indices) - len(self.slice_indices)
                    print(f"Note: Excluded {excluded} boundary slice(s) for 2.5D mode")
            else:
                self.slice_indices = slice_indices
        else:
            self.image_paths = image_paths
            self.stack = None
            self.slice_indices = None
            if mode == '2.5d':
                raise ValueError("2.5D mode requires stack input, not image_paths")

    def __len__(self):
        """
        Calculate the length of the dataset.

        Returns:
            int: For training/validation datasets, returns total number of patches.
                 For test datasets, returns number of images/slices.
        """
        if self.use_stack:
            num_items = len(self.slice_indices)
        else:
            num_items = len(self.image_paths)

        if self.patches_per_image is None:
            return num_items
        return num_items * self.patches_per_image

    def load_image(self, idx):
        """
        Load and normalize an image from the dataset (legacy path-based mode).

        Args:
            idx (int): Index of the image to load.

        Returns:
            numpy.ndarray: Normalized image array of shape (H, W).
        """
        if self.use_stack:
            raise RuntimeError("load_image() called but dataset is in stack mode. Use get_slice() instead.")
        img_path = self.image_paths[idx]
        return load_and_normalize_image(img_path)

    def get_slice(self, z_idx):
        """
        Get a single slice from the stack.

        Args:
            z_idx (int): Z-index of the slice to retrieve.

        Returns:
            numpy.ndarray: Slice of shape (H, W).
        """
        if not self.use_stack:
            raise RuntimeError("get_slice() called but dataset is in path mode. Use load_image() instead.")
        return self.stack[z_idx]

    def get_triplet(self, z_idx):
        """
        Get a triplet of 3 consecutive slices for 2.5D mode.

        Args:
            z_idx (int): Z-index of the CENTER slice.

        Returns:
            numpy.ndarray: Triplet of shape (3, H, W) containing slices [z-1, z, z+1].

        Raises:
            ValueError: If z_idx is at the boundary (cannot form triplet).
        """
        if not self.use_stack:
            raise RuntimeError("get_triplet() called but dataset is in path mode.")
        if z_idx <= 0 or z_idx >= self.stack.shape[0] - 1:
            raise ValueError(f"Cannot get triplet for boundary slice z={z_idx}")
        return self.stack[z_idx - 1:z_idx + 2]  # Shape: (3, H, W)

    def get_data(self, item_idx):
        """
        Get data for a given item index, respecting the processing mode.

        This is the primary method for retrieving data, handling both 2D and 2.5D modes.

        Args:
            item_idx (int): Index into slice_indices (stack mode) or image_paths (path mode).

        Returns:
            numpy.ndarray: Data array.
                - 2D mode: Shape (H, W)
                - 2.5D mode: Shape (3, H, W)
        """
        if self.use_stack:
            z_idx = self.slice_indices[item_idx]
            if self.mode == '2.5d':
                return self.get_triplet(z_idx)
            else:
                return self.get_slice(z_idx)
        else:
            return self.load_image(item_idx)

    def preprocess_for_roi(self, img_path, scale_factor):
        """
        Preprocess an image for ROI detection.
        
        Args:
            img_path (str): Path to the image file
            scale_factor (float): Factor to scale down the image
            
        Returns:
            numpy.ndarray: Preprocessed image ready for ROI detection
        """
        return load_and_preprocess_image(img_path, scale_factor=scale_factor)
    
    def get_roi_patches(self, preprocessed_img, patch_size, threshold, above_threshold, scale_factor):
        """
        Get ROI patch coordinates using the improved find_roi_patches function.
        
        Args:
            preprocessed_img (numpy.ndarray): Preprocessed image array
            patch_size (int): Size of patches to extract
            threshold (float): Threshold for ROI detection
            above_threshold (bool): Whether to select patches above threshold
            scale_factor (float): Scale factor for coordinate conversion
            
        Returns:
            list: List of patch coordinates (top, left)
        """
        return find_roi_patches(
            preprocessed_img, 
            patch_size, 
            threshold=threshold,
            above_threshold=above_threshold,
            scale_factor=scale_factor
        )