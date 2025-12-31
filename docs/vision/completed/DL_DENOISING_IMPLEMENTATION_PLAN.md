# Deep Learning Denoising Module - Implementation Plan

## Overview

Implement the Deep Learning Denoising Module using the autoStructN2V library for self-supervised image denoising. The module supports both N2V (Stage 1 only) and autoStructN2V (Stage 1 + Mask Extraction + Stage 2) methods.

**Key Concepts (Self-Supervised Denoising):**
- The images uploaded ARE the images that will be denoised (training = denoising)
- No ground truth required - the network learns from the noisy data itself
- Step 3 ("Run Denoising") produces the final denoised output
- Step 4 ("Process Additional Images") is **OPTIONAL** - only for processing more images from the same recording

**Key References:**
- Product Spec: `docs/vision/spec_files/DL_DENOISING_MODULE_PRODUCT_SPEC.md`
- autoStructN2V Codebase: `docs/autoStructN2V/codebase/`
- Existing Filter Module: `public/workspace/js/modules/denoising-filter/FilterDenoisingModule.js`

**User Requirements:**
- Installation: Editable install (`pip install -e docs/autoStructN2V/codebase/`)
- Scope: Full spec (N2V + autoStructN2V)
- GPU: CPU fallback with warning
- Mask UI: Full visualization with parameter adjustment
- **Simplified Output:** Only keep essential files (TIFF stacks + models + config)

---

## Phase 0: Environment Setup

**Objective:** Install autoStructN2V and verify GPU/CPU availability.

### To-Do List

- [ ] Install autoStructN2V in editable mode
  ```bash
  pip install -e docs/autoStructN2V/codebase/
  ```
- [ ] Verify import works: `python -c "from autoStructN2V.pipeline import run_pipeline; print('OK')"`
- [ ] Create GPU detection utility: `python/utils/gpu_check.py`
  - Detect CUDA availability
  - Return JSON with device info, memory, and warnings for CPU-only
- [ ] Verify test data exists or create: `test_data/trypB_testData_denoising.tif`
- [ ] Add note to `requirements.txt` about autoStructN2V editable install

### Files to Create/Modify

| File | Action |
|------|--------|
| `python/utils/__init__.py` | Create (empty) |
| `python/utils/gpu_check.py` | Create |
| `requirements.txt` | Modify (add comment) |

### Manual Testing

```bash
# Test installation
python -c "from autoStructN2V.pipeline import run_pipeline; print('Import OK')"

# Test GPU detection
python python/utils/gpu_check.py
# Expected: JSON with device info
```

---

## Phase 1: Module Foundation & Registry

**Objective:** Create module skeleton, register in workspace, implement Step 1 (Data Selection + Method Choice) with mode selection.

### To-Do List

- [ ] Create module directory structure:
  ```
  public/workspace/js/modules/denoising-dl/
  ├── DLDenoisingModule.js
  ├── DLDenoisingAPI.js
  ├── components/
  └── css/dl-denoising.css
  ```
- [ ] Update `registry.js`: Change `denoising-dl` status to `'available'`
- [ ] Implement `DLDenoisingModule.js`:
  - Extend BaseModule with 4-step config using new step names:
    - Step 1: "Select Images" (canNavigate: true)
    - Step 2: "Configure" (canNavigate when validated)
    - Step 3: "Run Denoising" (canNavigate when configured)
    - Step 4: "Additional (Optional)" (canNavigate when complete, optional: true)
  - Add **Mode Selection UI** at module entry:
    - Mode A: "Train & Denoise" (default) - full workflow
    - Mode B: "Import Existing Model" - skip to Step 4
  - Render Step 1 with FileSelector and Method Selector
  - Method selector: N2V vs autoStructN2V radio buttons with descriptions
  - Add info box: "The images you select here will be denoised during the process"
- [ ] Create `DLDenoisingAPI.js` with stub methods
- [ ] Create `dl-denoising.css` importing module-base.css
- [ ] Wire up test data loading via existing `/api/denoising/test-data`

