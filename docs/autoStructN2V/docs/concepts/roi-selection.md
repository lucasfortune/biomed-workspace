# ROI Selection

Intelligent patch selection based on Regions of Interest (ROI) to improve training efficiency and quality.

## Overview

Instead of extracting patches randomly, autoStructN2V can intelligently select patches from informative regions:

- **Stage 1**: Select background/empty regions to learn noise characteristics
- **Stage 2**: Select structure-rich regions where structured noise is visible

This targeted approach improves training efficiency and model quality.

## Why ROI Selection?

### The Problem

Random patch extraction may:
- Include many uninformative patches (empty regions)
- Miss important structures
- Waste computational resources
- Lead to imbalanced training

### The Solution

**ROI-based selection**:
- Analyzes image content
- Selects patches from desired regions
- Ensures diverse, informative training data
- Adapts to different stages' needs

### Benefits

1. **Faster convergence**: More informative patches
2. **Better quality**: Learn from relevant regions
3. **Efficiency**: No wasted computation on empty patches
4. **Adaptability**: Different strategies per stage

## How ROI Selection Works

### Algorithm Overview

```
Input Image
     ↓
Preprocessing (downscale, filter, enhance)
     ↓
Sliding Window Analysis
     ↓
Intensity-Based Thresholding
     ↓
Select Patches Above/Below Threshold
     ↓
Return Patch Coordinates
```

### Step 1: Preprocessing

Transform image for efficient analysis:

1. **Downscale** by `scale_factor` (e.g., 4×):
   ```python
   small_img = rescale(image, scale_factor=0.25)
   ```
   Reduces computation, captures large-scale structure

2. **Gaussian filtering** (σ=300):
   ```python
   filtered = gaussian_filter(small_img, sigma=300)
   ```
   Smooths noise, emphasizes large structures

3. **Histogram equalization**:
   ```python
   enhanced = equalize_adapthist(filtered)
   ```
   Enhances contrast, makes threshold more effective

### Step 2: Sliding Window

Slide window across preprocessed image:

```python
stride = patch_size * (1 - overlap)  # Default overlap=0.5

for y in range(0, height, stride):
    for x in range(0, width, stride):
        patch = enhanced[y:y+patch_size, x:x+patch_size]
        mean_intensity = np.mean(patch)

        if (above_threshold and mean_intensity > roi_threshold) or \
           (not above_threshold and mean_intensity < roi_threshold):
            patch_coords.append((y, x))
```

### Step 3: Intensity Thresholding

Compare mean intensity to `roi_threshold`:

**For Background Selection** (`select_background=True`):
```python
if mean_intensity < roi_threshold:
    select_this_patch  # Low intensity = background
```

**For Structure Selection** (`select_background=False`):
```python
if mean_intensity > roi_threshold:
    select_this_patch  # High intensity = structures
```

### Step 4: Coordinate Scaling

Convert coordinates back to original scale:

```python
original_coords = (y / scale_factor, x / scale_factor)
```

## Configuration Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `use_roi` | True (Stage 1), False (Stage 2) | Enable ROI selection |
| `roi_threshold` | 0.5 | Intensity threshold (0-1 range) |
| `scale_factor` | 0.25 | Downscaling for preprocessing |
| `select_background` | True (Stage 1), False (Stage 2) | Select low vs high intensity |

## Stage-Specific Strategies

### Stage 1: Background Selection

**Goal**: Learn noise characteristics from clean regions

**Configuration**:
```python
'stage1': {
    'use_roi': True,
    'roi_threshold': 0.5,
    'scale_factor': 0.25,
    'select_background': True,  # Select low-intensity regions
}
```

**Rationale**:
- Background regions have less signal
- Noise characteristics are clearer
- Structures might confuse noise learning
- Network learns to preserve background flatness

**Example**:
```
Image (cell microscopy):
┌─────────────────────────┐
│   [background]          │  ← Select from here
│                         │
│       ████              │
│      ██████    ███      │  Avoid dense structures
│     ████████  █████     │
│      ██████    ███      │
│                         │
│   [background]          │  ← Select from here
└─────────────────────────┘
```

