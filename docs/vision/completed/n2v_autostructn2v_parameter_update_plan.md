# N2V + autoStructN2V Parameter Recommendations — Implementation Plan

**Date approved**: 2026-05-26
**Source recommendations**:
- `docs/vision/n2v_parameter_recommendations.md` (N2V single-stage)
- `docs/vision/autostructn2v_parameter_recommendations.md` (full autoStructN2V pipeline)

**Scope**: Bring the DL Denoising module's preset defaults in line with the publication-validated Tier-D recipe for plain N2V and the Tier-C2 recipe for autoStructN2V. Create three presets (`fast`, `balanced`, `high`) that share recommended values across all three sections (N2V single-stage, autoStructN2V Stage 1, autoStructN2V Stage 2 + mask extractor), differing only in epoch count.

**Linked bug**: `BUGS_ISSUES.md` — "n2v parameter defaults are out of date" (prio 4, compl 1; actual ~compl 2).

---

## Decisions taken (from clarification)

1. **Validation**: static audit only — no live training validation. Backend support for every recommended param was verified by reading `python/denoising/`.
2. **Scope**: N2V single-stage + autoStructN2V Stage 1 + autoStructN2V Stage 2 + mask extractor. autoStructN2V Stage 1 uses N2V values except `use_augmentation=false`, `use_roi=true`, lower `epochs`.
3. **UI expansion**: only widen existing controls' ranges/options to fit recommended values. **No new param controls** added to the UI (normalize_method, blurpool, etc. are written by preset but invisible).
4. **Stage 2 non-power-of-2 values**: switch `batch_size` and `learning_rate` to numeric inputs (Stage 2 only).
5. **Epoch ladder**:
   - N2V: fast=100 / balanced=200 / high=400
   - autoStructN2V Stage 1: fast=50 / balanced=100 / high=150
   - autoStructN2V Stage 2: fast=50 / balanced=100 / high=200
6. **Out of scope**: noise-type-specific extractor overrides (kernel_conv, sinusoidal) per autoStructN2V doc §5 — ignored.

---

## Phase 1 — Static validation (done)

Backend support verified in `python/denoising/`:
- `normalize_method` ('zscore') — `training.py:134`, `operations.py:275`.
- `overlap_tile_pad` (16) — `training.py:137,427,734`, `inference.py:42,208,435,510`.
- `remove_top_skip`, `use_blurpool` — `training.py:138-139`, `operations.py:279-280`, `inference.py:73-74`.
- `activation` — `inference.py:75` (default `'elu'`).
- `masking_strategy=3` and `=4` — accepted in extractor / mask path.
- Mask extractor: `python/denoising/training.py:497-510` and `operations.py:131-144` accept every param in the recommendations.

Frontend↔backend param-name mapping already in place:
- `adaptive_thresholding` → `adapt_autocorr` (`denoising.routes.js:564`, `DenoisingService.js:1655`)
- `max_masked_pixels` → `max_true_pixels` (`denoising.routes.js:577`, `DenoisingService.js:1666`)

No backend code changes required.

---

## Phase 2 — Update `config/denoising_presets.json`

