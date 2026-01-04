# autoStructN2V/masking/utilities.py
import numpy as np

def create_full_mask(single_masking_kernel, patch_size, mask_percentage, verbose):
    """
    Create a numpy array with efficient random placements of the input square pattern.
    
    Args:
        single_masking_kernel (numpy.ndarray): kernel representing a single mask 
                            (single True with False border for Stage 1, more complex for Stage 2)
        patch_size (int): Size of the full mask (same size as patch to denoise)
        mask_percentage (float): Target percentage of True values in the output (0-100)
    
    Returns:
        tuple: (full_masking_kernel, prediction_kernel)
            - full_masking_kernel: Boolean array with random placements of the input single mask pattern
            - prediction_kernel: Boolean array with only the center points of each pattern marked as True
    """
    # Create empty output arrays
    full_masking_kernel = np.zeros((patch_size, patch_size), dtype=bool)
    prediction_kernel = np.zeros((patch_size, patch_size), dtype=bool)
    
    # Get dimensions and properties of the input pattern
    pattern_size = single_masking_kernel.shape[0]
    true_count_per_pattern = np.sum(single_masking_kernel)
    
    # Calculate total number of pixels and target number of True pixels
    total_pixels = patch_size * patch_size
    target_true_pixels = int(total_pixels * (mask_percentage / 100))
    
    # Calculate how many patterns we need to place (rounded up to handle edge cases better)
    num_patterns_needed = int(np.ceil(target_true_pixels / true_count_per_pattern))
    
    # Create a grid of all possible positions
    y, x = np.meshgrid(
        np.arange(patch_size - pattern_size + 1),
        np.arange(patch_size - pattern_size + 1)
    )
    positions = np.column_stack((x.ravel(), y.ravel()))
    
    # Shuffle positions for randomness
    np.random.shuffle(positions)
    
    # Find where the True values are in the pattern relative to the origin
    pattern_true_coords = np.argwhere(single_masking_kernel)
    
    # Find the center point of the pattern
    center_y, center_x = pattern_size // 2, pattern_size // 2
    
    # Track how many patterns we've placed
    patterns_placed = 0
    
    # Try to place patterns
    for pos_idx, (i, j) in enumerate(positions):
        if patterns_placed >= num_patterns_needed:
            break
            
        # Check if pattern would fit without adjacent True values
        is_valid = True
        
        # Calculate where the True values would be if placed at this position
        true_positions = pattern_true_coords + [i, j]
        
        # Check if any True value would touch an existing True value
        for y, x in true_positions:
            # Skip if out of bounds
            if y < 0 or y >= patch_size or x < 0 or x >= patch_size:
                is_valid = False
                break
                
            # Check all 8 adjacent cells + the cell itself
            for dy in [-1, 0, 1]:
                for dx in [-1, 0, 1]:
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < patch_size and 0 <= nx < patch_size:
                        if full_masking_kernel[ny, nx] and not (dy == 0 and dx == 0 and single_masking_kernel[y-i, x-j]):
                            is_valid = False
                            break
                if not is_valid:
                    break
            if not is_valid:
                break
        
        if is_valid:
            # Place the pattern
            for y, x in true_positions:
                if 0 <= y < patch_size and 0 <= x < patch_size:
                    full_masking_kernel[y, x] = True
            
            # Mark the center point in the second mask
            center_y_pos = i + center_y
            center_x_pos = j + center_x
            if 0 <= center_y_pos < patch_size and 0 <= center_x_pos < patch_size:
                prediction_kernel[center_y_pos, center_x_pos] = True
            
            patterns_placed += 1
            
            # Optimization: Remove nearby positions from consideration
            if pos_idx < len(positions) - 1:
                distances = np.abs(positions[pos_idx+1:] - np.array([i, j]))
                keep_mask = np.any(distances >= pattern_size - 1, axis=1)
                positions = np.vstack([positions[:pos_idx+1], positions[pos_idx+1:][keep_mask]])
    
    # Calculate the actual percentage achieved
    actual_percentage = (np.sum(full_masking_kernel) / total_pixels) * 100
    
    # If we haven't reached our target, try to add individual patterns to get closer
    if actual_percentage < mask_percentage * 0.9 and patterns_placed > 0:
        # Find empty spaces where we might place additional patterns
        remaining_space = ~full_masking_kernel
        
        # Try to place more patterns in empty regions
        for i in range(0, patch_size - pattern_size + 1, pattern_size - 1):
            for j in range(0, patch_size - pattern_size + 1, pattern_size - 1):
                if np.sum(full_masking_kernel) / total_pixels >= mask_percentage / 100:
                    break
                    
                region = remaining_space[i:i+pattern_size, j:j+pattern_size]
                if region.shape == single_masking_kernel.shape and np.all(region):
                    # Place pattern
                    full_masking_kernel[i:i+pattern_size, j:j+pattern_size] = single_masking_kernel | full_masking_kernel[i:i+pattern_size, j:j+pattern_size]
                    
                    # Mark the center point in the second mask
                    center_y_pos = i + center_y
                    center_x_pos = j + center_x
                    if 0 <= center_y_pos < patch_size and 0 <= center_x_pos < patch_size:
                        prediction_kernel[center_y_pos, center_x_pos] = True
    
    # Final actual percentage
    actual_percentage = (np.sum(full_masking_kernel) / total_pixels) * 100
    if verbose:
        import matplotlib.pyplot as plt
        
        print("\n=== Mask Creation Details ===")
        print(f"Patch size: {patch_size}x{patch_size}")
        print(f"Target mask percentage: {mask_percentage:.2f}%")
        print(f"Achieved mask percentage: {actual_percentage:.2f}%")
        print(f"Placed {patterns_placed} patterns")
        print(f"Pattern size: {single_masking_kernel.shape}")
        print(f"Total masked pixels: {np.sum(full_masking_kernel)}")
        
        # Visualize masks
        fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(10, 4))
        ax1.imshow(full_masking_kernel, cmap='gray')
        ax1.set_title("Full Mask")
        ax2.imshow(prediction_kernel, cmap='gray')
        ax2.set_title("Prediction Kernel")
        plt.tight_layout()
        plt.show()
    else:
        print(f"Achieved {actual_percentage:.2f}% True values (target: {mask_percentage}%)")
        print(f"Placed {np.sum(prediction_kernel)} pattern centers")
    
    return full_masking_kernel, prediction_kernel

