# datasets/training.py
import random
import numpy as np
import torch

from .base import BaseNoiseDataset
from ..masking.utilities import create_full_mask, create_full_mask_3d


def _ups_replace_2d(patch, mask, window_size=5, exclude_mask=None):
    """Vectorised UPS replacement: each pixel in ``mask`` is replaced by a
    uniform random sample from its ``window_size`` x ``window_size``
    neighborhood, excluding the center and any positions in ``exclude_mask``.
    Reflect-padding handles patch borders. Falls back to a global value drawn
    from positions outside ``exclude_mask`` if a window has no valid neighbor
    (rare, only at borders with very dense masks).

    Args:
        patch: 2D array of values.
        mask: boolean array of positions to replace (same shape as patch).
        window_size: side length of the local neighborhood (positive odd int).
        exclude_mask: boolean array of positions that should NOT be sampled
            as replacement values. Defaults to ``mask`` itself (legacy
            behaviour for ``mask_strat=3``). The ``mask_strat=4`` path passes
            the *full* mask here while passing only the centers as ``mask``,
            so UPS replaces the centers but never samples from any masked
            position (centers OR struct neighbors).

    See diagnostic note F2 / fix A2 (2026-05-08) for the original strategy 3.
    The ``exclude_mask`` parameter was added in Tier B2 (2026-05-14 session 03)
    to support strategy 4 (UPS centers + uniform-random struct neighbors).
    CAREamics' `roi_size` parameter controls the same neighborhood; their
    default is 11 (vs ours 5).
    """
    if window_size < 1 or window_size % 2 == 0:
        raise ValueError(f"window_size must be a positive odd integer, got {window_size}")
    pad = window_size // 2
    if exclude_mask is None:
        exclude_mask = mask

    n_masked = int(mask.sum())
    if n_masked == 0:
        return patch.copy()

    padded_patch = np.pad(patch, pad, mode='reflect')
    padded_exclude = np.pad(exclude_mask, pad, mode='reflect')

    ys, xs = np.where(mask)
    yy = ys[:, None, None] + np.arange(window_size)[None, :, None]
    xx = xs[:, None, None] + np.arange(window_size)[None, None, :]

    window_values = padded_patch[yy, xx]                                # (n, W, W)
    window_masked = padded_exclude[yy, xx].copy()                       # (n, W, W)
    window_masked[:, pad, pad] = True                                   # exclude center

    flat_values = window_values.reshape(n_masked, -1)
    flat_valid = ~window_masked.reshape(n_masked, -1)

    # Uniform random pick from valid positions: random scores, mask invalid to -inf, argmax.
    scores = np.random.rand(n_masked, window_size * window_size)
    scores[~flat_valid] = -np.inf
    chosen = scores.argmax(axis=1)
    sampled = flat_values[np.arange(n_masked), chosen]

    # Fallback for any row where all window neighbors are excluded.
    has_valid = flat_valid.any(axis=1)
    if not has_valid.all():
        unmasked_global = patch[~exclude_mask]
        if len(unmasked_global) > 0:
            n_fallback = int((~has_valid).sum())
            sampled[~has_valid] = np.random.choice(unmasked_global, size=n_fallback)

    out = patch.copy()
    out[ys, xs] = sampled
    return out


def _uniform_random_replace_2d(patch, mask):
    """Replace each pixel in ``mask`` with a uniform random value in the
    closed interval ``[patch.min(), patch.max()]``. Used for the structural
    mask neighbors under ``mask_strat=4`` — matches CAREamics' struct-mask
    replacement (`careamics.transforms.pixel_manipulation._apply_struct_mask`).

    For a constant patch (max == min) all replaced positions take the
    constant value. Returns a copy; the original patch is not modified.
    """
    n_masked = int(mask.sum())
    if n_masked == 0:
        return patch.copy()
    out = patch.copy()
    lo = float(patch.min())
    hi = float(patch.max())
    if hi > lo:
        out[mask] = np.random.uniform(lo, hi, size=n_masked).astype(patch.dtype, copy=False)
    else:
        out[mask] = lo
    return out


# Backwards-compat alias — still used by older callers (validation.py).
def _ups_5x5_replace_2d(patch, mask):
    return _ups_replace_2d(patch, mask, window_size=5)


