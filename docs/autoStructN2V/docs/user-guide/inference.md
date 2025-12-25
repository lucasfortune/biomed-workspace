# Inference Guide

Guide to using trained autoStructN2V models for denoising new images.

## Overview

After training, you can use trained models to denoise new images. autoStructN2V provides:

- **Automatic inference** via `run_pipeline()` (denoises training/val/test splits)
- **Manual inference** via `AutoStructN2VPredictor` class (denoise arbitrary images)

## Automatic Inference (via Pipeline)

The pipeline automatically applies trained models to all images:

```python
from autoStructN2V.pipeline import run_pipeline

config = {
    'input_dir': './data/',
    'experiment_name': 'my_experiment',
}

results = run_pipeline(config)

# Denoised images saved to:
print(results['final_results_dir'])
# -> ./results/my_experiment/final_results/
```

**Output Structure**:
```
final_results/
├── train/
│   ├── image_001_denoised.tif
│   ├── image_002_denoised.tif
│   └── ...
├── val/
│   └── ...
└── test/
    └── ...
```

## Manual Inference

Use `AutoStructN2VPredictor` to denoise specific images with a trained model.

### Basic Usage

```python
from autoStructN2V.inference import AutoStructN2VPredictor
from autoStructN2V.models import create_model
import torch

# Load model
model = create_model('stage2', features=64, num_layers=2)
checkpoint = torch.load('results/my_experiment/stage2/model/stage2_model.pth')
model.load_state_dict(checkpoint['model_state_dict'])
model.eval()

# Create predictor
predictor = AutoStructN2VPredictor(
    model=model,
    device='cuda',
    patch_size=64,
    stride=32,  # Overlap for smoother results
)

# Denoise single image
denoised = predictor.denoise_image(
    image_path='noisy_image.tif',
    output_path='denoised_image.tif',
    show=True  # Display result
)
```

### Denoise Directory

Process all images in a directory:

```python
predictor = AutoStructN2VPredictor(model=model, patch_size=64)

output_paths = predictor.process_directory(
    input_dir='./new_noisy_images/',
    output_dir='./denoised_outputs/',
    show=False
)

print(f"Processed {len(output_paths)} images")
```

### Load from Checkpoint

Simplified loading from checkpoint:

```python
from autoStructN2V.inference import AutoStructN2VPredictor
from autoStructN2V.models import AutoStructN2VModel

predictor = AutoStructN2VPredictor.from_checkpoint(
    checkpoint_path='results/my_experiment/stage2/model/stage2_model.pth',
    model_class=AutoStructN2VModel,
    stage='stage2',
    patch_size=64,
    device='cuda'
)

# Ready to use
denoised = predictor.denoise_image('input.tif', 'output.tif')
```

## Patch-Based Processing

Large images are processed in overlapping patches for memory efficiency and smooth results.

### How It Works

1. **Patch Extraction**: Image divided into overlapping patches
2. **Inference**: Each patch denoised independently
3. **Reconstruction**: Patches blended using weighted averaging
4. **Overlap**: Ensures smooth transitions between patches

### Configuration

```python
predictor = AutoStructN2VPredictor(
    model=model,
    patch_size=64,    # Size of patches
    stride=32,        # Overlap: stride < patch_size
    device='cuda'
)
```

**Stride Guidelines**:
- `stride = patch_size`: No overlap (fastest, may have seams)
- `stride = patch_size // 2`: 50% overlap (recommended)
- `stride = patch_size // 4`: 75% overlap (smoothest, slowest)

### Memory Management

For very large images:

```python
# Use smaller patches and less overlap
predictor = AutoStructN2VPredictor(
    model=model,
    patch_size=48,   # Smaller patches
    stride=40,       # Less overlap
)
```

## Denoise Custom Images

### Single Image

```python
import numpy as np
from PIL import Image

# Option 1: From file
denoised = predictor.denoise_image('input.tif', 'output.tif')

# Option 2: From array
from autoStructN2V.utils.image import load_and_normalize_image

img_array = load_and_normalize_image('input.tif')
img_tensor = torch.from_numpy(img_array).unsqueeze(0).unsqueeze(0)  # Add batch and channel dims
denoised_tensor = predictor.denoise_tensor(img_tensor)
denoised_array = denoised_tensor.squeeze().cpu().numpy()

# Save
Image.fromarray((denoised_array * 255).astype(np.uint8)).save('output.tif')
```

### Batch Processing

```python
import glob

input_files = glob.glob('./data/*.tif')

for input_path in input_files:
    output_path = input_path.replace('.tif', '_denoised.tif')
    predictor.denoise_image(input_path, output_path, show=False)
    print(f"Processed: {input_path}")
```