def create_mask_for_training(stage, kernel=None, patch_size=64, mask_percentage=20.0, **kwargs):
    """
    Create a mask for training stage 1 or stage 2.
    
    This is a convenience function that creates appropriate masks for each stage.
    
    Args:
        stage (str): 'stage1' for standard N2V or 'stage2' for structured N2V
        kernel (numpy.ndarray, optional): Custom kernel to use. If None, creates appropriate kernel.
        patch_size (int): Size of patches to be processed
        mask_percentage (float): Percentage of pixels to mask (0-100)
        **kwargs: Additional parameters for kernel generation
        
    Returns:
        tuple: (full_mask, prediction_kernel)
            - full_mask: Boolean array with masks applied
            - prediction_kernel: Corresponding prediction kernel for loss calculation
    """
    from .kernels import create_stage1_mask_kernel
    
    if stage not in ['stage1', 'stage2']:
        raise ValueError("Stage must be either 'stage1' or 'stage2'")
    
    # Create or validate kernel
    if kernel is None:
        if stage == 'stage1':
            # For stage1, create a simple single-pixel mask
            center_size = kwargs.get('center_size', 1)
            kernel = create_stage1_mask_kernel(center_size)
        else:  # stage2
            # For stage2, require a pre-created structured mask from StructuralNoiseExtractor
            raise ValueError("For stage2, you must provide a structured kernel. Use StructuralNoiseExtractor to create one.")
    
    # Create full mask from kernel
    full_mask, prediction_kernel = create_full_mask(
        kernel, 
        patch_size, 
        mask_percentage
    )
    
    return full_mask, prediction_kernel


