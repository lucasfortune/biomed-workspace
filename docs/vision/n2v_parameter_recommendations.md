# N2V Parameter Recommendations for the Web Application

**Date**: 2026-05-22
**Source of truth**: `publication/experiments/shared/configs.py` (`SHARED_HPARAMS` + `n2v_only_config()`)
**Scope**: Stage 1 / standalone N2V denoising as deployed in the visualization web app.

This document distils the N2V hyperparameter set that has been validated in the publication experiments. Values were converged via successive tiers of fixes (A → D) closing the reimplementation gap to upstream CAREamics N2V (Tier D result: renorm-PSNR 29.90 / Pearson 0.9645 vs CAREamics 23.51 / 0.9566 on `FMD_fish_stripe_balanced`). Each value is annotated with its rationale and citation back to the literature (Krull 2019, Broaddus 2020, Höck 2022, CAREamics 0.1.0) where applicable.

The document is split into two layers:

1. **Method-level recommendations** — values that should be the web app's defaults for N2V because they have been independently validated and have publication-grade evidence. These should rarely change.
2. **Experiment-harness values** — settings that exist in `SHARED_HPARAMS` because the publication experiments need them, but which the web app should either replace with its own logic or expose as user-tunable.

---

## 1. Method-level recommendations (use these as web app defaults)

### Training schedule

| Parameter | Recommended | Rationale |
|---|---|---|
| `normalize_method` | `'zscore'` | CAREamics-style z-score normalization. Flipped from `'unit'` on 2026-05-12 (session 05) after Tier D closed the reimplementation gap to upstream CAREamics N2V. The framework default in `autoStructN2V/pipeline/config.py` stays at `'unit'` for backwards-compat, but **for N2V quality, `'zscore'` is required**. |
| `num_epochs` | `400` (publication setting) — `100–200` acceptable for interactive use | Bumped from 100 → 400 on 2026-05-12 (session 06) to match the validated Tier-D recipe. For web-app interactive sessions, lower values work but quality plateaus visibly past ~150. |
| `use_aux_psnr_for_scheduling` | `False` | Masked val_loss drives `ReduceLROnPlateau` / EarlyStopping / best-checkpoint selection. This is the paper-faithful signal (Krull 2019, Broaddus 2020, Höck 2022, CAREamics 0.1.0). Aux PSNR-vs-clean is only computed when ground truth exists and is for *logging only*. Web-app users typically have no clean ground truth — this default is correct for them. |

### Stage 1 / N2V network architecture

| Parameter | Recommended | Rationale |
|---|---|---|
| `features` | `32` | Tier-D canonical (2026-05-12 session 06). Pre-Tier-D values were exploratory. |
| `num_layers` | `2` | Tier-D canonical. |
| `activation` | `'relu'` | Tier C / N2V2 (2026-05-08): ReLU with matched He-init aligns initialization with the activation function. |
| `remove_top_skip` | `True` | Tier C / N2V2 (2026-05-08): removes the identity-shortcut path that lets the U-Net trivially copy noisy input to output. Critical for N2V correctness. |
| `use_blurpool` | `True` | Tier C / N2V2 (2026-05-08): MaxBlurPool prevents aliasing in downsampling, closes another shortcut path. |
| `use_resize_conv` | `True` | Reduces checkerboard artifacts in the decoder. |
| `upsampling_mode` | `'bilinear'` | Pairs with `use_resize_conv`. |

### Patching

| Parameter | Recommended | Rationale |
|---|---|---|
| `patch_size` | `64` | Bumped from 32 on 2026-04-29 so windowing (Tukey/Hann/Hamming) in the mask extractor retains enough effective sample area to suppress spectral leakage. For N2V-only (no extractor), 64 still works well; 32 also viable if memory is constrained. |
| `batch_size` | `128` | Tier-D canonical. |
| `learning_rate` | `4e-4` | Tier-D canonical. |
| `patches_per_image` | `100` | Tier-D canonical. |
| `overlap_tile_pad` | `16` | Overlap-tile training (option d, 2026-05-13 session 02). Dataset extracts (patch_size + 2*pad) patches but the N2V loss is computed only on the central patch_size region. Inference/cache use only the central output. Eliminates the 1–3 px edge-band artifact otherwise produced under pad=0 training. |

### N2V masking

| Parameter | Recommended | Rationale |
|---|---|---|
| `mask_percentage` | `1.5` | Tier-D canonical. Paper-aligned (Krull 2019 ~0.5–1.5% depending on patch density). |
| `mask_center_size` | `1` | Single-pixel N2V center — definitive for vanilla N2V. |
| `masking_strategy` | `3` (UPS 5×5) | Tier A2 fix (2026-05-08): publication-faithful Uniform-Pixel-Selection within a 5×5 neighborhood. |
| `use_augmentation` | `True` | Helpful for non-directional N2V (no struct-mask alignment concern). |

