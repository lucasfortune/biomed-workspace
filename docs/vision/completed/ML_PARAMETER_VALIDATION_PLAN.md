# ML Parameter Validation — Implementation Plan

## Context

After file upload in the Segmentation and DL Denoising modules, TIFF image dimensions are known but not used to constrain training parameters. Invalid values (e.g., `patch_size` larger than image) only fail at Python runtime, wasting the user's time. This plan adds real-time frontend validation that highlights invalid fields, shows error messages, and disables progression until parameters are valid.

## Constraints Validated

| Constraint | Applies To | Formula |
|---|---|---|
| Patch size vs image | Both modules | `patch_size <= min(width, height)` |
| Extract size divisibility | DL Denoising only | `(patch_size + 2 * overlap_tile_pad) % 2^num_layers == 0` |
| Numeric ranges | Both modules | Each field's min/max (from HTML attributes) |

## Architecture

Two new shared utilities + CSS additions + integration into each module:

```
core/utils/ParameterValidator.js   — Pure validation logic, no DOM
core/utils/FormValidationController.js — DOM binding: error spans, option disabling, event delegation
core/css/module-base.css           — .has-error, .field-error styles
```

The validator is instantiated with image dimensions (from file validation) and provides validation functions. The controller attaches to a form container, listens for changes via event delegation, and updates the DOM accordingly.

---

## Phase 1: Shared Validation Utilities + CSS

### 1a. `core/utils/ParameterValidator.js` (NEW)

Pure validation class:
- `setImageDimensions(width, height)` — stores min dimension
- `validatePatchSize(value, { overlapTilePad, numLayers })` — checks `<= minDim` and optionally the extract-size divisibility constraint
- `validateRange(value, min, max, fieldName)` — generic range check
- `getMaxPatchSize()` — returns `min(width, height)` or null if no dimensions
- `checkExtractSize(patchSize, overlapTilePad, numLayers)` — N2V-specific: `(ps + 2*pad) % 2^layers == 0`

### 1b. `core/utils/FormValidationController.js` (NEW)

DOM controller class:
- `constructor(validator, { onValidationChange })` — takes validator + callback
- `attachTo(containerEl)` — delegates `change`/`input` events on container
- `detach()` — cleanup
- `addFieldRule(fieldId, ruleFn)` — registers validation rule for a field
- `validateField(fieldId)` — runs rule, toggles `.has-error` on `.form-field` parent, shows/hides `.field-error` span
- `validateAll()` — runs all registered rules, calls `onValidationChange(allValid, errorCount)`
- `updateSelectOptions(selectId, maxValue)` — disables `<option>`s exceeding maxValue, appends "(exceeds image)" suffix
- `clearAll()` — remove all error states
- `destroy()` — detach + clearAll

Error display approach: each `.form-field` gets a `<span class="field-error" data-field="fieldId"></span>` injected after the input/select. The controller creates these lazily on first error.

### 1c. CSS additions in `core/css/module-base.css` (MODIFY)

Add after the existing `.form-field` rules (~line 633):

```css
.form-field.has-error input,
.form-field.has-error select {
  border-color: var(--danger-color);
  box-shadow: 0 0 0 2px rgba(220, 53, 69, 0.15);
}

.form-field .field-error {
  display: none;
  font-size: var(--module-font-size-xs);
  color: var(--module-error-text);
  margin-top: 2px;
  line-height: 1.3;
}

.form-field.has-error .field-error {
  display: block;
}

.form-field select option:disabled {
  color: var(--module-text-muted, #999);
}
```

---

## Phase 2: Segmentation Module Integration

### Files Modified
- `modules/segmentation/handlers/FileHandler.js` — store image dimensions after validation
- `modules/segmentation/SegmentationModule.js` — initialize validator on step 2, gate step2Next

### 2a. Store dimensions in FileHandler

In `displayValidationResults(validation)`, after success check, extract and store:
```javascript
if (validation?.info?.slice_dimensions) {
  const [h, w] = validation.info.slice_dimensions;
  this.module.imageDimensions = { width: w, height: h };
}
```

The Python validation returns `info.slice_dimensions = [height, width]` as an array.

### 2b. Initialize validation on step 2

In `SegmentationModule.js`, when navigating to step 2 (`goToStep(2)` or step setup):

1. Import `ParameterValidator` and `FormValidationController`
2. Create validator with stored `imageDimensions`
3. Create controller attached to `.config-form` container
4. Register rules for:
   - `patchSize`: `<= min(width, height)`, also update select options to disable oversized values
   - `patchesPerImage`: range 1–100
   - `numLayers`: range 2–6
   - `numEpochs`: range 10–500
