# autoStructN2V/utils/mask_utils.py
"""
Utilities for creating, loading, and manipulating masks for Stage 2 training.

Note: This module deals with single masking kernels (the output of StructuralNoiseExtractor.extract_mask()).
These kernels are then converted to full masks using create_full_mask() during training.
When saving masks for future Stage 2 use, only the single kernel should be saved.
"""

import os
import numpy as np
import matplotlib.pyplot as plt
from glob import glob

from ..masking import StructuralNoiseExtractor
from ..utils.image import load_and_normalize_image

def create_mask_from_images(image_paths, output_path, extractor_config=None, 
                           max_images=10, patches_per_image=50, patch_size=64, 
                           verbose=True):
    """
    Create a structural mask from a list of images and save it to a file.
    
    Args:
        image_paths (list): List of paths to input images
        output_path (str): Path to save the generated mask (.npy file)
        extractor_config (dict, optional): Configuration for StructuralNoiseExtractor
        max_images (int): Maximum number of images to use for mask creation
        patches_per_image (int): Number of patches to extract per image
        patch_size (int): Size of patches to extract
        verbose (bool): Whether to show verbose output and visualization
        
    Returns:
        numpy.ndarray: Generated mask
    """
    # Default extractor configuration
    if extractor_config is None:
        extractor_config = {
            'norm_autocorr': True,
            'log_autocorr': True,
            'crop_autocorr': True,
            'adapt_autocorr': True,
            'adapt_CB': 50.0,
            'adapt_DF': 0.95,
            'center_size': 11,
            'base_percentile': 50,
            'percentile_decay': 1.15,
            'center_ratio_threshold': 0.3,
            'use_center_proximity': True,
            'center_proximity_threshold': 0.95,
            'keep_center_component_only': True,
            'max_true_pixels': 25
        }
    
    # Create extractor
    extractor = StructuralNoiseExtractor(**extractor_config)
    
    # Limit number of images to process
    selected_paths = image_paths[:max_images]
    
    if verbose:
        print(f"Creating mask from {len(selected_paths)} images...")
        print(f"Patch size: {patch_size}, Patches per image: {patches_per_image}")
    
    # Extract patches from images
    all_patches = []
    
    for img_path in selected_paths:
        if verbose:
            print(f"Processing: {os.path.basename(img_path)}")
        
        # Load image
        img_array = load_and_normalize_image(img_path)
        h, w = img_array.shape
        
        # Extract random patches
        patches_from_image = 0
        while patches_from_image < patches_per_image and h >= patch_size and w >= patch_size:
            top = np.random.randint(0, h - patch_size + 1)
            left = np.random.randint(0, w - patch_size + 1)
            patch = img_array[top:top+patch_size, left:left+patch_size]
            all_patches.append(patch)
            patches_from_image += 1
    
    if not all_patches:
        raise ValueError("No valid patches could be extracted from the images")
    
    if verbose:
        print(f"Extracted {len(all_patches)} patches total")
    
    # Convert to numpy array
    noise_patterns = np.array(all_patches)
    
    # Generate mask
    struct_mask, autocorr_center = extractor.extract_mask(noise_patterns, verbose)
    
    # Save mask
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    np.save(output_path, struct_mask)
    
    if verbose:
        print(f"Mask saved to: {output_path}")
        print(f"Mask shape: {struct_mask.shape}")
        print(f"True pixels: {np.sum(struct_mask)} ({np.sum(struct_mask)/struct_mask.size*100:.2f}%)")
    
    return struct_mask

def load_and_validate_mask(mask_path, expected_shape=None, verbose=True):
    """
    Load a mask from file and validate its properties.
    
    Args:
        mask_path (str): Path to the mask file
        expected_shape (tuple, optional): Expected shape of the mask
        verbose (bool): Whether to print validation results
        
    Returns:
        numpy.ndarray: Loaded and validated mask
        
    Raises:
        ValueError: If mask is invalid
    """
    if not os.path.exists(mask_path):
        raise FileNotFoundError(f"Mask file not found: {mask_path}")
    
    # Load mask
    mask = np.load(mask_path)
    
    # Validate type
    if mask.dtype != bool:
        if verbose:
            print(f"Converting mask from {mask.dtype} to bool")
        mask = mask.astype(bool)
    
    # Validate shape
    if len(mask.shape) != 2:
        raise ValueError(f"Mask must be 2D, got shape {mask.shape}")
    
    if expected_shape is not None and mask.shape != expected_shape:
        raise ValueError(f"Expected mask shape {expected_shape}, got {mask.shape}")
    
    # Check if mask has any True values
    if not np.any(mask):
        raise ValueError("Mask contains no True values")
    
    # Check if mask is all True (probably not useful)
    if np.all(mask):
        print("Warning: Mask contains all True values")
    
    if verbose:
        print(f"Loaded mask from: {mask_path}")
        print(f"Shape: {mask.shape}")
        print(f"True pixels: {np.sum(mask)} ({np.sum(mask)/mask.size*100:.2f}%)")
        print(f"Data type: {mask.dtype}")
    
    return mask