### Process with Progress Bar

```python
from tqdm import tqdm

input_files = glob.glob('./data/*.tif')

for input_path in tqdm(input_files, desc="Denoising"):
    output_path = input_path.replace('.tif', '_denoised.tif')
    predictor.denoise_image(input_path, output_path, show=False)
```

## Visualization

### Display Results

```python
from autoStructN2V.inference import visualize_denoising_result
from autoStructN2V.utils.image import load_and_normalize_image

original = load_and_normalize_image('noisy.tif')
denoised = load_and_normalize_image('denoised.tif')

fig = visualize_denoising_result(
    original=original,
    denoised=denoised,
    title="Denoising Result",
    figsize=(12, 6)
)

# Save figure
fig.savefig('comparison.png', dpi=300)
```

### Compare Multiple Results

```python
from autoStructN2V.inference import compare_multiple_images

images = [
    load_and_normalize_image('original.tif'),
    load_and_normalize_image('stage1_output.tif'),
    load_and_normalize_image('stage2_output.tif'),
]

titles = ['Original', 'Stage 1', 'Stage 2']

fig = compare_multiple_images(
    image_arrays=images,
    titles=titles,
    figsize=(15, 5)
)
```

### Create Difference Map

```python
from autoStructN2V.inference import create_difference_map

diff_map = create_difference_map(
    original=original,
    denoised=denoised,
    enhanced=True  # Enhance contrast for visibility
)

import matplotlib.pyplot as plt
plt.figure(figsize=(8, 8))
plt.imshow(diff_map, cmap='RdBu_r')
plt.colorbar()
plt.title("Noise Removed")
plt.show()
```

## Stage Selection

### Use Stage 1 Output

For general noise removal:

```python
# Load Stage 1 model
model = create_model('stage1', features=64, num_layers=2)
checkpoint = torch.load('results/exp/stage1/model/stage1_model.pth')
model.load_state_dict(checkpoint['model_state_dict'])

predictor = AutoStructN2VPredictor(model=model, patch_size=32)
denoised = predictor.denoise_image('input.tif', 'stage1_output.tif')
```

### Use Stage 2 Output (Recommended)

For complete denoising (random + structured noise):

```python
# Load Stage 2 model
model = create_model('stage2', features=64, num_layers=2)
checkpoint = torch.load('results/exp/stage2/model/stage2_model.pth')
model.load_state_dict(checkpoint['model_state_dict'])

predictor = AutoStructN2VPredictor(model=model, patch_size=64)
denoised = predictor.denoise_image('input.tif', 'stage2_output.tif')
```

### Sequential Application

Apply Stage 1 then Stage 2:

```python
# Stage 1
predictor1 = AutoStructN2VPredictor(model=model1, patch_size=32)
intermediate = predictor1.denoise_image('input.tif', 'stage1_temp.tif')

# Stage 2 on Stage 1 output
predictor2 = AutoStructN2VPredictor(model=model2, patch_size=64)
final = predictor2.denoise_image('stage1_temp.tif', 'final.tif')
```

**Note**: This is equivalent to what the pipeline does automatically.

## Working with Different Image Formats

### 16-bit Images

```python
# Load, denoise, save 16-bit
from autoStructN2V.utils.image import load_and_normalize_image
from PIL import Image
import numpy as np

# Load (normalizes to [0, 1])
img = load_and_normalize_image('16bit_input.tif')

# Denoise
img_tensor = torch.from_numpy(img).unsqueeze(0).unsqueeze(0).float()
denoised_tensor = predictor.denoise_tensor(img_tensor)
denoised = denoised_tensor.squeeze().cpu().numpy()

# Save as 16-bit
denoised_16bit = (denoised * 65535).astype(np.uint16)
Image.fromarray(denoised_16bit).save('16bit_output.tif')
```

### Float Images

```python
# Already in [0, 1] range
img = load_and_normalize_image('float_input.tif')  # Handles automatically

# Denoise
img_tensor = torch.from_numpy(img).unsqueeze(0).unsqueeze(0).float()
denoised_tensor = predictor.denoise_tensor(img_tensor)
denoised = denoised_tensor.squeeze().cpu().numpy()

# Save as float
Image.fromarray(denoised.astype(np.float32)).save('float_output.tif')
```

### Multi-page TIFF

