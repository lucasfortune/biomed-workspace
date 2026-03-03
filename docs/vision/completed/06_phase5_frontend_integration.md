# Phase 5: Frontend Training Integration + Inference

**Status:** Implemented — testing in progress
**Prerequisites:** Phases 1-4 complete
**Estimated Complexity:** Large

---

## Objective

Wire the direction-aware 2.5D training backend (Phases 3+4) into the segmentation module's frontend UI: auto-detect direction volumes, training configuration controls, dual-loss chart display, and inference result handling. Also enable standalone 2.5D mode (multi-slice context without direction head) as a separate option.

---

## Design Decisions (diverging from original roadmap)

1. **No third file selector** for direction volume. Instead, auto-detect from workspace metadata when annotation is selected.
2. **"Use filament annotations" checkbox** appears when a direction volume is found (default: checked). This auto-sets the mode to 2.5D.
3. **2D/2.5D toggle** is always visible (right-aligned in the "Train from Scratch" header, matching the DL Denoising module layout). When a direction volume is in use, the toggle is greyed out and locked to 2.5D.
4. **Input Slices options**: 3, 5, 7 (not 1 — selecting 1 would contradict the 2.5D toggle).
5. **Direction overlay visualization** (RGB colormap in Image Viewer) is **deferred to a later phase**.
6. **config.json** now includes a `mode` field (`"2d"`, `"2.5d"`, or `"direction_aware"`) and all mode-specific parameters, serving as a complete record of the training configuration.
7. **"Use Pretrained Model"** import flow displays mode info from config.json in the validation summary.

---

## Implementation Steps

### Backend Changes

#### Step 1: Update context_slices validation (`src/app.js`)

Change `[1, 3, 5]` → `[3, 5, 7]` in `validateTrainingConfig`.

#### Step 2: Store direction sub-losses in training history (`src/helpers/pythonRunner.js`)

Store `train_seg_loss`, `train_dir_loss`, `val_seg_loss`, `val_dir_loss` in `training.history` entries when present in progress metrics.

#### Step 3: Pass context_slices independently (`src/helpers/pythonRunner.js`, `src/routes/ml.routes.js`)

Add `--context_slices` arg to Python spawn call. Include `context_slices` in `trainingParams` from config.

### Python Changes

#### Step 4: Support 2.5D without direction volume (`python/train_model.py`)

- Add `--context_slices` CLI argument
- New mode detection: `mode_25d = direction_aware OR (context_slices > 1)`
- New branch for 2.5D-without-direction: `Imagedataset25D(direction_volume=None)`, `UNet25D(has_direction_head=False)`, standard CE loss
- Modify `Imagedataset25D.__getitem__` to return 2-tuple when `self.direction is None`
- Checkpoint `model_type: 'standard_25d'` for this mode

#### Step 5: Inference for 2.5D without direction (`python/run_inference.py`)

- Handle `model_type == 'standard_25d'` in `load_model()` → UNet25D without direction head
- Use `run_inference_25d` for both `direction_aware` and `standard_25d`, skip direction output for the latter

### Frontend Changes

#### Step 6: Step 1 HTML — Filament checkbox and mode toggle (`Templates.js`)

- Add `directionAwareSection` (hidden) with checkbox below annotation FileSelector
- Add `modeToggleSection` with 2D/2.5D slider toggle (same pattern as DL Denoising module)

#### Step 7: Step 2 HTML — Direction-aware config section (`Templates.js`)

- Add `directionConfigGroup` (hidden): Input Slices (3/5/7), Alpha (0-10), Lambda Dir (0-5)
- Add `contextSlicesOnlyGroup` (hidden): Input Slices only, for 2.5D without direction

#### Step 8: Step 3 HTML — Direction metric cards (`Templates.js`)

4 additional metric cards (hidden): Train Seg Loss, Train Dir Loss, Val Seg Loss, Val Dir Loss

#### Step 9: Direction volume auto-detection (`FileHandler.js`)

- On annotation selection, query workspace files for `f.parentId === annotationId && f.tags.includes('direction_volume')`
- If found: show checkbox, auto-set 2.5D, hide toggle
- If not: hide checkbox, show toggle
- Handle checkbox change and mode toggle events

#### Step 10: Module state and config (`SegmentationModule.js`)

- New state: `selectedMode`, `directionVolumePath`, `useFilamentAnnotations`, `isDirectionAwareTraining`
- `configureAndProceed()`: Include direction params when applicable, or just `context_slices` for 2.5D-only
- Step 2 navigation: Show/hide appropriate config groups
- `resetWorkflow()`: Clear all direction state

#### Step 11: Dual-loss chart lines (`ChartHandler.js`)

- `enableDirectionDatasets()`: Dynamically add 4 dashed/lighter datasets to Loss chart
- `updateCharts()`: Auto-detect direction metrics, push to extra datasets
- `clearCharts()`: Remove extra datasets on reset

