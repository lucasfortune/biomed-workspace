# Inference API Reference

Model inference and visualization.

## Module: `inference.predictor`

### Class: `AutoStructN2VPredictor`

Predictor for applying trained models to denoise images.

**Constructor:**
```python
AutoStructN2VPredictor(model, device=None, patch_size=64, stride=None)
```

**Parameters:**
- `model` (nn.Module): Trained model
- `device` (torch.device, optional): Inference device (auto-detect if None)
- `patch_size` (int): Patch size (default: 64)
- `stride` (int, optional): Stride for patches (default: patch_size//2)

**Methods:**

#### `denoise_image(image_path, output_path=None, show=False)`

Denoise single image.

**Parameters:**
- `image_path` (str): Input image path
- `output_path` (str, optional): Output path
- `show` (bool): Display result (default: False)

**Returns:**
- numpy.ndarray: Denoised image

**Example:**
```python
from autoStructN2V.inference import AutoStructN2VPredictor

predictor = AutoStructN2VPredictor(model=model, patch_size=64)
denoised = predictor.denoise_image('noisy.tif', 'denoised.tif', show=True)
```

#### `denoise_tensor(img_tensor)`

Denoise image tensor using patch-based processing.

**Parameters:**
- `img_tensor` (torch.Tensor): Input tensor (B, C, H, W)

**Returns:**
- torch.Tensor: Denoised tensor

#### `process_directory(input_dir, output_dir=None, show=False)`

Process all TIFF images in directory.

**Parameters:**
- `input_dir` (str): Input directory
- `output_dir` (str, optional): Output directory
- `show` (bool): Display results (default: False)

**Returns:**
- list: Output image paths

**Example:**
```python
output_paths = predictor.process_directory(
    input_dir='./noisy_images/',
    output_dir='./denoised_outputs/'
)
print(f"Processed {len(output_paths)} images")
```

#### `from_checkpoint(checkpoint_path, model_class, stage, **kwargs)` [Class Method]

Create predictor from checkpoint.

**Parameters:**
- `checkpoint_path` (str): Checkpoint path
- `model_class`: Model class
- `stage` (str): 'stage1' or 'stage2'
- `**kwargs`: Additional predictor args

**Returns:**
- AutoStructN2VPredictor

**Example:**
```python
predictor = AutoStructN2VPredictor.from_checkpoint(
    checkpoint_path='stage2_model.pth',
    model_class=AutoStructN2VModel,
    stage='stage2',
    patch_size=64
)
```

---

## Module: `inference.visualization`

### Function: `visualize_denoising_result`

Visualize original vs denoised with histograms.

**Signature:**
```python
visualize_denoising_result(original, denoised, title=None, 
                           figsize=(12, 6), cmap='gray')
```

**Parameters:**
- `original` (np.ndarray): Original image
- `denoised` (np.ndarray): Denoised image
- `title` (str, optional): Figure title
- `figsize` (tuple): Figure size
- `cmap` (str): Colormap (default: 'gray')

**Returns:**
- matplotlib.figure.Figure

**Example:**
```python
from autoStructN2V.inference import visualize_denoising_result
from autoStructN2V.utils.image import load_and_normalize_image

original = load_and_normalize_image('original.tif')
denoised = load_and_normalize_image('denoised.tif')

fig = visualize_denoising_result(original, denoised, title="Results")
fig.savefig('comparison.png')
```

---

### Function: `compare_multiple_images`

Compare multiple images in grid layout.

**Signature:**
```python
compare_multiple_images(image_arrays, titles=None, 
                        figsize=(15, 10), cmap='gray')
```

**Parameters:**
- `image_arrays` (list): List of image arrays
- `titles` (list, optional): Image titles
- `figsize` (tuple): Figure size
- `cmap` (str): Colormap

**Returns:**
- matplotlib.figure.Figure

**Example:**
```python
from autoStructN2V.inference import compare_multiple_images

images = [original, stage1_output, stage2_output]
titles = ['Original', 'Stage 1', 'Stage 2']

fig = compare_multiple_images(images, titles)
```

---

### Function: `create_difference_map`

Create difference map between images.

**Signature:**
```python
create_difference_map(original, denoised, enhanced=True)
```

**Parameters:**
- `original` (np.ndarray): Original image
- `denoised` (np.ndarray): Denoised image
- `enhanced` (bool): Enhance contrast (default: True)

**Returns:**
- numpy.ndarray: Difference map

---

**See Also:**
- [Inference Guide](../user-guide/inference.md)
- [Basic Usage Tutorial](../tutorials/basic-usage.md)
