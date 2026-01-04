# Training Guide

Best practices, tips, and strategies for training autoStructN2V models.

## Training Overview

autoStructN2V uses a two-stage training approach:

1. **Stage 1**: Train U-Net to predict masked pixels from unmasked neighbors (standard N2V)
2. **Stage 2**: Train U-Net with structured masking pattern to remove correlated noise

Both stages use:
- Adam optimizer
- ReduceLROnPlateau learning rate scheduler
- MSE loss on masked pixels
- Early stopping (optional)

## Training Process

###Stage 1 Training

**Goal**: Remove random, uncorrelated noise

**Process**:
1. Extract random patches from training images
2. Apply random single-pixel masks (blind spots)
3. Train model to predict masked pixels
4. Validate on validation set
5. Generate denoised patches for Stage 2 mask creation

**Typical Duration**: 5-20 minutes per epoch (depends on hardware and dataset size)

### Stage 2 Training

**Goal**: Remove structured, correlated noise

**Process**:
1. Extract structural mask pattern (from Stage 1 output, file, or original images)
2. Create full mask with pattern placements
3. Extract patches from original noisy images
4. Apply structured masks to patches
5. Train model to predict masked pixels
6. Validate on validation set

**Typical Duration**: 10-30 minutes per epoch (larger patches, more complex patterns)

## Monitoring Training

### TensorBoard

Launch TensorBoard to monitor training:

```bash
# Stage 1
tensorboard --logdir results/experiment_name/stage1/logs

# Stage 2
tensorboard --logdir results/experiment_name/stage2/logs
```

**What to Monitor**:

1. **Loss Curves**
   - Training loss should decrease steadily
   - Validation loss should track training loss closely
   - Large gap = overfitting (reduce model capacity or add regularization)

2. **Learning Rate**
   - Starts at configured value
   - Decreases when validation loss plateaus (ReduceLROnPlateau)
   - Multiple decreases are normal

3. **Sample Images**
   - Logged periodically during training
   - Visual check of denoising quality
   - Look for artifacts or under/over-smoothing

### Console Output

With `verbose=True`:

```
Epoch [1/100]: train_loss=0.0234, val_loss=0.0187, lr=0.0001
Epoch [2/100]: train_loss=0.0198, val_loss=0.0165, lr=0.0001
...
Epoch [25/100]: train_loss=0.0087, val_loss=0.0092, lr=0.0001
Epoch 00025: reducing learning rate of group 0 to 5.0000e-05.
...
Early stopping triggered at epoch 42
Best validation loss: 0.0083 at epoch 37
```

## Best Practices

### 1. Start with Default Settings

Begin with defaults and adjust based on results:

```python
config = {
    'input_dir': './data/',
    'experiment_name': 'baseline',
}
results = run_pipeline(config)
```

### 2. Use Early Stopping

Prevents overfitting and saves time:

```python
config = {
    'early_stopping': True,
    'early_stopping_patience': 10,  # Stop if no improvement for 10 epochs
}
```

### 3. Enable Verbose Mode

See what's happening:

```python
config = {
    'verbose': True,  # Detailed output and visualizations
}
```

### 4. Set Appropriate Epoch Count

```python
config = {
    'num_epochs': 100,  # Good starting point
    # With early stopping, training may stop earlier
}
```

### 5. Use Data Augmentation

Improves generalization:

```python
config = {
    'stage1': {'use_augmentation': True},
    'stage2': {'use_augmentation': True},
}
```

## Hyperparameter Tuning

### Learning Rate

**Too High**: Loss oscillates or increases
- Solution: Decrease learning rate by 50-75%

**Too Low**: Slow convergence, plateaus early
- Solution: Increase learning rate by 2-5×

**Guidelines**:
- Stage 1: 1e-4 to 2e-4
- Stage 2: 1e-5 to 5e-5 (typically 10× lower than Stage 1)

```python
config = {
    'stage1': {'learning_rate': 2e-4},  # Aggressive
    'stage2': {'learning_rate': 5e-6},  # Conservative
}
```

### Batch Size

**Larger Batches**:
- ✓ More stable gradients
- ✓ Faster training (better GPU utilization)
- ✗ Requires more memory
- ✗ May generalize worse

**Smaller Batches**:
- ✓ Less memory
- ✓ May generalize better (noisier gradients)
- ✗ Slower training
- ✗ Less stable

**Guidelines**:
```python
# For 8 GB GPU
config = {
    'stage1': {'batch_size': 8, 'patch_size': 32},
    'stage2': {'batch_size': 4, 'patch_size': 64},
}

# For 4 GB GPU
config = {
    'stage1': {'batch_size': 2, 'patch_size': 32},
    'stage2': {'batch_size': 1, 'patch_size': 48},
}
```

