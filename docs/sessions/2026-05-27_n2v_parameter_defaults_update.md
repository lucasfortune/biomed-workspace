# N2V + autoStructN2V Parameter Defaults Update

**Date:** 2026-05-27
**Phase:** Phase 4 - Polish & Maintenance
**Duration:** ~2 hours
**Status:** Complete
**Complexity:** Medium

---

## Goals

**Primary Objectives:**
- [x] Update N2V parameter defaults to publication-validated Tier-D values
- [x] Update autoStructN2V Stage 1 + Stage 2 defaults to Tier-C2 values
- [x] Create/update fast, balanced, and high quality presets
- [x] Expand UI controls to accommodate new recommended values

**Secondary Objectives:**
- [x] Align defensive fallback defaults across routes, services, and Python backend
- [x] Update help articles for masking strategy and ROI selection
- [x] Version bump to 1.2.1

---

## Summary

**Accomplished:**
- Rewrote all 3 denoising presets (fast/balanced/high) with publication-validated parameter recipes
- N2V Stage 1: features=32, batch_size=128, learning_rate=4e-4, mask_percentage=1.5, masking_strategy=3 (UPS 5x5), normalize_method=zscore, remove_top_skip/use_blurpool/activation=relu, overlap_tile_pad=16
- autoStructN2V Stage 1: same as N2V but augmentation=false, ROI=true, lower epochs
- autoStructN2V Stage 2: patch_size=128, batch_size=24, learning_rate=7.5e-5, masking_strategy=4 (UPS center + struct)
- Mask extractor: SHARED defaults (percentile_decay=1.035, adapt_DF=0.65, center_size=15, window=tukey)
- Expanded UI dropdowns: batch_size to 128, learning_rate to 4e-4, masking_strategy options 3+4
- Switched Stage 2 batch_size and learning_rate to numeric inputs (non-power-of-2 values)
- Hidden params (normalize_method, overlap_tile_pad, remove_top_skip, use_blurpool, activation, mask_center_size, ROI subkeys, extractor SHARED defaults) ride through presets to backend without UI surface
- Defensive fallback defaults aligned across all backend layers

**Key Findings:**
- Backend already supported all recommended parameters (no backend logic changes needed)
- Frontend param-name mapping (adaptive_thresholding -> adapt_autocorr, max_masked_pixels -> max_true_pixels) was already in place
- Stage 2 publication recipe (patch_size=256 + overlap_tile_pad=16 = extract_size=288) exceeds the 256x256 test data; resolved by lowering Stage 2 default to patch_size=128

**Blockers Encountered:**
- autoStructN2V Stage 2 failed on test data with ValueError (h - extract_size <= 0) when using publication patch_size=256. Resolved by lowering Stage 2 default to 128 while keeping 256 available in dropdown for users with larger images.

---

## Detailed Log

### Task 1: Static validation of recommendations

**Problem:** docs/vision/n2v_parameter_recommendations.md and docs/vision/autostructn2v_parameter_recommendations.md contain publication-validated parameters that needed backend verification before applying.

**Investigation:** Grepped python/denoising/ for every recommended parameter (normalize_method, overlap_tile_pad, remove_top_skip, use_blurpool, masking_strategy=3/4, etc.). Verified param-name mapping in routes and services.

**Result:** All parameters fully supported. No backend code changes needed — only defaults/presets.

### Task 2: Update preset JSON and UI controls

**Problem:** All 3 presets (fast/balanced/high) had outdated values (e.g., features=64, masking_strategy=0, mask_percentage=15, batch_size=4). UI dropdowns didn't include recommended values.

**Solution:**
- Rewrote config/denoising_presets.json with Tier-D/C2 recipe values
- Added stage1_autostruct_overrides sub-object for autoStructN2V-specific Stage 1 overrides (augmentation off, ROI on, lower epochs)
- Updated applyPreset() to apply overrides when method=autostructn2v
- Expanded masking_strategy dropdown (added options 3 and 4), batch_size (added 64, 128), learning_rate (added 4e-4)
- Converted Stage 2 batch_size and learning_rate to numeric inputs
- Updated default selections (features: 64->32, num_layers default: 4->2, etc.)

**Result:** All presets show correct publication-validated values. Users can still customize via dropdowns.

### Task 3: Defensive fallback alignment

**Problem:** Multiple backend layers had stale fallback defaults (adapt_DF=0.95 vs recommended 0.65, center_size=10 vs 15, percentile_decay=1.15 vs 1.035, center_ratio_threshold=0.3 vs 0.2).

**Solution:** Updated mapExtractorConfig in denoising.routes.js, DenoisingService.js, and StructuralNoiseExtractor calls in operations.py and training.py. Updated MaskParameterPanel visible defaults and slider range/precision.

### Task 4: Stage 2 patch_size hotfix

