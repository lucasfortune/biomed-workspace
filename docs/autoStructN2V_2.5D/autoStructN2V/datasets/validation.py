# datasets/validation.py
import random
import numpy as np
import torch

from .base import BaseNoiseDataset
from .training import _ups_replace_2d, _uniform_random_replace_2d
from ..masking.utilities import create_full_mask, create_full_mask_3d


class ValidationDataset(BaseNoiseDataset):
    """
    Dataset for validating Noise2Void models during training.

    **Post-A4 fix (2026-05-06):** validation now applies the same blind-spot
    masking as training. The previous behaviour (return unmasked input as both
    input and target with an all-ones loss mask) computed
    ``MSE(model(noisy), noisy)`` over all pixels — which is minimised by the
    identity function and therefore biased ``ReduceLROnPlateau`` and
    ``EarlyStopping`` toward learning the identity rather than denoising.

    The masking applied here matches ``TrainingDataset`` exactly: a fresh
    random full mask + prediction kernel is sampled per ``__getitem__`` from
    a pre-generated pool. The validation loss is then on the same scale as
    the training loss but evaluated on held-out slices. (For deterministic
    early-stopping decisions, the trainer additionally computes
    ``PSNR(model_output, clean)`` on the full validation stack when a clean
    reference is available — see the trainer's auxiliary metric.)

    Args:
        image_paths (list, optional): List of paths to validation images.
        stack (numpy.ndarray, optional): Pre-loaded TIFF stack.
        slice_indices (list, optional): List of z-indices to use from the stack.
        mode (str, optional): Processing mode - '2d' or '2.5d'. Defaults to '2d'.
        patch_size (int): Size of image patches to extract.
        single_kernel (numpy.ndarray): The structural mask kernel — same as
            passed to TrainingDataset. **Required** for the post-A4 masked
            validation loss.
        mask_percentage (float): Target percentage of prediction centers per
            patch (publication semantics).
        mask_strat (int): Masking strategy (0: local mean, 1: zeros,
            2: random from entire patch [legacy], 3: UPS — uniform sample from
            5x5 neighborhood excluding all masked positions [publication-style,
            Stage-1 default], 4: UPS centers + uniform-random `[patch.min,
            patch.max]` for struct-mask neighbors [CAREamics-style, Stage-2
            default; reduces to strategy 3 for single-pixel kernels]).
        mask_pool_size (int): Pool size for pre-generated masks. Default 32.
        local_mean_window (int): Side length (odd) of the neighborhood used
            for ``mask_strat=0`` (local mean) replacement. Default 5 (A6 fix).
        patches_per_image (int): Number of patches to extract per image/slice.
        use_roi (bool, optional): Whether to use ROI selection. Defaults to False.
        scale_factor (float, optional): Factor for ROI detection.
        roi_threshold (float, optional): Threshold for ROI detection.
        select_background (bool, optional): If True, selects background patches.
    """

    def __init__(self, image_paths=None, stack=None, slice_indices=None, mode='2d',
                 patch_size=None, single_kernel=None, mask_percentage=15.0, mask_strat=0,
                 mask_pool_size=32, local_mean_window=5, ups_window_size=5,
                 patches_per_image=50,
                 use_roi=False, scale_factor=0.25,
                 roi_threshold=0.5, select_background=True, norm_stats=None,
                 overlap_tile_pad=0):
        # Initialize base class
        super().__init__(
            image_paths=image_paths,
            stack=stack,
            slice_indices=slice_indices,
            mode=mode,
            patch_size=patch_size,
            patches_per_image=patches_per_image
        )

        if single_kernel is None:
            raise ValueError(
                "ValidationDataset requires single_kernel (the structural mask "
                "kernel) to apply consistent masking with TrainingDataset. "
                "The legacy unmasked validation loss biased optimisation toward "
                "learning the identity function — see diagnostic note F4 / A4."
            )

        self.use_roi = use_roi
        self.scale_factor = scale_factor
        self.roi_threshold = roi_threshold
        self.select_background = select_background
        self.single_kernel = single_kernel
        self.mask_percentage = mask_percentage
        self.mask_strat = mask_strat
        self.mask_pool_size = max(1, int(mask_pool_size))
        if local_mean_window < 1 or local_mean_window % 2 == 0:
            raise ValueError(f"local_mean_window must be a positive odd integer, got {local_mean_window}")
        self.local_mean_window = int(local_mean_window)
        if ups_window_size < 1 or ups_window_size % 2 == 0:
            raise ValueError(f"ups_window_size must be a positive odd integer, got {ups_window_size}")
        self.ups_window_size = int(ups_window_size)
        self.to_tensor = self.to_tensor  # keep base init

        # Train-derived z-score stats (passed through from TrainingDataset side
        # at dataloader construction; see pipeline/data.py).
        self.norm_stats = norm_stats

        # Overlap-tile validation: when > 0, mirrors TrainingDataset's
        # extract-extended / loss-on-central pattern so validation loss is on
        # the same scale as training loss.
        self.overlap_tile_pad = max(0, int(overlap_tile_pad))
        self.extract_size = self.patch_size + 2 * self.overlap_tile_pad

        # Pre-generate the mask pool (same scheme as TrainingDataset).
        self._mask_pool, self._pred_pool = self._build_mask_pool()

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

    def _build_mask_pool(self):
        """Generate the mask pool — identical to ``TrainingDataset._build_mask_pool``."""
        masks = []
        preds = []
        if self.mode == '2.5d':
            for _ in range(self.mask_pool_size):
                m, p = create_full_mask_3d(self.single_kernel, self.patch_size,
                                           self.mask_percentage, verbose=False)
                masks.append(m)
                preds.append(p)
        else:
            for _ in range(self.mask_pool_size):
                m, p = create_full_mask(self.single_kernel, self.patch_size,
                                        self.mask_percentage, verbose=False)
                masks.append(m)
                preds.append(p)
        return np.stack(masks), np.stack(preds)

    def _apply_mask(self, patch, mask, mask_strat, prediction_kernel=None):
        """Apply the same masking as TrainingDataset.apply_mask. Kept here as
        an inline copy because the strategy table is small and the import
        graph is cleaner without bouncing through TrainingDataset.

        ``prediction_kernel`` is required by ``mask_strat=4`` (CAREamics-style
        UPS-centers + uniform-random-neighbors); other strategies ignore it.
        """
        masked = patch.copy()
        if mask_strat == 1:  # zero
            masked[mask] = 0
        elif mask_strat == 2:  # random from entire patch (legacy 'random')
            unmasked_values = patch[~mask]
            if len(unmasked_values) > 0:
                masked[mask] = np.random.choice(unmasked_values, size=int(np.sum(mask)))
        elif mask_strat == 3:  # UPS NxN excluding all masked positions (default 5; CAREamics 11)
            if patch.ndim == 3:
                for ch in range(patch.shape[0]):
                    masked[ch] = _ups_replace_2d(patch[ch], mask[ch], window_size=self.ups_window_size)
            else:
                masked = _ups_replace_2d(patch, mask, window_size=self.ups_window_size)
        elif mask_strat == 4:  # UPS centers + uniform-random struct neighbors (Tier B2, see training.py)
            if patch.ndim == 3:
                for ch in range(patch.shape[0]):
                    ch_mask = mask[ch]
                    if prediction_kernel is None:
                        masked[ch] = _ups_replace_2d(
                            patch[ch], ch_mask, window_size=self.ups_window_size
                        )
                    else:
                        ch_pred = prediction_kernel[ch]
                        ch_centers = ch_mask & ch_pred
                        ch_neighbors = ch_mask & ~ch_pred
                        if ch_centers.any():
                            masked[ch] = _ups_replace_2d(
                                patch[ch], ch_centers, window_size=self.ups_window_size,
                                exclude_mask=ch_mask
                            )
                        if ch_neighbors.any():
                            masked[ch] = _uniform_random_replace_2d(masked[ch], ch_neighbors)
            else:
                if prediction_kernel is None:
                    masked = _ups_replace_2d(patch, mask, window_size=self.ups_window_size)
                else:
                    centers = mask & prediction_kernel
                    neighbors = mask & ~prediction_kernel
                    if centers.any():
                        masked = _ups_replace_2d(
                            patch, centers, window_size=self.ups_window_size,
                            exclude_mask=mask
                        )
                    if neighbors.any():
                        masked = _uniform_random_replace_2d(masked, neighbors)
        else:  # local mean over self.local_mean_window x self.local_mean_window
            half = self.local_mean_window // 2
            if patch.ndim == 3:
                c, h, w = patch.shape
                for ch in range(c):
                    ch_mask = mask[ch]
                    ch_patch = patch[ch]
                    for i in range(h):
                        for j in range(w):
                            if ch_mask[i, j]:
                                i_start, i_end = max(0, i - half), min(h, i + half + 1)
                                j_start, j_end = max(0, j - half), min(w, j + half + 1)
                                neighborhood = ch_patch[i_start:i_end, j_start:j_end]
                                neighborhood_mask = ch_mask[i_start:i_end, j_start:j_end]
                                unmasked = neighborhood[~neighborhood_mask]
                                if len(unmasked) > 0:
                                    masked[ch, i, j] = np.mean(unmasked)
                                else:
                                    fallback = ch_patch[~ch_mask]
                                    if len(fallback) > 0:
                                        masked[ch, i, j] = np.random.choice(fallback)
            else:
                h, w = patch.shape
                for i in range(h):
                    for j in range(w):
                        if mask[i, j]:
                            i_start, i_end = max(0, i - half), min(h, i + half + 1)
                            j_start, j_end = max(0, j - half), min(w, j + half + 1)
                            neighborhood = patch[i_start:i_end, j_start:j_end]
                            neighborhood_mask = mask[i_start:i_end, j_start:j_end]
                            unmasked = neighborhood[~neighborhood_mask]
                            if len(unmasked) > 0:
                                masked[i, j] = np.mean(unmasked)
                            else:
                                fallback = patch[~mask]
                                if len(fallback) > 0:
                                    masked[i, j] = np.random.choice(fallback)
        return masked

    def __getitem__(self, idx):
        """
        Get a validation sample with masking applied (post-A4 fix).

        Returns:
            tuple: (input_tensor, target_tensor, mask_tensor)
                - input_tensor: Patch with mask applied (replaced pixels).
                - target_tensor: Original unmasked patch (the supervisory signal).
                - mask_tensor: Prediction kernel (loss is computed only at these positions).
        """
        item_idx = idx // self.patches_per_image
        data = self.get_data(item_idx)

        # Get spatial dimensions
        if self.mode == '2.5d':
            _, h, w = data.shape
        else:
            h, w = data.shape

        # Select patch location at extract_size (= patch_size + 2*pad)
        extract_size = self.extract_size
        if not self.use_stack and self.use_roi and self.roi_patches[item_idx]:
            top, left = random.choice(self.roi_patches[item_idx])
            if top + extract_size > h or left + extract_size > w:
                top = np.random.randint(0, h - extract_size)
                left = np.random.randint(0, w - extract_size)
        else:
            top = np.random.randint(0, h - extract_size)
            left = np.random.randint(0, w - extract_size)

        # Extract the patch at extract_size
        if self.mode == '2.5d':
            patch = data[:, top:top + extract_size, left:left + extract_size]
        else:
            patch = data[top:top + extract_size, left:left + extract_size]

        # Sample a fresh mask + prediction kernel from the pool. Under
        # overlap_tile_pad>0, embed them in the centre of extract_size arrays
        # so the loss is computed only on the central patch_size region.
        pool_idx = np.random.randint(0, self.mask_pool_size)
        if self.overlap_tile_pad > 0:
            pad = self.overlap_tile_pad
            inner_mask = self._mask_pool[pool_idx]
            inner_pred = self._pred_pool[pool_idx]
            if self.mode == '2.5d':
                mask = np.zeros((3, extract_size, extract_size), dtype=inner_mask.dtype)
                prediction_kernel = np.zeros((3, extract_size, extract_size), dtype=inner_pred.dtype)
                mask[:, pad:pad+self.patch_size, pad:pad+self.patch_size] = inner_mask
                prediction_kernel[:, pad:pad+self.patch_size, pad:pad+self.patch_size] = inner_pred
            else:
                mask = np.zeros((extract_size, extract_size), dtype=inner_mask.dtype)
                prediction_kernel = np.zeros((extract_size, extract_size), dtype=inner_pred.dtype)
                mask[pad:pad+self.patch_size, pad:pad+self.patch_size] = inner_mask
                prediction_kernel[pad:pad+self.patch_size, pad:pad+self.patch_size] = inner_pred
        else:
            mask = self._mask_pool[pool_idx]
            prediction_kernel = self._pred_pool[pool_idx]

        # CAREamics-style z-score normalization before masking, mirroring
        # TrainingDataset so the loss is computed in the same space.
        if self.norm_stats is not None:
            m, s, eps = self.norm_stats['mean'], self.norm_stats['std'], self.norm_stats['eps']
            patch = ((patch - m) / (s + eps)).astype(np.float32)

        # Apply masking — input is masked, target is the original (unmasked) patch.
        # ``prediction_kernel`` is forwarded so mask_strat=4 can distinguish
        # active centers from struct-mask neighbors.
        input_patch = self._apply_mask(patch, mask, self.mask_strat,
                                       prediction_kernel=prediction_kernel)
        target_patch = patch.copy()

        # Convert to tensors
        if self.mode == '2.5d':
            input_tensor = torch.from_numpy(input_patch).float()
            target_tensor = torch.from_numpy(target_patch).float()
        else:
            input_tensor = self.to_tensor(input_patch)
            target_tensor = self.to_tensor(target_patch)

        mask_tensor = torch.from_numpy(prediction_kernel).float()

        return input_tensor, target_tensor, mask_tensor