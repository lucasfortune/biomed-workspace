# Basic Usage Tutorial

Complete beginner-friendly walkthrough of using autoStructN2V to denoise microscopy images.

## Prerequisites

- autoStructN2V installed ([Installation Guide](../getting-started.md#installation))
- Python 3.7+
- A directory with noisy TIFF images
- (Optional) CUDA-capable GPU

## Tutorial Overview

In this tutorial, you will:
1. Prepare your data
2. Configure the pipeline
3. Run the full two-stage denoising
4. Examine the results
5. Monitor training with TensorBoard

**Estimated time**: 30 minutes (excluding training time)

## Step 1: Prepare Your Data

### 1.1 Organize Images

Create a directory with your noisy images:

```bash
mkdir ~/my_microscopy_data
# Copy your .tif images to this directory
```

Your directory should look like:
```
my_microscopy_data/
├── image_001.tif
├── image_002.tif
├── image_003.tif
├── ...
└── image_020.tif
```

**Requirements**:
- At least 10 images (20+ recommended)
- TIFF format (.tif or .tiff)
- Grayscale (single channel)
- 8-bit or 16-bit

### 1.2 Verify Images

Quick verification script:

```python
import os
from PIL import Image
import numpy as np

data_dir = "~/my_microscopy_data"
tif_files = [f for f in os.listdir(data_dir) if f.endswith('.tif')]

print(f"Found {len(tif_files)} TIFF images")

# Check first image
img = Image.open(os.path.join(data_dir, tif_files[0]))
img_array = np.array(img)

print(f"Image shape: {img_array.shape}")
print(f"Data type: {img_array.dtype}")
print(f"Value range: [{img_array.min()}, {img_array.max()}]")
```

Expected output:
```
Found 20 TIFF images
Image shape: (512, 512)
Data type: uint8 (or uint16)
Value range: [0, 255] (or [0, 65535])
```

## Step 2: Create Configuration

### 2.1 Minimal Configuration

Create a Python script `denoise_images.py`:

```python
from autoStructN2V.pipeline import run_pipeline

# Minimal configuration
config = {
    'input_dir': '~/my_microscopy_data/',
    'output_dir': './results/',
    'experiment_name': 'my_first_experiment',
    'device': 'cuda',  # Use 'cpu' if no GPU
}

# Run pipeline
print("Starting pipeline...")
results = run_pipeline(config)

print("\n" + "="*50)
print("Pipeline Complete!")
print("="*50)
print(f"Denoised images: {results['final_results_dir']}")
print(f"Stage 1 model: {results['stage1_model_path']}")
print(f"Stage 2 model: {results['stage2_model_path']}")
```

### 2.2 Run the Pipeline

```bash
python denoise_images.py
```

You'll see output like:
```
Starting pipeline...
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
Epoch [2/100]: train_loss=0.0198, val_loss=0.0165, lr=0.0001
...
```

**Expected duration**:
- With GPU: 30-60 minutes total
- With CPU: 4-8 hours total

## Step 3: Monitor Training

### 3.1 Launch TensorBoard

While training is running, open a new terminal:

```bash
# Monitor Stage 1
tensorboard --logdir results/my_first_experiment/stage1/logs

# Or Stage 2 (when it starts)
tensorboard --logdir results/my_first_experiment/stage2/logs
```

### 3.2 View in Browser

Navigate to `http://localhost:6006`

You'll see:
- **SCALARS**: Loss curves, learning rate
- **IMAGES**: Sample denoised patches
- **GRAPHS**: Model architecture

### 3.3 What to Look For

**Good Training Signs**:
- Training loss decreases smoothly
- Validation loss tracks training loss closely
- Sample images show progressive denoising

**Warning Signs**:
- Validation loss increases (overfitting)
- Loss plateaus early (may need more capacity)
- Loss oscillates wildly (reduce learning rate)

## Step 4: Examine Results

### 4.1 Output Structure

After completion, you'll have:

```
results/my_first_experiment/
├── config.json                  # Saved configuration
├── data/                        # Split dataset
│   ├── train/                   # Training images (14)
│   ├── val/                     # Validation images (3)
│   ├── test/                    # Test images (3)
│   └── stage1_denoised/        # Stage 1 outputs
│       ├── train/
│       ├── val/
│       └── test/
├── stage1/
│   ├── model/
│   │   └── stage1_model.pth    # Trained Stage 1 model
│   └── logs/                    # TensorBoard logs
├── stage2/
│   ├── model/
│   │   ├── stage2_model.pth    # Trained Stage 2 model
│   │   └── stage2_mask.npy     # Learned structural mask
│   └── logs/
└── final_results/               # Final denoised images
    ├── train/
    ├── val/
    └── test/
```

### 4.2 View Results

```python
import matplotlib.pyplot as plt
from autoStructN2V.utils.image import load_and_normalize_image
from autoStructN2V.inference import visualize_denoising_result

# Pick a test image
original_path = 'results/my_first_experiment/data/test/image_001.tif'
denoised_path = 'results/my_first_experiment/final_results/test/image_001_denoised.tif'

# Load images
original = load_and_normalize_image(original_path)
denoised = load_and_normalize_image(denoised_path)

# Visualize
fig = visualize_denoising_result(
    original=original,
    denoised=denoised,
    title="Denoising Result",
    figsize=(12, 6)
)
plt.show()
```

### 4.3 Compare All Stages

```python
from autoStructN2V.inference import compare_multiple_images

# Load all versions
original = load_and_normalize_image('results/.../data/test/image_001.tif')
stage1 = load_and_normalize_image('results/.../data/stage1_denoised/test/image_001_denoised.tif')
stage2 = load_and_normalize_image('results/.../final_results/test/image_001_denoised.tif')

# Compare
fig = compare_multiple_images(
    image_arrays=[original, stage1, stage2],
    titles=['Original (Noisy)', 'After Stage 1', 'After Stage 2'],
    figsize=(15, 5)
)
plt.show()
```

### 4.4 Inspect Structural Mask

```python
import numpy as np
import matplotlib.pyplot as plt

# Load mask
mask = np.load('results/my_first_experiment/stage2/model/stage2_mask.npy')

print(f"Mask shape: {mask.shape}")
print(f"True pixels: {np.sum(mask)}/{mask.size} ({np.sum(mask)/mask.size*100:.1f}%)")

# Visualize
plt.figure(figsize=(8, 8))
plt.imshow(mask, cmap='gray', interpolation='nearest')
plt.title("Learned Structural Mask")
plt.colorbar()
plt.show()
```

## Step 5: Improve Results (Optional)

### 5.1 Enable Verbose Mode

See detailed information:

```python
config = {
    'input_dir': '~/my_microscopy_data/',
    'experiment_name': 'verbose_run',
    'verbose': True,  # Enable detailed output
}

results = run_pipeline(config)
```

This shows:
- Dataset split details
- Sample patches and masks
- Denoising progression
- Final comparisons

### 5.2 Adjust for Better Quality

```python
config = {
    'input_dir': '~/my_microscopy_data/',
    'experiment_name': 'high_quality',

    'num_epochs': 150,  # More training
    'early_stopping_patience': 20,

    'stage1': {
        'features': 96,          # More capacity
        'num_layers': 3,         # Deeper network
        'patch_size': 64,        # Larger patches
        'batch_size': 8,         # Larger batches
        'learning_rate': 2e-4,
        'patches_per_image': 200,
    },

    'stage2': {
        'features': 96,
        'num_layers': 3,
        'patch_size': 96,
        'batch_size': 4,
        'learning_rate': 5e-6,
        'patches_per_image': 300,
    }
}

results = run_pipeline(config)
```

### 5.3 Adjust for Faster Training

```python
config = {
    'input_dir': '~/my_microscopy_data/',
    'experiment_name': 'fast_test',

    'num_epochs': 50,  # Fewer epochs

    'stage1': {
        'features': 48,          # Smaller model
        'num_layers': 2,
        'batch_size': 16,        # Larger batches
        'patches_per_image': 75, # Fewer patches
    },

    'stage2': {
        'features': 48,
        'num_layers': 2,
        'batch_size': 8,
        'patches_per_image': 150,
    }
}

results = run_pipeline(config)
```

## Step 6: Use Trained Models

### 6.1 Denoise New Images

```python
from autoStructN2V.inference import AutoStructN2VPredictor
from autoStructN2V.models import create_model
import torch

# Load Stage 2 model (final model)
model = create_model('stage2', features=64, num_layers=2)
checkpoint = torch.load('results/my_first_experiment/stage2/model/stage2_model.pth')
model.load_state_dict(checkpoint['model_state_dict'])
model.eval()

# Create predictor
predictor = AutoStructN2VPredictor(
    model=model,
    device='cuda',
    patch_size=64,
)

# Denoise new image
denoised = predictor.denoise_image(
    image_path='new_noisy_image.tif',
    output_path='new_denoised_image.tif',
    show=True
)
```

### 6.2 Batch Process Directory

```python
# Process all images in a directory
output_paths = predictor.process_directory(
    input_dir='./new_data/',
    output_dir='./denoised_output/',
    show=False
)

print(f"Processed {len(output_paths)} images")
```

## Common Issues and Solutions

### Issue 1: Out of Memory

```python
# Solution: Reduce batch size and patch size
config = {
    'stage1': {'batch_size': 2, 'patch_size': 32},
    'stage2': {'batch_size': 1, 'patch_size': 48},
}
```

### Issue 2: Poor Denoising

```python
# Solution: Increase model capacity
config = {
    'stage1': {'features': 96, 'num_layers': 3},
    'stage2': {'features': 96, 'num_layers': 3},
}
```

### Issue 3: Training Too Slow

```python
# Solution: Use smaller model and fewer epochs
config = {
    'num_epochs': 50,
    'stage1': {'features': 32, 'patches_per_image': 50},
    'stage2': {'features': 32, 'patches_per_image': 100},
}
```

### Issue 4: Structural Noise Remains

```python
# Solution: Adjust extractor parameters
config = {
    'stage2': {
        'extractor': {
            'center_size': 15,
            'base_percentile': 45,
            'max_true_pixels': 30,
        }
    }
}
```

## Next Steps

Congratulations! You've successfully:
- ✓ Run the complete autoStructN2V pipeline
- ✓ Monitored training with TensorBoard
- ✓ Examined denoising results
- ✓ Used trained models for inference

### Continue Learning

- [Configuration Reference](../user-guide/configuration.md) - All configuration options
- [Custom Masks Tutorial](custom-masks.md) - Create custom structural masks
- [Advanced Configuration](advanced-configuration.md) - Advanced scenarios
- [Training Guide](../user-guide/training.md) - Training best practices

### Get Help

- [Troubleshooting Guide](../troubleshooting.md) - Common issues
- [API Reference](../api-reference/pipeline.md) - Technical documentation
- GitHub Issues - Report bugs or ask questions

---

**Next Tutorial**: [Custom Masks](custom-masks.md) for creating and using custom structural masks.
