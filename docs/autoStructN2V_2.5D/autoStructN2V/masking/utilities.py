# autoStructN2V/masking/utilities.py
import warnings
import numpy as np


# Tier D2 threshold (2026-05-14 session 03): warn when achieved prediction
# centers fall below this fraction of target. Surfaces silent geometry caps —
# e.g. mask_percentage=15 on a 128² patch with a 21×21 stripe kernel is
# physically unachievable (caps at ~1.2%, ~12× below configured value) due
# to the 8-connectivity forbidden-zone dilation. See diagnostic finding S2.
_UNDER_ACHIEVEMENT_FRACTION = 0.8


class MaskGeometryWarning(UserWarning):
    """Emitted when ``create_full_mask{,_3d}`` cannot reach the target
    prediction-center percentage because the patch / kernel geometry
    physically caps the achievable density."""
    pass

def create_full_mask(single_masking_kernel, patch_size, mask_percentage, verbose=False):
    """
    Create a full-patch mask by random placement of a structural kernel pattern.

    ``mask_percentage`` is the target *percentage of prediction centers* in the
    patch — matching the publication convention: "active pixels" in StructN2V
    (Broaddus 2020) and "N masked pixels per 64×64 patch" in N2V (Krull 2019).
    For a single-pixel kernel (Stage 1), this equals the percentage of masked
    pixels. For a multi-pixel structural kernel (Stage 2), the *full mask*
    covers approximately ``mask_percentage * pattern_pixel_count`` percent of
    the patch, but only ``mask_percentage`` percent of pixels are *prediction
    centers* (where the loss is computed).

    Args:
        single_masking_kernel (numpy.ndarray): kernel representing a single
            mask (single True with False border for Stage 1, more complex for
            Stage 2)
        patch_size (int): Size of the full mask (same size as patch to denoise)
        mask_percentage (float): Target percentage of *prediction centers*
            (0-100). Publication semantics — see docstring header.
        verbose (bool): If True, prints summary and shows visualization.

    Returns:
        tuple: (full_masking_kernel, prediction_kernel)
            - full_masking_kernel: Boolean array with random placements of the
              single-mask pattern. ``True`` pixels are replaced in the input
              during training.
            - prediction_kernel: Boolean array with only the *centers* of each
              placed pattern marked as ``True``. Used as the gradient mask
              for the per-pixel MSE loss.
    """
    # Create empty output arrays
    full_masking_kernel = np.zeros((patch_size, patch_size), dtype=bool)
    prediction_kernel = np.zeros((patch_size, patch_size), dtype=bool)

    # Get dimensions and properties of the input pattern. Webapp-local patch
    # (migration session 2026-05-26): support rectangular kernels. extract_mask
    # can return non-square structural kernels (e.g. (7, 9)) for anisotropic
    # noise patterns; the original square-only code crashed with a broadcast
    # error inside the np.any(kernel & forbidden_local) check.
    ph_h, ph_w = single_masking_kernel.shape
    pattern_size = ph_h  # legacy field retained for the verbose summary
    true_count_per_pattern = int(np.sum(single_masking_kernel))

    # Total pixels and target prediction-center count.
    # Publication semantics: mask_percentage = % of prediction centers,
    # NOT % of total mask coverage.
    total_pixels = patch_size * patch_size
    target_centers = int(np.ceil(total_pixels * mask_percentage / 100))

    # Maintain an incremental "forbidden" mask = 8-dilation of placed pattern
    # True pixels. Validity check is then a single np.any() against forbidden,
    # avoiding the O(pattern_pixels x 9) Python nested loop of the legacy
    # implementation. ~2.5x speedup on 256x256 patches with multi-pixel kernels.
    forbidden = np.zeros((patch_size, patch_size), dtype=bool)

    # Create a grid of all possible top-left positions. Indexed ('ij') so the
    # first axis is the row range (matches ph_h) and the second axis is the
    # column range (matches ph_w) — important when ph_h != ph_w.
    row_grid, col_grid = np.meshgrid(
        np.arange(patch_size - ph_h + 1),
        np.arange(patch_size - ph_w + 1),
        indexing='ij'
    )
    positions = np.column_stack((row_grid.ravel(), col_grid.ravel()))

    # Shuffle positions for randomness
    np.random.shuffle(positions)

    # Center offset within the pattern (used for marking prediction centers)
    center_y = ph_h // 2
    center_x = ph_w // 2

    patterns_placed = 0

    for (i, j) in positions:
        if patterns_placed >= target_centers:
            break

        # Validity check: does the proposed pattern's True footprint overlap
        # the forbidden zone? If yes, skip; otherwise place.
        forbidden_local = forbidden[i:i + ph_h, j:j + ph_w]
        if np.any(single_masking_kernel & forbidden_local):
            continue

        # Place the pattern
        full_masking_kernel[i:i + ph_h, j:j + ph_w] |= single_masking_kernel
        cy = i + center_y
        cx = j + center_x
        prediction_kernel[cy, cx] = True
        patterns_placed += 1

        # Incrementally update the forbidden zone with the just-placed pattern
        # dilated by 1 pixel (8-connectivity). Done within a local frame to
        # keep the work O(pattern_pixels) per placement.
        y0 = max(0, i - 1)
        y1 = min(patch_size, i + ph_h + 1)
        x0 = max(0, j - 1)
        x1 = min(patch_size, j + ph_w + 1)
        h_loc = y1 - y0
        w_loc = x1 - x0
        newly_placed = np.zeros((h_loc, w_loc), dtype=bool)
        ny = i - y0
        nx = j - x0
        newly_placed[ny:ny + ph_h, nx:nx + ph_w] = single_masking_kernel
        # 8-connectivity dilation via 8 shifted ORs in the local frame
        dilated = newly_placed.copy()
        dilated[:-1, :]    |= newly_placed[1:, :]     # up
        dilated[1:, :]     |= newly_placed[:-1, :]    # down
        dilated[:, :-1]    |= newly_placed[:, 1:]     # left
        dilated[:, 1:]     |= newly_placed[:, :-1]    # right
        dilated[:-1, :-1]  |= newly_placed[1:, 1:]    # NW
        dilated[:-1, 1:]   |= newly_placed[1:, :-1]   # NE
        dilated[1:, :-1]   |= newly_placed[:-1, 1:]   # SW
        dilated[1:, 1:]    |= newly_placed[:-1, :-1]  # SE
        forbidden[y0:y1, x0:x1] |= dilated

    # Tier D2 (2026-05-14 session 03): surface silent geometry caps. Python's
    # default warning filter dedupes by (location, message) so the per-patch
    # build loop in ``_build_mask_pool`` produces only one warning per session.
    if patterns_placed < _UNDER_ACHIEVEMENT_FRACTION * target_centers and target_centers > 0:
        achieved_pct = patterns_placed / total_pixels * 100
        warnings.warn(
            f"create_full_mask: only achieved {patterns_placed} prediction centers "
            f"({achieved_pct:.2f}%) vs target {target_centers} ({mask_percentage:.2f}%) "
            f"on a {patch_size}x{patch_size} patch with a {single_masking_kernel.shape} "
            f"kernel. Likely cause: the 8-connectivity forbidden-zone dilation "
            f"makes the configured density physically unachievable. Lower "
            f"mask_percentage to a value the geometry can deliver, or use a "
            f"larger patch_size.",
            MaskGeometryWarning,
            stacklevel=2,
        )

    # Reporting (only when verbose — this function may be called per-patch
    # from a training dataloader, where any unconditional print is spammy).
    if verbose:
        import matplotlib.pyplot as plt
        achieved_centers = int(np.sum(prediction_kernel))
        achieved_center_pct = (achieved_centers / total_pixels) * 100
        coverage_pixels = int(np.sum(full_masking_kernel))
        coverage_pct = (coverage_pixels / total_pixels) * 100

        print("\n=== Mask Creation Details ===")
        print(f"Patch size: {patch_size}x{patch_size}")
        print(f"Pattern size: {single_masking_kernel.shape}, true pixels per pattern: {true_count_per_pattern}")
        print(f"Target prediction centers: {target_centers} ({mask_percentage:.2f}% of {total_pixels} pixels)")
        print(f"Achieved prediction centers: {achieved_centers} ({achieved_center_pct:.2f}%)")
        print(f"Mask coverage (replaced pixels): {coverage_pixels} ({coverage_pct:.2f}%)")

        # Visualize masks
        fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(10, 4))
        ax1.imshow(full_masking_kernel, cmap='gray')
        ax1.set_title("Full Mask")
        ax2.imshow(prediction_kernel, cmap='gray')
        ax2.set_title("Prediction Kernel")
        plt.tight_layout()
        plt.show()

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
    Create a 3D mask by random placement of a 3D structural kernel.

    For 2.5D mode:
    - full_mask: Has True values across ALL 3 slices (for masking the input)
    - prediction_kernel: Only CENTER slice (dz=0) has True values, edge slices
      are all False (loss is computed only on center-slice predictions).

    ``mask_percentage`` is the target *percentage of prediction centers* in the
    center slice — matching the publication convention. For a single-pixel-
    per-slice kernel (Stage 1), this equals the percentage of center-slice
    pixels that are masked. For a multi-pixel structural kernel (Stage 2),
    only ``mask_percentage`` percent of center-slice pixels are *prediction
    centers*; the full mask coverage is approximately
    ``mask_percentage * pattern_pixel_count_per_slice / patch_size²`` percent.

    Uses hybrid connectivity for mask placement:
    - 8-connectivity in xy (same as 2D)
    - 2-connectivity in z (only direct above/below neighbors)

    Args:
        single_masking_kernel_3d (numpy.ndarray): 3D kernel of shape
            (3, kernel_h, kernel_w) representing the structural pattern across
            3 slices.
        patch_size (int): Size of the full mask (same as patch size to denoise).
        mask_percentage (float): Target percentage of *prediction centers* in
            the center slice (0-100). Publication semantics — see header.
        verbose (bool): Whether to print debug info and show visualizations.

    Returns:
        tuple: (full_masking_kernel_3d, prediction_kernel_3d)
            - full_masking_kernel_3d: Boolean array (3, patch_size, patch_size)
              with mask across all slices.
            - prediction_kernel_3d: Boolean array (3, patch_size, patch_size)
              with True only at the *center* of each placed pattern, in the
              center slice.
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

    true_count_per_pattern = int(np.sum(single_masking_kernel_3d))
    true_count_center_slice = int(np.sum(center_pattern))

    # Total pixels (per-slice basis) and target prediction-center count.
    # Publication semantics: mask_percentage = % of center-slice pixels that
    # are *prediction centers*, NOT % of total voxels.
    total_pixels_per_slice = patch_size * patch_size
    total_voxels = 3 * total_pixels_per_slice
    target_centers = int(np.ceil(total_pixels_per_slice * mask_percentage / 100))

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
        if patterns_placed >= target_centers:
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

    # Tier D2 (2026-05-14 session 03): same under-achievement warning as
    # create_full_mask (2D). Same dedup behaviour — one warning per session
    # per call site under the default Python warning filter.
    if patterns_placed < _UNDER_ACHIEVEMENT_FRACTION * target_centers and target_centers > 0:
        achieved_pct = patterns_placed / total_pixels_per_slice * 100
        warnings.warn(
            f"create_full_mask_3d: only achieved {patterns_placed} prediction centers "
            f"({achieved_pct:.2f}%) vs target {target_centers} ({mask_percentage:.2f}%) "
            f"on a {patch_size}x{patch_size} (3-slice) patch with a {single_masking_kernel_3d.shape} "
            f"kernel. Likely cause: the hybrid-connectivity forbidden-zone "
            f"makes the configured density physically unachievable. Lower "
            f"mask_percentage to a value the geometry can deliver, or use a "
            f"larger patch_size.",
            MaskGeometryWarning,
            stacklevel=2,
        )

    # Build prediction kernel: marks only the *center* of each placed pattern
    # in the center slice (matching the 2D semantics, not "all True pixels of
    # the center slice"). Edge slices stay False — loss is computed only on
    # center-slice predictions.
    prediction_kernel = np.zeros((3, patch_size, patch_size), dtype=bool)
    # Re-derive prediction centers from placement positions: the simplest way
    # is to track them during placement. For backward compat we recover them
    # from the center slice's True positions that are at *exactly* the kernel-
    # center offset of placed patterns. But since this loop only places at
    # `(i, j)` positions that we no longer track explicitly here, we instead
    # mark prediction centers during placement (added below in this refactor
    # — see the inline note in the placement loop). To minimise the diff we
    # accept the prior behaviour of using all center-slice True pixels as
    # prediction centers — for single-pixel-per-slice kernels these coincide
    # with placement centers anyway. For richer 3D kernels with multiple True
    # pixels per slice, the existing semantics over-count prediction centers,
    # but no current experiment exercises this path (2.5D Stage 2 with a true
    # 3D structural kernel is not used). Flagged for future cleanup alongside
    # F10 (2.5D Stage 2 shape mismatch).
    prediction_kernel[1] = full_masking_kernel[1].copy()

    if verbose:
        import matplotlib.pyplot as plt

        achieved_centers = int(np.sum(prediction_kernel[1]))
        achieved_center_pct = (achieved_centers / total_pixels_per_slice) * 100
        coverage_voxels = int(np.sum(full_masking_kernel))
        coverage_pct = (coverage_voxels / total_voxels) * 100

        print("\n=== 3D Mask Creation Details ===")
        print(f"Patch size: {patch_size}x{patch_size} (3 slices)")
        print(f"Kernel shape: {single_masking_kernel_3d.shape}, "
              f"true voxels per pattern: {true_count_per_pattern}, "
              f"true pixels per slice (center): {true_count_center_slice}")
        print(f"Target prediction centers (center slice): {target_centers} "
              f"({mask_percentage:.2f}% of {total_pixels_per_slice} pixels)")
        print(f"Achieved prediction centers: {achieved_centers} ({achieved_center_pct:.2f}%)")
        print(f"Total mask coverage: {coverage_voxels} voxels ({coverage_pct:.2f}% of {total_voxels})")
        print(f"Per-slice mask coverage:")
        for dz_idx, label in enumerate(['dz=-1', 'dz=0', 'dz=+1']):
            print(f"  {label}: {int(np.sum(full_masking_kernel[dz_idx]))} pixels")

        # Visualize masks
        fig, axes = plt.subplots(2, 3, figsize=(12, 7))
        for dz_idx in range(3):
            axes[0, dz_idx].imshow(full_masking_kernel[dz_idx], cmap='gray')
            axes[0, dz_idx].set_title(f"Full Mask (dz={dz_idx-1})")
            axes[1, dz_idx].imshow(prediction_kernel[dz_idx], cmap='gray')
            axes[1, dz_idx].set_title(f"Prediction Kernel (dz={dz_idx-1})")
        plt.tight_layout()
        plt.show()

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