# Migration Guide: autoStructN2V 2.5D Update

**Date**: 2026-01-03
**Version**: 2.0.0 (2.5D Support)

This document summarizes all changes made to the autoStructN2V module to support 2.5D volumetric processing. It is intended to help users migrate existing implementations to the updated version.

---

## Table of Contents

1. [Overview of Changes](#overview-of-changes)
2. [Breaking Changes](#breaking-changes)
3. [New Configuration Parameters](#new-configuration-parameters)
4. [API Changes by Module](#api-changes-by-module)
5. [Migration Guide](#migration-guide)
6. [Code Examples](#code-examples)

---

## Overview of Changes

The update adds optional 2.5D processing mode while preserving full backward compatibility with existing 2D implementations. Key additions:

| Feature | Description |
|---------|-------------|
| **2.5D Mode** | Process volumetric TIFF stacks using 3-slice triplet context |
| **Stack Input** | New `input_data` parameter for single TIFF stack files |
| **3D Masking** | 3D mask kernels and prediction kernels for volumetric data |
| **3D Autocorrelation** | FFT-based 3D autocorrelation for structural noise extraction |
| **Stack Inference** | Sliding window prediction through volumes |

**Backward Compatibility**: Existing 2D implementations will continue to work without modification. The default mode is `'2d'`.

---

## Breaking Changes

### None for 2D Mode

If you're using the pipeline in 2D mode (the default), **no changes are required**. All existing configurations and code will work as before.

### Potential Issues

1. **Custom Dataset Subclasses**: If you've subclassed `TrainingDataset`, `ValidationDataset`, or `TestDataset`, you may need to update them to handle the new `mode` and `stack`/`slice_indices` parameters.

2. **Custom Mask Functions**: If you've created custom masking functions, they won't automatically work with 2.5D mode. You'll need to create 3D variants.

3. **Direct Model Instantiation**: If you create models directly (bypassing `create_model_from_config`), you'll need to manually set the correct `in_channels`/`out_channels` for 2.5D mode.

---

## New Configuration Parameters

### Top-Level Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `mode` | str | `'2d'` | Processing mode: `'2d'` or `'2.5d'` |
| `input_data` | str | None | Path to TIFF stack file (required for 2.5D, optional for 2D) |

### Behavior Changes

| Mode | Input Parameter | Data Splitting | Model Channels |
|------|-----------------|----------------|----------------|
| `'2d'` | `input_dir` (directory) | By files | 1 → 1 |
| `'2.5d'` | `input_data` (TIFF stack) | By z-indices | 3 → 1 (or 3 → 3 for Stage 1 with Stage 2) |

---

## API Changes by Module

### 1. `autoStructN2V/models/factory.py`

#### New Function: `create_model_from_config()`

```python
# OLD: Manual model creation
from autoStructN2V.models import create_model
model = create_model(features=64, num_layers=3, stage='stage1')

# NEW: Mode-aware model creation (recommended)
from autoStructN2V.models import create_model_from_config
model = create_model_from_config(config, stage='stage1')
```

**Channel Logic**:
```python
def create_model_from_config(config, stage):
    mode = config.get('mode', '2d')
    run_stage2 = config.get('run_stage2', False)

    if mode == '2.5d':
        in_channels = 3
        if stage == 'stage1' and run_stage2:
            out_channels = 3  # For 3D autocorrelation
        else:
            out_channels = 1  # Center slice prediction
    else:
        in_channels = 1
        out_channels = 1

    return FlexibleUNet(in_channels=in_channels, out_channels=out_channels, ...)
```

---

### 2. `autoStructN2V/masking/kernels.py`

#### New Function: `create_stage1_mask_kernel_3d()`

```python
# OLD: 2D kernel only
from autoStructN2V.masking import create_stage1_mask_kernel
kernel_2d = create_stage1_mask_kernel(center_size=1)  # Shape: (3, 3)

# NEW: 3D kernel for 2.5D mode
from autoStructN2V.masking import create_stage1_mask_kernel_3d
kernel_3d = create_stage1_mask_kernel_3d(center_size=1)  # Shape: (3, 3, 3)
```

**Key Behavior**: The 3D kernel has True values in ALL 3 slices (not just center), ensuring proper mask percentage across the triplet.

---

### 3. `autoStructN2V/masking/utilities.py`

#### New Functions

```python
from autoStructN2V.masking import (
    create_full_mask_3d,      # 3D version of create_full_mask
    create_random_mask_3d     # 3D version of create_random_mask
)

# Usage
kernel_3d = create_stage1_mask_kernel_3d(center_size=1)
full_mask, prediction_kernel = create_full_mask_3d(
    kernel_3d,
    patch_size=64,
    mask_percentage=15.0,
    verbose=False
)
# full_mask shape: (3, 64, 64)
# prediction_kernel shape: (3, 64, 64)
```

**Critical Design**:
- `full_mask`: True pixels in ALL 3 slices
- `prediction_kernel`: True pixels ONLY in center slice (z=1)
- The center slice of `prediction_kernel` exactly matches the center slice of `full_mask`

---

### 4. `autoStructN2V/masking/structure.py`

#### New Methods in `StructuralNoiseExtractor`

```python
from autoStructN2V.masking import StructuralNoiseExtractor

extractor = StructuralNoiseExtractor(...)

# OLD: 2D extraction
# patches shape: (N, 1, H, W) or (N, H, W)
mask_2d, autocorr_2d = extractor.extract_mask(patches_2d, verbose=False)

# NEW: 3D extraction for 2.5D mode
# patches shape: (N, 3, H, W) - triplet patches
mask_3d, autocorr_3d = extractor.extract_mask_3d(patches_3d, verbose=False)
```

#### New Internal Function

```python
# 3D autocorrelation computation
def _calculate_3d_autocorrelation(triplet):
    """
    Compute 3D autocorrelation for a 3-slice triplet.

    Args:
        triplet: Shape (3, H, W)

    Returns:
        autocorr_3d: Shape (3, 2H-1, 2W-1) cropped to relevant region
    """
```

---

### 5. `autoStructN2V/masking/__init__.py`

#### New Exports

```python
# Added exports
from .kernels import create_stage1_mask_kernel_3d
from .utilities import create_full_mask_3d, create_random_mask_3d
```

---

### 6. `autoStructN2V/pipeline/data.py`

#### New Function: `split_stack_indices()`

```python
from autoStructN2V.pipeline.data import split_stack_indices

# Split z-indices instead of files
indices = split_stack_indices(
    num_slices=100,
    split_ratio=(0.7, 0.15, 0.15),
    seed=42,
    verbose=False
)
# Returns: {'train': [0,1,2,...], 'val': [...], 'test': [...]}
```

#### Updated Function: `create_dataloaders()`

```python
# OLD: Path-based only
train_loader, val_loader, test_loader = create_dataloaders(
    image_paths=(train_paths, val_paths, test_paths),
    config=config,
    stage="stage1"
)

# NEW: Supports both path-based and stack-based
# Option 1: Path-based (unchanged)
train_loader, val_loader, test_loader = create_dataloaders(
    image_paths=(train_paths, val_paths, test_paths),
    config=config,
    stage="stage1"
)

# Option 2: Stack-based (new)
train_loader, val_loader, test_loader = create_dataloaders(
    config=config,
    stage="stage1",
    stack=loaded_stack,           # numpy array (num_slices, H, W)
    slice_indices=split_indices   # dict with 'train', 'val', 'test' keys
)
```

---

### 7. `autoStructN2V/pipeline/runner.py`

#### Updated Function: `run_pipeline()`

```python
# OLD: Directory input only
config = {
    'input_dir': './images/',
    ...
}

# NEW: Supports both directory and stack input
# Option 1: Directory (unchanged)
config = {
    'input_dir': './images/',
    'mode': '2d',  # Optional, default is '2d'
    ...
}

# Option 2: TIFF stack
config = {
    'input_data': './stack.tif',
    'mode': '2.5d',
    ...
}
```

#### Updated Function: `create_stage2_mask()`

Now automatically handles 2D vs 2.5D mode based on config:

```python
# Internal logic change - no API change
# Automatically calls extract_mask_3d() and create_full_mask_3d() when mode='2.5d'
```

---

### 8. `autoStructN2V/inference/predictor.py`

#### Updated Class: `AutoStructN2VPredictor`

```python
# OLD: No mode parameter
predictor = AutoStructN2VPredictor(
    model=model,
    patch_size=64,
    stride=32
)

# NEW: Mode-aware predictor
predictor = AutoStructN2VPredictor(
    model=model,
    patch_size=64,
    stride=32,
    mode='2.5d'  # New parameter: '2d' or '2.5d'
)
```

#### New Method: `denoise_stack()`

```python
# Denoise entire TIFF stack
denoised = predictor.denoise_stack(
    input_path='./input_stack.tif',
    output_path='./output_stack.tif',
    dtype='float32'  # 'float32', 'uint16', or 'uint8'
)
```

#### New Internal Methods

```python
# 2D slice-by-slice processing
output = predictor._predict_2d(stack)

# 2.5D sliding window processing
output = predictor._predict_2_5d(stack)

# Single triplet prediction
center_slice = predictor._predict_triplet(triplet)
```

#### Updated Class Method: `from_checkpoint()`

```python
# Now extracts mode from checkpoint hparams if available
predictor = AutoStructN2VPredictor.from_checkpoint(
    checkpoint_path='./model.pth',
    model_class=AutoStructN2VModel,
    stage='stage2',
    mode='2.5d'  # Can also be inferred from checkpoint
)
```

---

### 9. `autoStructN2V/trainers/base.py`

#### Updated Method: `calculate_loss()`

```python
# Now handles both 2D and 3D masks properly
# Formula: sum(pixel_losses * mask) / (mask.sum() + 1e-8)
```

#### Updated Methods: `train_epoch()`, `validate_epoch()`

```python
# Now handle mask dimension expansion for both modes:
# - 2D masks: (B, H, W) → (B, 1, H, W)
# - 3D masks: (B, 3, H, W) → unchanged
```

---

### 10. `autoStructN2V/utils/image.py`

#### New Functions

```python
from autoStructN2V.utils.image import load_tiff_stack, save_tiff_stack

# Load multi-page TIFF
stack = load_tiff_stack('./stack.tif')
# Returns: numpy array (num_slices, H, W), dtype float32, normalized to [0,1]

# Save multi-page TIFF
save_tiff_stack('./output.tif', stack, dtype='float32')
# dtype options: 'float32', 'uint16', 'uint8'
```

---

### 11. `autoStructN2V/datasets/*.py`

#### Updated Classes: `TrainingDataset`, `ValidationDataset`, `TestDataset`

All dataset classes now support two input modes:

```python
# OLD: Path-based only
dataset = TrainingDataset(
    image_paths=train_paths,
    patch_size=64,
    ...
)

# NEW: Also supports stack-based
dataset = TrainingDataset(
    stack=loaded_stack,           # numpy array
    slice_indices=train_indices,  # list of z-indices
    mode='2.5d',                  # '2d' or '2.5d'
    patch_size=64,
    ...
)
```

**New Parameters**:
- `stack`: Loaded TIFF stack as numpy array
- `slice_indices`: List of z-indices for this split
- `mode`: Processing mode ('2d' or '2.5d')

---

## Migration Guide

### Scenario 1: Keep Using 2D Mode (No Changes Required)

If you're happy with 2D processing, your existing code will work without any changes:

```python
# This still works exactly as before
config = {
    'input_dir': './my_images/',
    'output_dir': './results/',
    'run_stage1': True,
    'run_stage2': True
}
results = run_pipeline(config)
```

### Scenario 2: Switch to 2.5D Mode

To process volumetric data with 2.5D mode:

```python
# Change input_dir to input_data and add mode
config = {
    'input_data': './my_stack.tif',  # Single TIFF stack
    'output_dir': './results/',
    'mode': '2.5d',                   # Enable 2.5D
    'run_stage1': True,
    'run_stage2': True
}
results = run_pipeline(config)
```

### Scenario 3: Custom Model Creation

If you create models directly:

```python
# OLD
from autoStructN2V.models import FlexibleUNet
model = FlexibleUNet(in_channels=1, out_channels=1, features=64, num_layers=3)

# NEW (recommended): Use factory function
from autoStructN2V.models import create_model_from_config
model = create_model_from_config(config, stage='stage1')

# Or manually specify channels for 2.5D
model = FlexibleUNet(
    in_channels=3,   # Triplet input
    out_channels=1,  # Center slice output
    features=64,
    num_layers=3
)
```

### Scenario 4: Custom Inference

If you use the predictor directly:

```python
# OLD
predictor = AutoStructN2VPredictor(model, patch_size=64)
denoised = predictor.denoise_image(image_path)

# NEW for 2.5D
predictor = AutoStructN2VPredictor(model, patch_size=64, mode='2.5d')
denoised = predictor.denoise_stack(stack_path, output_path)
```

### Scenario 5: Custom Masking

If you create masks manually:

```python
# OLD: 2D masks
from autoStructN2V.masking import create_stage1_mask_kernel, create_full_mask
kernel = create_stage1_mask_kernel(center_size=1)
mask, pred_kernel = create_full_mask(kernel, 64, 15.0, False)

# NEW: 3D masks for 2.5D
from autoStructN2V.masking import create_stage1_mask_kernel_3d, create_full_mask_3d
kernel = create_stage1_mask_kernel_3d(center_size=1)
mask, pred_kernel = create_full_mask_3d(kernel, 64, 15.0, False)
# mask shape: (3, 64, 64) - True in all slices
# pred_kernel shape: (3, 64, 64) - True only in center slice
```

---

## Code Examples

### Complete 2.5D Pipeline Example

```python
from autoStructN2V.pipeline import run_pipeline

config = {
    # Input: TIFF stack instead of directory
    'input_data': './microscopy_volume.tif',
    'output_dir': './results/',
    'experiment_name': 'volume_denoising',

    # Enable 2.5D mode
    'mode': '2.5d',

    # Standard pipeline settings
    'device': 'cuda',
    'run_stage1': True,
    'run_stage2': True,
    'num_epochs': 100,

    # Stage configurations (same as 2D)
    'stage1': {
        'patch_size': 64,
        'batch_size': 8,
        'mask_percentage': 15.0
    },
    'stage2': {
        'patch_size': 64,
        'batch_size': 4,
        'mask_source': 'stage1'
    }
}

results = run_pipeline(config)
print(f"Denoised stack saved to: {results['final_results_dir']}")
```

### Manual 2.5D Inference Example

```python
import torch
from autoStructN2V.models import FlexibleUNet
from autoStructN2V.inference import AutoStructN2VPredictor

# Create 2.5D model (3 input channels, 1 output channel)
model = FlexibleUNet(
    in_channels=3,
    out_channels=1,
    features=64,
    num_layers=3
)

# Load trained weights
checkpoint = torch.load('./trained_model.pth')
model.load_state_dict(checkpoint['model_state_dict'])

# Create predictor with 2.5D mode
predictor = AutoStructN2VPredictor(
    model=model,
    patch_size=64,
    stride=32,
    mode='2.5d'
)

# Denoise a TIFF stack
denoised = predictor.denoise_stack(
    input_path='./noisy_volume.tif',
    output_path='./denoised_volume.tif',
    dtype='uint16'
)

print(f"Denoised {denoised.shape[0]} slices")
```

### Custom 3D Mask Extraction Example

```python
import numpy as np
from autoStructN2V.masking import StructuralNoiseExtractor, create_full_mask_3d

# Create extractor
extractor = StructuralNoiseExtractor(
    center_size=11,
    base_percentile=50,
    max_true_pixels=25
)

# Denoised triplet patches from Stage 1 (shape: N, 3, H, W)
denoised_patches = np.random.rand(100, 3, 64, 64).astype(np.float32)

# Extract 3D structural mask
mask_kernel, autocorr = extractor.extract_mask_3d(denoised_patches, verbose=True)
print(f"Extracted mask kernel shape: {mask_kernel.shape}")  # (3, kernel_h, kernel_w)

# Create full mask for training
full_mask, prediction_kernel = create_full_mask_3d(
    mask_kernel,
    patch_size=64,
    mask_percentage=10.0,
    verbose=True
)
print(f"Full mask shape: {full_mask.shape}")  # (3, 64, 64)
print(f"Prediction kernel shape: {prediction_kernel.shape}")  # (3, 64, 64)
```

---

## Testing the Migration

After updating your implementation, run the test suite to verify everything works:

```bash
# Run all mode-related tests
pytest tests/test_modes.py -v

# Expected: 21 passed
```

Key tests to verify:
- `test_2d_model_channels`: 2D mode still works
- `test_2_5d_stage2_channels`: 2.5D channels correct
- `test_3d_mask_prediction_kernel_center_only`: 3D masking logic
- `test_predict_2_5d_boundary_handling`: Boundary slices handled
- `test_denoise_stack_2_5d_mode`: Full stack denoising

---

## Summary of Import Changes

```python
# New imports available
from autoStructN2V.masking import (
    create_stage1_mask_kernel_3d,  # NEW
    create_full_mask_3d,           # NEW
    create_random_mask_3d          # NEW
)

from autoStructN2V.models import (
    create_model_from_config       # NEW (recommended)
)

from autoStructN2V.utils.image import (
    load_tiff_stack,               # NEW
    save_tiff_stack                # NEW
)

from autoStructN2V.pipeline.data import (
    split_stack_indices            # NEW
)
```

---

## Questions or Issues

If you encounter issues during migration:

1. Ensure `mode` is set correctly in your config
2. Verify model channels match the mode (3 for 2.5D, 1 for 2D)
3. Check that mask shapes are correct (3D for 2.5D mode)
4. Run the test suite to identify specific failures

For 2D mode, no changes should be needed - if something breaks, it's likely a bug that should be reported.
