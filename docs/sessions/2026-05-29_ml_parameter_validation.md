# ML Module Parameter Validation

**Date:** 2026-05-29
**Phase:** Phase 4 - Polish & Bug Fixes
**Duration:** ~2 hours
**Status:** ✅ Complete
**Complexity:** Medium

---

## 🎯 Goals

**Primary Objectives:**
- [x] Add real-time parameter validation to Segmentation module config step
- [x] Add real-time parameter validation to DL Denoising module config step
- [x] Highlight invalid fields with error messages
- [x] Disable Start Training / step navigation when invalid
- [x] Account for padding in patch_size constraint (N2V extract-size divisibility)

**Secondary Objectives:**
- [x] Distinguish error styling from focus styling (initial implementation had both red)

---

## 📝 Summary

**Accomplished:**
- ✅ Created shared `ParameterValidator` utility (pure validation logic)
- ✅ Created shared `FormValidationController` utility (DOM binding, event delegation)
- ✅ Added field-level validation CSS using subtle red background tint for errors
- ✅ Integrated validation into Segmentation module (step 2 config)
- ✅ Integrated validation into DL Denoising module (both N2V and autoStructN2V stages)
- ✅ Patch size dropdown options exceeding image dimensions are auto-disabled
- ✅ N2V extract-size divisibility constraint validated (`(patch_size + 2*pad) % 2^num_layers == 0`)
- ✅ Manual verification via Playwright in both modules + light/dark mode
- ✅ Refined error visual to use background tint (not border) so focus ring stays distinct
- ✅ Bumped workspace version to 1.2.2, tagged commit

**Key Findings:**
- Segmentation backend response `validation.info.slice_dimensions = [height, width]`; the frontend FileHandler was reading a non-existent `validation.raw_dims` field, so dimension details were silently missing from the existing display
- DL Denoising already stored `validationResult.info.dimensions = {width, height}` directly on the module
- The N2V `overlap_tile_pad` default is 16 (from presets) / 4 (Python fallback); changing `num_layers` requires re-validating `patch_size` due to extract-size divisibility
- The original error styling (red border) clashed with the design system's focus ring (also red), so the final design uses a soft background tint for errors and reserves the bright red border for the focus state

---

## 📋 Detailed Log

### Task 1: Shared Validation Utilities ✅

**Problem:**
Both Segmentation and DL Denoising had overlapping parameter constraints (patch_size vs image dimensions) but no shared infrastructure. Putting validation logic inside each module would duplicate code and complicate testing.

**Solution:**
Two new files in `public/workspace/js/core/utils/`:
- `ParameterValidator.js` — pure validation: `validatePatchSize`, `validateRange`, `checkExtractSize`. No DOM dependencies.
- `FormValidationController.js` — DOM binding: attaches delegated change/input listeners to a container, manages `.has-error` class on `.form-field`, lazily creates `.field-error` spans, disables select options exceeding a max value.

The split lets the validator stay focused on rules while the controller handles all DOM bookkeeping. Either can be replaced independently.

**Files Changed:**
- `public/workspace/js/core/utils/ParameterValidator.js` (new)
- `public/workspace/js/core/utils/FormValidationController.js` (new)

---

### Task 2: Validation CSS ✅

**Problem:**
First implementation used a red border for error state. But the design system's focus ring is also red (`var(--module-primary)` + red box-shadow), so a focused-but-valid field looked similar to a defocused error.

**Solution:**
Replaced the red border error state with a subtle red background tint:
- Light mode: `rgba(220, 53, 69, 0.08)` background
- Dark mode: `rgba(255, 107, 107, 0.12)` background

Now the focus ring (bright red border) and the error tint (soft background fill) are distinct visual channels. Focusing on an errored field shows both — clearly communicating "you're editing an invalid field."

**Files Changed:**
- `public/workspace/js/core/css/module-base.css` (+26 lines)

---