**Problem:** Publication Stage 2 patch_size=256 + overlap_tile_pad=16 = extract_size=288 exceeds 256x256 test data, causing ValueError in DataLoader.

**Solution:** Lowered Stage 2 default patch_size from 256 to 128 (extract_size=160, fits 256x256). Kept 256 in dropdown for users with larger images.

---

## Code Changes Summary

### New Files (+3)
- `docs/vision/n2v_parameter_recommendations.md` (152 lines) - N2V parameter recommendations from publication experiments
- `docs/vision/autostructn2v_parameter_recommendations.md` (296 lines) - autoStructN2V parameter recommendations
- `docs/vision/completed/n2v_autostructn2v_parameter_update_plan.md` (241 lines) - Implementation plan

### Modified Files (11 changes)
- `config/denoising_presets.json` - Rewrote all 3 presets with validated N2V + autoStructN2V values; expanded parameterRanges
- `public/workspace/js/modules/denoising-dl/handlers/ConfigHandler.js` - Rewrote getDefaultPresets (3 presets); expanded N2V/Stage dropdowns; Stage 2 numeric inputs; applyPreset autoStruct override logic
- `public/workspace/js/modules/denoising-dl/components/MaskParameterPanel.js` - percentile_decay default 1.15->1.035, slider range/precision updated
- `src/routes/denoising.routes.js` - mapExtractorConfig fallback defaults aligned
- `src/services/DenoisingService.js` - Extractor param fallback defaults aligned
- `python/denoising/operations.py` - StructuralNoiseExtractor call fallbacks aligned
- `python/denoising/training.py` - StructuralNoiseExtractor call fallbacks aligned
- `public/workspace/content/modules/denoising-dl/step2-masking-strategy.md` - Added strategies 3 (UPS 5x5) and 4 (UPS center + struct) with references
- `public/workspace/content/modules/denoising-dl/step2-roi-selection.md` - Added autoStructN2V Stage 1 auto-enable note
- `package.json` - Version 1.2.0 -> 1.2.1
- `public/workspace/index.html` - Workspace version label 1.2.0 -> 1.2.1

---

## Testing Performed

**Manual Testing:**
- [x] N2V mode: switch fast/balanced/high presets - verified all controls show recommended values
- [x] autoStructN2V mode: verified Stage 1 and Stage 2 columns show correct values
- [x] N2V smoke train (10 epochs on test data) - completed successfully
- [x] autoStructN2V smoke train (Stage 1 -> mask extract -> Stage 2 on test data) - completed successfully after patch_size hotfix

---

## Design Decisions

1. **Hidden params via preset, no new UI controls:** User decided not to add new parameter controls to the UI. Publication-validated hidden params (normalize_method, blurpool, etc.) are written by presets and pass through to backend but are not user-tunable.
2. **Stage 2 numeric inputs:** Stage 2 batch_size (24) and learning_rate (7.5e-5) are non-power-of-2 values, so switched from dropdown to numeric input for Stage 2 only.
3. **stage1_autostruct_overrides in preset JSON:** autoStructN2V Stage 1 uses N2V values with 3 overrides (augmentation off, ROI on, lower epochs). Encoded as a nested override object stripped by applyPreset() at runtime.
4. **Stage 2 patch_size=128 instead of publication 256:** Publication recipe requires images >= 288x288. Test data is 256x256. Lowered default to 128 (extract_size=160); 256 remains selectable.
5. **Noise-type-specific overrides dropped:** autoStructN2V doc section 5 (kernel_conv, sinusoidal overrides) not implemented per user decision.

---

## Issues Resolved

- **N2V parameter defaults out of date** (BUGS_ISSUES.md, prio 4) - Fixed

---

## Next Steps

**Remaining open issues (from BUGS_ISSUES.md):**
1. Cleanup function deletes active trainings (prio 5, compl 3)
2. Admin page "user: unknown" in active sessions (prio 1, compl 1)
3. Update annotation/segmentation guides for direction-aware features (prio 1, compl 1)
4. Link docs on login page (prio 1, compl 1)

---

## Related Documentation

**Created/Updated:**
- [N2V Parameter Recommendations](../vision/n2v_parameter_recommendations.md) - Source of truth for N2V defaults
- [autoStructN2V Parameter Recommendations](../vision/autostructn2v_parameter_recommendations.md) - Source of truth for autoStructN2V defaults
- [Implementation Plan](../vision/completed/n2v_autostructn2v_parameter_update_plan.md) - Completed plan

---

## Metrics

| Metric | Value |
|--------|-------|
| Time Spent | ~2 hours |
| Files Changed | 14 files |
| Lines Added | +1103 |
| Lines Removed | -190 |
| Commits | 1 |
| Issues Closed | 1 |
| Issues Created | 0 |

---

**Navigation:**
← [Session Index](INDEX.md) | [Documentation Index](../INDEX.md) →

---

**Session Type:** Bug Fix
**Phase Status After Session:** On Track