### Model Capacity (Features and Layers)

**More Capacity** (higher features, more layers):
- ✓ Can learn more complex patterns
- ✗ Slower training
- ✗ More memory
- ✗ Risk of overfitting

**Less Capacity**:
- ✓ Faster training
- ✓ Less memory
- ✗ May underfit complex noise

**Guidelines**:
```python
# Simple noise
config = {
    'stage1': {'features': 32, 'num_layers': 2},
    'stage2': {'features': 32, 'num_layers': 2},
}

# Moderate noise
config = {
    'stage1': {'features': 64, 'num_layers': 2},
    'stage2': {'features': 64, 'num_layers': 3},
}

# Complex noise
config = {
    'stage1': {'features': 96, 'num_layers': 3},
    'stage2': {'features': 96, 'num_layers': 4},
}
```

### Patch Size

**Larger Patches**:
- ✓ More context
- ✓ Better for large structures
- ✗ Fewer patches per image
- ✗ More memory

**Smaller Patches**:
- ✓ More patches
- ✓ Less memory
- ✗ Less context

**Guidelines**:
- Stage 1: 32-64 pixels (focus on local noise)
- Stage 2: 64-128 pixels (capture structural patterns)
- Must be divisible by 2^num_layers

```python
config = {
    'stage1': {'patch_size': 64},
    'stage2': {'patch_size': 96},  # Larger for structural patterns
}
```

### Patches Per Image

**More Patches**:
- ✓ More training data
- ✓ Better coverage of image content
- ✗ Slower training (more iterations per epoch)

**Fewer Patches**:
- ✓ Faster training
- ✗ Less data diversity

**Guidelines**:
- Stage 1: 100-200 patches/image
- Stage 2: 150-300 patches/image

```python
config = {
    'stage1': {'patches_per_image': 150},
    'stage2': {'patches_per_image': 250},
}
```

### Mask Percentage

**Higher Percentage**:
- ✓ More training signal
- ✗ Less context for prediction

**Lower Percentage**:
- ✓ More context preserved
- ✗ Less training signal

**Guidelines**:
- Stage 1: 15-20% (random noise removal)
- Stage 2: 8-12% (structural patterns are sparse)

```python
config = {
    'stage1': {'mask_percentage': 18.0},
    'stage2': {'mask_percentage': 10.0},
}
```

## Common Training Issues

### Issue 1: Slow Convergence

**Symptoms**: Loss decreases very slowly

**Solutions**:
```python
# Increase learning rate
config = {
    'stage1': {'learning_rate': 2e-4},  # From 1e-4
}

# Increase patches per image
config = {
    'stage1': {'patches_per_image': 200},  # From 100
}

# Increase batch size (if memory allows)
config = {
    'stage1': {'batch_size': 8},  # From 4
}
```

### Issue 2: Overfitting

**Symptoms**: Training loss decreases but validation loss increases or plateaus

**Solutions**:
```python
# Reduce model capacity
config = {
    'stage1': {
        'features': 48,  # From 64
        'num_layers': 2,  # From 3
    }
}

# Enable augmentation
config = {
    'stage1': {'use_augmentation': True},
}

# Use early stopping
config = {
    'early_stopping': True,
    'early_stopping_patience': 10,
}

# Increase training data (more patches)
config = {
    'stage1': {'patches_per_image': 200},
}
```

### Issue 3: Out of Memory

**Symptoms**: CUDA out of memory error

**Solutions**:
```python
# Reduce batch size
config = {
    'stage1': {'batch_size': 2},  # From 4
    'stage2': {'batch_size': 1},  # From 2
}

# Reduce patch size
config = {
    'stage1': {'patch_size': 32},  # From 64
    'stage2': {'patch_size': 48},  # From 96
}

# Reduce model capacity
config = {
    'stage1': {'features': 32, 'num_layers': 2},
}

# Use CPU (slower)
config = {
    'device': 'cpu',
}
```

### Issue 4: Poor Denoising Quality

**Symptoms**: Denoised images still noisy or over-smoothed

**Solutions for Remaining Noise**:
```python
# Increase model capacity
config = {
    'stage1': {
        'features': 96,
        'num_layers': 3,
    }
}

# Increase training duration
config = {
    'num_epochs': 150,
    'early_stopping_patience': 20,
}

# Increase patch diversity
config = {
    'stage1': {'patches_per_image': 200},
}
```

**Solutions for Over-Smoothing**:
```python
# Reduce mask percentage
config = {
    'stage1': {'mask_percentage': 12.0},  # From 15.0
}

# Reduce model capacity
config = {
    'stage1': {'features': 48, 'num_layers': 2},
}

# Reduce training epochs
config = {
    'num_epochs': 75,
}
```

