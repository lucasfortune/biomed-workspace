# Utils API Reference

Utility functions for image processing, patching, training, and masks.

## Module: `utils.image`

### Function: `get_image_paths(directory)`

Get all TIFF file paths in directory.

**Parameters:**
- `directory` (str): Directory path

**Returns:**
- list: Absolute paths to TIFF files

**Raises:**
- `FileNotFoundError`: Directory doesn't exist
- `ValueError`: No TIFF files found

---

### Function: `verify_image(image_path)`

Verify image file is valid and readable.

**Parameters:**
- `image_path` (str): Image path

**Returns:**
- tuple: (is_valid, message)

---

### Function: `load_and_normalize_image(img_path)`

Load and normalize image to [0,1].

**Parameters:**
- `img_path` (str): Image path

**Returns:**
- np.ndarray: Float32 2D array in [0,1]

**Raises:**
- `FileNotFoundError`: File doesn't exist
- `ValueError`: Invalid image format

**Supports:** 8-bit, 16-bit, float images

**Example:**
```python
from autoStructN2V.utils.image import load_and_normalize_image

img = load_and_normalize_image('image.tif')
print(img.shape, img.dtype, img.min(), img.max())
```

---

### Function: `load_and_preprocess_image(img_path, sigma=300, scale_factor=0.25)`

Load, scale, filter, and enhance image for ROI detection.

**Parameters:**
- `img_path` (str): Image path
- `sigma` (float): Gaussian filter sigma
- `scale_factor` (float): Scale factor

**Returns:**
- np.ndarray: Preprocessed image

**Process:** Scale → Gaussian filter → Histogram equalization

---

### Function: `calculate_autocorrelation(image, normalize=True, log_transform=True, crop_size=None)`

Calculate autocorrelation of image patch.

**Parameters:**
- `image` (np.ndarray): 2D image
- `normalize` (bool): Normalize by zero-lag
- `log_transform` (bool): Apply log transform
- `crop_size` (int, optional): Size of central region

**Returns:**
- np.ndarray: Central autocorrelation

**Uses:** FFT-based convolution for efficiency

---

## Module: `utils.patching`

### Function: `image_to_patches(image, patch_size, stride)`

Convert image to overlapping patches.

**Parameters:**
- `image` (torch.Tensor): Image (C, H, W)
- `patch_size` (int): Patch size
- `stride` (int): Stride between patches

**Returns:**
- torch.Tensor: Patches (N, C, patch_size, patch_size)

**Example:**
```python
from autoStructN2V.utils.patching import image_to_patches

patches = image_to_patches(image_tensor, patch_size=64, stride=32)
```

---

### Function: `patches_to_image(patches, image_size, patch_size, stride)`

Reconstruct image from patches with weighted averaging.

**Parameters:**
- `patches` (torch.Tensor): Patches (N, C, patch_size, patch_size)
- `image_size` (tuple): Original size (C, H, W)
- `patch_size` (int): Patch size
- `stride` (int): Stride used

**Returns:**
- torch.Tensor: Reconstructed image (C, H, W)

**Method:** Weighted average with center-weighted mask

---

### Function: `create_weight_mask(patch_size, alpha=1)`

Create weight mask for blending patches.

**Parameters:**
- `patch_size` (int): Patch size
- `alpha` (float): Falloff exponent

**Returns:**
- torch.Tensor: Weight mask (patch_size, patch_size)

---

### Function: `find_roi_patches(img, patch_size, threshold=0.2, above_threshold=False, max_patches=10000, scale_factor=1.0, overlap=0.5)`

Find ROI patches in image.

**Parameters:**
- `img` (np.ndarray): Image in [0,1]
- `patch_size` (int): Patch size
- `threshold` (float): Intensity threshold
- `above_threshold` (bool): Select above vs below
- `max_patches` (int): Max patches to return
- `scale_factor` (float): Coordinate scaling
- `overlap` (float): Patch overlap fraction

**Returns:**
- list: List of (top, left) coordinates

---

## Module: `utils.training`

### Function: `set_seed(seed)`

Set random seeds for reproducibility.

**Parameters:**
- `seed` (int): Random seed

**Sets:** Python random, NumPy, PyTorch, CUDA

**Enables:** Deterministic mode

**Example:**
```python
from autoStructN2V.utils.training import set_seed

set_seed(42)  # Reproducible results
```

---

### Function: `validate_architecture_params(hparams)`

Validate architecture parameters work together.

**Parameters:**
- `hparams` (dict): Hyperparameters

**Raises:**
- `ValueError`: Invalid configuration

---

### Function: `get_balanced_hparams(hparams)`

Adjust and validate relationships between stages.

**Parameters:**
- `hparams` (dict): Hyperparameters

**Returns:**
- dict: Adjusted hyperparameters

---

### Function: `estimate_memory_requirements(hparams)`

Estimate GPU memory requirements.

**Parameters:**
- `hparams` (dict): Hyperparameters

**Returns:**
- float: Estimated MB

---

### Function: `cleanup(doc=False)`

Clean up PyTorch objects and free memory.

**Parameters:**
- `doc` (bool): Print status messages

**Cleans:** Loaders, models, optimizers, CUDA cache

---

## Module: `utils.mask_utils`

### Function: `create_mask_from_images(image_paths, output_path, extractor_config=None, max_images=10, patches_per_image=50, patch_size=64, verbose=True)`

Create and save structural mask from images.

**Parameters:**
- `image_paths` (list): Image paths
- `output_path` (str): Save path (.npy)
- `extractor_config` (dict, optional): StructuralNoiseExtractor config
- `max_images` (int): Max images to use
- `patches_per_image` (int): Patches per image
- `patch_size` (int): Patch size
- `verbose` (bool): Verbose output

**Returns:**
- np.ndarray: Generated mask

**Example:**
```python
from autoStructN2V.utils.mask_utils import create_mask_from_images

mask = create_mask_from_images(
    image_paths=['img1.tif', 'img2.tif'],
    output_path='./custom_mask.npy',
    verbose=True
)
```

---

### Function: `load_and_validate_mask(mask_path, expected_shape=None, verbose=True)`

Load and validate mask from file.

**Parameters:**
- `mask_path` (str): Mask file path
- `expected_shape` (tuple, optional): Expected shape
- `verbose` (bool): Print validation

**Returns:**
- np.ndarray: Validated mask

---

### Function: `visualize_mask(mask, title='Mask Visualization', save_path=None)`

Visualize mask with detailed information.

**Parameters:**
- `mask` (np.ndarray): Mask to visualize
- `title` (str): Plot title
- `save_path` (str, optional): Save path

---

### Function: `compare_masks(mask1, mask2, labels=['Mask 1', 'Mask 2'], save_path=None)`

Compare two masks side by side.

**Parameters:**
- `mask1`, `mask2` (np.ndarray): Masks to compare
- `labels` (list): Labels
- `save_path` (str, optional): Save path

**Shows:** Difference, overlap, Jaccard index

---

### Function: `batch_create_masks(input_dir, output_dir, extractor_configs, image_extension='.tif')`

Create multiple masks with different configs.

**Parameters:**
- `input_dir` (str): Input directory
- `output_dir` (str): Output directory
- `extractor_configs` (dict): {name: config} dictionary
- `image_extension` (str): Image extension

**Returns:**
- dict: {name: mask_path}

---

**See Also:**
- [Pipeline Module](pipeline.md)
- [Datasets Module](datasets.md)
- [Masking Module](masking.md)