### Files to Create

| File | Description |
|------|-------------|
| `public/workspace/js/modules/denoising-dl/DLDenoisingModule.js` | Main module class |
| `public/workspace/js/modules/denoising-dl/DLDenoisingAPI.js` | API client |
| `public/workspace/js/modules/denoising-dl/css/dl-denoising.css` | Module styles |

### Files to Modify

| File | Change |
|------|--------|
| `public/workspace/js/modules/registry.js` | Update denoising-dl status and path |

### Manual Testing

1. Navigate to `/workspace`
2. Click Denoising card → "Deep Learning" button
3. Verify module loads without console errors
4. Verify Step 1 shows:
   - File selector with test data option
   - Method selector (N2V / autoStructN2V)
   - "Next: Configure" button (disabled)
5. Select test data + method → verify "Next" enables

---

## Phase 2: Backend Routes & Validation

**Objective:** Implement backend endpoints for file validation, GPU check, and presets.

### To-Do List

- [ ] Extend `src/routes/denoising.routes.js` with DL endpoints:
  - `POST /api/denoising/dl/validate` - Validate TIFF for DL
  - `GET /api/denoising/dl/gpu-check` - Check GPU availability
  - `GET /api/denoising/dl/presets` - Get configuration presets
- [ ] Create `python/validate_dl_tiff.py`:
  - Validate dimensions, bit depth, minimum slices (10+)
  - Return JSON with validation result and image info
- [ ] Create `config/denoising_presets.json`:
  - Fast, Balanced, High Quality presets
  - Stage 1 and Stage 2 parameters
  - Mask extractor defaults
- [ ] Wire up Step 1 validation flow in frontend
- [ ] Display GPU status in UI (warning if CPU-only)

### Files to Create

| File | Description |
|------|-------------|
| `python/validate_dl_tiff.py` | TIFF validation for DL denoising |
| `config/denoising_presets.json` | Configuration presets |

### Files to Modify

| File | Change |
|------|--------|
| `src/routes/denoising.routes.js` | Add DL validation endpoints |
| `DLDenoisingAPI.js` | Implement validation methods |
| `DLDenoisingModule.js` | Wire up validation flow |

### Manual Testing

1. Upload a valid TIFF file
2. Verify validation results display (dimensions, slices, bit depth)
3. Upload an invalid file (PNG) → verify error message
4. Check GPU detection shows in UI
5. Verify presets endpoint returns JSON

---

## Phase 3: Configuration Step

**Objective:** Implement Step 2 with N2V single-column and autoStructN2V dual-column configurations.

### To-Do List

- [ ] Create `components/DualColumnConfig.js`:
  - Two-column responsive grid for Stage 1 / Stage 2
  - "Copy Stage 1 to Stage 2" button
- [ ] Create `components/CollapsibleSection.js`:
  - Expand/collapse with animation
  - Status badge (Complete/In Progress/Pending)
- [ ] Implement Step 2 UI:
  - N2V mode: Single column (Stage 1 only)
  - autoStructN2V mode: Dual column (Stage 1 + Stage 2)
  - Preset dropdown (Fast/Balanced/High Quality)
  - Advanced Options sections (collapsed)
  - Mask Extractor config (collapsed, autoStructN2V only)
- [ ] Implement parameter validation (numeric ranges)
- [ ] Save config to module state on "Next"

### Parameter Groups

**Stage 1 & 2 Common:**
- Patch Size (32, 48, 64, 96, 128)
- Patches per Image (50-500)
- Batch Size (1, 2, 4, 8, 16, 32)
- Mask Percentage (5-30%)
- Features (32, 48, 64, 96, 128)
- Layers (2, 3, 4, 5)
- Learning Rate (1e-6 to 1e-3)
- Epochs (10-500)
- Early Stopping (toggle + patience)