### Stage 2: Structure Selection

**Goal**: Learn structured noise from regions where it's visible

**Configuration**:
```python
'stage2': {
    'use_roi': True,  # Can be enabled or disabled
    'roi_threshold': 0.5,
    'select_background': False,  # Select high-intensity regions
}
```

**Rationale**:
- Structured noise often visible in signal regions
- Empty regions don't show patterns
- Learn from informative areas
- Preserve fine structures

**Example**:
```
Image with scan lines:
┌─────────────────────────┐
│ ‖ ‖ ‖ ‖ ‖ ‖ ‖ ‖ ‖ ‖ ‖  │
│       ████              │  ← Select from here
│ ‖ ‖  ██████  ‖ ███ ‖    │     (structures + lines)
│     ████████  █████     │
│ ‖ ‖  ██████  ‖ ███ ‖    │
│ ‖ ‖ ‖ ‖ ‖ ‖ ‖ ‖ ‖ ‖ ‖  │
└─────────────────────────┘
```

### Disabling ROI Selection

For random sampling:
```python
'stage1': {'use_roi': False},
'stage2': {'use_roi': False},
```

**Use when**:
- Images have uniform content
- Threshold is hard to set
- Want maximum diversity
- Faster setup (no preprocessing)

## Tuning ROI Threshold

### Finding the Right Threshold

**Too Low** (e.g., 0.2):
- Selects only darkest regions
- May miss informative areas
- Fewer patches available

**Too High** (e.g., 0.8):
- Selects only brightest regions
- May include too much
- Less selective

**Just Right** (0.4-0.6):
- Balances selection and diversity
- Adapts to image content
- Usually works well

### Threshold by Image Type

| Image Type | Recommended Threshold |
|------------|----------------------|
| High contrast (bright structures on dark background) | 0.3-0.5 |
| Low contrast (subtle structures) | 0.5-0.7 |
| Uniform content | Disable ROI |
| Very sparse structures | 0.2-0.4 (background) or 0.7-0.9 (structures) |

### Adaptive Approach

```python
import numpy as np
from autoStructN2V.utils.image import load_and_normalize_image

# Load sample image
img = load_and_normalize_image('sample.tif')

# Calculate statistics
mean = np.mean(img)
median = np.median(img)

# Set threshold
roi_threshold = median  # Use median as threshold
print(f"Recommended threshold: {roi_threshold:.2f}")
```

## Visualization

### Visualize ROI Selection

```python
import matplotlib.pyplot as plt
import numpy as np
from autoStructN2V.utils.image import load_and_normalize_image, load_and_preprocess_image
from autoStructN2V.utils.patching import find_roi_patches

# Load and preprocess
img = load_and_normalize_image('image.tif')
preprocessed = load_and_preprocess_image('image.tif', scale_factor=0.25)

# Find ROI patches
patch_coords = find_roi_patches(
    preprocessed,
    patch_size=32,
    threshold=0.5,
    above_threshold=False,  # Background
    max_patches=100,
    scale_factor=0.25
)

# Visualize
fig, axes = plt.subplots(1, 2, figsize=(12, 6))

# Original image
axes[0].imshow(img, cmap='gray')
axes[0].set_title("Original Image")
axes[0].axis('off')

# With ROI overlay
axes[1].imshow(img, cmap='gray')
for y, x in patch_coords:
    rect = plt.Rectangle((x, y), 32, 32, fill=False, edgecolor='red', linewidth=1)
    axes[1].add_patch(rect)
axes[1].set_title(f"ROI Patches (n={len(patch_coords)})")
axes[1].axis('off')

plt.tight_layout()
plt.show()
```

## Performance Considerations

### Preprocessing Cost

ROI preprocessing is **cached** and reused:
- Computed once per image
- Stored in memory
- Reused for all patch extractions
- Negligible overhead (~100ms per image)

### Selection Efficiency

ROI selection is **fast**:
- Sliding window on downscaled image
- Simple intensity comparison
- Returns immediately
- Much faster than model training

