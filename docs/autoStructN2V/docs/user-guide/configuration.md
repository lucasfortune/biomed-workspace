# Configuration Reference

Complete reference for all configuration parameters in autoStructN2V.

## Configuration Structure

The configuration is a nested dictionary with the following top-level structure:

```python
config = {
    # General parameters
    'experiment_name': '...',
    'input_dir': '...',
    # ...

    # Stage 1 parameters
    'stage1': {
        'features': 64,
        # ...
    },

    # Stage 2 parameters
    'stage2': {
        'features': 64,
        'extractor': {
            # Extractor parameters
        }
    }
}
```

## General Parameters

### Experiment Setup

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `experiment_name` | str | `'autoStructN2V_experiment'` | Name for the experiment directory |
| `output_dir` | str | `'./results'` | Base directory for all outputs |
| `input_dir` | str | **Required** | Directory containing input images |
| `random_seed` | int | `42` | Random seed for reproducibility |
| `image_extension` | str | `'.tif'` | File extension for input images |

### Device and Execution

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `device` | str | `'cuda'` | Device for training ('cuda' or 'cpu') |
| `verbose` | bool | `False` | Print detailed information and visualizations |

### Dataset Splitting

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `split_ratio` | tuple | `(0.7, 0.15, 0.15)` | Train/validation/test split ratios (must sum to 1.0) |

### Training Control

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `num_epochs` | int | `100` | Maximum number of training epochs |
| `early_stopping` | bool | `True` | Enable early stopping |
| `early_stopping_patience` | int | `10` | Epochs without improvement before stopping |

### Stage Execution Control

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `run_stage1` | bool | `True` | Execute Stage 1 training |
| `run_stage2` | bool | `True` | Execute Stage 2 training |

**Note**: At least one of `run_stage1` or `run_stage2` must be `True`.

## Stage 1 Parameters

All Stage 1 parameters are nested under the `'stage1'` key.

### Model Architecture

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| `features` | int | `64` | 16-128 | Base number of features in U-Net |
| `num_layers` | int | `2` | 2-4 | Number of down/upsampling layers in U-Net |
| `use_resize_conv` | bool | `True` | - | Use resize convolution (reduces artifacts) |
| `upsampling_mode` | str | `'bilinear'` | 'bilinear', 'nearest', 'bicubic' | Upsampling interpolation mode |

### Training Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| `patch_size` | int | `32` | 32-128 | Size of image patches |
| `batch_size` | int | `4` | 1-64 | Training batch size |
| `learning_rate` | float | `1e-4` | 1e-5 to 1e-3 | Learning rate for optimizer |
| `patches_per_image` | int | `100` | 50-500 | Number of patches extracted per image |

### Masking Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| `mask_percentage` | float | `15.0` | 10.0-30.0 | Percentage of pixels to mask |
| `mask_center_size` | int | `1` | 1-3 | Size of mask center (blind spot) |
| `masking_strategy` | int | `0` | 0, 1, 2 | Strategy for masked values: 0=local mean, 1=zeros, 2=random |

### ROI Selection

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| `use_roi` | bool | `True` | - | Enable ROI-based patch selection |
| `roi_threshold` | float | `0.5` | 0.3-0.7 | Intensity threshold for ROI detection |
| `scale_factor` | float | `0.25` | 0.1-0.5 | Scale factor for ROI preprocessing |
| `select_background` | bool | `True` | - | Select background (True) vs structures (False) |

### Data Augmentation

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `use_augmentation` | bool | `True` | Enable data augmentation (flips, rotations) |

### Example Stage 1 Configuration

```python
'stage1': {
    # Architecture
    'features': 64,
    'num_layers': 3,
    'use_resize_conv': True,
    'upsampling_mode': 'bilinear',

    # Training
    'patch_size': 64,
    'batch_size': 8,
    'learning_rate': 2e-4,
    'patches_per_image': 150,

    # Masking
    'mask_percentage': 15.0,
    'mask_center_size': 1,
    'masking_strategy': 0,

    # ROI
    'use_roi': True,
    'roi_threshold': 0.5,
    'scale_factor': 0.25,
    'select_background': True,

    # Augmentation
    'use_augmentation': True,
}
```

## Stage 2 Parameters

All Stage 2 parameters are nested under the `'stage2'` key.

### Model Architecture

Same as Stage 1 architecture parameters.

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| `features` | int | `64` | 16-128 | Base number of features in U-Net |
| `num_layers` | int | `2` | 2-5 | Number of down/upsampling layers |
| `use_resize_conv` | bool | `True` | - | Use resize convolution |
| `upsampling_mode` | str | `'bilinear'` | 'bilinear', 'nearest', 'bicubic' | Upsampling mode |