**Mask Extractor (autoStructN2V):**
- Adaptive Thresholding (toggle)
- Base Percentile (30-70)
- Percentile Decay (1.0-1.3)
- Max Masked Pixels (10-40)

### Files to Create

| File | Description |
|------|-------------|
| `components/DualColumnConfig.js` | Dual-column layout |
| `components/CollapsibleSection.js` | Collapsible sections |

### Files to Modify

| File | Change |
|------|--------|
| `DLDenoisingModule.js` | Add Step 2 render and logic |
| `dl-denoising.css` | Add dual-column, collapsible styles |

### Manual Testing

1. Navigate to Step 2 with N2V selected → verify single column
2. Go back, select autoStructN2V → verify dual column
3. Load "Fast" preset → verify parameters update
4. Modify parameters → verify validation highlights errors
5. Navigate back to Step 1, forward to Step 2 → verify config persists

---

## Phase 4: Training Backend & N2V Flow

**Objective:** Implement Python wrapper, training endpoints, Socket.IO, and N2V training with output cleanup.

### To-Do List

- [ ] Create `python/autostructn2v_wrapper.py`:
  - Modes: `train`, `inference`, `extract_mask`, `regenerate_mask`
  - Progress emission: `DENOISING_PROGRESS:{json}`
  - Result emission: `DENOISING_RESULT:{json}`
  - Error emission: `DENOISING_ERROR:{json}`
  - GPU/CPU auto-detection with fallback
  - **Output cleanup and stack creation** (see Phase 4.5 for details)
- [ ] Create `src/services/DenoisingService.js`:
  - Training session management
  - Progress parsing from Python stdout
  - Socket.IO emission to rooms
- [ ] Create `src/sockets/denoising.socket.js`:
  - Room: `denoising-${trainingId}`
  - Events: `denoising-stage1-progress`, `denoising-stage1-complete`, etc.
- [ ] Add training endpoints to `denoising.routes.js`:
  - `POST /api/denoising/dl/start-training`
  - `GET /api/denoising/dl/training-status/:trainingId`
- [ ] Register socket handlers in `src/sockets/index.js`
- [ ] Inject DenoisingService in `src/app.js`

### Python Wrapper Key Functions

```python
def run_training(config: dict)  # Main training entry
def emit_progress(stage, data)  # DENOISING_PROGRESS:{json}
def emit_result(stage, data)    # DENOISING_RESULT:{json}
def emit_error(stage, message)  # DENOISING_ERROR:{json}
```

### Files to Create

| File | Description |
|------|-------------|
| `python/autostructn2v_wrapper.py` | Web integration wrapper |
| `src/services/DenoisingService.js` | Training orchestration |
| `src/sockets/denoising.socket.js` | Socket.IO handlers |

### Files to Modify

| File | Change |
|------|--------|
| `src/routes/denoising.routes.js` | Add training endpoints |
| `src/sockets/index.js` | Register denoising handlers |
| `src/app.js` | Inject DenoisingService |

### Manual Testing

1. Configure N2V training, click "Start Denoising"
2. Verify training starts (check server logs)
3. Verify Socket.IO connection established
4. Verify model saved to `models/<sessionId>/denoising/DL_<trainingId>/`
5. Test with CPU (if no GPU) → verify warning shown, training proceeds

---

## Phase 4.5: Output Cleanup & Stack Creation

**Objective:** Simplify autoStructN2V output by keeping only essential files and combining slices into TIFF stacks.

### To-Do List

- [ ] Add `finalize_training_output()` function to `autostructn2v_wrapper.py`:
  - Collect all denoised slice TIFFs from train/val/test directories
  - Sort slices by original slice number (slice_0000, slice_0001, ...)
  - Combine into single TIFF stack using tifffile
  - Copy model file(s) to correct location
  - Copy config.json to models directory
  - Delete all intermediate files and directories
  - Emit progress during cleanup

- [ ] Add stack creation helper function:
  ```python
  def create_tiff_stack(slice_dirs: list, output_path: str) -> int:
      """Combine individual slice TIFFs into ordered stack."""
      # Collect all slice files from train/val/test
      # Sort by slice number (extract from filename)
      # Stack and save as single TIFF
      # Return slice count
  ```

