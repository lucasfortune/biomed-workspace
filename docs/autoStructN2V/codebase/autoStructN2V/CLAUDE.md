# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

autoStructN2V is a two-stage deep learning pipeline for microscopy image denoising that combines standard and structured Noise2Void approaches. The project uses PyTorch and implements a flexible U-Net architecture with specialized masking strategies.

**Key Concept**: Stage 1 removes background noise using standard Noise2Void, while Stage 2 targets structured noise patterns (like camera artifacts, scan lines) using a learned structural mask. The pipeline can run stages independently or sequentially.

## Development Commands

### Installation
```bash
# Install dependencies
pip install -r requirements.txt

# Install package in development mode
pip install -e .
```

### Running the Pipeline
```python
# Full pipeline example
from autoStructN2V.pipeline import run_pipeline

config = {
    'input_dir': './my_noisy_images/',
    'output_dir': './results/',
    'experiment_name': 'my_experiment',
    'device': 'cuda',
    'run_stage1': True,
    'run_stage2': True
}

results = run_pipeline(config)
```

### TensorBoard Monitoring
```bash
# View training logs
tensorboard --logdir results/[experiment_name]/stage1/logs
tensorboard --logdir results/[experiment_name]/stage2/logs
```

## Architecture Overview

### Core Pipeline Flow

1. **Data Splitting** (`pipeline/data.py`): Images are split into train/val/test sets and copied to the experiment directory
2. **Stage 1 Training** (optional): Standard Noise2Void with random pixel masking
3. **Mask Extraction** (if Stage 2 enabled): Extract structural noise patterns using autocorrelation analysis
4. **Stage 2 Training** (optional): Structured Noise2Void with learned spatial masking pattern
5. **Inference**: Apply trained model(s) to denoise full images using patch-based processing

### Key Components

**Pipeline (`pipeline/`):**
- `runner.py`: Orchestrates the entire pipeline, handles stage execution, model training, and inference
- `config.py`: Configuration validation with extensive defaults and stage control logic
- `data.py`: Dataset splitting and DataLoader creation with masking support

**Models (`models/`):**
- `unet.py`: Flexible U-Net with **resize convolution** to prevent checkerboard artifacts (instead of transposed convolution)
- `factory.py`: Model creation with stage-specific initialization
- `auto_struct_n2v.py`: Model wrapper with noise prediction logic

**Datasets (`datasets/`):**
- `base.py`: Base dataset with patch extraction and ROI selection
- `training.py`: Training dataset with random pixel masking (Stage 1) or structured masking (Stage 2)
- `validation.py`: Validation dataset with consistent masking
- `testing.py`: Test dataset for evaluation

**Masking (`masking/`):**
- `structure.py`: **StructuralNoiseExtractor** - extracts structured noise patterns via autocorrelation analysis
- `kernels.py`: Mask creation utilities for training
- `utilities.py`: Helper functions for mask manipulation

**Trainers (`trainers/`):**
- `auto_struct_n2v.py`: Main trainer with TensorBoard logging, early stopping, and stage-specific logic
- `base.py`: Base trainer interface
- `callbacks.py`: EarlyStopping callback

**Inference (`inference/`):**
- `predictor.py`: Patch-based inference for full images with overlap handling
- `visualization.py`: Denoising visualization utilities

### Stage Execution Modes

The pipeline supports three execution modes:

1. **Full Pipeline**: `run_stage1=True, run_stage2=True, stage2.mask_source='stage1'`
   - Stage 1 denoises patches, Stage 2 learns structured mask from those patches

2. **Stage 2 with Pre-saved Mask**: `run_stage1=False, run_stage2=True, stage2.mask_source='file'`
   - Load existing mask from `.npy` file, train only Stage 2
   - Requires `stage2.mask_file_path` to be set

3. **Stage 2 with Direct Extraction**: `run_stage1=False, run_stage2=True, stage2.mask_source='extractor'`
   - Extract mask directly from original noisy images using StructuralNoiseExtractor
   - Stage 2 trains on original images with this mask

**Important**: When `run_stage1=False` and `run_stage2=True`, Stage 2 ALWAYS trains on and denoises the original noisy images (not Stage 1 output), regardless of mask source.

### Mask Creation Pipeline

Understanding mask creation is critical:

1. **Single Kernel Extraction**: `StructuralNoiseExtractor.extract_mask()` analyzes image patches via autocorrelation to find a single structural pattern (e.g., 7x7 or 11x11 boolean array)

2. **Full Mask Creation**: `create_full_mask()` takes the single kernel and tiles it across the full patch size, enforcing the `mask_percentage` by adding random pixels

3. **Training Application**: The full mask is used during training to determine which pixels to mask and predict

**Key Files**: `masking/structure.py` (extraction), `masking/kernels.py` (full mask creation)

### Checkerboard Artifact Prevention

The U-Net uses **resize convolution** by default instead of transposed convolution to avoid checkerboard artifacts:
- `use_resize_conv=True` (default): Upsample via interpolation, then convolve
- `upsampling_mode='bilinear'` (default): Can be 'bilinear', 'nearest', or 'bicubic'
- Set `use_resize_conv=False` to use classical transposed convolution (not recommended)

**Configuration**: Set in `stage1.use_resize_conv`, `stage1.upsampling_mode` (and same for stage2)

## Configuration System