class TrainingDataset(BaseNoiseDataset):
    """
    Dataset for training Noise2Void with blind-spot masking.

    Supports both 2D and 2.5D processing modes:
    - 2D mode: Single slice input/output
    - 2.5D mode: 3-slice triplet input, with masking applied across all slices

    Can use either path-based (legacy) or stack-based (new) input.

    **Mask construction (post 2026-05-06 refactor / fix A1):** the dataset
    receives the *single structural kernel* (not a precomputed full mask) and
    builds a small **mask pool** of ``mask_pool_size`` random full masks at
    init time via ``create_full_mask`` / ``create_full_mask_3d``. Each
    ``__getitem__`` picks a random mask from the pool. This implements the
    publication-equivalent stratified random per-patch masking semantics
    while amortising the construction cost (which is non-trivial for large
    structural kernels). Pool size 32 is a good default — with batch_size=4
    and ~50 batches per epoch (= 200 patches per epoch), each mask in the
    pool is sampled ~6 times per epoch in different combinations, ample
    diversity to prevent positional memorisation.

    Args:
        image_paths (list, optional): List of paths to input images (legacy mode).
        stack (numpy.ndarray, optional): Pre-loaded TIFF stack of shape (num_slices, H, W).
        slice_indices (list, optional): List of z-indices to use from the stack.
        mode (str, optional): Processing mode - '2d' or '2.5d'. Defaults to '2d'.
        patch_size (int): Size of image patches to extract.
        single_kernel (numpy.ndarray): The structural mask kernel — a small
            boolean array (Stage 1: typically 3x3 with one True center; Stage 2:
            the structural mask describing the noise correlation pattern).
            **Required** — not a precomputed full mask.
        mask_percentage (float): Target percentage of *prediction centers* per
            patch (publication semantics — see ``masking.utilities.create_full_mask``).
        mask_strat (int): Masking strategy (0: local mean, 1: zeros,
            2: random from entire patch [legacy], 3: UPS — uniform sample from
            5x5 neighborhood excluding all masked positions [publication-style,
            Stage-1 default], 4: UPS centers + uniform-random `[patch.min,
            patch.max]` for struct-mask neighbors [CAREamics-style, Stage-2
            default; reduces to strategy 3 for single-pixel kernels]).
        mask_pool_size (int): Number of distinct random full masks to
            pre-generate at init. ``__getitem__`` samples randomly from this
            pool. Default 32.
        local_mean_window (int): Side length (odd) of the neighborhood used
            for ``mask_strat=0`` (local mean) replacement. Default 5 — matches
            N2V/N2V2 convention. Was hardcoded 3 prior to A6 fix (2026-05-08).
        patches_per_image (int): Number of patches to extract per image/slice.
        use_roi (bool, optional): Whether to use ROI-based patch selection. Defaults to True.
        scale_factor (float, optional): Factor for ROI detection. Defaults to 0.25.
        roi_threshold (float, optional): Threshold for ROI detection. Defaults to 0.5.
        select_background (bool, optional): If True, selects background patches. Defaults to True.
        use_augmentation (bool, optional): Whether to apply data augmentation. Defaults to True.
    """

    def __init__(self, image_paths=None, stack=None, slice_indices=None, mode='2d',
                 patch_size=None, single_kernel=None, mask_percentage=15.0, mask_strat=0,
                 mask_pool_size=32, local_mean_window=5, ups_window_size=5,
                 patches_per_image=100,
                 use_roi=True, scale_factor=0.25,
                 roi_threshold=0.5, select_background=True, use_augmentation=True,
                 norm_stats=None, overlap_tile_pad=0):
        # Initialize base class with appropriate input mode
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
                "TrainingDataset requires single_kernel (the structural mask "
                "kernel). The legacy 'mask' / 'prediction_kernel' parameters "
                "were removed in the A1 refactor — pass the kernel directly."
            )

        self.mask_percentage = mask_percentage
        self.mask_strat = mask_strat
        self.use_roi = use_roi
        self.scale_factor = scale_factor
        self.roi_threshold = roi_threshold
        self.select_background = select_background
        self.use_augmentation = use_augmentation
        self.single_kernel = single_kernel
        self.mask_pool_size = max(1, int(mask_pool_size))
        if local_mean_window < 1 or local_mean_window % 2 == 0:
            raise ValueError(f"local_mean_window must be a positive odd integer, got {local_mean_window}")
        self.local_mean_window = int(local_mean_window)
        if ups_window_size < 1 or ups_window_size % 2 == 0:
            raise ValueError(f"ups_window_size must be a positive odd integer, got {ups_window_size}")
        self.ups_window_size = int(ups_window_size)

        # CAREamics-style z-score normalization stats (train-derived). When set,
        # patches are normalized in __getitem__ *before* apply_mask so masking
        # samples replacement values from the normalized distribution.
        self.norm_stats = norm_stats

        # Overlap-tile training: when > 0, __getitem__ extracts a
        # ``(patch_size + 2*pad)`` patch from the slice but the mask + prediction
        # kernel are placed only in the central ``patch_size`` region. The model
        # sees the extended context; the loss is computed only on the central
        # region. Eliminates the reflection-padding × UNet bottleneck regime
        # mismatch that produces a 1–3 px edge artifact under pad=0 training.
        self.overlap_tile_pad = max(0, int(overlap_tile_pad))
        self.extract_size = self.patch_size + 2 * self.overlap_tile_pad

        # Pre-generate the mask pool. Each entry is a (full_mask, prediction_kernel)
        # pair built by stratified random pattern placement at LOSS-region size
        # (patch_size). Under overlap_tile_pad>0 we embed them into the larger
        # extract_size region at __getitem__ time.
        self._mask_pool, self._pred_pool = self._build_mask_pool()

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

    def _build_mask_pool(self):
        """Generate a pool of random masks + prediction kernels at init time.

        Returns two stacked arrays of shape ``(N, ...)`` where N=mask_pool_size.
        For 2D mode the inner shape is ``(patch_size, patch_size)``; for 2.5D
        mode it is ``(3, patch_size, patch_size)``.
        """
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
    
    @staticmethod
    def _augment_lockstep(arrays, flip_h, flip_v, rot_k):
        """Apply the same flip/rotation to each array in ``arrays``.

        Each array must be 2D ``(H, W)`` or 3D ``(C, H, W)`` and share spatial
        dimensions with the others. The same random parameters are applied to
        every array — this is the A5 fix that keeps the mask + prediction
        kernel aligned with the patch's orientation, so directional structural
        masks (e.g. the 21-pixel stripe mask) track the noise correlation
        direction through augmentation.
        """
        out = []
        for arr in arrays:
            is_3d = arr.ndim == 3
            a = arr
            if flip_h:
                a = np.flip(a, axis=2 if is_3d else 1)
            if flip_v:
                a = np.flip(a, axis=1 if is_3d else 0)
            if rot_k:
                a = np.rot90(a, k=rot_k, axes=(1, 2) if is_3d else (0, 1))
            out.append(np.ascontiguousarray(a))
        return out
        
    def __getitem__(self, idx):
        """
        Get a training sample consisting of an input patch, target patch, and mask.

        The input patch has some pixels masked according to the noise2void strategy.
        Applies random augmentation if enabled. The mask + prediction_kernel are
        sampled randomly per ``__getitem__`` from the pre-generated pool, giving
        publication-equivalent stratified random per-patch masking.

        Returns:
            tuple: (input_tensor, target_tensor, mask_tensor)
                - 2D mode: All tensors have shape (1, H, W)
                - 2.5D mode: input/target have shape (3, H, W), mask has shape (3, H, W)
        """
        # Calculate which image/slice and which patch within that image
        item_idx = idx // self.patches_per_image

        # Get data using the appropriate method (handles both path and stack modes)
        data = self.get_data(item_idx)

        # Get spatial dimensions (works for both 2D and 3D data)
        if self.mode == '2.5d':
            _, h, w = data.shape  # (3, H, W)
        else:
            h, w = data.shape  # (H, W)

        # Select patch location. Under overlap-tile training the extracted
        # patch is (patch_size + 2*pad) so the slice must accommodate that.
        extract_size = self.extract_size
        if not self.use_stack and self.use_roi and self.roi_patches[item_idx]:
            top, left = random.choice(self.roi_patches[item_idx])
            if top + extract_size > h or left + extract_size > w:
                top = np.random.randint(0, h - extract_size)
                left = np.random.randint(0, w - extract_size)
        else:
            top = np.random.randint(0, h - extract_size)
            left = np.random.randint(0, w - extract_size)

        # Extract the patch at extract_size (pad-extended)
        if self.mode == '2.5d':
            patch = data[:, top:top + extract_size, left:left + extract_size]
        else:
            patch = data[top:top + extract_size, left:left + extract_size]

        # Sample a fresh mask + prediction kernel from the pool. Pool entries
        # are at patch_size (loss region). Under overlap_tile_pad>0 we embed
        # them in the centre of extract_size arrays so masking only affects
        # central pixels (loss is computed only there).
        pool_idx = np.random.randint(0, self.mask_pool_size)
        if self.overlap_tile_pad > 0:
            pad = self.overlap_tile_pad
            inner_mask = self._mask_pool[pool_idx]
            inner_pred = self._pred_pool[pool_idx]
            if self.mode == '2.5d':
                # Inner shapes: (3, patch_size, patch_size) — embed in (3, extract, extract)
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

        # A5 fix (2026-05-08): augment the patch and the mask + prediction
        # kernel together so directional structural masks track the patch's
        # noise correlation direction. Augmenting AFTER patch extraction is
        # distributionally equivalent to augmenting before extraction — random
        # patch + augment = augment + random patch.
        if self.use_augmentation:
            flip_h = random.random() > 0.5
            flip_v = random.random() > 0.5
            rot_k = random.choice([0, 1, 2, 3])
            patch, mask, prediction_kernel = self._augment_lockstep(
                (patch, mask, prediction_kernel), flip_h, flip_v, rot_k
            )

        # CAREamics-style z-score normalization (applied BEFORE masking so the
        # replacement values sampled by apply_mask come from the normalized
        # distribution — matches Normalize being first in CAREamics' Compose).
        if self.norm_stats is not None:
            m, s, eps = self.norm_stats['mean'], self.norm_stats['std'], self.norm_stats['eps']
            patch = ((patch - m) / (s + eps)).astype(np.float32)

        # Apply masking to create input. ``prediction_kernel`` is forwarded so
        # mask_strat=4 can distinguish active centers (UPS replacement) from
        # struct-mask neighbors (uniform-random replacement); other strategies
        # ignore it.
        input_patch, _ = self.apply_mask(
            patch, mask, self.mask_strat, prediction_kernel=prediction_kernel
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

        # Mask tensor (the prediction kernel — used as gradient mask in the loss)
        mask_tensor = torch.from_numpy(prediction_kernel).float()

        return input_tensor, target_tensor, mask_tensor

    def apply_mask(self, patch, mask, mask_strat, prediction_kernel=None):
        """
        Apply masking kernel to an image patch using various strategies.

        Supports both 2D patches (H, W) and 3D patches (C, H, W) for 2.5D mode.

        Args:
            patch (numpy.ndarray): Input patch. Shape (H, W) for 2D or (C, H, W) for 2.5D.
            mask (numpy.ndarray): Boolean mask of the same shape as ``patch``.
                ``True`` pixels will be replaced.
            mask_strat (int): Masking strategy:
                0: Replace with local mean of unmasked neighbors over a
                   ``self.local_mean_window`` x ``self.local_mean_window``
                   window (default 5x5; was hardcoded 3x3 pre-A6).
                1: Replace with zero
                2: Replace with a random unmasked value drawn from the entire
                   patch (legacy; out-of-distribution replacement values let the
                   model learn an outlier-fixing shortcut — see diagnostic note F2).
                3: Replace with a uniform random unmasked value drawn from a
                   5x5 neighborhood (reflect-padded at the patch border),
                   excluding the center and any other masked positions in the
                   window. Matches N2V UPS for single-pixel kernels and
                   the legacy StructN2V default for multi-pixel kernels
                   (A2 fix, 2026-05-08).
                4: Two-tier replacement matching CAREamics StructN2V
                   (`uniform_manipulate` + `_apply_struct_mask`):
                   - Active centers (positions in ``prediction_kernel``):
                     UPS as in strategy 3, but with ``exclude_mask`` set to
                     the *full* mask so the UPS window never samples from
                     any masked pixel (centers OR struct neighbors).
                   - Struct-mask neighbors (positions in ``mask`` but NOT in
                     ``prediction_kernel``): replaced with uniform random
                     values in ``[patch.min(), patch.max()]``. Hides the
                     correlated-noise contribution from the structural
                     neighborhood, which strategy 3's local UPS leaks
                     because the 5×5 window straddles the kernel footprint.
                   For single-pixel kernels (Stage 1, ``prediction_kernel == mask``),
                   strategy 4 reduces to strategy 3. Requires ``prediction_kernel``
                   to be passed; falls back to strategy 3 if it is None.
                   See diagnostic note S3 (2026-05-14) and Tier B2 fix.
            prediction_kernel (numpy.ndarray, optional): Boolean array same
                shape as ``mask`` marking the active prediction centers.
                Required by ``mask_strat=4``; ignored by other strategies.

        Returns:
            tuple:
                masked_patch (numpy.ndarray): Patch with masking applied
                    (same shape as input).
                mask (numpy.ndarray): The same boolean mask passed in,
                    returned for convenience.
        """
        if mask.shape != patch.shape:
            raise ValueError(f"Mask shape {mask.shape} doesn't match patch shape {patch.shape}")

        masked_patch = patch.copy()

        if patch.ndim == 3:
            # 3D patch (C, H, W) - apply masking to each channel
            return self._apply_mask_3d(masked_patch, mask, mask_strat, prediction_kernel)
        else:
            # 2D patch (H, W)
            return self._apply_mask_2d(masked_patch, mask, mask_strat, prediction_kernel)

    def _apply_mask_2d(self, patch, mask, mask_strat, prediction_kernel=None):
        """Apply masking to a 2D patch."""
        h, w = patch.shape
        masked_patch = patch.copy()

        if mask_strat == 1:  # Zero
            masked_patch[mask] = 0
        elif mask_strat == 2:  # Random from entire patch (legacy)
            unmasked_values = patch[~mask]
            if len(unmasked_values) > 0:
                masked_patch[mask] = np.random.choice(unmasked_values, size=np.sum(mask))
        elif mask_strat == 3:  # UPS NxN excluding all masked positions (default 5; CAREamics uses 11)
            masked_patch = _ups_replace_2d(patch, mask, window_size=self.ups_window_size)
        elif mask_strat == 4:  # UPS centers + uniform-random struct neighbors
            if prediction_kernel is None:
                # Caller didn't pass pred_kernel — fall back to strategy 3.
                masked_patch = _ups_replace_2d(patch, mask, window_size=self.ups_window_size)
            else:
                centers = mask & prediction_kernel
                neighbors = mask & ~prediction_kernel
                if centers.any():
                    masked_patch = _ups_replace_2d(
                        patch, centers, window_size=self.ups_window_size,
                        exclude_mask=mask
                    )
                if neighbors.any():
                    masked_patch = _uniform_random_replace_2d(masked_patch, neighbors)
        else:  # Local mean over self.local_mean_window x self.local_mean_window
            half = self.local_mean_window // 2
            for i in range(h):
                for j in range(w):
                    if mask[i, j]:
                        i_start, i_end = max(0, i - half), min(h, i + half + 1)
                        j_start, j_end = max(0, j - half), min(w, j + half + 1)

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

    def _apply_mask_3d(self, patch, mask, mask_strat, prediction_kernel=None):
        """
        Apply masking to a 3D patch (C, H, W).

        For each masked position, uses values from the same spatial location
        across all channels when computing replacements.
        """
        c, h, w = patch.shape
        masked_patch = patch.copy()

        if mask_strat == 1:  # Zero
            masked_patch[mask] = 0
        elif mask_strat == 2:  # Random from entire patch (legacy)
            # For each channel, replace with random unmasked value from same channel
            for ch in range(c):
                ch_mask = mask[ch]
                unmasked_values = patch[ch][~ch_mask]
                if len(unmasked_values) > 0:
                    masked_patch[ch][ch_mask] = np.random.choice(
                        unmasked_values, size=np.sum(ch_mask)
                    )
        elif mask_strat == 3:  # UPS NxN — apply per-channel
            for ch in range(c):
                masked_patch[ch] = _ups_replace_2d(patch[ch], mask[ch], window_size=self.ups_window_size)
        elif mask_strat == 4:  # UPS centers + uniform-random struct neighbors — per-channel
            for ch in range(c):
                ch_mask = mask[ch]
                if prediction_kernel is None:
                    masked_patch[ch] = _ups_replace_2d(
                        patch[ch], ch_mask, window_size=self.ups_window_size
                    )
                else:
                    ch_pred = prediction_kernel[ch]
                    ch_centers = ch_mask & ch_pred
                    ch_neighbors = ch_mask & ~ch_pred
                    if ch_centers.any():
                        masked_patch[ch] = _ups_replace_2d(
                            patch[ch], ch_centers, window_size=self.ups_window_size,
                            exclude_mask=ch_mask
                        )
                    if ch_neighbors.any():
                        masked_patch[ch] = _uniform_random_replace_2d(
                            masked_patch[ch], ch_neighbors
                        )
        else:  # Local mean over self.local_mean_window x self.local_mean_window
            half = self.local_mean_window // 2
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
                            unmasked_values = neighborhood[~neighborhood_mask]

                            if len(unmasked_values) > 0:
                                masked_patch[ch, i, j] = np.mean(unmasked_values)
                            else:
                                unmasked_values = ch_patch[~ch_mask]
                                if len(unmasked_values) > 0:
                                    masked_patch[ch, i, j] = np.random.choice(unmasked_values)

        return masked_patch, mask