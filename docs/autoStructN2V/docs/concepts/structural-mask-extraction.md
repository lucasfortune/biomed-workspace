# Structural Mask Extraction

Detailed explanation of how structural noise patterns are automatically extracted using autocorrelation analysis.

## Overview

The `StructuralNoiseExtractor` class automatically identifies structural noise patterns in images using autocorrelation analysis and ring-based thresholding.

**Input**: Collection of noisy image patches
**Output**: Binary mask representing the structural noise pattern

## Why Autocorrelation?

### The Problem

Structured noise has spatial correlation—nearby pixels have related noise values. We need to identify this spatial structure.

### The Solution

**Autocorrelation** measures how similar an image is to shifted versions of itself:
- High autocorrelation at offset (dx, dy) → pattern repeats at that offset
- Analyzing autocorrelation reveals periodicity and structure

### Example

For a vertical line pattern:
```
Image:           Autocorrelation:
|  |  |          •  ·  •  ·  •
|  |  |    →     •  ·  •  ·  •
|  |  |          •  ·  •  ·  •

Strong correlation at horizontal offsets where lines align
```

## Extraction Algorithm

### Step 1: Compute Autocorrelations

For each image patch:

1. **Zero-pad** to prevent edge effects
2. **FFT-based convolution**:
   ```python
   autocorr = ifft2(abs(fft2(image))^2)
   ```
3. **Shift** so zero-lag is at center
4. **Normalize** by zero-lag value (makes values between 0 and 1)
5. **Log transform** for better visualization:
   ```python
   autocorr = log(1 + autocorr)
   ```

### Step 2: Average Autocorrelations

Average across all patches:
```python
mean_autocorr = mean(autocorrelations, axis=0)
```

This reinforces consistent patterns and suppresses random variations.

### Step 3: Crop and Adapt Center Region

1. **Crop** to center square (size = `center_size`):
   ```python
   center = mean_autocorr[center-size/2 : center+size/2,
                          center-size/2 : center+size/2]
   ```

2. **Adaptive thresholding** (if `adapt_autocorr=True`):
   ```python
   for each pixel at distance d from center:
       threshold = adapt_CB / (1 + adapt_DF * d)
       center[pixel] = center[pixel] if center[pixel] > threshold else 0
   ```

   This suppresses low values far from center.

3. **Normalize** to [0, 1] range

### Step 4: Ring-Based Analysis

Process concentric rings from center outward:

```
Ring structure:
[4 4 4 4 4]
[4 3 3 3 4]
[4 3 2 3 4]  ← Center (highest priority)
[4 3 3 3 4]
[4 4 4 4 4]
```

For each ring (from innermost to outermost):

1. **Get ring pixels**: All pixels at distance = ring_idx

2. **Calculate threshold**:
   ```python
   percentile = base_percentile * (percentile_decay ^ ring_idx)
   threshold = percentile(center[ring], percentile)
   ```

   Threshold increases with distance (stricter for outer rings).

3. **Center ratio check**:
   ```python
   max_ring_value = max(center[ring])
   center_value = center[center_position]
   ratio = max_ring_value / center_value

   if ratio > center_ratio_threshold:
       mark pixels above threshold as True
   ```

4. **Center proximity check** (if `use_center_proximity=True`):
   ```python
   for each True pixel:
       proximity = value / center_value
       if proximity < center_proximity_threshold:
           mark pixel as False
   ```

### Step 5: Post-Processing

1. **Keep center component only** (if `keep_center_component_only=True`):
   ```python
   connected_components = label(binary_mask)
   center_component = connected_components[center_position]
   binary_mask = (connected_components == center_component)
   ```

2. **Limit mask size** (if `max_true_pixels` specified):
   ```python
   if count(True) > max_true_pixels:
       keep top max_true_pixels by autocorrelation value
   ```

3. **Return** (binary_mask, processed_center)

## Parameters Explained

### Autocorrelation Processing

