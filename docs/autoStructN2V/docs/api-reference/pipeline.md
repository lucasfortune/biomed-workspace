# Pipeline API Reference

Technical reference for the `pipeline` module.

## Module: `pipeline.runner`

### `run_pipeline(config)`

Main entry point for the autoStructN2V pipeline.

**Parameters:**
- `config` (dict): Configuration dictionary

**Returns:**
- dict: Results summary with keys:
  - `experiment_dir`: Path to experiment directory
  - `config`: Complete configuration
  - `stages_run`: List of stages executed
  - `stage1_model_path`: Path to Stage 1 model (if run)
  - `stage1_denoised_dir`: Path to Stage 1 outputs (if run)
  - `stage2_model_path`: Path to Stage 2 model (if run)
  - `stage2_mask_path`: Path to Stage 2 mask (if run)
  - `final_results_dir`: Path to final denoised images

**Raises:**
- `ValueError`: Invalid configuration
- `FileNotFoundError`: Input directory not found
- `RuntimeError`: Training or inference failures

**Example:**
```python
from autoStructN2V.pipeline import run_pipeline

config = {
    'input_dir': './data/',
    'experiment_name': 'my_exp',
}
results = run_pipeline(config)
```

---

### `create_stage2_mask(config, image_paths, denoised_patches, verbose)`

Create structured mask for Stage 2.

**Parameters:**
- `config` (dict): Configuration
- `image_paths` (tuple, optional): (train, val, test) paths
- `denoised_patches` (np.ndarray, optional): Stage 1 patches
- `verbose` (bool): Print details

**Returns:**
- tuple: (full_mask, prediction_kernel)
  - full_mask: Boolean array (patch_size, patch_size)
  - prediction_kernel: Boolean array (patch_size, patch_size)

**Example:**
```python
full_mask, pred_kernel = create_stage2_mask(
    config, image_paths=paths, verbose=True
)
```

---

### `load_mask_from_file(mask_file_path, verbose)`

Load masking kernel from .npy file.

**Parameters:**
- `mask_file_path` (str): Path to .npy file
- `verbose` (bool): Print loading details

**Returns:**
- np.ndarray: Boolean mask array

**Raises:**
- `FileNotFoundError`: File doesn't exist
- `ValueError`: Invalid mask format

---

### `denoise_directory(model, input_dir, output_dir, config, stage)`

Apply trained model to directory.

**Parameters:**
- `model` (nn.Module): Trained model
- `input_dir` (str): Input directory
- `output_dir` (str): Output directory
- `config` (dict): Configuration
- `stage` (str): 'stage1' or 'stage2'

**Returns:**
- list: Paths to denoised images

---

## Module: `pipeline.config`

### `validate_config(config)`

Validate and complete configuration.

**Parameters:**
- `config` (dict): User configuration

**Returns:**
- dict: Validated configuration with defaults

**Raises:**
- `ValueError`: Invalid configuration

**Validation Checks:**
- Required fields present
- Stage execution flags valid
- Mask source configuration correct
- Numeric parameters in valid ranges
- Paths exist (for file-based masks)

---

### `create_output_directories(config)`

Create output directory structure.

**Parameters:**
- `config` (dict): Validated configuration

**Returns:**
- dict: Dictionary of directory paths

**Created Structure:**
```
output_dir/experiment_name/
├── data/
│   ├── train/
│   ├── val/
│   └── test/
├── stage1/ (if enabled)
│   ├── model/
│   ├── logs/
│   └── results/
├── stage2/ (if enabled)
│   ├── model/
│   ├── logs/
│   └── results/
└── final_results/
```

---

## Module: `pipeline.data`

### `split_dataset(input_dir, output_dirs, split_ratio, image_extension, seed, verbose)`

Split images into train/val/test sets.

**Parameters:**
- `input_dir` (str): Input directory
- `output_dirs` (dict): Output directory structure
- `split_ratio` (tuple): (train, val, test) ratios
- `image_extension` (str): Image file extension
- `seed` (int): Random seed
- `verbose` (bool): Print split details

**Returns:**
- tuple: (train_paths, val_paths, test_paths)

**Example:**
```python
paths = split_dataset(
    './data/',
    dirs,
    (0.7, 0.15, 0.15),
    '.tif',
    42,
    verbose=True
)
```

---

### `create_dataloaders(image_paths, config, stage, stage1_denoised_dir, structured_mask, prediction_kernel, verbose)`

Create PyTorch DataLoaders.

**Parameters:**
- `image_paths` (tuple): (train, val, test) paths
- `config` (dict): Configuration
- `stage` (str): 'stage1' or 'stage2'
- `stage1_denoised_dir` (str, optional): Stage 1 output dir
- `structured_mask` (np.ndarray, optional): Structured mask
- `prediction_kernel` (np.ndarray, optional): Prediction kernel
- `verbose` (bool): Print loader details

**Returns:**
- tuple: (train_loader, val_loader, test_loader)

**Example:**
```python
train_loader, val_loader, test_loader = create_dataloaders(
    paths, config, 'stage1', verbose=True
)
```

---

## See Also

- [Pipeline Guide](../user-guide/pipeline.md) - Usage guide
- [Configuration Reference](../user-guide/configuration.md) - All parameters
- [Architecture](../concepts/architecture.md) - System design