### Issue 5: Stage 2 Not Removing Structured Noise

**Symptoms**: Structured patterns remain after Stage 2

**Solutions**:
```python
# Adjust extractor parameters
config = {
    'stage2': {
        'extractor': {
            'center_size': 15,  # Larger analysis region
            'base_percentile': 45,  # More lenient threshold
            'center_ratio_threshold': 0.25,  # Lower threshold
            'max_true_pixels': 30,  # Allow more pattern pixels
        }
    }
}

# Use larger patches
config = {
    'stage2': {'patch_size': 128},  # Capture larger patterns
}

# Increase Stage 2 capacity
config = {
    'stage2': {
        'features': 96,
        'num_layers': 4,
    }
}

# Try different mask source
config = {
    'stage2': {
        'mask_source': 'extractor',  # Extract directly from original
    }
}
```

## Advanced Training Strategies

### Progressive Training

Train with increasing complexity:

```python
# Phase 1: Quick training with small model
config1 = {
    'experiment_name': 'phase1_fast',
    'num_epochs': 50,
    'stage1': {'features': 32, 'num_layers': 2},
    'stage2': {'features': 32, 'num_layers': 2},
}
results1 = run_pipeline(config1)

# Phase 2: Fine-tune with larger model
config2 = {
    'experiment_name': 'phase2_refined',
    'num_epochs': 100,
    'stage1': {'features': 64, 'num_layers': 3},
    'stage2': {
        'features': 64,
        'num_layers': 3,
        'mask_source': 'file',
        'mask_file_path': results1['stage2_mask_path'],  # Reuse mask
    }
}
results2 = run_pipeline(config2)
```

### Cross-Validation

Test multiple configurations:

```python
configs = [
    {'features': 32, 'num_layers': 2},
    {'features': 64, 'num_layers': 2},
    {'features': 64, 'num_layers': 3},
]

for i, stage1_config in enumerate(configs):
    config = {
        'experiment_name': f'cv_fold_{i}',
        'stage1': stage1_config,
    }
    results = run_pipeline(config)
    # Evaluate results and choose best
```

### Transfer Learning

Use mask learned from one dataset on another:

```python
# Train on dataset A
config_a = {
    'input_dir': './dataset_a/',
    'experiment_name': 'dataset_a',
}
results_a = run_pipeline(config_a)

# Apply to dataset B using learned mask
config_b = {
    'input_dir': './dataset_b/',
    'experiment_name': 'dataset_b',
    'run_stage1': False,
    'run_stage2': True,
    'stage2': {
        'mask_source': 'file',
        'mask_file_path': results_a['stage2_mask_path'],
    }
}
results_b = run_pipeline(config_b)
```

## ROI Selection Strategy

### Stage 1: Select Background Regions

Focuses on empty regions to learn noise characteristics:

```python
config = {
    'stage1': {
        'use_roi': True,
        'select_background': True,  # Select low-intensity regions
        'roi_threshold': 0.5,
        'scale_factor': 0.25,
    }
}
```

### Stage 2: Select Structure Regions

Focuses on regions with structures:

```python
config = {
    'stage2': {
        'use_roi': True,
        'select_background': False,  # Select high-intensity regions
        'roi_threshold': 0.5,
    }
}
```

### Disable ROI Selection

Use random patches (faster, but may be less effective):

```python
config = {
    'stage1': {'use_roi': False},
    'stage2': {'use_roi': False},
}
```

## Reproducibility

Ensure reproducible results:

```python
config = {
    'random_seed': 42,  # Fixed seed
    # PyTorch deterministic mode is automatically enabled
}
```

**Note**: Some operations (especially CUDA) may not be fully deterministic.

## Training Time Estimates

Approximate times for 100 epochs (depends on hardware):

| Configuration | GPU | Stage 1 | Stage 2 | Total |
|---------------|-----|---------|---------|-------|
| Fast (small model, small patches) | GTX 1080 | 30 min | 45 min | 1.25 hr |
| Default | RTX 3080 | 15 min | 25 min | 40 min |
| High-quality (large model, large patches) | RTX 3090 | 45 min | 90 min | 2.25 hr |
| CPU (slow) | i7-10700K | 6 hr | 12 hr | 18 hr |

**Early stopping typically reduces times by 30-50%.**

## See Also

- [Configuration Reference](configuration.md) - Complete parameter documentation
- [Pipeline Guide](pipeline.md) - Running the pipeline
- [Two-Stage Approach](../concepts/two-stage-approach.md) - Understanding the training process
- [API Reference: Trainers](../api-reference/trainers.md) - Technical training details

---

**Next**: [Inference Guide](inference.md) for using trained models.