def visualize_mask(mask, title="Mask Visualization", save_path=None):
    """
    Visualize a mask with detailed information.
    
    Args:
        mask (numpy.ndarray): Mask to visualize
        title (str): Title for the plot
        save_path (str, optional): Path to save the visualization
    """
    fig, axes = plt.subplots(1, 3, figsize=(15, 5))
    
    # Original mask
    axes[0].imshow(mask, cmap='gray')
    axes[0].set_title("Mask")
    axes[0].axis('off')
    
    # Mask with center highlighted
    center_y, center_x = mask.shape[0] // 2, mask.shape[1] // 2
    mask_highlighted = mask.astype(float)
    if mask[center_y, center_x]:
        mask_highlighted[center_y, center_x] = 0.5  # Highlight center
    
    axes[1].imshow(mask_highlighted, cmap='viridis')
    axes[1].set_title("Mask (Center Highlighted)")
    axes[1].axis('off')
    
    # Mask statistics
    axes[2].axis('off')
    stats_text = f"""
    Shape: {mask.shape}
    Total pixels: {mask.size}
    True pixels: {np.sum(mask)}
    Percentage: {np.sum(mask)/mask.size*100:.2f}%
    Center value: {mask[center_y, center_x]}
    
    Connected components:
    """
    
    from skimage.measure import label
    labeled = label(mask, connectivity=2)
    num_components = np.max(labeled)
    stats_text += f"{num_components}"
    
    axes[2].text(0.1, 0.9, stats_text, transform=axes[2].transAxes, 
                fontsize=12, verticalalignment='top', fontfamily='monospace')
    
    plt.suptitle(title)
    plt.tight_layout()
    
    if save_path:
        plt.savefig(save_path, dpi=150, bbox_inches='tight')
        print(f"Visualization saved to: {save_path}")
    
    plt.show()

def compare_masks(mask1, mask2, labels=["Mask 1", "Mask 2"], save_path=None):
    """
    Compare two masks side by side.
    
    Args:
        mask1 (numpy.ndarray): First mask
        mask2 (numpy.ndarray): Second mask
        labels (list): Labels for the masks
        save_path (str, optional): Path to save the comparison
    """
    fig, axes = plt.subplots(2, 3, figsize=(15, 10))
    
    # First mask
    axes[0, 0].imshow(mask1, cmap='gray')
    axes[0, 0].set_title(labels[0])
    axes[0, 0].axis('off')
    
    # Second mask
    axes[0, 1].imshow(mask2, cmap='gray')
    axes[0, 1].set_title(labels[1])
    axes[0, 1].axis('off')
    
    # Difference (if same shape)
    if mask1.shape == mask2.shape:
        diff = mask1.astype(int) - mask2.astype(int)
        im = axes[0, 2].imshow(diff, cmap='RdBu', vmin=-1, vmax=1)
        axes[0, 2].set_title("Difference")
        axes[0, 2].axis('off')
        plt.colorbar(im, ax=axes[0, 2])
    else:
        axes[0, 2].text(0.5, 0.5, "Different shapes\nCannot compare", 
                       ha='center', va='center', transform=axes[0, 2].transAxes)
        axes[0, 2].axis('off')
    
    # Statistics
    for i, (mask, label) in enumerate([(mask1, labels[0]), (mask2, labels[1])]):
        axes[1, i].axis('off')
        stats_text = f"""
        {label}
        Shape: {mask.shape}
        True pixels: {np.sum(mask)}
        Percentage: {np.sum(mask)/mask.size*100:.2f}%
        """
        axes[1, i].text(0.1, 0.9, stats_text, transform=axes[1, i].transAxes,
                        fontsize=12, verticalalignment='top', fontfamily='monospace')
    
    # Summary comparison
    axes[1, 2].axis('off')
    if mask1.shape == mask2.shape:
        overlap = np.sum(mask1 & mask2)
        union = np.sum(mask1 | mask2)
        jaccard = overlap / union if union > 0 else 0
        
        summary_text = f"""
        Comparison Summary
        
        Overlap: {overlap} pixels
        Union: {union} pixels
        Jaccard Index: {jaccard:.3f}
        
        Only in {labels[0]}: {np.sum(mask1 & ~mask2)}
        Only in {labels[1]}: {np.sum(mask2 & ~mask1)}
        """
    else:
        summary_text = f"""
        Comparison Summary
        
        Cannot compare:
        Different shapes
        {labels[0]}: {mask1.shape}
        {labels[1]}: {mask2.shape}
        """
    
    axes[1, 2].text(0.1, 0.9, summary_text, transform=axes[1, 2].transAxes,
                    fontsize=12, verticalalignment='top', fontfamily='monospace')
    
    plt.tight_layout()
    
    if save_path:
        plt.savefig(save_path, dpi=150, bbox_inches='tight')
        print(f"Comparison saved to: {save_path}")
    
    plt.show()