#### Step 12: Direction metric display (`TrainingHandler.js`)

Update 4 additional metric cards in `updateTrainingProgress()`.

#### Step 13: Inference direction output (`InferenceHandler.js`)

Show info message when `direction_output_path` exists in inference result.

#### Step 14: CSS (`segmentation-modern.css`)

Mode toggle slider, filament annotation row, direction metric card styling.

#### Step 15: State persistence (`StateHandler.js`)

Persist/restore direction-aware state and chart data for session resume.

---

## File Summary

| File | Action | Scope |
|------|--------|-------|
| `src/app.js` | Modify | Trivial |
| `src/helpers/pythonRunner.js` | Modify | Minor |
| `src/routes/ml.routes.js` | Modify | Minor |
| `python/train_model.py` | Modify | Moderate |
| `python/run_inference.py` | Modify | Minor |
| `Templates.js` | Modify | Major |
| `FileHandler.js` | Modify | Major |
| `SegmentationModule.js` | Modify | Moderate |
| `ChartHandler.js` | Modify | Moderate |
| `TrainingHandler.js` | Modify | Minor |
| `InferenceHandler.js` | Modify | Minor |
| `segmentation-modern.css` | Modify | Minor |
| `StateHandler.js` | Modify | Minor |

---

## UI Behavior Summary

### When annotation has a direction volume:
```
Select annotation → checkbox "Use filament annotations" appears (checked)
                  → mode auto-set to 2.5D, toggle greyed out (locked to 2.5D)
                  → Step 2 shows alpha/lambda/context_slices config
                  → Training uses UNet25D with direction head + combined loss
                  → Chart shows 6 lines (2 total + 4 sub-losses)
```

### When annotation has no direction volume:
```
Select annotation → no checkbox
                  → 2D/2.5D toggle enabled and interactive
                  → If 2D: standard training (existing behavior)
                  → If 2.5D: Step 2 shows only context_slices
                  → Training uses UNet25D without direction head + standard CE
```

### When user unchecks "Use filament annotations":
```
Uncheck → mode toggle re-enabled (defaults to 2D)
        → direction volume path cleared
        → Step 2 config adjusts accordingly
```

---

## Deferred: Direction Overlay Visualization

Not included in Phase 5. Future implementation will add:
- RGB colormap overlay in Image Viewer: `(|dx|, |dy|, |dz|) → (R, G, B)` per standard DTI convention
- X-oriented filaments = red, Y = green, Z = blue
- Slider-controlled overlay opacity

---

## Verification Checklist

- [x] Backward compat: annotation without direction volume → standard 2D workflow unchanged
- [x] 2.5D without direction: multi-slice context training works, `model_type: 'standard_25d'`
- [x] Import pretrained model: mode info shown in validation summary
- [ ] Auto-detection: annotation with direction volume → checkbox + auto 2.5D *(requires direction volume — to test)*
- [ ] Opt-out: uncheck filament annotations → mode toggle re-enabled *(requires direction volume — to test)*
- [ ] Direction-aware training: combined loss, dual chart lines, direction metric cards *(requires direction volume — to test)*
- [ ] Inference with direction model: produces direction volume output + info message *(requires direction volume — to test)*
- [ ] Chart resume: direction datasets restored from training history *(requires direction volume — to test)*
- [ ] `context_slices=7`: accepted by backend and Python *(not yet tested)*
- [ ] Import pretrained 2.5D model: inference runs correctly *(not yet tested)*

### Additional observations from testing

- 2D segmentation: works as before, no regressions observed
- 2.5D segmentation (no direction volume): trains and produces results; however, the result and config.json do not yet prominently indicate that 2.5D mode was used (config.json now includes `mode` field as of latest changes)

---

## Post-Plan Changes

The following changes were made after the initial implementation based on testing feedback:

1. **Mode toggle repositioned** from inside the workflow body (below file selectors) to the "Train from Scratch" workflow header (right-aligned), matching the DL Denoising module layout.
2. **`config.mode` field added** to the training config object (`"2d"`, `"2.5d"`, or `"direction_aware"`), persisted to `config.json` along with all mode-specific parameters.
3. **Import flow updated** — `ImportHandler` now shows mode info (mode, input slices, alpha, lambda) in the validation summary when importing a pretrained model.
4. **`window.importedModelInfo` bug fixed** — the workspace import flow never set this global, causing `InferenceHandler.runInference()` to reject imported models. Fixed to use `this.module.hasImportedModel` and set the global for NavigationHandler compatibility.

---

**Navigation:**
← [Phase 3+4: Direction-Aware 2.5D U-Net](completed/06_phase3_4_25d_dual_head_unet.md) | [Session Index](../sessions/INDEX.md) →