| Parameter | Default | Effect |
|-----------|---------|--------|
| `norm_autocorr` | True | Normalize by zero-lag (recommended) |
| `log_autocorr` | True | Log transform for better visualization |
| `crop_autocorr` | True | Focus on central region |
| `adapt_autocorr` | True | Adaptive threshold by distance |
| `adapt_CB` | 50.0 | Base coefficient for adaptive threshold |
| `adapt_DF` | 0.95 | Distance decay factor |

**Tuning**:
- Higher `adapt_CB`: More aggressive suppression of weak correlations
- Higher `adapt_DF`: Faster decay with distance

### Ring Analysis

| Parameter | Default | Effect |
|-----------|---------|--------|
| `center_size` | 10 | Size of analysis region |
| `base_percentile` | 50 | Base threshold percentile |
| `percentile_decay` | 1.15 | Threshold increase per ring |
| `center_ratio_threshold` | 0.3 | Min ring/center ratio |

**Tuning**:
- Larger `center_size`: Capture larger patterns
- Lower `base_percentile`: Include more pixels (more lenient)
- Higher `percentile_decay`: Outer rings harder to include
- Lower `center_ratio_threshold`: Include weaker patterns

### Selection Criteria

| Parameter | Default | Effect |
|-----------|---------|--------|
| `use_center_proximity` | True | Require closeness to center value |
| `center_proximity_threshold` | 0.95 | Min value/center_value ratio |

**Tuning**:
- Lower threshold: Include more pixels

### Post-Processing

| Parameter | Default | Effect |
|-----------|---------|--------|
| `keep_center_component_only` | True | Discard disconnected components |
| `max_true_pixels` | 25 | Maximum mask pixels |

**Tuning**:
- Higher `max_true_pixels`: Allow larger patterns

## Example Walkthrough

### Scenario: Vertical Scan Lines

**Input**: Images with vertical scan lines every 8 pixels

#### Step 1: Autocorrelation

```
Autocorrelation shows:
- Strong peak at center (0, 0)
- Peaks at (±8, 0), (±16, 0), ... (vertical periodicity)
- Weak values elsewhere
```

#### Step 2: After Cropping (center_size=15)

```
15x15 region:
. . . • . . . • . . . • . . .
. . . • . . . • . . . • . . .
. . . • . . . • . . . • . . .
• • • ◉ • • • ◉ • • • ◉ • • •  ← center row
. . . • . . . • . . . • . . .
. . . • . . . • . . . • . . .
. . . • . . . • . . . • . . .
      ↑       ↑
      8 pixels apart
```

#### Step 3: Ring Processing

```
Ring 0 (center): Always True
Ring 1: Check nearby pixels (1 pixel away)
Ring 2: Check pixels 2 pixels away
...
Ring 8: Strong peak → True
Ring 16: Another peak → True
```

#### Step 4: Result

```
Binary mask:
F F F F F F F F F F F F F F F
F F F F F F F F F F F F F F F
F F F F F F F F F F F F F F F
F F F F F F F T F F F F F F F
F F F F F F T T T F F F F F F
F F F F F F F T F F F F F F F
F F F F F F F F F F F F F F F
F F F F F F F F F F F F F F F

Captures vertical structure!
```

## Tuning for Different Noise Types

### Fine Structured Noise (Small Patterns)

```python
'extractor': {
    'center_size': 7,              # Smaller analysis region
    'base_percentile': 60,         # Stricter threshold
    'max_true_pixels': 15,         # Smaller mask
}
```

### Coarse Structured Noise (Large Patterns)

```python
'extractor': {
    'center_size': 21,             # Larger analysis region
    'base_percentile': 40,         # More lenient
    'max_true_pixels': 40,         # Larger mask
}
```

### Weak Structured Noise

```python
'extractor': {
    'base_percentile': 30,         # Very lenient
    'center_ratio_threshold': 0.1, # Low ratio requirement
    'use_center_proximity': False, # Disable proximity check
}
```

### Strong Structured Noise

```python
'extractor': {
    'base_percentile': 70,         # Strict threshold
    'center_ratio_threshold': 0.5, # High ratio requirement
    'max_true_pixels': 20,         # Keep only strongest
}
```