- [ ] Update `run_training()` to call cleanup after completion:
  - For N2V-only: Cleanup after Stage 1 completes
  - For autoStructN2V: Wait until Stage 2 completes before cleanup

- [ ] Output file naming:
  - N2V: `n2v_denoised_<trainingId>.tif`
  - autoStructN2V Stage 1: `asn2v_stage1_denoised_<trainingId>.tif`
  - autoStructN2V Stage 2: `asn2v_stage2_denoised_<trainingId>.tif`

### Files to Modify

| File | Change |
|------|--------|
| `python/autostructn2v_wrapper.py` | Add cleanup and stack creation functions |

### Manual Testing

1. Run N2V training → verify single TIFF stack created in `results/denoising/DL_<trainingId>/`
2. Run autoStructN2V training → verify two TIFF stacks (stage1, stage2) created
3. Verify models saved to `models/denoising/DL_<trainingId>/` with correct names
4. Verify intermediate files are deleted (no nested directories, no TensorBoard logs)
5. Open output TIFF stack → verify slice order matches original input

---

## Phase 5: Denoising UI, Charts & Results Display

**Objective:** Implement Step 3 denoising UI with progress, loss charts, results display, and state management.

### To-Do List

- [ ] Create `components/TrainingProgress.js`:
  - Overall progress bar
  - Stage status indicators (N2V: 1 stage, autoStructN2V: 3 stages)
  - Current epoch/loss display
  - Time elapsed/remaining estimation
- [ ] Create `components/LossChart.js`:
  - Chart.js wrapper for loss curves
  - Train/Val loss lines
  - Real-time updates during training
- [ ] Implement Socket.IO client in module:
  - Join training room on start
  - Handle `denoising-stage1-progress` events
  - Handle `denoising-stage1-complete` event
- [ ] Implement training state persistence:
  - Save training ID to StateManager
  - Rejoin room on page refresh
  - Show "Denoising in Progress" if resuming
- [ ] Denoising UI states:
  - Ready → Show "Start Denoising" button
  - Denoising → Show progress, hide button
  - Complete → Show "Denoising Complete" results section

- [ ] **Create "Denoising Complete" results section:**
  - Display denoised TIFF stack info (filename, slice count, file size)
  - Download button for TIFF stack (single file)
  - "View in Image Viewer" button
  - Info box: "Your denoising is complete! Step 4 is OPTIONAL"
  - "Process Additional Images (Optional)" button linking to Step 4
  - For autoStructN2V: Show both Stage 1 and Stage 2 stacks with "Recommended" label on Stage 2

### Files to Create

| File | Description |
|------|-------------|
| `components/TrainingProgress.js` | Progress display |
| `components/LossChart.js` | Chart.js wrapper |

### Files to Modify

| File | Change |
|------|--------|
| `DLDenoisingModule.js` | Add Step 3, Socket.IO integration |
| `dl-denoising.css` | Progress and chart styles |

### Manual Testing

1. Start N2V training
2. Verify progress bar updates
3. Verify loss chart updates in real-time
4. Verify epoch counter increments
5. Verify "Next: Inference" enables on completion
6. **Refresh page during training** → verify resume works

---

## Phase 6: Mask Visualization & autoStructN2V

**Objective:** Implement full autoStructN2V flow with mask extraction, visualization, and Stage 2.

### To-Do List

- [ ] Create `components/MaskVisualization.js`:
  - Render mask kernel as pixel grid (11x11 or similar)
  - Color: active pixels (dark purple), inactive (light gray)
  - Display kernel size, active pixel count, pattern type
- [ ] Create `components/MaskParameterPanel.js`:
  - Sliders for Base Percentile, Percentile Decay, Max Pixels
  - Toggle for Adaptive Thresholding
  - "Regenerate Mask" button with loading state
