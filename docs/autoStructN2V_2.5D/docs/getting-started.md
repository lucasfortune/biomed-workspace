# Getting Started

This guide will help you install autoStructN2V and run your first denoising pipeline.

## Prerequisites

Before installing autoStructN2V, ensure you have:

- Python 3.7 or higher
- pip package manager
- (Optional) CUDA-capable GPU for faster training

## Installation

### Step 1: Clone the Repository

```bash
git clone https://github.com/yourusername/autoStructN2V.git
cd autoStructN2V
```

### Step 2: Create Virtual Environment (Recommended)

Using conda:
```bash
conda create -n autostruct python=3.8
conda activate autostruct
```

Or using venv:
```bash
python -m venv autostruct_env
source autostruct_env/bin/activate  # On Windows: autostruct_env\Scripts\activate
```

### Step 3: Install Dependencies

```bash
pip install -r requirements.txt
```

This will install:
- PyTorch (with CUDA support if available)
- torchvision
- NumPy
- Pillow (image I/O)
- scikit-image (image processing)
- matplotlib (visualization)
- tqdm (progress bars)
- tensorboard (training monitoring)

### Step 4: Install autoStructN2V

Install in development mode:
```bash
pip install -e .
```

### Step 5: Verify Installation

```python
import autoStructN2V
print(autoStructN2V.__version__)  # Should print: 0.1.0
```

## Quick Start: Your First Pipeline

### Prepare Your Data

1. Create a directory with your noisy images:
```
my_data/
├── image_001.tif
├── image_002.tif
├── image_003.tif
└── ...
```

2. Images should be:
   - TIFF format (.tif or .tiff)
   - Grayscale (single channel)
   - 8-bit or 16-bit

### Run the Full Pipeline

Create a Python script:

```python
from autoStructN2V.pipeline import run_pipeline

# Minimal configuration
config = {
    'input_dir': './my_data/',
    'output_dir': './results/',
    'experiment_name': 'my_first_experiment',
    'device': 'cuda',  # Use 'cpu' if no GPU
}

# Run pipeline with default settings
results = run_pipeline(config)

print(f"Training complete!")
print(f"Stage 1 model: {results['stage1_model_path']}")
print(f"Stage 2 model: {results['stage2_model_path']}")
print(f"Denoised images: {results['final_results_dir']}")
```

Run the script:
```bash
python denoise_my_images.py
```

### What Happens During Execution

1. **Data Splitting**: Images are split into train/validation/test sets (70/15/15 by default)
2. **Stage 1 Training**: Model learns to remove random noise (~5-20 minutes per epoch)
3. **Mask Extraction**: Structural noise pattern is identified
4. **Stage 2 Training**: Model learns to remove structured noise (~10-30 minutes per epoch)
5. **Inference**: Trained models are applied to all images
6. **Results**: Denoised images saved to `results/my_first_experiment/final_results/`

### Monitor Training with TensorBoard

While training is running, open a new terminal and run:

```bash
tensorboard --logdir results/my_first_experiment/
```

Then navigate to `http://localhost:6006` in your browser to view:
- Training and validation loss curves
- Learning rate changes
- Sample denoised images

## Understanding the Output Directory

After running the pipeline, you'll find:

```
results/my_first_experiment/
├── config.json                     # Saved configuration
├── data/                           # Split dataset
│   ├── train/
│   ├── val/
│   ├── test/
│   └── stage1_denoised/           # Stage 1 outputs
├── stage1/
│   ├── model/
│   │   └── stage1_model.pth       # Trained Stage 1 model
│   └── logs/                       # TensorBoard logs
├── stage2/
│   ├── model/
│   │   ├── stage2_model.pth       # Trained Stage 2 model
│   │   └── stage2_mask.npy        # Learned structural mask
│   └── logs/
└── final_results/                  # Final denoised images
    ├── train/
    ├── val/
    └── test/
```

## Customizing the Pipeline

### Adjusting Training Parameters

```python
config = {
    'input_dir': './my_data/',
    'output_dir': './results/',
    'experiment_name': 'custom_experiment',
    'device': 'cuda',

    # General settings
    'num_epochs': 150,              # More epochs for better results
    'early_stopping': True,
    'early_stopping_patience': 15,
    'verbose': True,                # Show detailed information

    # Stage 1 configuration
    'stage1': {
        'patch_size': 64,           # Larger patches
        'batch_size': 8,            # Larger batches (needs more memory)
        'features': 96,             # More model capacity
        'num_layers': 3,            # Deeper network
        'learning_rate': 2e-4,
        'patches_per_image': 150,
    },

    # Stage 2 configuration
    'stage2': {
        'patch_size': 96,
        'batch_size': 4,
        'features': 96,
        'num_layers': 3,
        'learning_rate': 5e-6,
        'patches_per_image': 250,
    }
}

results = run_pipeline(config)
```

### Running Only Stage 1

```python
config = {
    'input_dir': './my_data/',
    'run_stage1': True,
    'run_stage2': False,  # Skip Stage 2
    # ... other parameters
}
```

### Running Only Stage 2 with Pre-saved Mask

```python
config = {
    'input_dir': './my_data/',
    'run_stage1': False,
    'run_stage2': True,

    'stage2': {
        'mask_source': 'file',
        'mask_file_path': './saved_masks/my_mask.npy',
        # ... other stage2 parameters
    }
}
```

## Next Steps

Now that you've successfully run your first pipeline, explore:

1. [**Configuration Guide**](user-guide/configuration.md) - Learn about all configuration options
2. [**Basic Usage Tutorial**](tutorials/basic-usage.md) - Detailed walkthrough with explanations
3. [**Two-Stage Approach**](concepts/two-stage-approach.md) - Understand how the stages work together
4. [**Pipeline Guide**](user-guide/pipeline.md) - Advanced pipeline usage

## Common Issues

### Out of Memory Errors

If you encounter CUDA out of memory errors:

```python
config = {
    'stage1': {
        'batch_size': 2,      # Reduce batch size
        'patch_size': 32,     # Use smaller patches
        'features': 32,       # Reduce model capacity
    },
    'stage2': {
        'batch_size': 1,
        'patch_size': 48,
        'features': 32,
    }
}
```

### Slow Training

For faster experimentation:

```python
config = {
    'num_epochs': 50,        # Fewer epochs
    'stage1': {
        'patches_per_image': 50,  # Fewer patches
    },
    'stage2': {
        'patches_per_image': 100,
    }
}
```

### No GPU Available

If you don't have a GPU or CUDA is unavailable:

```python
config = {
    'device': 'cpu',         # Use CPU instead
    'stage1': {
        'batch_size': 1,     # Smaller batches for CPU
        'num_layers': 2,     # Shallower network
    }
}
```

For more troubleshooting, see the [Troubleshooting Guide](troubleshooting.md).

## Getting Help

If you encounter issues:

1. Check the [Troubleshooting Guide](troubleshooting.md)
2. Review the [API Reference](api-reference/pipeline.md) for detailed parameter descriptions
3. Open an issue on GitHub with your configuration and error message

---

**Next**: [Basic Usage Tutorial](tutorials/basic-usage.md) for a detailed walkthrough with explanations.
