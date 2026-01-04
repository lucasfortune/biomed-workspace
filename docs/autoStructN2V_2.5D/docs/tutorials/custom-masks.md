# Custom Masks Tutorial

Learn how to create, analyze, and use custom structural masks for Stage 2 training.

## Overview

This tutorial covers:
1. Creating masks from your own images
2. Analyzing mask quality
3. Using custom masks in Stage 2
4. Comparing different mask configurations
5. Reusing masks across datasets

**Prerequisites**: Completed [Basic Usage Tutorial](basic-usage.md)

## Why Custom Masks?

Default mask extraction works well for most cases, but custom masks let you:
- Fine-tune for specific noise patterns
- Reuse validated masks
- Experiment with different extractor settings
- Apply same mask to similar datasets

## Part 1: Creating Masks from Images

### 1.1 Basic Mask Creation

```python
from autoStructN2V.masking import StructuralNoiseExtractor
from autoStructN2V.utils.image import load_and_normalize_image
import numpy as np
import matplotlib.pyplot as plt

# Load some noisy images
image_paths = [
    './data/noisy_001.tif',
    './data/noisy_002.tif',
    './data/noisy_003.tif',
]

# Extract patches from images
patches = []
patch_size = 64

for path in image_paths:
    img = load_and_normalize_image(path)
    h, w = img.shape

    # Extract 50 random patches per image
    for _ in range(50):
        if h >= patch_size and w >= patch_size:
            top = np.random.randint(0, h - patch_size + 1)
            left = np.random.randint(0, w - patch_size + 1)
            patch = img[top:top+patch_size, left:left+patch_size]
            patches.append(patch)

patches = np.array(patches)
print(f"Extracted {len(patches)} patches")

# Create extractor with default settings
extractor = StructuralNoiseExtractor(
    center_size=10,
    base_percentile=50,
    percentile_decay=1.15,
    center_ratio_threshold=0.3,
    use_center_proximity=True,
    center_proximity_threshold=0.95,
    max_true_pixels=25,
)

# Extract mask
mask, autocorr = extractor.extract_mask(patches, verbose=True)

print(f"Mask shape: {mask.shape}")
print(f"True pixels: {np.sum(mask)}/{mask.size} ({np.sum(mask)/mask.size*100:.2f}%)")

# Visualize
fig, axes = plt.subplots(1, 2, figsize=(12, 6))

axes[0].imshow(autocorr, cmap='viridis')
axes[0].set_title("Autocorrelation Center")
axes[0].axis('off')

axes[1].imshow(mask, cmap='gray', interpolation='nearest')
axes[1].set_title(f"Structural Mask ({np.sum(mask)} pixels)")
axes[1].axis('off')

plt.tight_layout()
plt.show()

# Save mask
np.save('./custom_mask.npy', mask)
print("Mask saved to ./custom_mask.npy")
```

### 1.2 Using Different Extractor Settings

Try multiple configurations:

```python
# Configuration 1: Strict (small mask)
extractor_strict = StructuralNoiseExtractor(
    center_size=10,
    base_percentile=70,  # High percentile = strict
    max_true_pixels=15,  # Small mask
)
mask_strict, _ = extractor_strict.extract_mask(patches, verbose=False)

# Configuration 2: Lenient (large mask)
extractor_lenient = StructuralNoiseExtractor(
    center_size=15,
    base_percentile=30,  # Low percentile = lenient
    max_true_pixels=40,  # Large mask
)
mask_lenient, _ = extractor_lenient.extract_mask(patches, verbose=False)

# Configuration 3: Balanced (default-like)
extractor_balanced = StructuralNoiseExtractor(
    center_size=12,
    base_percentile=50,
    max_true_pixels=25,
)
mask_balanced, _ = extractor_balanced.extract_mask(patches, verbose=False)

# Compare
fig, axes = plt.subplots(1, 3, figsize=(15, 5))

axes[0].imshow(mask_strict, cmap='gray', interpolation='nearest')
axes[0].set_title(f"Strict ({np.sum(mask_strict)} pixels)")

axes[1].imshow(mask_balanced, cmap='gray', interpolation='nearest')
axes[1].set_title(f"Balanced ({np.sum(mask_balanced)} pixels)")

axes[2].imshow(mask_lenient, cmap='gray', interpolation='nearest')
axes[2].set_title(f"Lenient ({np.sum(mask_lenient)} pixels)")

for ax in axes:
    ax.axis('off')

plt.tight_layout()
plt.show()
```

## Part 2: Analyzing Mask Quality

### 2.1 Visualize Mask Details

```python
from autoStructN2V.utils.mask_utils import visualize_mask

mask = np.load('./custom_mask.npy')

visualize_mask(
    mask=mask,
    title="Custom Structural Mask Analysis",
    save_path='./mask_analysis.png'
)
```

