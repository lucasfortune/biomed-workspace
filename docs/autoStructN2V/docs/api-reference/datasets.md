# Datasets API Reference

PyTorch Dataset classes for loading and processing data.

## Module: `datasets.base`

### Class: `BaseNoiseDataset`

Base dataset with common functionality.

**Constructor:**
```python
BaseNoiseDataset(image_paths, patch_size=None, patches_per_image=None)
```

**Parameters:**
- `image_paths` (list): List of image file paths
- `patch_size` (int, optional): Patch size
- `patches_per_image` (int, optional): Patches per image

**Methods:**
- `__len__()`: Returns dataset length
- `load_image(idx)`: Load and normalize image at index
- `preprocess_for_roi(img_path, scale_factor)`: Preprocess for ROI detection
- `get_roi_patches(preprocessed_img, patch_size, threshold, above_threshold, scale_factor)`: Get ROI patch coordinates

---

## Module: `datasets.training`

### Class: `TrainingDataset`

Training dataset with masking and augmentation.

**Constructor:**
```python
TrainingDataset(image_paths, patch_size, kernel_size, mask, mask_percentage, 
                mask_strat=0, prediction_kernel=None, patches_per_image=100,
                use_roi=True, scale_factor=0.25, roi_threshold=0.5, 
                select_background=True, use_augmentation=True)
```

**Parameters:**
- `image_paths` (list): Image paths
- `patch_size` (int): Patch size
- `kernel_size` (int): Kernel size for local mean
- `mask` (np.ndarray): Boolean mask array
- `mask_percentage` (float): Mask percentage (0-100)
- `mask_strat` (int): Masking strategy (0=local mean, 1=zeros, 2=random)
- `prediction_kernel` (np.ndarray): Prediction kernel
- `patches_per_image` (int): Patches per image
- `use_roi` (bool): Use ROI selection
- `scale_factor` (float): ROI scale factor
- `roi_threshold` (float): ROI threshold
- `select_background` (bool): Select background vs structures
- `use_augmentation` (bool): Apply augmentation

**Methods:**
- `__getitem__(idx)`: Get training sample
  - **Returns:** (input_tensor, target_tensor, mask_tensor)

**Example:**
```python
from autoStructN2V.datasets import TrainingDataset

dataset = TrainingDataset(
    image_paths=train_paths,
    patch_size=32,
    kernel_size=3,
    mask=mask_array,
    mask_percentage=15.0,
)
```

---

## Module: `datasets.validation`

### Class: `ValidationDataset`

Validation dataset without masking.

**Constructor:**
```python
ValidationDataset(image_paths, patch_size, patches_per_image=100,
                  use_roi=False, scale_factor=0.25, roi_threshold=0.5, 
                  select_background=True)
```

**Methods:**
- `__getitem__(idx)`: Get validation sample
  - **Returns:** (input_tensor, input_tensor, ones_mask)

---

## Module: `datasets.testing`

### Class: `TestDataset`

Test dataset for full image processing.

**Constructor:**
```python
TestDataset(image_paths)
```

**Methods:**
- `__getitem__(idx)`: Get full test image
  - **Returns:** (input_tensor, input_tensor, ones_mask)

**Example:**
```python
from autoStructN2V.datasets import TestDataset

test_dataset = TestDataset(image_paths=test_paths)
test_loader = DataLoader(test_dataset, batch_size=1)
```

---

**See Also:**
- [Pipeline Data Module](pipeline.md#module-pipelinedata)
- [Training Guide](../user-guide/training.md)