### Training Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| `patch_size` | int | `64` | 64-256 | Size of image patches (typically larger than Stage 1) |
| `batch_size` | int | `2` | 1-32 | Training batch size |
| `learning_rate` | float | `1e-5` | 1e-6 to 1e-4 | Learning rate (typically lower than Stage 1) |
| `patches_per_image` | int | `200` | 100-1000 | Number of patches per image |

### Masking Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| `mask_percentage` | float | `10.0` | 5.0-20.0 | Percentage of pixels to mask (typically lower than Stage 1) |
| `masking_strategy` | int | `0` | 0, 1, 2 | Masking strategy: 0=local mean, 1=zeros, 2=random |

### Mask Source Configuration

| Parameter | Type | Default | Options | Description |
|-----------|------|---------|---------|-------------|
| `mask_source` | str | `'stage1'` | 'stage1', 'file', 'extractor' | Source for creating structural mask |
| `mask_file_path` | str | `None` | - | Path to .npy mask file (required if mask_source='file') |

**Mask Source Options:**

- `'stage1'`: Use denoised patches from Stage 1 to create mask (default for full pipeline)
- `'file'`: Load pre-saved mask from .npy file (for independent Stage 2 execution)
- `'extractor'`: Create mask directly from original noisy images

**Validation Rules:**
- If `run_stage1=False` and `mask_source='stage1'`: Error (Stage 1 must run first)
- If `mask_source='file'` and `mask_file_path=None`: Error (file path required)
- Mask file must exist and be a .npy file

### ROI Selection

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `use_roi` | bool | `False` | Enable ROI selection (usually disabled for Stage 2) |
| `roi_threshold` | float | `0.5` | Intensity threshold |
| `scale_factor` | float | `0.25` | Scale factor |
| `select_background` | bool | `False` | Select structures (False) instead of background |

### Data Augmentation

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `use_augmentation` | bool | `True` | Enable data augmentation |

## Structural Noise Extractor Parameters

Nested under `stage2 → extractor`. These control how structural patterns are extracted.

### Autocorrelation Processing

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `norm_autocorr` | bool | `True` | Normalize autocorrelation by zero-lag value |
| `log_autocorr` | bool | `True` | Apply log transform to autocorrelation |
| `crop_autocorr` | bool | `True` | Crop autocorrelation to center region |
| `adapt_autocorr` | bool | `True` | Use adaptive thresholding |
| `adapt_CB` | float | `50.0` | Base coefficient for adaptive threshold (5.0-100.0) |
| `adapt_DF` | float | `0.95` | Distance factor for adaptive threshold (0.8-0.99) |

### Ring Analysis Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| `center_size` | int | `10` | 7-25 | Size of center square to analyze |
| `base_percentile` | float | `50` | 30-70 | Base percentile for thresholding |
| `percentile_decay` | float | `1.15` | 1.0-1.3 | Threshold decay factor per ring |
| `center_ratio_threshold` | float | `0.3` | 0.1-0.5 | Minimum ratio of ring max to center value |

### Selection Criteria

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| `use_center_proximity` | bool | `True` | - | Use proximity-based selection criterion |
| `center_proximity_threshold` | float | `0.95` | 0.5-0.99 | Threshold for center proximity measure |

### Post-Processing

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| `keep_center_component_only` | bool | `True` | - | Keep only connected component containing center |
| `max_true_pixels` | int | `25` | 10-30 | Maximum number of True pixels in final mask |

### Example Stage 2 Configuration

```python
'stage2': {
    # Architecture
    'features': 64,
    'num_layers': 3,
    'use_resize_conv': True,
    'upsampling_mode': 'bilinear',

    # Training
    'patch_size': 96,
    'batch_size': 4,
    'learning_rate': 5e-6,
    'patches_per_image': 250,

    # Masking
    'mask_percentage': 8.0,
    'masking_strategy': 0,

    # Mask source
    'mask_source': 'stage1',

    # ROI (usually disabled)
    'use_roi': False,
    'select_background': False,

    # Extractor configuration
    'extractor': {
        'norm_autocorr': True,
        'log_autocorr': True,
        'crop_autocorr': True,
        'adapt_autocorr': True,
        'adapt_CB': 50.0,
        'adapt_DF': 0.95,
        'center_size': 12,
        'base_percentile': 55,
        'percentile_decay': 1.2,
        'center_ratio_threshold': 0.25,
        'use_center_proximity': True,
        'center_proximity_threshold': 0.9,
        'keep_center_component_only': True,
        'max_true_pixels': 20,
    }
}
```

## Parameter Guidelines

### Patch Size Selection

**Stage 1**: Smaller patches (32-64)
- Faster training
- More patches per image
- Good for general noise removal