- [ ] Create `python/extract_mask_preview.py`:
  - Run StructuralNoiseExtractor on Stage 1 output
  - Return mask as base64 PNG + metadata JSON
- [ ] Add mask endpoints:
  - `POST /api/denoising/dl/extract-mask`
  - `POST /api/denoising/dl/regenerate-mask`
- [ ] Implement empty mask detection:
  - If mask has <2 active pixels or only center pixel
  - Show warning: "Low structural noise detected"
  - Options: "Use N2V Results (Skip Stage 2)" or "Adjust Parameters"
- [ ] Implement Stage 2 training flow:
  - After mask approved, start Stage 2
  - Progress updates via Socket.IO
  - Completion enables inference step
- [ ] Training UI for autoStructN2V (3 collapsible sections):
  - Stage 1: Collapsible, shows final stats
  - Interim Results: Mask visualization + parameter panel
  - Stage 2: Collapsible, shows progress

### Files to Create

| File | Description |
|------|-------------|
| `components/MaskVisualization.js` | Mask kernel display |
| `components/MaskParameterPanel.js` | Mask parameter controls |
| `python/extract_mask_preview.py` | Mask extraction utility |

### Files to Modify

| File | Change |
|------|--------|
| `python/autostructn2v_wrapper.py` | Add mask extraction mode |
| `src/routes/denoising.routes.js` | Add mask endpoints |
| `DLDenoisingModule.js` | Add mask UI, Stage 2 flow |
| `dl-denoising.css` | Mask visualization styles |

### Manual Testing

1. Select autoStructN2V, complete Stage 1
2. Verify mask extraction runs automatically
3. Verify mask visualization renders correctly
4. Adjust mask parameters → click "Regenerate" → verify new mask
5. Verify Stage 2 starts after mask approval
6. Verify Stage 2 completion enables "Next"
7. **Test empty mask**: Use data with minimal structured noise → verify warning appears

---

## Phase 7: Additional Processing, Model Import & Polish

**Objective:** Implement Step 4 (Optional), model import mode, error handling, and final polish.

> **Note:** Step 4 is OPTIONAL. Denoised output from Step 3 is the primary result.
> Step 4 is only needed for processing additional images from the same recording.

### To-Do List

- [ ] Add inference endpoints:
  - `POST /api/denoising/dl/process-additional`
  - Progress via Socket.IO: `denoising-inference-progress`
- [ ] Add inference support to `autostructn2v_wrapper.py`:
  - Load trained model (Stage 1 or Stage 2 based on method)
  - Process TIFF slice by slice with progress
  - Save denoised output to `additional/` subdirectory
- [ ] Implement Step 4 UI (Optional):
  - Prominent "OPTIONAL" notice at top
  - Explanation: "Your denoised images are already available from Step 3"
  - File selector for additional images
  - Compatibility check with warnings for different source files
  - Processing progress bar
  - Completion: Download + "View in Image Viewer" + "Process More Images"

- [ ] **Implement Model Import Mode:**
  - Add "Import Model" mode selection in Phase 1 Mode Selection UI
  - Create model upload UI (.pth + config.json)
  - Validate uploaded model files:
    - Parse config.json for architecture info
    - Check .pth file is valid PyTorch weights
    - Extract original dimensions for compatibility checks
  - Show compatibility warnings
  - Skip directly to Step 4 when model imported
  - Add endpoint: `POST /api/denoising/dl/import-model`

- [ ] Error handling:
  - Training errors (GPU OOM → suggest reduce batch size)
  - Validation errors (clear messages)
  - Network errors (retry option)
- [ ] State persistence:
  - Save full module state to StateManager
  - Enable resume after page refresh
- [ ] Lineage tracking:
  - Include input file IDs in requests
  - Create lineage for denoised output
- [ ] UI polish:
  - Loading states for all async operations
  - Disabled states during processing
  - Tooltips for parameters
  - Responsive design fixes
  - Step 4 indicator shows "(Optional)" suffix
