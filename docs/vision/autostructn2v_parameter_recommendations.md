# AutoStructN2V Parameter Recommendations for the Web Application

**Date**: 2026-05-26
**Source of truth**: `publication/experiments/shared/configs.py` (`SHARED_HPARAMS` + `autostructn2v_config()` + `EXTRACTOR_OVERRIDES`)
**Supplementary**: `publication/experiments/results/tuning/accepted_params.json` (per-dataset tuned extractor values)
**Scope**: Full two-stage AutoStructN2V pipeline (Stage 1 pre-denoising + mask extraction + Stage 2 structural denoising).

This document covers the complete AutoStructN2V parameter set. For Stage 1 / standalone N2V, see `n2v_parameter_recommendations.md` in this directory.

---

## 1. Pipeline overview

AutoStructN2V runs two stages:

1. **Stage 1 (N2V pre-denoising)**: Trains a vanilla N2V model, produces denoised patches, then runs the mask extractor on the autocorrelation of the denoised residuals to discover the structural noise kernel.
2. **Stage 2 (StructN2V denoising)**: Trains a StructN2V model using the auto-discovered kernel mask, producing the final denoised output.

The `autostructn2v_config()` factory function selects this mode: `run_stage1=True`, `run_stage2=True`, `stage2.mask_source='stage1'`.

---

## 2. Stage 1 modifications (vs. standalone N2V)

When Stage 1 feeds Stage 2, three parameters change from the plain N2V recommendations:

| Parameter | N2V-only | AutoStructN2V Stage 1 | Rationale |
|---|---|---|---|
| `stage1.use_augmentation` | `True` | **`False`** | Augmentation (flips/rotations) would cause the averaged autocorrelation to lose directional structural information, breaking the mask extractor. This is the single most critical override. |
| `stage1.use_roi` | `False` | **`True`** | ROI filtering lets Stage 1 focus on foreground regions, improving autocorrelation quality for mask extraction. |
| `num_epochs` | `400` | **`100`** | Stage 1 is a pre-denoising step, not the final model. 100 epochs is sufficient for the residual autocorrelation to be readable by the extractor. |

All other Stage 1 parameters (architecture, patching, masking, normalization) are identical to the N2V recommendations.

---

## 3. Stage 2 training parameters

### Architecture

| Parameter | Recommended | Rationale |
|---|---|---|
| `features` | `32` | Reverted from 64 → 32 on 2026-05-18 to align with the validated Tier-D N2V backbone. Broaddus 2020 uses features=16; we keep 32 for consistency with the modern backbone choice. Halves VRAM vs. features=64. |
| `num_layers` | `2` | Consistent with Stage 1 and Tier-D canonical. |
| `activation` | `'relu'` | Tier C / N2V2 (2026-05-08): ReLU with matched He-init. |
| `remove_top_skip` | `True` | Tier C / N2V2: removes identity-shortcut that lets the U-Net bypass the blind-spot constraint. |
| `use_blurpool` | `True` | Tier C / N2V2: anti-aliased downsampling. |
| `use_resize_conv` | `True` | Reduces checkerboard artifacts in the decoder. |
| `upsampling_mode` | `'bilinear'` | Pairs with `use_resize_conv`. |

### Patching and training

| Parameter | Recommended | Rationale |
|---|---|---|
| `patch_size` | `256` | Tier C2 (2026-05-14): matches Broaddus 2020 (256x256 patches). Per-patch active-pixel count grows ~16x vs. the legacy 64 default, providing the training-signal density Broaddus 2020 reports for stripe noise. With `overlap_tile_pad=16`, the dataset extracts 288x288 patches but loss is on the central 256x256. |
| `batch_size` | `24` | Tier C2 (2026-05-14): batch=24 at patch=256 + extract=288 + features=32 peaks well below the A5000's 24 GB. Batch=32 works with features=32 but 24 provides comfortable headroom. |
| `learning_rate` | `7.5e-5` | Tier A2, updated for Tier C2: conservative midpoint between Broaddus 2020's explicit 2e-5 (at batch=4) and the linear-scaling rule (1.2e-4 at batch=24). The pre-A2 value of 1e-5 drove a death-spiral to 1.95e-8 by epoch 104 with the ReduceLROnPlateau scheduler. |
| `patches_per_image` | `200` | Canonical. |
| `overlap_tile_pad` | `16` | Same as Stage 1 — eliminates edge-band artifacts. |
| `num_epochs` | `100` | `autostructn2v_config()` override. |