This shows:
- Mask visualization
- Pixel count and percentage
- Center position
- Connected components

### 2.2 Compare Two Masks

```python
from autoStructN2V.utils.mask_utils import compare_masks

mask1 = np.load('./mask_strict.npy')
mask2 = np.load('./mask_lenient.npy')

compare_masks(
    mask1=mask1,
    mask2=mask2,
    labels=["Strict", "Lenient"],
    save_path='./mask_comparison.png'
)
```

Shows:
- Side-by-side visualization
- Difference map
- Overlap analysis
- Jaccard similarity index

### 2.3 Validate Mask Properties

```python
from autoStructN2V.utils.mask_utils import load_and_validate_mask

mask = load_and_validate_mask(
    mask_path='./custom_mask.npy',
    expected_shape=(11, 11),  # Optional
    verbose=True
)
```

Checks:
- File exists and readable
- Data type is boolean
- Shape is square and odd-sized
- Center pixel is handled correctly
- No NaN or invalid values

## Part 3: Using Custom Masks in Training

### 3.1 Stage 2 with Custom Mask

```python
from autoStructN2V.pipeline import run_pipeline

config = {
    'input_dir': './data/',
    'experiment_name': 'custom_mask_experiment',

    # Skip Stage 1, run Stage 2 only
    'run_stage1': False,
    'run_stage2': True,

    'stage2': {
        'mask_source': 'file',  # Use custom mask
        'mask_file_path': './custom_mask.npy',

        # Stage 2 parameters
        'patch_size': 64,
        'batch_size': 4,
        'features': 64,
        'num_layers': 2,
        'learning_rate': 1e-5,
        'patches_per_image': 200,
    }
}

results = run_pipeline(config)
print(f"Training complete! Results: {results['final_results_dir']}")
```

### 3.2 Full Pipeline with Custom Mask from Stage 1

```python
config = {
    'input_dir': './data/',
    'experiment_name': 'full_custom_mask',

    # Run both stages
    'run_stage1': True,
    'run_stage2': True,

    'stage2': {
        'mask_source': 'stage1',  # Use Stage 1 output

        # Customize extractor
        'extractor': {
            'center_size': 15,
            'base_percentile': 45,
            'percentile_decay': 1.2,
            'center_ratio_threshold': 0.25,
            'max_true_pixels': 30,
        }
    }
}

results = run_pipeline(config)
```

### 3.3 Stage 2 with Direct Mask Extraction

```python
config = {
    'input_dir': './data/',
    'experiment_name': 'direct_extraction',

    # Skip Stage 1
    'run_stage1': False,
    'run_stage2': True,

    'stage2': {
        'mask_source': 'extractor',  # Extract from original images

        'extractor': {
            'center_size': 12,
            'base_percentile': 50,
            'max_true_pixels': 25,
        }
    }
}

results = run_pipeline(config)
```

## Part 4: Experimenting with Parameters

### 4.1 Grid Search Over Parameters

```python
import itertools

# Define parameter grid
center_sizes = [10, 15, 20]
base_percentiles = [40, 50, 60]

# Grid search
results = []

for center_size, percentile in itertools.product(center_sizes, base_percentiles):
    extractor = StructuralNoiseExtractor(
        center_size=center_size,
        base_percentile=percentile,
    )

    mask, _ = extractor.extract_mask(patches, verbose=False)

    results.append({
        'center_size': center_size,
        'base_percentile': percentile,
        'true_pixels': np.sum(mask),
        'mask': mask,
    })

    print(f"center_size={center_size}, percentile={percentile}: "
          f"{np.sum(mask)} True pixels")

# Find best configuration (example: closest to 25 pixels)
target = 25
best = min(results, key=lambda x: abs(x['true_pixels'] - target))
print(f"\nBest config: center_size={best['center_size']}, "
      f"percentile={best['base_percentile']} "
      f"({best['true_pixels']} pixels)")

# Save best mask
np.save('./best_mask.npy', best['mask'])
```

### 4.2 Visualize Parameter Effects

```python
fig, axes = plt.subplots(3, 3, figsize=(12, 12))

for idx, result in enumerate(results):
    row = idx // 3
    col = idx % 3

    axes[row, col].imshow(result['mask'], cmap='gray', interpolation='nearest')
    axes[row, col].set_title(
        f"size={result['center_size']}, pct={result['base_percentile']}\n"
        f"{result['true_pixels']} pixels"
    )
    axes[row, col].axis('off')

plt.tight_layout()
plt.show()
```

## Part 5: Reusing Masks Across Datasets

### 5.1 Apply Mask to New Dataset