- [ ] Integration with ImageViewer:
  - Set `modules.denoising.viewerFile` state
  - Navigate to ImageViewer on "View Results"

### Files to Modify

| File | Change |
|------|--------|
| `python/autostructn2v_wrapper.py` | Add inference mode |
| `src/routes/denoising.routes.js` | Add inference endpoints |
| `DLDenoisingModule.js` | Add Step 4, error handling, polish |
| `dl-denoising.css` | Final polish |

### Manual Testing

1. **Full N2V workflow** (without Step 4): Data → Config → Denoise → Download results
2. **Full autoStructN2V workflow** (without Step 4): Data → Config → Denoise (Stage 1) → Mask → Denoise (Stage 2) → Download results
3. **N2V with additional processing**: Complete Step 3 → Go to Step 4 → Upload additional images → Process → Download
4. **Model Import workflow**: Select "Import Model" mode → Upload .pth + config.json → Go to Step 4 → Process images
5. Test Step 4 compatibility check with mismatched dimensions
6. Test error scenarios:
   - Invalid file upload
   - Mismatched dimensions for inference
   - Training failure simulation (if possible)
6. Test page refresh during training → verify resume
7. Verify lineage appears in file browser "See Info"
8. Test on CPU-only system → verify warning + completion

---

## Files Summary

### New Files (19 total)

| File | Phase |
|------|-------|
| `python/utils/__init__.py` | 0 |
| `python/utils/gpu_check.py` | 0 |
| `python/validate_dl_tiff.py` | 2 |
| `python/autostructn2v_wrapper.py` | 4, 4.5 |
| `python/extract_mask_preview.py` | 6 |
| `config/denoising_presets.json` | 2 |
| `src/services/DenoisingService.js` | 4 |
| `src/sockets/denoising.socket.js` | 4 |
| `public/workspace/js/modules/denoising-dl/DLDenoisingModule.js` | 1 |
| `public/workspace/js/modules/denoising-dl/DLDenoisingAPI.js` | 1 |
| `public/workspace/js/modules/denoising-dl/css/dl-denoising.css` | 1 |
| `public/workspace/js/modules/denoising-dl/components/DualColumnConfig.js` | 3 |
| `public/workspace/js/modules/denoising-dl/components/CollapsibleSection.js` | 3 |
| `public/workspace/js/modules/denoising-dl/components/TrainingProgress.js` | 5 |
| `public/workspace/js/modules/denoising-dl/components/LossChart.js` | 5 |
| `public/workspace/js/modules/denoising-dl/components/ResultsDisplay.js` | 5 |
| `public/workspace/js/modules/denoising-dl/components/MaskVisualization.js` | 6 |
| `public/workspace/js/modules/denoising-dl/components/MaskParameterPanel.js` | 6 |
| `public/workspace/js/modules/denoising-dl/components/ModelImportPanel.js` | 7 |

### Modified Files (5 total)

| File | Phases |
|------|--------|
| `requirements.txt` | 0 |
| `public/workspace/js/modules/registry.js` | 1 |
| `src/routes/denoising.routes.js` | 2, 4, 6, 7 |
| `src/sockets/index.js` | 4 |
| `src/app.js` | 4 |

---

## Critical Files to Read Before Implementation

1. `docs/autoStructN2V/codebase/autoStructN2V/pipeline/runner.py` - Core pipeline logic
2. `docs/autoStructN2V/codebase/autoStructN2V/masking/structure.py` - Mask extraction
3. `public/workspace/js/modules/denoising-filter/FilterDenoisingModule.js` - Pattern reference
4. `docs/vision/spec_files/DL_DENOISING_MODULE_PRODUCT_SPEC.md` - Full specification

---

## Notes

- Each phase has a "Manual Testing" section - complete these before proceeding
- Phase 0 must be completed first (autoStructN2V installation)
- Phases 1-3 can be done without GPU
- Phases 4-7 require training tests (GPU recommended, CPU works with patience)