### Masking (Stage 2)

| Parameter | Recommended | Rationale |
|---|---|---|
| `masking_strategy` | `4` | Tier B2 (2026-05-14): "UPS center + uniform-random struct neighbors." Strategy 3 (UPS for all positions) leaks correlated noise through the structural kernel footprint because the 5x5 UPS window straddles the kernel and sits within the noise correlation neighbourhood. Strategy 4 applies UPS only to the prediction center and random replacement to structural neighbours — matches CAREamics' struct-mask strategy. |
| `mask_percentage` | `15.0` | Set by `autostructn2v_config()`. For multi-pixel structural kernels, this value is **largely cosmetic**: 8-connectivity forbidden-zone dilation in `create_full_mask()` caps achievable prediction-center density well below the target (e.g. ~1.35% for a 21-pixel stripe kernel on 256x256, ~0.57% for et_derived, ~0.35% for cross_hatch). The configured value determines how many centers the placement loop *attempts* — geometry is the actual limiter. Values in [2, 15] produce identical achieved density. |
| `mask_source` | `'stage1'` | Auto-discovered from Stage 1 residual autocorrelation. |

### Augmentation and ROI (Stage 2)

| Parameter | Recommended | Rationale |
|---|---|---|
| `use_augmentation` | `False` | Tier C2 (2026-05-14): for inference-time noise with a fixed orientation (stripe, cross-hatch), training on 8 rotated orientations wastes model capacity. N2V supplementary explicitly disables augmentation for cryo-TEM (the only direct precedent for structured-noise denoising). |
| `use_roi` | `False` | ROI is not used in Stage 2; the structural mask already defines the region of interest. |

---

## 4. Mask extractor parameters

The extractor analyses the autocorrelation of Stage 1's denoised residuals to discover the structural noise kernel. This is the core automation of AutoStructN2V.

### Autocorrelation preprocessing

| Parameter | Recommended | What it does |
|---|---|---|
| `norm_autocorr` | `True` | Normalize autocorrelation to [0, 1]. Required for stable thresholding. |
| `log_autocorr` | `True` | Log-transform autocorrelation. Compresses dynamic range so weak structural peaks become visible. |
| `crop_autocorr` | `True` | Crop to `center_size` before analysis. Removes irrelevant far-field values. |
| `window` | `'none'` (SHARED default) or `'tukey'` (accepted params) | Windowing suppresses spectral leakage from sharp patch boundaries (the "+" artifact through autocorrelation center). `'tukey'` with `alpha=0.25` is recommended when patch_size >= 64. |
| `window_alpha` | `0.25` | Tukey taper width. Lower = less leakage suppression but more interior preserved. 0.25 is a sensible default. |

### Thresholding strategy