```python
from PIL import Image
import numpy as np

# Load multi-page TIFF
img = Image.open('multipage.tif')
denoised_pages = []

for i in range(img.n_frames):
    img.seek(i)
    page = np.array(img).astype(np.float32) / 255.0

    # Denoise this page
    page_tensor = torch.from_numpy(page).unsqueeze(0).unsqueeze(0)
    denoised_tensor = predictor.denoise_tensor(page_tensor)
    denoised_page = denoised_tensor.squeeze().cpu().numpy()

    denoised_pages.append((denoised_page * 255).astype(np.uint8))

# Save multi-page output
denoised_pages[0].save(
    'multipage_denoised.tif',
    save_all=True,
    append_images=denoised_pages[1:]
)
```

## Performance Optimization

### GPU Utilization

```python
# Ensure model is on GPU
model = model.to('cuda')
predictor = AutoStructN2VPredictor(model=model, device='cuda')
```

### Batch Processing with DataLoader

For many images, use DataLoader for better GPU utilization:

```python
from torch.utils.data import DataLoader
from autoStructN2V.datasets import TestDataset

# Create dataset
test_dataset = TestDataset(image_paths=['img1.tif', 'img2.tif', 'img3.tif'])
test_loader = DataLoader(test_dataset, batch_size=4, num_workers=2)

# Process batches
model.eval()
with torch.no_grad():
    for batch_idx, (inputs, _, _) in enumerate(test_loader):
        inputs = inputs.to('cuda')
        outputs = model(inputs)
        # Save outputs...
```

### Mixed Precision

For faster inference (requires PyTorch >= 1.6):

```python
import torch

model = model.to('cuda')
model.eval()

with torch.cuda.amp.autocast():
    with torch.no_grad():
        denoised = predictor.denoise_tensor(img_tensor.to('cuda'))
```

## Quality Assessment

### Visual Inspection

Always visually inspect results:

```python
# Display side-by-side
denoised = predictor.denoise_image('input.tif', 'output.tif', show=True)
```

### Quantitative Metrics

```python
import numpy as np
from skimage.metrics import peak_signal_noise_ratio, structural_similarity

original = load_and_normalize_image('original.tif')
denoised = load_and_normalize_image('denoised.tif')

# PSNR (higher is better)
psnr = peak_signal_noise_ratio(original, denoised)
print(f"PSNR: {psnr:.2f} dB")

# SSIM (higher is better, max 1.0)
ssim = structural_similarity(original, denoised, data_range=1.0)
print(f"SSIM: {ssim:.4f}")
```

**Note**: These metrics require ground truth (noise-free reference), which is typically not available for real microscopy images.

### Signal-to-Noise Ratio Estimation

```python
# Estimate SNR improvement
original_std = np.std(original)
denoised_std = np.std(denoised)

noise_reduction = (original_std - denoised_std) / original_std * 100
print(f"Noise reduction: {noise_reduction:.1f}%")
```

## Troubleshooting

### Out of Memory During Inference

```python
# Solution 1: Smaller patches
predictor = AutoStructN2VPredictor(model=model, patch_size=32)

# Solution 2: Less overlap
predictor = AutoStructN2VPredictor(model=model, stride=56)  # From 32

# Solution 3: Process on CPU (slower)
predictor = AutoStructN2VPredictor(model=model, device='cpu')
```

### Artifacts at Patch Boundaries

```python
# Increase overlap
predictor = AutoStructN2VPredictor(
    model=model,
    patch_size=64,
    stride=32,  # 50% overlap (or lower for more overlap)
)
```

### Inconsistent Results

```python
# Ensure model is in eval mode
model.eval()

# Disable gradients
with torch.no_grad():
    denoised = predictor.denoise_tensor(img_tensor)
```

### Wrong Model Loaded

```python
# Verify checkpoint contents
checkpoint = torch.load('model.pth')
print(checkpoint.keys())
# Should contain: 'model_state_dict', 'optimizer_state_dict', 'epoch', etc.

# Check model architecture matches
model = create_model('stage2', features=64, num_layers=2)  # Must match training config
```

## Best Practices

1. **Use Stage 2 output** for final results (combines both stages)
2. **Enable overlap** (`stride < patch_size`) for smooth results
3. **Keep images normalized** to [0, 1] range
4. **Use GPU** whenever possible for faster inference
5. **Visually inspect** results before batch processing
6. **Save intermediate results** when applying stages sequentially

## See Also

- [API Reference: Inference Module](../api-reference/inference.md) - Detailed API documentation
- [API Reference: Predictor](../api-reference/inference.md#autostructn2vpredictor) - Predictor class reference
- [Pipeline Guide](pipeline.md) - Automatic inference via pipeline
- [Troubleshooting](../troubleshooting.md) - Common issues

---

**Next**: [Architecture Overview](../concepts/architecture.md) to understand system design.
