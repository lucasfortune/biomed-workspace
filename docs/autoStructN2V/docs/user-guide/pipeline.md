# Pipeline Guide

The `run_pipeline()` function is the main entry point for autoStructN2V. This guide explains how to use it effectively.

## Overview

The pipeline orchestrates the complete denoising workflow:

1. Configuration validation
2. Data splitting into train/val/test sets
3. Stage 1 training (optional)
4. Structural mask extraction
5. Stage 2 training (optional)
6. Inference on all images
7. Results visualization

## Basic Usage

```python
from autoStructN2V.pipeline import run_pipeline

config = {
    'input_dir': './data/',
    'output_dir': './results/',
    'experiment_name': 'my_experiment',
    'device': 'cuda',
}

results = run_pipeline(config)
```

## Configuration Dictionary

The `config` dictionary controls all aspects of the pipeline. See the [Configuration Reference](configuration.md) for complete details.

### Required Parameters

- `input_dir`: Directory containing input TIFF images

### Commonly Used Parameters

```python
config = {
    # Required
    'input_dir': './my_images/',

    # Experiment setup
    'output_dir': './results/',
    'experiment_name': 'experiment_001',
    'random_seed': 42,
    'device': 'cuda',  # or 'cpu'

    # Dataset splitting
    'split_ratio': (0.7, 0.15, 0.15),  # train/val/test
    'image_extension': '.tif',

    # Training control
    'num_epochs': 100,
    'early_stopping': True,
    'early_stopping_patience': 10,
    'verbose': True,  # Show detailed output

    # Stage control
    'run_stage1': True,
    'run_stage2': True,
}
```

## Pipeline Execution Modes

### Mode 1: Full Pipeline (Both Stages)

Train both stages sequentially for complete denoising:

```python
config = {
    'input_dir': './data/',
    'run_stage1': True,
    'run_stage2': True,

    'stage2': {
        'mask_source': 'stage1',  # Use Stage 1 output for mask
    }
}

results = run_pipeline(config)
```

**Process**:
1. Stage 1 removes random noise
2. Stage 1 outputs used to extract structural pattern
3. Stage 2 removes structured noise using the extracted pattern

### Mode 2: Stage 1 Only

Run only Stage 1 to remove random noise:

```python
config = {
    'input_dir': './data/',
    'run_stage1': True,
    'run_stage2': False,
}

results = run_pipeline(config)
```

**Output**: Saves a structural mask to `stage1_generated_kernel.npy` for potential future use.

### Mode 3: Stage 2 with Pre-saved Mask

Run Stage 2 independently using a previously saved mask:

```python
config = {
    'input_dir': './data/',
    'run_stage1': False,
    'run_stage2': True,

    'stage2': {
        'mask_source': 'file',
        'mask_file_path': './previous_experiment/stage1_generated_kernel.npy',
    }
}

results = run_pipeline(config)
```

**Use case**: Apply the same structural mask to different datasets.

### Mode 4: Stage 2 with Direct Mask Extraction

Create the structural mask directly from original noisy images:

```python
config = {
    'input_dir': './data/',
    'run_stage1': False,
    'run_stage2': True,

    'stage2': {
        'mask_source': 'extractor',  # Extract from original images
        'extractor': {
            'center_size': 15,
            'base_percentile': 50,
            'center_ratio_threshold': 0.3,
        }
    }
}

results = run_pipeline(config)
```

**Use case**: When you know your data has structured noise but want to skip Stage 1.

## Return Value

The `run_pipeline()` function returns a dictionary with results:

```python
results = {
    'experiment_dir': '/path/to/results/experiment_name/',
    'config': {/* full configuration */},
    'stages_run': ['stage1', 'stage2'],

    # If Stage 1 was run
    'stage1_model_path': '/path/to/stage1_model.pth',
    'stage1_denoised_dir': '/path/to/stage1_denoised/',
    'stage1_generated_mask_path': '/path/to/mask.npy',  # If Stage 2 not run

    # If Stage 2 was run
    'stage2_model_path': '/path/to/stage2_model.pth',
    'stage2_mask_path': '/path/to/stage2_mask.npy',

    # Final results
    'final_results_dir': '/path/to/final_results/',
}
```

## Stage Configuration

Each stage has its own configuration sub-dictionary.

### Stage 1 Configuration Example

```python
'stage1': {
    # Model architecture
    'features': 64,              # Base features in U-Net
    'num_layers': 2,             # U-Net depth
    'use_resize_conv': True,     # Prevent checkerboard artifacts
    'upsampling_mode': 'bilinear',

    # Training parameters
    'patch_size': 32,
    'batch_size': 4,
    'learning_rate': 1e-4,
    'patches_per_image': 100,

    # Masking parameters
    'mask_percentage': 15.0,     # % of pixels to mask
    'mask_center_size': 1,       # Single-pixel blind spot
    'masking_strategy': 0,       # 0: local mean, 1: zeros, 2: random

    # ROI selection
    'use_roi': True,
    'roi_threshold': 0.5,
    'scale_factor': 0.25,
    'select_background': True,   # Select background patches

    # Augmentation
    'use_augmentation': True,
}
```

### Stage 2 Configuration Example