### Trade-offs

| Aspect | With ROI | Without ROI |
|--------|----------|-------------|
| **Setup time** | +100ms per image | 0ms |
| **Patch quality** | Higher (targeted) | Mixed |
| **Diversity** | May be limited | Maximum |
| **Training speed** | Faster (informative) | May be slower |
| **Memory** | +small overhead | None |

## Common Patterns

### Pattern 1: Two-Stage Strategy

```python
config = {
    'stage1': {
        'use_roi': True,
        'select_background': True,   # Learn from clean areas
        'roi_threshold': 0.4,
    },
    'stage2': {
        'use_roi': True,
        'select_background': False,  # Learn from structures
        'roi_threshold': 0.6,
    }
}
```

### Pattern 2: Aggressive Selection

```python
config = {
    'stage1': {
        'use_roi': True,
        'roi_threshold': 0.3,  # Very strict background
        'select_background': True,
    }
}
```

### Pattern 3: Disable for Uniform Images

```python
config = {
    'stage1': {'use_roi': False},
    'stage2': {'use_roi': False},
}
```

## Troubleshooting

### Problem: Too Few Patches Selected

**Symptoms**: "Not enough patches" error or very slow epoch

**Solutions**:
```python
# Option 1: Adjust threshold
'stage1': {'roi_threshold': 0.6},  # More lenient

# Option 2: Disable ROI
'stage1': {'use_roi': False},

# Option 3: Increase patch extraction
'stage1': {'patches_per_image': 200},  # Try more attempts
```

### Problem: Poor Training Results

**Symptoms**: High validation loss, poor denoising

**Solutions**:
```python
# Check if patches are too homogeneous
# Try opposite selection or disable ROI

'stage1': {
    'use_roi': False,  # Get more diversity
}
```

### Problem: Slow Preprocessing

**Symptoms**: Long wait before training starts

**Solutions**:
```python
# Use larger scale factor (less downscaling)
'stage1': {
    'scale_factor': 0.5,  # From 0.25
}

# Or disable ROI
'stage1': {'use_roi': False},
```

## Best Practices

1. **Start with defaults**: ROI settings work well for most cases
2. **Visualize first**: Check what regions are selected
3. **Match to data**: Adjust threshold based on image characteristics
4. **Stage-specific**: Use different settings for each stage
5. **Monitor diversity**: Ensure sufficient patch variety
6. **Disable if uncertain**: Random sampling is safe fallback

## Advanced Usage

### Custom ROI Function

```python
from autoStructN2V.datasets.base import BaseNoiseDataset

class CustomDataset(BaseNoiseDataset):
    def custom_roi_selection(self, img_path):
        # Your custom logic
        img = self.load_image(0)

        # Example: Select based on texture
        from skimage.feature import local_binary_pattern
        lbp = local_binary_pattern(img, 8, 1)

        # Find high-texture regions
        texture_map = gaussian_filter(lbp, sigma=5)
        threshold = np.percentile(texture_map, 75)

        # Extract patch coordinates...
        return patch_coords
```

### Multi-Criterion Selection

```python
def advanced_roi_selection(img, patch_size):
    coords = []

    # Criterion 1: Intensity
    intensity_ok = (img > 0.3) & (img < 0.7)

    # Criterion 2: Gradient (edges)
    from scipy.ndimage import sobel
    gradient = np.hypot(sobel(img, axis=0), sobel(img, axis=1))
    gradient_ok = gradient > np.percentile(gradient, 25)

    # Combine criteria
    roi_mask = intensity_ok & gradient_ok

    # Extract patches from ROI
    # ... (sliding window over roi_mask)

    return coords
```

## See Also

- [Training Guide](../user-guide/training.md) - Training with ROI
- [Configuration Reference](../user-guide/configuration.md#roi-selection) - ROI parameters
- [Architecture Overview](architecture.md) - System design
- [API Reference: Datasets](../api-reference/datasets.md) - ROI implementation

---

**Next**: [Basic Usage Tutorial](../tutorials/basic-usage.md) for practical walkthrough.
