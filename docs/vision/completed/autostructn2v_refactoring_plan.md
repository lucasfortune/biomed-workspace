# Plan: Refactor autostructn2v_wrapper.py into Modular Package

**Issue**: DL Denoising Module - autostructn2v_wrapper.py is 2,708 lines and needs refactoring
**Type**: Pure refactoring (no functionality changes)
**Priority**: 4/5 | **Complexity**: 1-2/5

---

## Overview

Split `python/autostructn2v_wrapper.py` (2,708 lines) into a modular package with 8 focused files while keeping the main entry point unchanged to avoid backend modifications.

## Target Structure

```
python/
├── autostructn2v_wrapper.py          # Main entry point (slim, ~80 lines)
│
└── denoising/
    ├── __init__.py                   # Package exports
    ├── utils.py                      # ~180 lines - Utilities & progress emission
    ├── models.py                     # ~100 lines - Model wrappers
    ├── trainer.py                    # ~180 lines - WebAutoStructN2VTrainer class
    ├── data_prep.py                  # ~130 lines - TIFF extraction & input prep
    ├── training.py                   # ~600 lines - Training orchestration
    ├── output.py                     # ~290 lines - Output finalization
    ├── inference.py                  # ~410 lines - Inference pipelines
    └── operations.py                 # ~450 lines - Special operations (mask, resume, skip)
```

---

## Implementation Phases

### Phase 1: Create Package Structure & Utils Module
**Files to create**: `python/denoising/__init__.py`, `python/denoising/utils.py`

**Move to `utils.py`** (lines 55-239):
- `safe_load_checkpoint()` - secure PyTorch checkpoint loading
- `convert_to_original_dtype()` - dtype conversion
- `sanitize_config()` - config sanitization for JSON
- `emit_progress()` - stdout progress emission
- `emit_result()` - stdout result emission
- `emit_error()` - stdout error emission
- `_detect_pattern()` - mask kernel pattern analysis (from line ~1171)

**Testing**: Import utils in Python REPL, verify all functions accessible

---

### Phase 2: Model Wrappers Module
**File to create**: `python/denoising/models.py`

**Move to `models.py`** (lines 77-155):
- `CenterChannelWrapper` class - wraps 2.5D model output
- `extract_triplet_patches()` - triplet patch extraction for 3D mask

**Testing**: Import models, instantiate CenterChannelWrapper with mock model

---

### Phase 3: Custom Trainer Module
**File to create**: `python/denoising/trainer.py`

**Move to `trainer.py`** (lines 241-420):
- `WebAutoStructN2VTrainer` class (extends AutoStructN2VTrainer)
  - `__init__()` with progress callback
  - `calculate_loss()` for 2.5D shape handling
  - `train()` with progress emission
  - `_generate_denoised_patches()`

**Dependencies**: Imports from `utils.py` (emit_progress)

**Testing**: Import trainer, verify class extends AutoStructN2VTrainer

---

### Phase 4: Data Preparation Module
**File to create**: `python/denoising/data_prep.py`

**Move to `data_prep.py`** (lines 422-555):
- `extract_tiff_stack_to_directory()` - unstack TIFF to slices
- `prepare_input_directory()` - handle 2D/2.5D input modes

**Dependencies**: tifffile, imageio, pathlib

**Testing**: Call `prepare_input_directory()` with test config, verify directory creation

---

### Phase 5: Training Orchestration Module
**File to create**: `python/denoising/training.py`

**Move to `training.py`** (lines 557-1169):
- `create_progress_callback()` - progress callback factory
- `run_training()` - **main training function**
  - Stage 1 training (N2V)
  - Mask extraction
  - Stage 2 training (autoStructN2V)

**Dependencies**: Imports from trainer, data_prep, utils, models

**Testing**: This is the core training logic - will be tested via full module test

---

### Phase 6: Output Processing Module
**File to create**: `python/denoising/output.py`

**Move to `output.py`** (lines 1171-1611, excluding `_detect_pattern` moved earlier):
- `collect_denoised_slices()` - gather slices from train/val/test dirs
- `create_tiff_stack()` - combine slices into 3D TIFF
- `finalize_training_output()` - output finalization & cleanup

**Dependencies**: Imports from utils

**Testing**: `collect_denoised_slices()` with mock directory structure

---

### Phase 7: Inference Module
**File to create**: `python/denoising/inference.py`

**Move to `inference.py`** (lines 1612-2019):
- `run_inference()` - single model inference
- `run_sequential_inference()` - Stage 1 → Stage 2 inference

**Dependencies**: Imports from utils, models

**Testing**: Import and verify functions exist with correct signatures

---

### Phase 8: Special Operations Module
**File to create**: `python/denoising/operations.py`

**Move to `operations.py`** (lines 2020-2662):
- `extract_mask()` - standalone mask extraction
- `run_stage2_only()` - resume Stage 2 after mask approval
- `finalize_stage1_only()` - skip Stage 2 workflow

**Dependencies**: Imports from trainer, training, output, utils

**Testing**: Verify function signatures match expected arguments from backend

---

### Phase 9: Slim Down Main Entry Point
**File to modify**: `python/autostructn2v_wrapper.py`

**Final structure** (~80 lines):
```python
#!/usr/bin/env python3
"""autoStructN2V Web Wrapper - Main Entry Point"""
import argparse
from denoising.training import run_training
from denoising.inference import run_inference, run_sequential_inference
from denoising.operations import extract_mask, run_stage2_only, finalize_stage1_only
from denoising.utils import emit_error

def main():
    parser = argparse.ArgumentParser(...)
    # Mode routing to imported functions

if __name__ == '__main__':
    main()
```

**Testing**: Full integration test via backend call

---

## Files to Modify

| File | Action |
|------|--------|
| `python/autostructn2v_wrapper.py` | Slim down to ~80 lines, import from package |
| `python/denoising/__init__.py` | CREATE - package init with exports |
| `python/denoising/utils.py` | CREATE - utilities & progress emission |
| `python/denoising/models.py` | CREATE - model wrappers |
| `python/denoising/trainer.py` | CREATE - WebAutoStructN2VTrainer |
| `python/denoising/data_prep.py` | CREATE - TIFF extraction & input prep |
| `python/denoising/training.py` | CREATE - training orchestration |
| `python/denoising/output.py` | CREATE - output finalization |
| `python/denoising/inference.py` | CREATE - inference pipelines |
| `python/denoising/operations.py` | CREATE - special operations |

---

## Manual Testing Steps

After each phase, verify imports work:
```bash
cd /home/lucas/Documents/phd/RKI_laue/viz_app
source venv/bin/activate
python -c "from denoising.utils import emit_progress; print('OK')"
```

### Full Integration Test (after Phase 9)

1. Start the application: `npm run dev`
2. Navigate to workspace → DL Denoising module
3. Run a test training with autoStructN2V method
4. Verify:
   - Stage 1 training completes with progress updates
   - Mask extraction works
   - Stage 2 training (if applicable) completes
   - Output files are created correctly
5. Test inference with trained model
6. Test "Skip Stage 2" functionality

---

## Risk Assessment

- **Low risk**: Pure refactoring, no logic changes
- **Backend unchanged**: Entry point path remains `python/autostructn2v_wrapper.py`
- **Rollback**: Git revert if issues arise

---

## Success Criteria

- [ ] All 8 module files created in `python/denoising/`
- [ ] `autostructn2v_wrapper.py` reduced to ~80 lines
- [ ] All 6 modes work: train, inference, extract_mask, train_stage2_only, inference_sequential, finalize_stage1_only
- [ ] No backend changes required
- [ ] Progress emission still works via Socket.IO