Three presets × three sections each. Per-preset variation is only `epochs` (and Stage 1's `epochs`).

### N2V single-stage (Stage 1 of N2V mode)
Identical across `fast`, `balanced`, `high` except `epochs`:

| Param | Value |
|---|---|
| `patch_size` | 64 |
| `batch_size` | 128 |
| `learning_rate` | 4e-4 |
| `patches_per_image` | 100 |
| `features` | 32 |
| `num_layers` | 2 |
| `mask_percentage` | 1.5 |
| `mask_center_size` | 1 |
| `masking_strategy` | 3 |
| `normalize_method` | `'zscore'` |
| `activation` | `'relu'` |
| `remove_top_skip` | `true` |
| `use_blurpool` | `true` |
| `use_resize_conv` | `true` |
| `upsampling_mode` | `'bilinear'` |
| `overlap_tile_pad` | 16 |
| `use_augmentation` | `true` |
| `use_roi` | `false` |
| `early_stopping` | `true` |
| `early_stopping_patience` | 10 |
| `epochs` | fast=100, balanced=200, high=400 |

### autoStructN2V Stage 1
Same as N2V Stage 1 except:
- `use_augmentation` = `false`
- `use_roi` = `true`
- `roi_threshold` = 0.5
- `scale_factor` = 0.25
- `select_background` = `true`
- `epochs`: fast=50, balanced=100, high=150

### autoStructN2V Stage 2

| Param | Value |
|---|---|
| `patch_size` | 256 |
| `batch_size` | 24 |
| `learning_rate` | 7.5e-5 |
| `patches_per_image` | 200 |
| `features` | 32 |
| `num_layers` | 2 |
| `mask_percentage` | 15.0 |
| `masking_strategy` | 4 |
| `mask_source` | `'stage1'` |
| `normalize_method` | `'zscore'` |
| `activation` | `'relu'` |
| `remove_top_skip` | `true` |
| `use_blurpool` | `true` |
| `use_resize_conv` | `true` |
| `upsampling_mode` | `'bilinear'` |
| `overlap_tile_pad` | 16 |
| `use_augmentation` | `false` |
| `use_roi` | `false` |
| `epochs` | fast=50, balanced=100, high=200 |

### Mask extractor (SHARED defaults — Stage 2 only)
Same across all presets:

| Param | Value |
|---|---|
| `adaptive_thresholding` | `true` |
| `adapt_CB` | 50.0 |
| `adapt_DF` | 0.65 |
| `center_size` | 15 |
| `base_percentile` | 50 |
| `percentile_decay` | 1.035 |
| `center_ratio_threshold` | 0.2 |
| `use_center_proximity` | `true` |
| `center_proximity_threshold` | 0.95 |
| `keep_center_component_only` | `true` |
| `max_masked_pixels` | 25 |
| `norm_autocorr` | `true` |
| `log_autocorr` | `true` |
| `crop_autocorr` | `true` |
| `window` | `'tukey'` |
| `window_alpha` | 0.25 |

### Update `parameterRanges`
- `mask_percentage`: `min: 0.5`, `step: 0.5`, `default: 1.5`
- `batch_size.options`: append 24, 64, 128 → `[1, 2, 4, 8, 16, 24, 32, 64, 128]`, `default: 128`
- `learning_rate.options`: append 0.0004 → `[0.00001, 0.00005, 0.0001, 0.0002, 0.0004]`, `labels` extended `["1e-5", "5e-5", "1e-4", "2e-4", "4e-4"]`, `default: 0.0004`
- `patch_size.options`: append 256 (only used by Stage 2) → `[32, 48, 64, 96, 128, 256]`, `default: 64`
- `features.default`: 64 → 32
- `masking_strategy.options`: append `{value: 3, label: "UPS 5×5"}`, `{value: 4, label: "UPS center + struct"}`, `default: 3`

---

## Phase 3 — Expand existing UI controls in `ConfigHandler.js`

### `renderN2VConfigForm()` (single-column N2V form)
- `patch_size` dropdown — default-selected 64 (already correct).
- `batch_size` dropdown — add `<option value="64">` and `<option value="128">`; default-selected 128.
- `mask_percentage` input — change `min="5"` → `min="0.5"`, `step="1"` → `step="0.5"`, default value 1.5.
- `features` dropdown — default-selected 32.
- `num_layers` dropdown — default-selected 2.
- `learning_rate` dropdown — add `<option value="0.0004">4e-4</option>`; default-selected 4e-4.
- `masking_strategy` dropdown — add `<option value="3">UPS 5×5</option>`; default-selected 3.

### `renderStageConfigForm(stage)` (dual-column autoStructN2V form)
Apply the same Stage 1 changes for `stage === 'stage1'`.

For `stage === 'stage2'`:
- `patch_size` dropdown — add `<option value="256">`; default-selected 256.
- `batch_size`: **convert to numeric input** `<input type="number" min="1" max="256" step="1" value="24">`.
- `learning_rate`: **convert to numeric input** with `step="0.00001"`, `min="0.000001"`, `max="0.001"`, value `0.000075` (display as 7.5e-5 in a hint span).
- `mask_percentage` input — keep current range (5–30), default-selected 15.
- `features` dropdown — default-selected 32.
- `num_layers` dropdown — default-selected 2.
- `masking_strategy` dropdown — add `<option value="4">UPS center + struct</option>`; default-selected 4.

### `applyPreset()` plumbing
Every recommended param in Phase 2 — including those without a UI control (normalize_method, activation, remove_top_skip, use_blurpool, mask_center_size, overlap_tile_pad, ROI subkeys, mask extractor SHARED params) — must be written into `this.module.trainingConfig.stage1/stage2/maskExtractor` so they ride through to the backend in the training request.

---

## Phase 4 — Update fallback presets in `ConfigHandler.getDefaultPresets()`

Extend the fallback (currently only `balanced`) to include `fast` and `high` and mirror Phase 2 values exactly. This is the path used when the backend `/api/denoising/dl/presets` fetch fails.

---

## Phase 5 — Update defensive fallback defaults (drift prevention)

When the frontend omits an extractor param, several backend layers have their own fallback defaults that are stale. Bring them in line:

- `src/routes/denoising.routes.js:556` (`mapExtractorConfig`):
  - `adapt_DF: 0.95 → 0.65`
  - `center_size: 10 → 15`
  - `percentile_decay: 1.15 → 1.035`
  - `center_ratio_threshold: 0.3 → 0.2`
- `src/services/DenoisingService.js:1654` — same updates.
- `python/denoising/training.py:497` and `python/denoising/operations.py:131` — same updates.
- `public/workspace/js/modules/denoising-dl/components/MaskParameterPanel.js`:
  - Line 22 (constructor defaults) and line 166 (`resetToDefaults()`): `percentile_decay: 1.15 → 1.035`.
  - This is the only visible default change in the mask panel UI.

---

## Phase 6 — Update existing help articles

- `public/workspace/content/modules/denoising-dl/step2-masking-strategy.md`:
  - Document option 3 (UPS 5×5, default for plain N2V and autoStructN2V Stage 1).
  - Document option 4 (UPS center + random struct neighbors, default for autoStructN2V Stage 2).
  - Cite Krull 2019, Broaddus 2020, CAREamics 0.1.0.
- `public/workspace/content/modules/denoising-dl/step2-roi-selection.md`:
  - Add note: ROI is auto-enabled for autoStructN2V Stage 1 (improves autocorrelation quality for mask extraction).

No new articles (no new UI controls).

---

## Phase 7 — Version bump + manual test

- `package.json`: `"version": "1.2.0"` → `"1.2.1"`.
- `public/workspace/index.html:120`: `Workspace Version 1.2.0` → `1.2.1`.

### Manual test plan (user-driven after implementation)
1. N2V mode: switch fast/balanced/high → verify visible controls (patch_size 64, batch_size 128, learning_rate 4e-4, features 32, num_layers 2, mask_percentage 1.5, masking_strategy 3) show recommended values.
2. autoStructN2V mode: same verification for both Stage 1 and Stage 2 columns, including the new Stage 2 numeric inputs (batch_size 24, learning_rate 7.5e-5).
3. Mask extractor panel: verify `percentile_decay` default shows 1.035.
4. DevTools network tab: inspect submitted config payload for a training start → confirm hidden params (`normalize_method='zscore'`, `overlap_tile_pad=16`, `remove_top_skip=true`, `use_blurpool=true`, `activation='relu'`, `mask_center_size=1`, ROI subkeys, mask extractor SHARED defaults including `window='tukey'`, `window_alpha=0.25`) are present.
5. Smoke train: N2V 10-epoch run + autoStructN2V Stage 1 (10 epochs) → mask extract → Stage 2 (10 epochs) on test data; verify end-to-end completion.

---

## Files touched (expected)

- `config/denoising_presets.json` (Phase 2)
- `public/workspace/js/modules/denoising-dl/handlers/ConfigHandler.js` (Phases 3, 4)
- `public/workspace/js/modules/denoising-dl/components/MaskParameterPanel.js` (Phase 5)
- `src/routes/denoising.routes.js` (Phase 5)
- `src/services/DenoisingService.js` (Phase 5)
- `python/denoising/training.py` (Phase 5)
- `python/denoising/operations.py` (Phase 5)
- `public/workspace/content/modules/denoising-dl/step2-masking-strategy.md` (Phase 6)
- `public/workspace/content/modules/denoising-dl/step2-roi-selection.md` (Phase 6)
- `package.json` (Phase 7)
- `public/workspace/index.html` (Phase 7)

---

## Out of scope (explicit)

- No new UI controls for `normalize_method`, `activation`, `remove_top_skip`, `use_blurpool`, `mask_center_size`, `overlap_tile_pad`, ROI subkeys, or the new mask-extractor params. They are written by the preset and ride through to the backend but are not user-tunable in the UI.
- No noise-type-specific extractor overrides (autoStructN2V doc §5).
- No changes to backend processing logic — only fallback default values.
- No autoStructN2V Stage 1 epoch field on the autoStructN2V dual-column form (uses the same `epochs` field shared with Stage 2? — to confirm during implementation; if separate `epochs` fields exist, both get their preset-specific values).