```python
'stage2': {
    # Model architecture
    'features': 64,
    'num_layers': 2,
    'use_resize_conv': True,
    'upsampling_mode': 'bilinear',

    # Training parameters
    'patch_size': 64,            # Typically larger than Stage 1
    'batch_size': 2,             # Smaller due to larger patches
    'learning_rate': 1e-5,       # Lower than Stage 1
    'patches_per_image': 200,

    # Masking parameters
    'mask_percentage': 10.0,     # Lower than Stage 1
    'masking_strategy': 0,

    # Mask source
    'mask_source': 'stage1',     # 'stage1', 'file', or 'extractor'
    'mask_file_path': None,      # Required if mask_source='file'

    # ROI selection
    'use_roi': False,            # Usually disabled for Stage 2
    'select_background': False,  # Select structures, not background

    # Structural noise extractor (if mask_source='stage1' or 'extractor')
    'extractor': {
        'center_size': 10,
        'base_percentile': 50,
        'percentile_decay': 1.15,
        'center_ratio_threshold': 0.3,
        'use_center_proximity': True,
        'center_proximity_threshold': 0.95,
        'keep_center_component_only': True,
        'max_true_pixels': 25,
    }
}
```

## Monitoring Progress

### Console Output

With `verbose=True`, you'll see:

```
Using device: cuda

Stage execution plan:
  Stage 1: ENABLED
  Stage 2: ENABLED
  Stage 2 mask source: stage1

Splitting dataset...
  Train: 14 images (70.0%)
  Val: 3 images (15.0%)
  Test: 3 images (15.0%)

========================================
Stage 1: Standard Noise2Void Training
========================================

Creating dataloaders...
Training stage 1 model...

Epoch [1/100]: train_loss=0.0234, val_loss=0.0187, lr=0.0001
...
```

### TensorBoard

Launch TensorBoard to monitor training in real-time:

```bash
tensorboard --logdir results/experiment_name/stage1/logs
tensorboard --logdir results/experiment_name/stage2/logs
```

View:
- Loss curves (training and validation)
- Learning rate schedule
- Sample denoised images
- Model architecture graph

## Best Practices

### 1. Start with Defaults

Begin with minimal configuration and let defaults handle the rest:

```python
config = {
    'input_dir': './data/',
    'experiment_name': 'test_run',
}
results = run_pipeline(config)
```

### 2. Enable Verbose Mode During Development

```python
config = {
    'verbose': True,  # See detailed information
    # ...
}
```

### 3. Use Early Stopping

```python
config = {
    'early_stopping': True,
    'early_stopping_patience': 10,  # Stop if no improvement for 10 epochs
    # ...
}
```

### 4. Set Random Seed for Reproducibility

```python
config = {
    'random_seed': 42,  # Reproducible results
    # ...
}
```

### 5. Adjust for Your Hardware

For limited GPU memory:
```python
config = {
    'stage1': {'batch_size': 2, 'patch_size': 32},
    'stage2': {'batch_size': 1, 'patch_size': 48},
}
```

For powerful GPUs:
```python
config = {
    'stage1': {'batch_size': 16, 'patch_size': 64, 'features': 96},
    'stage2': {'batch_size': 8, 'patch_size': 128, 'features': 96},
}
```

## Common Patterns

### Experiment with Stage 1 Settings

```python
stage1_configs = [
    {'features': 32, 'num_layers': 2},
    {'features': 64, 'num_layers': 2},
    {'features': 64, 'num_layers': 3},
]

for i, stage1_cfg in enumerate(stage1_configs):
    config = {
        'input_dir': './data/',
        'experiment_name': f'stage1_test_{i}',
        'run_stage1': True,
        'run_stage2': False,
        'stage1': stage1_cfg,
    }
    results = run_pipeline(config)
```

### Reuse Best Mask Across Datasets

```python
# First dataset: Extract mask
config1 = {
    'input_dir': './dataset1/',
    'experiment_name': 'dataset1',
}
results1 = run_pipeline(config1)
mask_path = results1['stage2_mask_path']

# Second dataset: Use same mask
config2 = {
    'input_dir': './dataset2/',
    'experiment_name': 'dataset2',
    'run_stage1': False,
    'run_stage2': True,
    'stage2': {
        'mask_source': 'file',
        'mask_file_path': mask_path,
    }
}
results2 = run_pipeline(config2)
```

## Error Handling

The pipeline validates configuration and provides clear error messages:

```python
# Missing required parameter
config = {}
results = run_pipeline(config)  # ValueError: input_dir must be specified

# Invalid mask source
config = {
    'run_stage1': False,
    'run_stage2': True,
    'stage2': {'mask_source': 'stage1'},  # Invalid: Stage 1 not running
}
results = run_pipeline(config)  # ValueError: mask_source cannot be 'stage1'...

# Missing mask file
config = {
    'stage2': {
        'mask_source': 'file',
        'mask_file_path': None,  # Missing
    }
}
results = run_pipeline(config)  # ValueError: mask_file_path must be provided
```

## See Also

- [Configuration Reference](configuration.md) - Complete parameter documentation
- [Training Guide](training.md) - Training best practices
- [Two-Stage Approach](../concepts/two-stage-approach.md) - Understanding the stages
- [API Reference: Pipeline Module](../api-reference/pipeline.md) - Technical API details

---

**Next**: [Configuration Reference](configuration.md) for complete parameter documentation.
