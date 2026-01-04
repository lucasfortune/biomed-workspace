# autoStructN2V/pipeline/data.py
import os
import random
import shutil
import numpy as np
import torch
from torch.utils.data import DataLoader
from glob import glob

from ..utils.image import get_image_paths, load_tiff_stack
from ..datasets import TrainingDataset, ValidationDataset, TestDataset
from ..masking import (
    create_stage1_mask_kernel,
    create_stage1_mask_kernel_3d,
    create_full_mask,
    create_full_mask_3d,
    StructuralNoiseExtractor
)

def split_dataset(input_dir, output_dirs, split_ratio=(0.7, 0.15, 0.15), 
                image_extension='.tif', seed=None, verbose = False):
    """
    Split dataset into training, validation, and test sets.
    
    Args:
        input_dir (str): Directory containing input images
        output_dirs (dict): Dictionary with paths to output directories
        split_ratio (tuple): Ratio for (train, val, test) split
        image_extension (str): Extension of image files
        seed (int, optional): Random seed for reproducibility
        
    Returns:
        tuple: (train_paths, val_paths, test_paths) - Lists of image paths
    """
    # Set random seed for reproducibility
    if seed is not None:
        random.seed(seed)
    
    # Get all images with the specified extension
    images = glob(os.path.join(input_dir, f'*{image_extension}'))
    
    if not images:
        raise ValueError(f"No images with extension {image_extension} found in {input_dir}")
    
    # Shuffle images
    random.shuffle(images)
    
    # Calculate split indices
    n_train = int(len(images) * split_ratio[0])
    n_val = int(len(images) * split_ratio[1])
    
    # Split dataset
    train_images = images[:n_train]
    val_images = images[n_train:n_train+n_val]
    test_images = images[n_train+n_val:]
    
    # Copy images to respective directories
    train_paths = _copy_images(train_images, os.path.join(output_dirs['data'], 'train'))
    val_paths = _copy_images(val_images, os.path.join(output_dirs['data'], 'val'))
    test_paths = _copy_images(test_images, os.path.join(output_dirs['data'], 'test'))
    
    if verbose:
        print("\n=== Dataset Split Details ===")
        print(f"Total images: {len(images)}")
        print(f"Training: {len(train_paths)} images ({len(train_paths)/len(images)*100:.1f}%)")
        print(f"Validation: {len(val_paths)} images ({len(val_paths)/len(images)*100:.1f}%)")
        print(f"Testing: {len(test_paths)} images ({len(test_paths)/len(images)*100:.1f}%)")
        if train_paths:
            print(f"Sample training images: {[os.path.basename(p) for p in train_paths[:3]]}")
    else:
        print(f"Dataset split: {len(train_paths)} training, {len(val_paths)} validation, {len(test_paths)} test images")
    
    
    return train_paths, val_paths, test_paths


def split_stack_indices(num_slices, split_ratio=(0.7, 0.15, 0.15), seed=None, verbose=False):
    """
    Split z-indices of a TIFF stack into training, validation, and test sets.

    Unlike split_dataset() which copies files, this function simply partitions
    z-indices for use with a single loaded TIFF stack.

    Args:
        num_slices (int): Total number of slices in the stack
        split_ratio (tuple): Ratio for (train, val, test) split. Defaults to (0.7, 0.15, 0.15)
        seed (int, optional): Random seed for reproducibility
        verbose (bool): Whether to print split details

    Returns:
        dict: Dictionary with 'train', 'val', 'test' keys, each containing a list of z-indices

    Example:
        >>> indices = split_stack_indices(100, split_ratio=(0.7, 0.15, 0.15), seed=42)
        >>> print(len(indices['train']))  # ~70 indices
        >>> print(len(indices['val']))    # ~15 indices
        >>> print(len(indices['test']))   # ~15 indices
    """
    if seed is not None:
        random.seed(seed)

    # Create list of all z-indices
    all_indices = list(range(num_slices))

    # Shuffle indices
    random.shuffle(all_indices)

    # Calculate split sizes
    n_train = int(num_slices * split_ratio[0])
    n_val = int(num_slices * split_ratio[1])
    # Test gets the remainder

    # Split indices
    train_indices = sorted(all_indices[:n_train])
    val_indices = sorted(all_indices[n_train:n_train + n_val])
    test_indices = sorted(all_indices[n_train + n_val:])

    if verbose:
        print("\n=== Stack Split Details ===")
        print(f"Total slices: {num_slices}")
        print(f"Training: {len(train_indices)} slices ({len(train_indices)/num_slices*100:.1f}%)")
        print(f"Validation: {len(val_indices)} slices ({len(val_indices)/num_slices*100:.1f}%)")
        print(f"Testing: {len(test_indices)} slices ({len(test_indices)/num_slices*100:.1f}%)")
        if train_indices:
            print(f"Sample training indices: {train_indices[:5]}...")
    else:
        print(f"Stack split: {len(train_indices)} training, {len(val_indices)} validation, "
              f"{len(test_indices)} test slices")

    return {
        'train': train_indices,
        'val': val_indices,
        'test': test_indices
    }


