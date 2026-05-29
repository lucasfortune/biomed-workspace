# U-Net Shape Mismatch Pre-Flight Validation

**Date:** 2026-05-29
**Phase:** Phase 4 - Polish & Bug Fixes
**Duration:** ~1 hour
**Status:** ✅ Complete
**Complexity:** Low–Medium

---

## 🎯 Goals

**Primary Objectives:**
- [x] Triage recent production error logs from `pm2-error-0.log`
- [x] Close the segmentation-side gap where U-Net `patch_size % 2^num_layers != 0` slipped past the new ML parameter validation
- [x] Add an inference-side pre-flight check so an incompatible inference TIFF can't trigger the decoder shape mismatch at run time
- [x] Verify the new behaviour end-to-end in a real browser

---

## 📝 Summary

**Triage of `pm2-error-0.log`:**
- 🔴 **Inference crashed** on a user with `Shape mismatch in decoder spatial dimensions: upsampled=torch.Size([30, 30]) vs skip=torch.Size([31, 31])` — a real U-Net "odd intermediate dimension" failure, the only error worth acting on.
- 🟡 The remaining errors were noise: a stale `deleteFile` (metadata gone, file already removed), `[Annotation Conversion] Values are already in expected format` mis-logged at ERROR level (it's an info-level message printed to stderr in `python/validate_tiff.py:129`), repeated NVML `UserWarning` from PyTorch CUDA init (driver/NVML mismatch or CPU-only host), and a benign `No active process found for training …` (cancel on already-finished job).

**Found gaps after reviewing yesterday's [[2026-05-29_ml_parameter_validation]] session:**
1. The segmentation training-config validator only enforced `patch_size <= min(image_dim)` and basic ranges, **not** divisibility by `2^num_layers`. That same constraint was already implemented for DL Denoising via `ParameterValidator.checkExtractSize()` but was never wired into the segmentation patch-size rule.
2. There was **no validation on the inference step at all**. Even with a correctly-trained model, a user could pick an inference TIFF whose smallest dimension wasn't a multiple of `2^num_layers` and crash mid-inference.

**Accomplished:**
- ✅ Wired `numLayers` into the segmentation patch-size rule (passes `{overlapTilePad: 0, numLayers}` into `ParameterValidator.validatePatchSize`). `FormValidationController._handleChange` already re-runs all rules on any tracked field change, so toggling `numLayers` automatically re-validates `patchSize` without an explicit dependency wire-up.
- ✅ Persisted `this.trainingConfig` on the module after successful save so the inference step can later read `num_layers` (previously it was only POSTed and dropped).
- ✅ Added `SegmentationModule._validateInferenceCompatibility()` — computes `min(w,h) % 2^num_layers`, and if non-zero disables `runInferenceBtn`, inserts an inline red banner above the button, and fires an error notification. Bails silently if either `inferenceDimensions` or `num_layers` is unknown (graceful degradation for the post-refresh case).
- ✅ Hooked the validator into three trigger points: `FileHandler.validateInferenceFile`/`loadTestInferenceData` (after inference upload), `ImportHandler` (after successful import validation), and `goToStep(4)` (on entering the inference step).
- ✅ Extended `resetWorkflow` to clear `inferenceDimensions`, `imageDimensions`, `trainingConfig`, `importedModelConfig` so a stale prior session can't bleed through.
- ✅ Drove the new validator through 9 cases in headless Chromium via Playwright (all pass).

**Key Findings:**
- The DL Denoising module already had divisibility checking via `ParameterValidator.checkExtractSize()` from yesterday's session — segmentation just never opted in to that path. The fix was a one-line rule change, not new validation infrastructure.
- `this.trainingConfig` was referenced as a fallback (`|| {}`) at `SegmentationModule.js:1305` but was never actually assigned anywhere. Other code paths read `document.getElementById('numLayers').value` directly, but that DOM element only exists in step 2. Inference happens in step 4, so persistence on the instance is required.
- `window.importedModelInfo` is set in the **classic** app only; the workspace module tracks the equivalent state on the module instance as `this.importedModelConfig`. `InferenceHandler.runInference` still checks `window.importedModelInfo`, which is dead code in the workspace context but harmless.

---

## 📋 Detailed Log

### Task 1: Triage `pm2-error-0.log` ✅

User pasted the last 50 lines from production. Categorized each line by severity and tracked sources in the repo to confirm benign vs. real:

| Severity | Symptom | Source / Status |
|---|---|---|
| 🔴 Real bug | `Shape mismatch in decoder spatial dimensions: upsampled=30x30 vs skip=31x31` | U-Net forward pass — needs prevention upstream |
| 🟡 Noise | `Failed to delete file …: Error: File not found` | `WorkspaceManager.js:568` — already-deleted metadata, downgrade log level |
| 🟡 Noise | `[Annotation Conversion] Values are already in expected format` | `python/validate_tiff.py:129` — info message printed to stderr, Node tags it as `[Python Error]` |
| 🟡 Noise | `Can't initialize NVML` UserWarning | PyTorch CUDA init — driver mismatch or CPU-only |
| 🟡 Noise | `No active process found for training c2f4b79a…` | Stop request for already-finished training |

Recommended only the U-Net shape mismatch warranted code changes.

---

### Task 2: Segmentation training-side divisibility check ✅

**File:** `public/workspace/js/modules/segmentation/SegmentationModule.js`

Updated the `patchSize` rule in `_initConfigValidation()`:

```js
this.formValidationController.addFieldRule('patchSize', (value) => {
  const layersEl = document.getElementById('numLayers');
  const layers = layersEl ? parseInt(layersEl.value) : null;
  return this.paramValidator.validatePatchSize(parseInt(value), {
    overlapTilePad: 0,
    numLayers: layers
  });
});
```

Added `this.trainingConfig = config;` after the successful `/configure-training` response in `configureAndProceed()`.

**Manual verification (by user):**
- Default values (patch 64, layers 4): no error ✓
- `numLayers=6, patchSize=32`: red tint + error message + Next disabled ✓
- Reverting `numLayers` to 4: error clears, Next re-enables ✓

The problematic patch / num_layers combos now caught at config-save time:

| num_layers | divisor | Now-blocked patch sizes |
|---|---|---|
| 5 | 32 | 48 |
| 6 | 64 | 32, 48, 96 |

---

### Task 3: Inference-side pre-flight check ✅

Added `SegmentationModule._validateInferenceCompatibility()` that:
1. Reads `this.inferenceDimensions` (populated by FileHandler on upload validation).
2. Reads `num_layers` from `this.importedModelConfig` first (imported models take precedence), else from `this.trainingConfig`.
3. If both available and `min(w,h) % 2^num_layers !== 0`: disables `runInferenceBtn`, inserts an inline warning banner above the button explaining the failure, and fires an error notification.
4. If either is unknown: bails silently — preserves graceful UX when the user has a trained model from a prior session that's lost its config.

**Wired into:**
- `FileHandler.validateInferenceFile` and `loadTestInferenceData`: extract `slice_dimensions` from `validation.info.slice_dimensions`, store as `module.inferenceDimensions = {width, height}`, call validator.
- `ImportHandler` (in the model+config validation success branch): call validator so import + already-loaded inference file triggers a re-check.
- `goToStep(4)`: call validator on entry so the existing "re-enable button if a file is present" path can't override a still-incompatible state.
- `resetWorkflow`: clears all four cached fields.

**Files Changed:**
- `public/workspace/js/modules/segmentation/SegmentationModule.js` (+~60 lines for the new method, +5 lines for state persistence + reset, +1 step-4 entry call)
- `public/workspace/js/modules/segmentation/handlers/FileHandler.js` (+12 lines across two upload paths)
- `public/workspace/js/modules/segmentation/handlers/ImportHandler.js` (+1 line)

---

### Task 4: Playwright verification ✅

Wrote `/tmp/test-inference-validation.js` driving headless Chromium through login → workspace → segmentation → step 4, then probing the validator with synthetic state via `page.evaluate`. 9 cases:

| # | Case | dims | num_layers (path) | Expected | Result |
|---|---|---|---|---|---|
| 1 | Compatible | 512×512 | 4 (training) | no gate | ✓ |
| 2 | Incompatible | 248×248 | 4 (training) | gated, text mentions `2^4 layers` | ✓ |
| 3 | Production pattern | 31×31 | 2 (training) | gated, text mentions `not divisible by 4` | ✓ |
| 4 | Imported precedence (ok) | 96×96 | 5 (imported) | no gate (96%32=0) | ✓ |
| 5 | Imported precedence (bad) | 96×96 | 6 (imported) | gated, text mentions `2^6 layers` | ✓ |
| 6 | Graceful: no num_layers | 31×31 | — | no gate | ✓ |
| 7 | Graceful: no dims | — | 4 (training) | no gate | ✓ |
| 8 | Non-square (min controls, bad) | 512×248 | 4 (training) | gated, text shows `512x248` | ✓ |
| 9 | Non-square (min controls, ok) | 512×256 | 4 (training) | no gate | ✓ |

**Caveat:** The Playwright test probes the validator in isolation by mutating module state directly. It does **not** exercise the integration glue (FileHandler reading the upload response, ImportHandler hook, `goToStep(4)` re-check, `resetWorkflow` clearing). Those paths were verified by code inspection only — a manual smoke upload would close the loop.

---

## 🐛 Bugs Fixed / Issues Closed

- ✅ **U-Net decoder shape mismatch during inference** — production error from `pm2-error-0.log`, root cause: no divisibility validation on either training config or inference inputs. Now blocked pre-flight on both sides.

## ⚠️ Logging Noise Identified (Not Yet Fixed)

Not in scope for this session, but worth tracking:
- `[Annotation Conversion] Values are already in expected format` is an info message that surfaces as an ERROR — either change the Python script to print to stdout or downgrade the Node-side classification of these specific stderr lines.
- `Failed to delete file …` should be a `warn`, not an `error`, when the metadata entry was already gone.

---

## 🔮 Follow-ups

- **Run a real upload-flow smoke test:** upload an inference TIFF with min dimension not divisible by `2^4` (e.g., 248×248) and confirm the warning appears without any extra interaction. Validates the integration glue the Playwright test skipped.
- Consider downgrading the two log-noise sources above so production logs surface only real errors.
- The `window.importedModelInfo` check in `InferenceHandler.runInference` (line 28) is dead code in the workspace context — it always evaluates falsy because nothing in the workspace sets it. Removing it would let `usingImportedModel` derive from `this.module.importedModelConfig` consistently. Not urgent.

Related: see [[2026-05-29_ml_parameter_validation]] for the original validation infrastructure this session built on.
