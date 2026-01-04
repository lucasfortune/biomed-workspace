# Masking API Reference

Mask creation and structural noise extraction.

## Module: `masking.kernels`

### Function: `create_stage1_mask_kernel`

Create single-pixel blind-spot kernel for Stage 1.

**Signature:**
```python
create_stage1_mask_kernel(center_size=1)
```

**Parameters:**
- `center_size` (int): Size of center True region (≥1)

**Returns:**
- np.ndarray: Boolean mask kernel

**Example:**
```python
from autoStructN2V.masking import create_stage1_mask_kernel

mask = create_stage1_mask_kernel(center_size=1)
# Returns 3x3 with False center
```

---

### Function: `create_blind_spot_kernel`

Create blind-spot kernel (True everywhere except center).

**Signature:**
```python
create_blind_spot_kernel(kernel_size)
```

---

## Module: `masking.structure`

### Class: `StructuralNoiseExtractor`

Extract structural binary masks from noisy images using autocorrelation.

**Constructor:**
```python
StructuralNoiseExtractor(norm_autocorr=True, log_autocorr=True, 
                         crop_autocorr=True, adapt_autocorr=True, 
                         adapt_CB=50.0, adapt_DF=0.95, center_size=15,
                         base_percentile=50, percentile_decay=1.15, 
                         center_ratio_threshold=0.3, use_center_proximity=False,
                         center_proximity_threshold=0.8, keep_center_component_only=True,
                         max_true_pixels=None)
```

**Parameters:**
See [Configuration Reference](../user-guide/configuration.md#extractor-parameters) for full details.

**Methods:**

#### `extract_mask(noise_patterns, verbose=False)`

Extract binary mask from noisy patterns.

**Parameters:**
- `noise_patterns` (list/np.ndarray): Noisy images or patches
- `verbose` (bool): Print extraction details

**Returns:**
- tuple: (binary_mask, center_square)
  - binary_mask: Boolean mask (e.g., 11x11)
  - center_square: Processed autocorrelation center

**Example:**
```python
from autoStructN2V.masking import StructuralNoiseExtractor

extractor = StructuralNoiseExtractor(
    center_size=15,
    base_percentile=50,
    max_true_pixels=25,
)

mask, autocorr = extractor.extract_mask(patches, verbose=True)
```

#### `clear_cache()`

Clear cached computation results.

---

## Module: `masking.utilities`

### Function: `create_full_mask`

Create full mask with random placements of single kernel.

**Signature:**
```python
create_full_mask(single_masking_kernel, patch_size, mask_percentage, verbose=False)
```

**Parameters:**
- `single_masking_kernel` (np.ndarray): Single mask pattern
- `patch_size` (int): Full mask size
- `mask_percentage` (float): Target percentage of True pixels (0-100)
- `verbose` (bool): Print details

**Returns:**
- tuple: (full_masking_kernel, prediction_kernel)
  - full_masking_kernel: Full mask with pattern placements
  - prediction_kernel: Only center points marked

**Example:**
```python
from autoStructN2V.masking import create_full_mask

full_mask, pred_kernel = create_full_mask(
    single_masking_kernel=struct_mask,
    patch_size=64,
    mask_percentage=10.0,
    verbose=True
)
```

---

### Function: `create_mask_for_training`

Convenience function for creating stage-appropriate masks.

**Signature:**
```python
create_mask_for_training(stage, kernel=None, patch_size=64, 
                         mask_percentage=15.0, **kwargs)
```

**Parameters:**
- `stage` (str): 'stage1' or 'stage2'
- `kernel` (np.ndarray, optional): Custom kernel
- `patch_size` (int): Patch size
- `mask_percentage` (float): Mask percentage
- `**kwargs`: Additional parameters

**Returns:**
- tuple: (full_mask, prediction_kernel)

---

**See Also:**
- [Structural Mask Extraction](../concepts/structural-mask-extraction.md)
- [Custom Masks Tutorial](../tutorials/custom-masks.md)