def create_full_mask_3d(single_masking_kernel_3d, patch_size, mask_percentage, verbose=False):
    """
    Create a 3D numpy array with efficient random placements of the 3D input pattern.

    For 2.5D mode:
    - full_mask: Has True values across ALL 3 slices (for masking the input)
    - prediction_kernel: Only CENTER slice (dz=0) has True values, matching the
      mask's center slice EXACTLY. Edge slices are all False.

    This ensures:
    - Masking is applied across all 3 input slices
    - Loss is computed only on center slice predictions
    - Center slice mask and prediction positions are identical

    Uses hybrid connectivity for mask placement:
    - 8-connectivity in xy (same as 2D)
    - 2-connectivity in z (only direct above/below neighbors)

    Args:
        single_masking_kernel_3d (numpy.ndarray): 3D kernel of shape (3, kernel_h, kernel_w)
                            representing the structural pattern across 3 slices
        patch_size (int): Size of the full mask (same as patch size to denoise)
        mask_percentage (float): Target percentage of True values in the output (0-100)
        verbose (bool): Whether to print debug info and show visualizations

    Returns:
        tuple: (full_masking_kernel_3d, prediction_kernel_3d)
            - full_masking_kernel_3d: Boolean array (3, patch_size, patch_size) with mask across all slices
            - prediction_kernel_3d: Boolean array (3, patch_size, patch_size) with True only in center slice
    """
    # Create empty output array for full mask
    full_masking_kernel = np.zeros((3, patch_size, patch_size), dtype=bool)

    # Get dimensions of the input 3D pattern
    kernel_z, kernel_h, kernel_w = single_masking_kernel_3d.shape
    if kernel_z != 3:
        raise ValueError(f"Expected kernel with z-dimension of 3, got {kernel_z}")

    # For 3D, we use the center slice (dz=0) pattern for placement decisions
    # and apply the full 3D pattern at each placement
    center_pattern = single_masking_kernel_3d[1]  # dz=0 slice

    true_count_per_pattern = np.sum(single_masking_kernel_3d)
    true_count_center_slice = np.sum(center_pattern)

    # Calculate total number of voxels and target
    total_voxels = 3 * patch_size * patch_size
    target_true_voxels = int(total_voxels * (mask_percentage / 100))

    # Calculate how many patterns we need to place
    num_patterns_needed = int(np.ceil(target_true_voxels / true_count_per_pattern))

    # Create a grid of all possible positions (based on 2D spatial grid)
    y, x = np.meshgrid(
        np.arange(patch_size - kernel_h + 1),
        np.arange(patch_size - kernel_w + 1)
    )
    positions = np.column_stack((x.ravel(), y.ravel()))

    # Shuffle positions for randomness
    np.random.shuffle(positions)

    # Find center point of the 2D pattern
    center_y, center_x = kernel_h // 2, kernel_w // 2

    # Track how many patterns we've placed
    patterns_placed = 0

    # Try to place patterns
    for pos_idx, (i, j) in enumerate(positions):
        if patterns_placed >= num_patterns_needed:
            break

        # Check if pattern would fit without adjacent True values
        # We check in 3D with hybrid connectivity
        is_valid = True

        # Check all 3 slices of the pattern
        for dz in range(3):
            slice_pattern = single_masking_kernel_3d[dz]
            pattern_true_coords = np.argwhere(slice_pattern)

            for (py, px) in pattern_true_coords:
                ny, nx = i + py, j + px

                # Skip if out of bounds
                if ny < 0 or ny >= patch_size or nx < 0 or nx >= patch_size:
                    is_valid = False
                    break

                # Check 8-connectivity in xy (same slice)
                for dy in [-1, 0, 1]:
                    for dx in [-1, 0, 1]:
                        check_y, check_x = ny + dy, nx + dx
                        if 0 <= check_y < patch_size and 0 <= check_x < patch_size:
                            if full_masking_kernel[dz, check_y, check_x]:
                                # Check if this is part of our own pattern
                                rel_y, rel_x = check_y - i, check_x - j
                                if not (0 <= rel_y < kernel_h and 0 <= rel_x < kernel_w and
                                        single_masking_kernel_3d[dz, rel_y, rel_x]):
                                    is_valid = False
                                    break
                    if not is_valid:
                        break

                # Check 2-connectivity in z (only direct above/below)
                if is_valid:
                    for check_dz in [-1, 1]:
                        check_z = dz + check_dz
                        if 0 <= check_z < 3:
                            if full_masking_kernel[check_z, ny, nx]:
                                # Check if this is part of our own pattern
                                if not (0 <= check_z < 3 and single_masking_kernel_3d[check_z, ny - i, nx - j]):
                                    is_valid = False
                                    break

                if not is_valid:
                    break
            if not is_valid:
                break

        if is_valid:
            # Place the 3D pattern across all slices
            for dz in range(3):
                slice_pattern = single_masking_kernel_3d[dz]
                pattern_true_coords = np.argwhere(slice_pattern)
                for (py, px) in pattern_true_coords:
                    ny, nx = i + py, j + px
                    if 0 <= ny < patch_size and 0 <= nx < patch_size:
                        full_masking_kernel[dz, ny, nx] = True

            patterns_placed += 1

    # Create prediction kernel: copy center slice from full mask, edge slices are all False
    # This ensures loss is computed only on center slice, but mask positions match exactly
    prediction_kernel = np.zeros((3, patch_size, patch_size), dtype=bool)
    prediction_kernel[1] = full_masking_kernel[1].copy()  # Center slice only

    # Calculate actual percentage achieved
    actual_percentage = (np.sum(full_masking_kernel) / total_voxels) * 100

    if verbose:
        import matplotlib.pyplot as plt

        print("\n=== 3D Mask Creation Details ===")
        print(f"Patch size: {patch_size}x{patch_size} (3 slices)")
        print(f"Target mask percentage: {mask_percentage:.2f}%")
        print(f"Achieved mask percentage: {actual_percentage:.2f}%")
        print(f"Placed {patterns_placed} 3D patterns")
        print(f"Kernel shape: {single_masking_kernel_3d.shape}")
        print(f"Total masked voxels: {np.sum(full_masking_kernel)}")
        print(f"Full mask per slice:")
        for dz_idx, label in enumerate(['dz=-1', 'dz=0', 'dz=+1']):
            print(f"  {label}: {np.sum(full_masking_kernel[dz_idx])} pixels")
        print(f"Prediction kernel (center slice only): {np.sum(prediction_kernel[1])} pixels")

        # Visualize masks
        fig, axes = plt.subplots(2, 3, figsize=(12, 7))
        for dz_idx in range(3):
            axes[0, dz_idx].imshow(full_masking_kernel[dz_idx], cmap='gray')
            axes[0, dz_idx].set_title(f"Full Mask (dz={dz_idx-1})")
            axes[1, dz_idx].imshow(prediction_kernel[dz_idx], cmap='gray')
            axes[1, dz_idx].set_title(f"Prediction Kernel (dz={dz_idx-1})")
        plt.tight_layout()
        plt.show()
    else:
        print(f"Achieved {actual_percentage:.2f}% True values (target: {mask_percentage}%)")
        print(f"Prediction kernel has {np.sum(prediction_kernel[1])} center slice pixels")

    return full_masking_kernel, prediction_kernel