### Inference / runtime

| Parameter | Recommended | Rationale |
|---|---|---|
| `early_stopping` | `False` for batch / publication runs; `True` reasonable for interactive web-app use | The publication uses `False` to get full 400-epoch curves; the web app should probably enable it with patience=10 to avoid wasted compute when convergence is fast. |
| `early_stopping_patience` | `10` | Standard. |

---

## 2. Experiment-harness values (web app should override or expose)

These exist in `SHARED_HPARAMS` for experimental reproducibility but should not be hard-defaults in the web app:

| Parameter | `SHARED_HPARAMS` value | Web app recommendation |
|---|---|---|
| `random_seed` | `42` | Web app should either accept user-provided seed or use `None` so each run differs. Fixed seed is a publication-reproducibility convention. |
| `device` | `'cuda'` | Web app should auto-detect (`'cuda'` if available, else `'cpu'`) rather than hard-fail on machines without a GPU. |
| `split_ratio` | `(0.7, 0.15, 0.15)` | Publication-experiment evaluation split. Web app users typically lack ground truth and don't care about test split. A `(0.85, 0.15, 0.0)` train/val/test or `(0.9, 0.1)` train/val split is more appropriate for production denoising. |
| `verbose` | `False` | Web app should plumb this to its logging system rather than relying on the package's stdout. |

---

## 3. ROI (Region of Interest) — disabled for plain N2V

Per `n2v_only_config()`, ROI is disabled when running standard N2V:

```python
cfg['stage1']['use_roi'] = False
```

The ROI mechanism (`use_roi`, `roi_threshold`, `scale_factor`, `select_background`) is only meaningful when the autoStructN2V mask extractor needs to identify foreground for masking. For pure N2V, leave `use_roi=False` and ignore the rest.

---

## 4. Canonical N2V config (copy-paste reference)

```python
n2v_stage1 = {
    # Training schedule
    'normalize_method': 'zscore',
    'num_epochs': 400,
    'use_aux_psnr_for_scheduling': False,
    'early_stopping': False,            # see §1 — True is reasonable for interactive use
    'early_stopping_patience': 10,

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

    # Masking
    'mask_percentage': 1.5,
    'mask_center_size': 1,
    'masking_strategy': 3,
    'use_augmentation': True,

    # ROI (disabled for plain N2V)
    'use_roi': False,
}
```

To run this with the migrated `autoStructN2V` package: build a config with `run_stage1=True`, `run_stage2=False`, place the dict above under `'stage1'`, and add the top-level keys from §2 (`device`, `split_ratio`, `random_seed`, `verbose`) per the web app's own conventions.

---

## 5. Provenance

All recommended values trace back to the following commits and notes in the publication repo (tag `v1.0-webapp` → HEAD `fa915df`):

- **Tier A** (`7216c3d`, 2026-05-08): masking strategy 3 (UPS 5×5), A4 scheduling
- **Tier B + C** (`cbcccd8`, 2026-05-12): N2V2 architectural fixes (top-skip removal, MaxBlurPool, ReLU + He init), falsified correlated-noise hypothesis
- **Tier D** (`0a5884a`, 2026-05-12): z-score input normalization closed the CAREamics reimplementation gap
- **Cache fix** (`065109c`, 2026-05-13): Stage-1 cache step loads training-time config (resolves `_norm_stats` drop)
- **Mask border fix** (`a2bee72`, 2026-05-13): drops redundant False border on Stage-1 mask kernel
- **Overlap-tile** (`4b901bd`, 2026-05-13): option (d), eliminates patch-edge artifacts
- **Scheduling revert** (`b32cfc5`, 2026-05-15): masked val_loss restored as scheduling signal, aux PSNR retained for logging only

Detailed evidence and ablations are documented in `publication/publication_docs/notes/n2v_structn2v_fixes_summary_2026-05-14.md` and `publication/publication_docs/notes/n2v_reimpl_debug_2026-05-12.md`.

### Literature anchors

- **Krull et al. (2019)** — Noise2Void: Learning Denoising from Single Noisy Images. Original N2V; defines UPS masking and the single-pixel center.
- **Broaddus et al. (2020)** — Removing structured noise with self-supervised blind-spot networks. StructN2V; informs the kernel-aware masking strategies inherited by Stage 2.
- **Höck et al. (2022)** — N2V2: fixing Noise2Void checkerboard artifacts with modified sampling strategies and a tweaked network architecture. Source of the Tier C / N2V2 architectural fixes (top-skip removal, MaxBlurPool, ReLU + He init).
- **CAREamics 0.1.0** — Reference implementation used as a reimplementation correctness target. The z-score normalization and masked val_loss scheduling defaults match CAREamics.