def _copy_images(images, output_dir):
    """
    Copy images to the output directory.
    
    Args:
        images (list): List of image paths
        output_dir (str): Directory to copy images to
        
    Returns:
        list: Paths to copied images
    """
    os.makedirs(output_dir, exist_ok=True)
    output_paths = []
    
    for img_path in images:
        filename = os.path.basename(img_path)
        dest_path = os.path.join(output_dir, filename)
        shutil.copy2(img_path, dest_path)
        output_paths.append(dest_path)
    
    return output_paths

def create_dataloaders(image_paths=None, config=None, stage="stage1", stage1_denoised_dir=None,
                      structured_mask=None, prediction_kernel=None, verbose=False,
                      stack=None, slice_indices=None):
    """
    Create data loaders for training, validation, and testing.

    Supports two input modes:
    1. **Path mode (legacy)**: Provide `image_paths` tuple
    2. **Stack mode (2.5D)**: Provide `stack` and `slice_indices`

    Args:
        image_paths (tuple, optional): (train_paths, val_paths, test_paths) for path mode
        config (dict): Configuration dictionary
        stage (str): 'stage1' or 'stage2'
        stage1_denoised_dir (str, optional): Directory with stage1 denoised images for stage2
        structured_mask (numpy.ndarray, optional): Pre-created structured mask for stage2
        prediction_kernel (numpy.ndarray, optional): Pre-created prediction kernel for stage2
        verbose (bool): Whether to print verbose information
        stack (numpy.ndarray, optional): Loaded TIFF stack (num_slices, H, W) for stack mode
        slice_indices (dict, optional): {'train': [...], 'val': [...], 'test': [...]} for stack mode

    Returns:
        tuple: (train_loader, val_loader, test_loader)
    """
    stage_config = config[stage]
    mode = config.get('mode', '2d')

    # Determine input mode
    use_stack = stack is not None and slice_indices is not None

    if use_stack:
        # Stack mode - for 2.5D or stack-based 2D
        train_indices = slice_indices['train']
        val_indices = slice_indices['val']
        test_indices = slice_indices['test']
    else:
        # Path mode - legacy behavior
        if image_paths is None:
            raise ValueError("Must provide either image_paths or (stack, slice_indices)")
        train_paths, val_paths, test_paths = image_paths

        # For stage2, optionally use denoised images from stage1 if provided
        if stage == "stage2" and stage1_denoised_dir:
            def get_denoised_paths(orig_paths, split_name):
                denoised_paths = []
                for p in orig_paths:
                    base_name, ext = os.path.splitext(os.path.basename(p))
                    denoised_path = os.path.join(stage1_denoised_dir, split_name, f"{base_name}_denoised{ext}")
                    if os.path.exists(denoised_path):
                        denoised_paths.append(denoised_path)
                    else:
                        potential_files = glob(os.path.join(stage1_denoised_dir, split_name, f"{base_name}*{ext}"))
                        if potential_files:
                            denoised_paths.append(potential_files[0])
                        else:
                            print(f"Warning: No denoised file found for {p}")
                return denoised_paths

            train_paths = get_denoised_paths(train_paths, 'train')
            val_paths = get_denoised_paths(val_paths, 'val')
            test_paths = get_denoised_paths(test_paths, 'test')

    # Create stage-specific mask based on configuration and mode
    if stage == "stage1":
        if mode == '2.5d':
            # Create 3D single-pixel mask for 2.5D Stage 1
            single_mask = create_stage1_mask_kernel_3d(stage_config.get('mask_center_size', 1))
            mask, prediction_kernel = create_full_mask_3d(
                single_mask,
                stage_config['patch_size'],
                stage_config['mask_percentage'],
                verbose
            )
        else:
            # Create 2D single-pixel mask for 2D Stage 1
            single_mask = create_stage1_mask_kernel(stage_config.get('mask_center_size', 1))
            mask, prediction_kernel = create_full_mask(
                single_mask,
                stage_config['patch_size'],
                stage_config['mask_percentage'],
                verbose
            )
    else:  # stage2
        # For stage 2, use provided structured mask if available
        if structured_mask is not None and prediction_kernel is not None:
            mask = structured_mask
            # prediction_kernel is already provided
        else:
            # Fall back to defaults if mask not provided
            print("Warning: No structured mask provided for stage2, using defaults")
            if mode == '2.5d':
                single_mask = create_stage1_mask_kernel_3d(stage_config.get('mask_center_size', 3))
                mask, prediction_kernel = create_full_mask_3d(
                    single_mask,
                    stage_config['patch_size'],
                    stage_config['mask_percentage'],
                    verbose
                )
            else:
                single_mask = create_stage1_mask_kernel(stage_config.get('mask_center_size', 3))
                mask, prediction_kernel = create_full_mask(
                    single_mask,
                    stage_config['patch_size'],
                    stage_config['mask_percentage'],
                    verbose
                )

    if verbose:
        print(f"\n=== {stage.upper()} DataLoader Configuration ===")
        print(f"Mode: {mode}")
        if use_stack:
            print(f"Input: Stack with {stack.shape[0]} slices")
            print(f"Training slices: {len(train_indices)}")
            print(f"Validation slices: {len(val_indices)}")
            print(f"Test slices: {len(test_indices)}")
        else:
            print(f"Input: Image paths")
            print(f"Training images: {len(train_paths)}")
            print(f"Validation images: {len(val_paths)}")
            print(f"Test images: {len(test_paths)}")
        print(f"Patch size: {stage_config['patch_size']}")
        print(f"Batch size: {stage_config['batch_size']}")
        print(f"Patches per image: {stage_config['patches_per_image']}")
        print(f"Mask shape: {mask.shape}")
        print(f"Prediction kernel shape: {prediction_kernel.shape}")
        print(f"Masking strategy: {'local mean' if stage_config['masking_strategy'] == 0 else 'zeros' if stage_config['masking_strategy'] == 1 else 'random'}")

    # Create datasets based on input mode
    if use_stack:
        # Stack-based datasets
        train_dataset = TrainingDataset(
            stack=stack,
            slice_indices=train_indices,
            mode=mode,
            patch_size=stage_config['patch_size'],
            kernel_size=3,
            mask=mask,
            mask_percentage=stage_config['mask_percentage'],
            mask_strat=stage_config['masking_strategy'],
            prediction_kernel=prediction_kernel,
            patches_per_image=stage_config['patches_per_image'],
            use_roi=False,  # ROI not supported in stack mode
            use_augmentation=stage_config['use_augmentation']
        )

        val_dataset = ValidationDataset(
            stack=stack,
            slice_indices=val_indices,
            mode=mode,
            patch_size=stage_config['patch_size'],
            patches_per_image=stage_config['patches_per_image'] // 2,
            use_roi=False
        )

        test_dataset = TestDataset(
            stack=stack,
            slice_indices=test_indices,
            mode=mode
        )
    else:
        # Path-based datasets (legacy)
        train_dataset = TrainingDataset(
            image_paths=train_paths,
            patch_size=stage_config['patch_size'],
            kernel_size=3,
            mask=mask,
            mask_percentage=stage_config['mask_percentage'],
            mask_strat=stage_config['masking_strategy'],
            prediction_kernel=prediction_kernel,
            patches_per_image=stage_config['patches_per_image'],
            use_roi=stage_config['use_roi'],
            scale_factor=stage_config['scale_factor'],
            roi_threshold=stage_config['roi_threshold'],
            select_background=stage_config['select_background'],
            use_augmentation=stage_config['use_augmentation']
        )

        val_dataset = ValidationDataset(
            image_paths=val_paths,
            patch_size=stage_config['patch_size'],
            patches_per_image=stage_config['patches_per_image'] // 2,
            use_roi=stage_config['use_roi'],
            scale_factor=stage_config['scale_factor'],
            roi_threshold=stage_config['roi_threshold'],
            select_background=stage_config['select_background']
        )

        test_dataset = TestDataset(
            image_paths=test_paths
        )

    # Create data loaders
    train_loader = DataLoader(
        train_dataset,
        batch_size=stage_config['batch_size'],
        shuffle=True,
        num_workers=4,
        pin_memory=True if torch.cuda.is_available() else False
    )

    val_loader = DataLoader(
        val_dataset,
        batch_size=stage_config['batch_size'],
        shuffle=False,
        num_workers=4,
        pin_memory=True if torch.cuda.is_available() else False
    )

    test_loader = DataLoader(
        test_dataset,
        batch_size=1,  # Process one full image at a time
        shuffle=False
    )

    return train_loader, val_loader, test_loader