def create_random_mask_3d(patch_size, mask_percentage):
    """
    Create a random 3D mask distributed across all 3 slices for Stage 1.

    For 2.5D mode:
    - full_mask: Has True values distributed randomly across ALL 3 slices
    - prediction_kernel: Only CENTER slice (dz=0) has True values, matching the
      mask's center slice EXACTLY. Edge slices are all False.

    This ensures:
    - Masking is applied across all 3 input slices (~15% of total voxels)
    - Loss is computed only on center slice predictions
    - Center slice mask and prediction positions are identical

    Args:
        patch_size (int): Size of patches (spatial dimension)
        mask_percentage (float): Percentage of voxels to mask (0-100)

    Returns:
        tuple: (full_mask, prediction_kernel)
            - full_mask: Boolean array (3, patch_size, patch_size) with random True positions
            - prediction_kernel: Boolean array (3, patch_size, patch_size) with True only in center slice
    """
    total_voxels = 3 * patch_size * patch_size
    num_masked = int(total_voxels * mask_percentage / 100)

    # Generate random flat indices
    flat_indices = np.random.choice(total_voxels, size=num_masked, replace=False)

    # Convert flat indices to 3D coordinates
    full_mask = np.zeros((3, patch_size, patch_size), dtype=bool)
    full_mask.flat[flat_indices] = True

    # Prediction kernel: copy center slice from full mask, edge slices are all False
    prediction_kernel = np.zeros((3, patch_size, patch_size), dtype=bool)
    prediction_kernel[1] = full_mask[1].copy()  # Center slice only

    return full_mask, prediction_kernel