Configuration is a nested dictionary passed to `run_pipeline()`. The system supports:

### General Parameters
- `input_dir`, `output_dir`, `experiment_name`: File paths and naming
- `device`: 'cuda' or 'cpu'
- `run_stage1`, `run_stage2`: Boolean flags for stage execution
- `verbose`: Enable detailed visualization and logging
- `num_epochs`, `early_stopping`, `early_stopping_patience`: Training control

### Stage-Specific Parameters
Each stage has its own sub-dictionary (`stage1`, `stage2`) containing:
- Model architecture: `features`, `num_layers`, `use_resize_conv`, `upsampling_mode`
- Training: `patch_size`, `batch_size`, `learning_rate`, `patches_per_image`
- Masking: `mask_percentage`, `mask_center_size`, `masking_strategy`
- Data selection: `use_roi`, `roi_threshold`, `select_background`, `use_augmentation`

### Stage 2 Mask Configuration
- `mask_source`: 'stage1' | 'file' | 'extractor'
- `mask_file_path`: Path to `.npy` file (when mask_source='file')
- `extractor`: Nested dict with StructuralNoiseExtractor parameters (autocorrelation, thresholds, etc.)

**See README.md for complete parameter documentation.**

## Important Implementation Details

### Dataset Pipeline
- **Patch Extraction**: Images are randomly cropped into patches during training
- **ROI Selection**: Optional background/foreground selection based on intensity
- **Augmentation**: Random flips and rotations applied if enabled
- **Masking Strategy**:
  - Stage 1: Random pixels masked (default 15%)
  - Stage 2: Structured pattern mask (default 10%)
  - Strategies: 0=local mean, 1=zeros, 2=random values

### Training Process
- Loss: MSE between predicted and actual values at masked pixels
- Optimizer: Adam with ReduceLROnPlateau scheduler
- Early Stopping: Monitors validation loss with configurable patience
- Logging: TensorBoard logs include loss curves, learning rate, and sample predictions

### Inference Process
- Patch-based: Large images processed in overlapping patches
- Overlap Handling: Average predictions in overlapping regions
- Full Pipeline: `AutoStructN2VPredictor.process_directory()` handles batching automatically

### Output Structure
```
results/
└── [experiment_name]/
    ├── config.json                    # Saved configuration
    ├── data/                          # Split dataset (copies of originals)
    │   ├── train/
    │   ├── val/
    │   ├── test/
    │   └── stage1_denoised/           # Stage 1 outputs (if run)
    ├── stage1/                        # Stage 1 artifacts
    │   ├── model/stage1_model.pth
    │   └── logs/                      # TensorBoard logs
    ├── stage2/                        # Stage 2 artifacts
    │   ├── model/
    │   │   ├── stage2_model.pth
    │   │   └── stage2_mask.npy        # Full mask used in training
    │   └── logs/
    ├── final_results/                 # Final denoised images
    │   ├── train/
    │   ├── val/
    │   └── test/
    └── stage1_generated_kernel.npy    # Single kernel (if only stage1 run)
```

## Common Development Patterns

### Adding New Configuration Parameters
1. Add default value in `pipeline/config.py` `validate_config()` function
2. Add validation logic if needed (e.g., in `_validate_stage_configuration()`)
3. Use the parameter via `config['stage1']['param_name']` or `config['stage2']['param_name']`
4. Update README.md configuration tables

### Modifying the U-Net Architecture
- Main implementation: `models/unet.py` `FlexibleUNet` class
- Encoder: `conv_block` → `MaxPool2d` (repeated)
- Decoder: `ResizeConvolution` (or `ConvTranspose2d`) → `conv_block` → concatenate skip connections
- Modify `conv_block()` method to change block structure
- Model creation: `models/factory.py` `create_model()`

### Adding New Masking Strategies
1. Extend `masking_strategy` parameter handling in `datasets/training.py`
2. Implement masking logic in `BaseNoiseDataset._generate_training_masks()`
3. Update configuration documentation

### Debugging Training Issues
- Enable verbose mode: `config['verbose'] = True`
- Check TensorBoard logs for loss curves
- Inspect dataset outputs: Access `train_loader.dataset[0]` to see patch/mask samples
- Verify mask statistics: `np.sum(mask)` should match `mask_percentage`
- Check model outputs: Add print statements in `AutoStructN2VModel.forward()`

## Important Caveats

1. **Patch Size Constraints**: Patch sizes must be divisible by `2^num_layers` to avoid size mismatches in U-Net skip connections

2. **Memory Management**: Large images, big batch sizes, or deep networks can cause OOM errors. The pipeline clears models after each stage with `torch.cuda.empty_cache()`

3. **Mask Source Confusion**: When `mask_source='stage1'`, Stage 2 uses the structural pattern learned from Stage 1 denoised patches BUT trains on the original noisy images, not Stage 1 outputs

4. **File Naming**: Denoised images are saved with `_denoised.tif` suffix. The visualization code handles multiple `_denoised` suffixes by stripping them all

5. **Autocorrelation Memory**: `StructuralNoiseExtractor` processes all patches simultaneously. For very large datasets, may need to limit `patches_per_image` or number of images used for mask extraction

6. **Stage Independence**: The stages are designed to be independent. Stage 2 doesn't require Stage 1 model weights, only optionally uses its denoised patches for mask learning