```python
# Train on dataset A
config_a = {
    'input_dir': './dataset_a/',
    'experiment_name': 'dataset_a',
}
results_a = run_pipeline(config_a)
mask_path = results_a['stage2_mask_path']

# Apply to dataset B
config_b = {
    'input_dir': './dataset_b/',
    'experiment_name': 'dataset_b_with_mask_from_a',

    'run_stage1': False,
    'run_stage2': True,

    'stage2': {
        'mask_source': 'file',
        'mask_file_path': mask_path,  # Reuse mask from dataset A
    }
}
results_b = run_pipeline(config_b)
```

### 5.2 Create Mask Library

```python
# Create masks for different noise types
from autoStructN2V.utils.mask_utils import batch_create_masks

input_dirs = {
    'vertical_lines': './data/vertical_noise/',
    'horizontal_lines': './data/horizontal_noise/',
    'grid_pattern': './data/grid_noise/',
}

extractor_configs = {
    'vertical_lines': {
        'center_size': 15,
        'base_percentile': 50,
    },
    'horizontal_lines': {
        'center_size': 15,
        'base_percentile': 50,
    },
    'grid_pattern': {
        'center_size': 20,
        'base_percentile': 45,
    },
}

# Create all masks
mask_paths = batch_create_masks(
    input_dirs=input_dirs,
    output_dir='./mask_library/',
    extractor_configs=extractor_configs
)

print("Created masks:")
for name, path in mask_paths.items():
    print(f"  {name}: {path}")
```

## Part 6: Advanced Techniques

### 6.1 Manual Mask Creation

```python
# Create a mask manually for known pattern
# Example: Vertical lines every 8 pixels

mask_size = 17  # Must be odd
mask = np.zeros((mask_size, mask_size), dtype=bool)

# Center pixel
center = mask_size // 2
mask[center, center] = True

# Vertical line at ±8 pixels
mask[center, center - 8] = True
mask[center, center + 8] = True

# Save
np.save('./manual_vertical_mask.npy', mask)

# Visualize
plt.figure(figsize=(6, 6))
plt.imshow(mask, cmap='gray', interpolation='nearest')
plt.title("Manual Vertical Line Mask")
plt.colorbar()
plt.show()
```

### 6.2 Combine Multiple Masks

```python
# Load multiple masks
mask1 = np.load('./mask_vertical.npy')
mask2 = np.load('./mask_horizontal.npy')

# Combine (union)
combined_mask = mask1 | mask2

# Limit size
if np.sum(combined_mask) > 30:
    # Keep only highest autocorrelation values
    # (requires autocorrelation values from extraction)
    pass

np.save('./combined_mask.npy', combined_mask)
```

### 6.3 Mask Refinement

```python
from scipy.ndimage import binary_erosion, binary_dilation

mask = np.load('./custom_mask.npy')

# Erode (make smaller, more conservative)
mask_eroded = binary_erosion(mask)

# Dilate (make larger, more aggressive)
mask_dilated = binary_dilation(mask)

# Visualize
fig, axes = plt.subplots(1, 3, figsize=(15, 5))

axes[0].imshow(mask_eroded, cmap='gray')
axes[0].set_title(f"Eroded ({np.sum(mask_eroded)} pixels)")

axes[1].imshow(mask, cmap='gray')
axes[1].set_title(f"Original ({np.sum(mask)} pixels)")

axes[2].imshow(mask_dilated, cmap='gray')
axes[2].set_title(f"Dilated ({np.sum(mask_dilated)} pixels)")

for ax in axes:
    ax.axis('off')

plt.tight_layout()
plt.show()
```

## Best Practices

1. **Start with defaults**: Try automatic extraction first
2. **Visualize**: Always visualize masks before using
3. **Experiment**: Try multiple configurations
4. **Validate**: Check mask properties
5. **Document**: Keep notes on what works for your data
6. **Reuse**: Build a library of validated masks

## Common Patterns

### Pattern 1: Conservative Mask

For subtle structured noise:
```python
extractor = StructuralNoiseExtractor(
    center_size=10,
    base_percentile=65,
    max_true_pixels=15,
)
```

### Pattern 2: Aggressive Mask

For strong structured noise:
```python
extractor = StructuralNoiseExtractor(
    center_size=20,
    base_percentile=35,
    max_true_pixels=40,
)
```

### Pattern 3: Balanced Mask

For general use:
```python
extractor = StructuralNoiseExtractor(
    center_size=12,
    base_percentile=50,
    max_true_pixels=25,
)
```

## See Also

- [Structural Mask Extraction](../concepts/structural-mask-extraction.md) - Algorithm details
- [Configuration Reference](../user-guide/configuration.md#extractor-parameters) - All parameters
- [API Reference: Masking](../api-reference/masking.md) - Technical documentation
- [Advanced Configuration Tutorial](advanced-configuration.md) - Advanced scenarios

---

**Next Tutorial**: [Advanced Configuration](advanced-configuration.md) for complex scenarios.