5. `onValidationChange` callback: enable/disable `step2Next` button
6. Run initial `validateAll()` to catch defaults that exceed dimensions

### 2c. Gate step2Next

Currently `step2Next` is always enabled. Add logic:
- On validation change: `step2Next.disabled = !allValid`
- In `configureAndProceed()`: add guard check as extra safety

### 2d. Cleanup

In `deactivate()`, call `controller.destroy()` to avoid memory leaks.

---

## Phase 3: DL Denoising Module Integration

### Files Modified
- `modules/denoising-dl/handlers/ConfigHandler.js` — add validation to config forms
- `modules/denoising-dl/handlers/NavigationHandler.js` — gate step progression on validity

### 3a. Initialize validation in ConfigHandler

After `renderConfigColumns()` completes (and after preset application):

1. Import `ParameterValidator` and `FormValidationController`
2. Create validator with `this.module.validationResult.info.dimensions` (already stored as `{width, height}`)
3. For each rendered stage (`stage1`, optionally `stage2`):
   - Create controller attached to stage container (`#stage1ConfigContent`, `#stage2ConfigContent`)
   - Register rules for:
     - `patch_size`: `<= min(width, height)` AND extract-size check with `overlap_tile_pad` (from config, default 16 from preset or 4 fallback) and `num_layers` (from form)
     - `patches_per_image`: 50–500
     - `batch_size`: (no extra constraint beyond options)
     - `mask_percentage`: 0.5–30 (stage1) / 5–30 (stage2)
     - `epochs`: 10–500
     - `early_stopping_patience`: 5–50
   - Update patch_size select options to disable invalid values
4. `onValidationChange` callback: store `configValid` flag on module

### 3b. Cross-field dependencies

When `num_layers` changes → re-validate `patch_size` (extract-size divisor changes).
When `patch_size` changes → just validate it (constraint is self-contained).

The controller's `validateAll()` re-runs all rules, so any field change triggers full re-validation. This is cheap for ~10 fields.

### 3c. Re-validation on preset change

`ConfigHandler` completely replaces form HTML on preset change. After re-render, re-initialize controllers and re-run validation. Add an `initValidation()` method called at the end of `renderConfigColumns()`.

### 3d. Gate step navigation

In `NavigationHandler.nextStep()` when leaving step 2 (line 242-244), add check:
```javascript
if (this.module.currentStep === 2) {
  if (!this.module.configValid) {
    this.module.state.notify('error', 'Please fix invalid parameters before continuing');
    return;
  }
  this.module.saveConfig();
  this.module.configSaved = true;
}
```

### 3e. Cleanup

In `DLDenoisingModule.deactivate()`, destroy controllers.

---

## Phase 4: Verification

### Manual Testing Checklist
1. **Segmentation module:**
   - Upload training data with known dimensions (e.g., 128x128)
   - Navigate to step 2 → verify patch_size options > 128 are disabled
   - Select an oversized patch_size → verify field is highlighted red with error message
   - Verify step2Next is disabled when error exists
   - Fix parameter → verify error clears, step2Next re-enables
   - Complete training flow → verify nothing is broken

2. **DL Denoising module (N2V):**
   - Upload data with known dimensions
   - Navigate to step 2 → verify patch_size options constrained
   - Change num_layers → verify patch_size re-validates (extract-size constraint)
   - Apply different preset → verify validation re-runs
   - Verify Next button gated on validity

3. **DL Denoising module (autoStructN2V):**
   - Verify both stage1 and stage2 columns are independently validated
   - Stage 2 has different patch_size options → verify both constrained

4. **Edge cases:**
   - Very small image (64x64) → most patch sizes disabled
   - Large image (1024x1024) → all options valid
   - Dark mode → error styling visible
   - Light mode → error styling visible

### Automated
- Start dev server: `npm run dev`
- Test in browser with various TIFF dimensions
- Check browser console for JS errors

---

## File Change Summary

| File | Action | Lines |
|---|---|---|
| `public/workspace/js/core/utils/ParameterValidator.js` | CREATE | ~80 |
| `public/workspace/js/core/utils/FormValidationController.js` | CREATE | ~120 |
| `public/workspace/js/core/css/module-base.css` | MODIFY | +20 |
| `public/workspace/js/modules/segmentation/handlers/FileHandler.js` | MODIFY | +5 |
| `public/workspace/js/modules/segmentation/SegmentationModule.js` | MODIFY | +40 |
| `public/workspace/js/modules/denoising-dl/handlers/ConfigHandler.js` | MODIFY | +50 |
| `public/workspace/js/modules/denoising-dl/handlers/NavigationHandler.js` | MODIFY | +5 |
| `public/workspace/js/modules/denoising-dl/DLDenoisingModule.js` | MODIFY | +5 |