### Task 3: Segmentation Module Integration ✅

**Problem:**
Step 2 config had no validation; the `step2Next` button was always enabled; invalid values only failed at Python runtime.

**Investigation:**
- Validation result stored in `validation.info.slice_dimensions` (Python output), but `FileHandler.displayValidationResults()` was reading `validation.raw_dims` which doesn't exist.
- `step2Next.onclick = () => this.configureAndProceed()` — no gating.

**Solution:**
- In `FileHandler.displayValidationResults()`: extract `[h, w]` from `slice_dimensions` and store on `this.module.imageDimensions`.
- In `SegmentationModule.goToStep(2)`: call new `_initConfigValidation()` method that instantiates a validator + controller, registers rules for `patchSize` / `patchesPerImage` / `numLayers` / `numEpochs`, disables oversized patch options, and runs initial validation.
- `onValidationChange` callback disables `step2Next` when any error exists.
- Added guard in `configureAndProceed()` as backup.
- Cleanup wired through `deactivate()` and `resetWorkflow()`.

**Files Changed:**
- `public/workspace/js/modules/segmentation/handlers/FileHandler.js` (+11 lines)
- `public/workspace/js/modules/segmentation/SegmentationModule.js` (+81 lines)

---

### Task 4: DL Denoising Module Integration ✅

**Problem:**
Same gap as segmentation, plus the additional N2V extract-size constraint. Config forms are re-rendered when presets change, so validation must re-initialize cleanly.

**Solution:**
- `ConfigHandler` now imports the validator/controller, manages an array of controllers (one per stage).
- `initValidation()` is called at the end of `renderConfigColumns()` (so it runs on initial render AND after preset change re-renders the HTML).
- For each rendered stage (stage1; stage2 if autoStructN2V), creates a controller attached to `#${stage}ConfigContent`.
- Patch size rule includes both image-dimensions check AND extract-size divisibility (`patch_size + 2*overlap_tile_pad` must be divisible by `2^num_layers`). `overlap_tile_pad` read from config (default 16 from presets, 4 fallback).
- `num_layers` change triggers re-validation of `patch_size` via `validateAll()` since the divisor changes.
- `NavigationHandler.nextStep()` gates step 2 → step 3 transition on `module.configValid`.
- `destroyValidation()` called in `deactivate()` and `reset()`.

**Files Changed:**
- `public/workspace/js/modules/denoising-dl/handlers/ConfigHandler.js` (+101 lines)
- `public/workspace/js/modules/denoising-dl/handlers/NavigationHandler.js` (+4 lines)
- `public/workspace/js/modules/denoising-dl/DLDenoisingModule.js` (+14 lines)

---

### Task 5: Verification ✅

**Approach:**
Playwright (headless Chromium) drove both modules through file upload → step 2 → parameter probing. Verified red background tint + error message on invalid `patchesPerImage=999` and `numEpochs=9999`; verified `step2Next` disabled and re-enabled; verified DL Denoising shows the same behavior; verified dark mode works.

**Caveat:**
The patch_size dropdown disabling path (`updateSelectOptions`) was exercised but didn't disable any options because the test data is 512x512 — large enough for all patch sizes to be valid. The logic is correct by code inspection; visual disabling would only trigger for very small images (e.g., 64x64).

---

## 🐛 Bugs Fixed / Issues Closed

- ✅ **ml modules parameter validation needed** (prio 4, compl 2) — closed in BUGS_ISSUES.md

---

## 📦 Version

Bumped workspace version 1.2.1 → 1.2.2 (workspace hub footer + `package.json`). Tagged commit `v1.2.2`.

---

## 🔮 Follow-ups

None for this session. Two open bugs remain in BUGS_ISSUES.md:
- User guide updates for direction-aware annotation/segmentation features (prio 1)
- Cleanup function deleting workspaces with active training (prio 5) — but `CleanupService.hasActiveProcesses()` was added and this may already be fixed