def batch_create_masks(input_dir, output_dir, extractor_configs, image_extension='.tif'):
    """
    Create multiple masks with different configurations for comparison.
    
    Args:
        input_dir (str): Directory containing input images
        output_dir (str): Directory to save generated masks
        extractor_configs (dict): Dictionary of {name: config} for different extractors
        image_extension (str): Extension of image files
        
    Returns:
        dict: Dictionary of {name: mask_path} for generated masks
    """
    # Get image paths
    image_paths = glob(os.path.join(input_dir, f'*{image_extension}'))
    
    if not image_paths:
        raise ValueError(f"No images found in {input_dir}")
    
    os.makedirs(output_dir, exist_ok=True)
    generated_masks = {}
    
    print(f"Creating masks from {len(image_paths)} images...")
    
    for name, config in extractor_configs.items():
        print(f"\nCreating mask: {name}")
        mask_path = os.path.join(output_dir, f"{name}_mask.npy")
        
        try:
            mask = create_mask_from_images(
                image_paths, 
                mask_path, 
                extractor_config=config,
                verbose=True
            )
            generated_masks[name] = mask_path
            
            # Save visualization
            viz_path = os.path.join(output_dir, f"{name}_mask_visualization.png")
            visualize_mask(mask, title=f"Mask: {name}", save_path=viz_path)
            
        except Exception as e:
            print(f"Failed to create mask {name}: {e}")
    
    print(f"\nGenerated {len(generated_masks)} masks in: {output_dir}")
    return generated_masks

# Example usage functions
def example_create_custom_mask():
    """Example of creating a custom mask from images."""
    
    # Configuration for a mask that captures fine structural details
    fine_structure_config = {
        'center_size': 15,
        'base_percentile': 40,
        'percentile_decay': 1.1,
        'center_ratio_threshold': 0.2,
        'use_center_proximity': True,
        'center_proximity_threshold': 0.9,
        'max_true_pixels': 30
    }
    
    # Configuration for a mask that captures larger structures
    large_structure_config = {
        'center_size': 25,
        'base_percentile': 60,
        'percentile_decay': 1.2,
        'center_ratio_threshold': 0.4,
        'use_center_proximity': False,
        'max_true_pixels': 20
    }
    
    image_paths = ['./data/image1.tif', './data/image2.tif']
    
    # Create fine structure mask
    fine_mask = create_mask_from_images(
        image_paths, 
        './masks/fine_structure_mask.npy',
        extractor_config=fine_structure_config,
        verbose=True
    )
    
    # Create large structure mask
    large_mask = create_mask_from_images(
        image_paths,
        './masks/large_structure_mask.npy',
        extractor_config=large_structure_config,
        verbose=True
    )
    
    # Compare the masks
    compare_masks(fine_mask, large_mask, 
                 labels=["Fine Structure", "Large Structure"],
                 save_path="./masks/mask_comparison.png")

def example_batch_mask_creation():
    """Example of creating multiple masks for comparison."""
    
    configs = {
        'conservative': {
            'center_size': 11,
            'base_percentile': 60,
            'center_ratio_threshold': 0.4,
            'max_true_pixels': 15
        },
        'moderate': {
            'center_size': 15,
            'base_percentile': 50,
            'center_ratio_threshold': 0.3,
            'max_true_pixels': 25
        },
        'aggressive': {
            'center_size': 20,
            'base_percentile': 40,
            'center_ratio_threshold': 0.2,
            'max_true_pixels': 35
        }
    }
    
    generated_masks = batch_create_masks(
        input_dir='./data/train/',
        output_dir='./masks/comparison/',
        extractor_configs=configs
    )
    
    return generated_masks