**Stage 2**: Larger patches (64-128)
- Captures larger structural patterns
- Better context for structured noise
- Requires more memory

**Rule**: Patch size must be divisible by 2^num_layers

### Batch Size Selection

Depends on available GPU memory:

| GPU Memory | Stage 1 Batch | Stage 2 Batch |
|------------|---------------|---------------|
| 4 GB | 2-4 | 1-2 |
| 8 GB | 4-8 | 2-4 |
| 12+ GB | 8-16 | 4-8 |

### Features and Layers

**More features/layers**: Better capacity, slower training, more memory
**Fewer features/layers**: Faster, less memory, may underfit

| Image Complexity | Features | Layers |
|------------------|----------|--------|
| Simple (low noise) | 32-48 | 2 |
| Moderate | 64 | 2-3 |
| Complex (high noise) | 64-96 | 3-4 |

### Learning Rate

**Stage 1**: Higher (1e-4 to 2e-4)
- Fresh training
- More aggressive learning

**Stage 2**: Lower (1e-5 to 5e-5)
- Fine-tuning structured patterns
- More careful optimization

### Mask Percentage

**Stage 1**: Higher (15-20%)
- More training signal
- Faster convergence

**Stage 2**: Lower (8-12%)
- Structural patterns are sparse
- Avoid over-masking

## Complete Example Configurations

### High-Quality Configuration (Slow, Best Results)

```python
config = {
    'input_dir': './data/',
    'experiment_name': 'high_quality',
    'device': 'cuda',
    'num_epochs': 200,
    'early_stopping_patience': 20,
    'verbose': True,

    'stage1': {
        'features': 96,
        'num_layers': 3,
        'patch_size': 64,
        'batch_size': 8,
        'learning_rate': 2e-4,
        'patches_per_image': 200,
        'mask_percentage': 18.0,
    },

    'stage2': {
        'features': 96,
        'num_layers': 4,
        'patch_size': 128,
        'batch_size': 4,
        'learning_rate': 5e-6,
        'patches_per_image': 300,
        'mask_percentage': 8.0,
        'extractor': {
            'center_size': 15,
            'base_percentile': 60,
            'max_true_pixels': 30,
        }
    }
}
```

### Fast Configuration (Quick Experiments)

```python
config = {
    'input_dir': './data/',
    'experiment_name': 'fast_test',
    'device': 'cuda',
    'num_epochs': 50,
    'verbose': False,

    'stage1': {
        'features': 48,
        'num_layers': 2,
        'patch_size': 32,
        'batch_size': 16,
        'learning_rate': 2e-4,
        'patches_per_image': 50,
    },

    'stage2': {
        'features': 48,
        'num_layers': 2,
        'patch_size': 64,
        'batch_size': 8,
        'learning_rate': 1e-5,
        'patches_per_image': 100,
    }
}
```

### Memory-Efficient Configuration (Limited GPU)

```python
config = {
    'input_dir': './data/',
    'experiment_name': 'low_memory',
    'device': 'cuda',

    'stage1': {
        'features': 32,
        'num_layers': 2,
        'patch_size': 32,
        'batch_size': 2,
        'learning_rate': 1e-4,
        'patches_per_image': 75,
    },

    'stage2': {
        'features': 32,
        'num_layers': 2,
        'patch_size': 48,
        'batch_size': 1,
        'learning_rate': 1e-5,
        'patches_per_image': 150,
    }
}
```

## Configuration Validation

The pipeline automatically validates configuration and provides helpful error messages:

```python
# Example validation errors:

# Error: Missing required field
config = {}
# ValueError: input_dir must be specified in the configuration

# Error: Invalid split ratio
config = {'split_ratio': (0.5, 0.3, 0.3)}  # Sums to 1.1
# ValueError: split_ratio must sum to 1.0

# Error: Invalid upsampling mode
config = {'stage1': {'upsampling_mode': 'cubic'}}
# ValueError: Invalid upsampling_mode 'cubic'. Must be one of: ['bilinear', 'nearest', 'bicubic']

# Error: Incompatible stage configuration
config = {'run_stage1': False, 'run_stage2': True, 'stage2': {'mask_source': 'stage1'}}
# ValueError: mask_source cannot be 'stage1' when run_stage1 is False
```

## See Also

- [Pipeline Guide](pipeline.md) - Using the pipeline with these configurations
- [Training Guide](training.md) - Training tips and best practices
- [Structural Mask Extraction](../concepts/structural-mask-extraction.md) - Understanding extractor parameters
- [API Reference: Config Module](../api-reference/pipeline.md#configuration) - Technical details

---

**Next**: [Training Guide](training.md) for training best practices.