## Common Patterns Detected

### Horizontal Lines

```
Mask:
F F F F F F F
F F F F F F F
T T T T T T T  ← Horizontal structure
F F F F F F F
```

### Vertical Lines

```
Mask:
F F F T F F F
F F F T F F F  ← Vertical structure
F F F T F F F
```

### Grid Pattern

```
Mask:
F F T F F
F F T F F
T T T T T
F F T F F
F F T F F
```

### Diagonal Pattern

```
Mask:
T F F F F
F T F F F
F F T F F  ← Diagonal structure
F F F T F
F F F F T
```

## Troubleshooting

### Problem: Mask Too Small

**Symptoms**: Not all structured noise captured

**Solutions**:
```python
'extractor': {
    'base_percentile': 40,        # From 50
    'max_true_pixels': 35,        # From 25
    'center_ratio_threshold': 0.2,# From 0.3
}
```

### Problem: Mask Too Large

**Symptoms**: Includes non-noise structures

**Solutions**:
```python
'extractor': {
    'base_percentile': 65,        # From 50
    'max_true_pixels': 15,        # From 25
    'center_ratio_threshold': 0.4,# From 0.3
}
```

### Problem: No Pattern Detected

**Symptoms**: Mask is empty or just center pixel

**Solutions**:
```python
'extractor': {
    'adapt_autocorr': False,      # Disable adaptive threshold
    'base_percentile': 25,        # Very lenient
    'use_center_proximity': False,
}
```

### Problem: Capturing Random Noise

**Symptoms**: Mask is scattered, not structured

**Solutions**:
```python
'extractor': {
    'keep_center_component_only': True,  # Ensure connected
    'base_percentile': 70,               # Stricter
    'center_ratio_threshold': 0.5,       # Higher
}
```

## Visualization

Enable verbose mode to see extraction process:

```python
config = {
    'verbose': True,
    'stage2': {
        'mask_source': 'stage1',
        # or 'extractor'
    }
}
results = run_pipeline(config)
```

This shows:
1. Autocorrelation center region (heatmap)
2. Ring processing progress
3. Final binary mask
4. Mask statistics

## Implementation Notes

### Computational Complexity

- **Autocorrelation**: O(N log N) per patch via FFT
- **Ring processing**: O(center_size²)
- **Total**: Depends on number of patches

For 100 patches of 64x64:
- ~1-2 seconds on modern CPU
- Cached for reuse

### Memory Usage

- Stores autocorrelations: `(num_patches, center_size, center_size)`
- For 100 patches, 15x15 center: ~4 MB
- Negligible compared to training

## Advanced Usage

### Manual Mask Creation

```python
from autoStructN2V.masking import StructuralNoiseExtractor
import numpy as np

# Load patches
patches = ...  # Shape: (N, H, W)

# Configure extractor
extractor = StructuralNoiseExtractor(
    center_size=15,
    base_percentile=50,
    # ... other parameters
)

# Extract mask
mask, autocorr_center = extractor.extract_mask(patches, verbose=True)

# Save mask
np.save('custom_mask.npy', mask)
```

### Compare Different Settings

```python
from autoStructN2V.utils.mask_utils import compare_masks

extractor1 = StructuralNoiseExtractor(base_percentile=40)
extractor2 = StructuralNoiseExtractor(base_percentile=60)

mask1, _ = extractor1.extract_mask(patches)
mask2, _ = extractor2.extract_mask(patches)

compare_masks(mask1, mask2, labels=["Lenient", "Strict"])
```

## See Also

- [Two-Stage Approach](two-stage-approach.md) - How masks are used in training
- [Configuration Reference](../user-guide/configuration.md#extractor-parameters) - All extractor parameters
- [Custom Masks Tutorial](../tutorials/custom-masks.md) - Creating and using custom masks
- [API Reference: Masking Module](../api-reference/masking.md) - Technical API details

---

**Next**: [ROI Selection](roi-selection.md) for intelligent patch selection.