| Parameter | Recommended | What it does |
|---|---|---|
| `adapt_autocorr` | `True` (SHARED) | Adaptive thresholding adjusts the cutoff per ring using local statistics. More robust to varying noise intensities across the autocorrelation. Disable (`False`) for sinusoidal noise where the structure is high-contrast and fixed-percentile works better. |
| `adapt_CB` | `50.0` | Base coefficient for adaptive threshold. |
| `adapt_DF` | `0.65` (SHARED) | Distance factor for adaptive threshold. Controls how quickly the threshold decays with distance from center. |
| `threshold_method` | `'percentile'` (default) | Alternative: `'otsu'` (Otsu's method) adapts to each ring's distribution. Useful when outer rings have compressed value ranges where a fixed-percentile threshold sits in the wrong place. |

### Ring analysis

| Parameter | Recommended | What it does |
|---|---|---|
| `center_size` | `15` (SHARED) | Side length of the center square analysed for ring structure. With `tighten_output_mask=True` (default), this is an upper bound on the search radius, not the output mask size. |
| `base_percentile` | `50` (SHARED) | Base percentile for per-ring thresholding. Higher = more aggressive (fewer pixels kept). |
| `percentile_decay` | `1.035` (SHARED) | Decay factor per ring. Values near 1.0 = nearly constant threshold across rings; higher = threshold rises for outer rings (more conservative outward). |
| `center_ratio_threshold` | `0.2` (SHARED) | Ring-level gate: minimum ratio of ring max to center value. Rings below this threshold are rejected as containing no structural signal. |

### Mask refinement

| Parameter | Recommended | What it does |
|---|---|---|
| `use_center_proximity` | `True` | Augments the ring analysis with a center-proximity measure. Helps reject isolated outlier pixels that pass the threshold but aren't part of the structural pattern. |
| `center_proximity_threshold` | `0.95` | Proximity threshold. Higher = stricter (fewer pixels kept). |
| `keep_center_component_only` | `True` | Keep only the connected component containing the center pixel. Rejects disconnected noise clusters. |
| `max_true_pixels` | `25` (SHARED) | Hard cap on mask size. Pixels closest to the center are kept; ties broken by autocorrelation intensity. Prevents runaway mask growth on noisy autocorrelations. |

---

## 5. Noise-type-specific extractor overrides

The base extractor params (§4) are tuned for `inverse_synthesis` noise. Two noise categories need different settings, codified in `EXTRACTOR_OVERRIDES`:

| Noise type | Override | Rationale |
|---|---|---|
| `inverse_synthesis` | *(none — base params)* | Base defaults are tuned for this category. |
| `kernel_conv` | `percentile_decay: 1.5` | Convolution-based noise has a broader structure that requires a more aggressive (rising) threshold for outer rings to avoid including noise pixels. |
| `sinusoidal` | `adapt_autocorr: False`, `percentile_decay: 1.15` | Sinusoidal noise produces high-contrast, well-defined autocorrelation peaks. Adaptive thresholding is not needed and can interfere; a fixed percentile with moderate decay works best. |

### Per-dataset tuned parameters (accepted_params.json)

The publication experiments also tested a separately tuned parameter set that was optimized per dataset. The key differences from the SHARED defaults:

| Parameter | SHARED default | Tuned (stripe) | Tuned (cross-hatch) |
|---|---|---|---|
| `adapt_autocorr` | `True` | `False` | `False` |
| `adapt_DF` | `0.65` | `0.95` | `0.95` |
| `center_size` | `15` | `25` | `25` |
| `base_percentile` | `50` | `95` | `90` |
| `percentile_decay` | `1.035` | `1.01` | `1.04` |
| `center_ratio_threshold` | `0.2` | `0.1` | `0.1` |
| `max_true_pixels` | `25` | `150` | `150` |
| `window` | `'none'` | `'tukey'` | `'tukey'` |

The tuned params are more permissive (larger `max_true_pixels`, higher `base_percentile` with aggressive initial threshold, gentler `percentile_decay`) because they were optimized for known noise structures where the autocorrelation signal is strong and consistent. The SHARED defaults are more conservative, designed to avoid false positives on unknown noise. **For a web app where the noise pattern is unknown, the SHARED defaults are the safer starting point.**

---

## 6. ROI parameters (Stage 1 in AutoStructN2V mode)

| Parameter | Recommended | What it does |
|---|---|---|
| `use_roi` | `True` | Enables foreground/background segmentation for Stage 1 patch selection. |
| `roi_threshold` | `0.5` | Threshold for the ROI binary mask. |
| `scale_factor` | `0.25` | Downscale factor for ROI computation (speed optimization). |
| `select_background` | `True` | Include background patches in training (improves generalization). |

---

## 7. Experiment-harness values (web app should override)

Same as the N2V document — `random_seed`, `device`, `split_ratio`, `verbose` are experiment-specific. See §2 of `n2v_parameter_recommendations.md` for web app alternatives.

---

## 8. Canonical AutoStructN2V config (copy-paste reference)

```python
autostructn2v_full = {
    # --- Top-level ---
    'normalize_method': 'zscore',
    'num_epochs': 100,
    'use_aux_psnr_for_scheduling': False,
    'early_stopping': False,
    'early_stopping_patience': 10,
    'run_stage1': True,
    'run_stage2': True,

    # --- Stage 1 (N2V pre-denoising + residual autocorrelation) ---
    'stage1': {
        # Architecture
        'features': 32,
        'num_layers': 2,
        'activation': 'relu',
        'remove_top_skip': True,
        'use_blurpool': True,
        'use_resize_conv': True,
        'upsampling_mode': 'bilinear',

        # Patching
        'patch_size': 64,
        'batch_size': 128,
        'learning_rate': 4e-4,
        'patches_per_image': 100,
        'overlap_tile_pad': 16,

        # Masking (vanilla N2V)
        'mask_percentage': 1.5,
        'mask_center_size': 1,
        'masking_strategy': 3,

        # CRITICAL: augmentation OFF for autocorrelation preservation
        'use_augmentation': False,

        # ROI (enabled for AutoStructN2V)
        'use_roi': True,
        'roi_threshold': 0.5,
        'scale_factor': 0.25,
        'select_background': True,
    },

    # --- Stage 2 (StructN2V with auto-discovered mask) ---
    'stage2': {
        # Architecture
        'features': 32,
        'num_layers': 2,
        'activation': 'relu',
        'remove_top_skip': True,
        'use_blurpool': True,
        'use_resize_conv': True,
        'upsampling_mode': 'bilinear',

        # Patching
        'patch_size': 256,
        'batch_size': 24,
        'learning_rate': 7.5e-5,
        'patches_per_image': 200,
        'overlap_tile_pad': 16,

        # Masking (structural)
        'mask_percentage': 15.0,
        'masking_strategy': 4,
        'mask_source': 'stage1',
        'mask_file_path': None,

        # Augmentation OFF for directional noise
        'use_augmentation': False,

        # ROI (disabled for Stage 2)
        'use_roi': False,

        # Mask extractor (base defaults — see §4-5 for noise-type overrides)
        'extractor': {
            'norm_autocorr': True,
            'log_autocorr': True,
            'crop_autocorr': True,
            'adapt_autocorr': True,
            'adapt_CB': 50.0,
            'adapt_DF': 0.65,
            'center_size': 15,
            'base_percentile': 50,
            'percentile_decay': 1.035,
            'center_ratio_threshold': 0.2,
            'use_center_proximity': True,
            'center_proximity_threshold': 0.95,
            'keep_center_component_only': True,
            'max_true_pixels': 25,
        },
    },
}
```

To apply noise-type-specific extractor overrides:
```python
# For kernel_conv noise:
autostructn2v_full['stage2']['extractor']['percentile_decay'] = 1.5

# For sinusoidal noise:
autostructn2v_full['stage2']['extractor']['adapt_autocorr'] = False
autostructn2v_full['stage2']['extractor']['percentile_decay'] = 1.15
```

---

## 9. Provenance

All Stage 2 training parameters trace to the Tier A2–D2 fix arc (2026-05-14, commits `0aa2bef`):

- **Tier A2**: learning rate linear-scaled from Broaddus 2020
- **Tier B2**: masking strategy 4 (UPS center + random struct neighbours)
- **Tier C2**: patch_size 256 (paper-faithful), batch_size 24 (VRAM budget), augmentation OFF
- **Tier D2**: mask_percentage semantics corrected (% prediction centers, not % masked pixels)
- **S4b extension**: explicit Stage 2 scheduler params

Stage 1 and architecture parameters trace to Tiers A–D (2026-05-08 through 2026-05-13) — see the N2V recommendations doc for details.

Extractor parameters were tuned in `publication/experiments/02_autostructn2v/prototype_skeleton_extractor.ipynb` and consolidated into `SHARED_HPARAMS`. Per-dataset tuning results are in `publication/experiments/results/tuning/accepted_params.json`.

### Literature anchors

- **Krull et al. (2019)** — Noise2Void. Original blind-spot method; defines UPS masking and the single-pixel center used by Stage 1.
- **Broaddus et al. (2020)** — Removing structured noise with self-supervised blind-spot networks. StructN2V; the paper that Stage 2 implements. Source for patch_size=256, mask_percentage=2%, batch=4 baseline.
- **Höck et al. (2022)** — N2V2. Source of architectural fixes: top-skip removal, MaxBlurPool, ReLU + He-init.
- **CAREamics 0.1.0** — Reference implementation; target for reimplementation correctness. Validates z-score normalization and masking strategy 4.
