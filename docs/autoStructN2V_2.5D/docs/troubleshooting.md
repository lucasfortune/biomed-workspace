# Troubleshooting Guide

Solutions to common issues when using autoStructN2V.

## Installation Issues

### Issue: pip install fails

**Symptoms:**
```
ERROR: Could not find a version that satisfies the requirement torch>=1.8.0
```

**Solutions:**
1. Update pip: `pip install --upgrade pip`
2. Install PyTorch separately: `pip install torch torchvision`
3. Check Python version: `python --version` (need 3.7+)

---

### Issue: CUDA not available

**Symptoms:**
```
Using device: cpu
```
When you expected GPU.

**Solutions:**
1. Check CUDA installation: `nvidia-smi`
2. Install CUDA-enabled PyTorch:
   ```bash
   pip install torch torchvision --index-url https://download.pytorch.org/whl/cu118
   ```
3. Verify in Python:
   ```python
   import torch
   print(torch.cuda.is_available())
   ```

---

## Training Issues

### Issue: Out of Memory (OOM)

**Symptoms:**
```
RuntimeError: CUDA out of memory
```

**Solutions:**

**Option 1: Reduce batch size**
```python
config = {
    'stage1': {'batch_size': 2},  # From 4
    'stage2': {'batch_size': 1},  # From 2
}
```

**Option 2: Reduce patch size**
```python
config = {
    'stage1': {'patch_size': 32},  # From 64
    'stage2': {'patch_size': 48},  # From 96
}
```

**Option 3: Reduce model capacity**
```python
config = {
    'stage1': {'features': 32, 'num_layers': 2},
    'stage2': {'features': 32, 'num_layers': 2},
}
```

**Option 4: Use CPU**
```python
config = {'device': 'cpu'}
```

---

### Issue: Training very slow

**Symptoms:** Epochs take > 1 hour

**Solutions:**

**Check GPU usage:**
```bash
nvidia-smi  # Should show high GPU utilization
```

**Option 1: Use GPU if available**
```python
config = {'device': 'cuda'}
```

**Option 2: Reduce patches**
```python
config = {
    'stage1': {'patches_per_image': 50},
    'stage2': {'patches_per_image': 100},
}
```

**Option 3: Disable ROI preprocessing**
```python
config = {
    'stage1': {'use_roi': False},
    'stage2': {'use_roi': False},
}
```

---

### Issue: Loss not decreasing

**Symptoms:** Loss stays high or plateaus early

**Solutions:**

**Option 1: Increase learning rate**
```python
config = {
    'stage1': {'learning_rate': 2e-4},  # From 1e-4
}
```

**Option 2: Increase model capacity**
```python
config = {
    'stage1': {'features': 96, 'num_layers': 3},
}
```

**Option 3: Increase training data**
```python
config = {
    'stage1': {'patches_per_image': 200},
}
```

**Option 4: Check data quality**
```python
from autoStructN2V.utils.image import load_and_normalize_image
import matplotlib.pyplot as plt

img = load_and_normalize_image('data/image_001.tif')
plt.imshow(img, cmap='gray')
plt.show()
```

---

### Issue: Overfitting

**Symptoms:** Training loss << validation loss

**Solutions:**

**Option 1: Enable early stopping**
```python
config = {
    'early_stopping': True,
    'early_stopping_patience': 10,
}
```

**Option 2: Reduce model capacity**
```python
config = {
    'stage1': {'features': 48, 'num_layers': 2},
}
```

**Option 3: Enable augmentation**
```python
config = {
    'stage1': {'use_augmentation': True},
}
```

**Option 4: More training data**
Add more images or increase patches_per_image.

---

## Configuration Issues

### Issue: `ValueError: input_dir must be specified`

**Solution:**
```python
config = {
    'input_dir': './my_data/',  # Add this
    # ...
}
```

---

### Issue: `ValueError: mask_source cannot be 'stage1' when run_stage1 is False`

**Solution:**
```python
config = {
    'run_stage1': False,
    'run_stage2': True,
    'stage2': {
        'mask_source': 'file',  # Change from 'stage1'
        'mask_file_path': './mask.npy',
    }
}
```

---

### Issue: `FileNotFoundError: Mask file not found`

**Solution:**

**Check file exists:**
```python
import os
path = './mask.npy'
print(os.path.exists(path))  # Should be True
```

**Use absolute path:**
```python
import os
config = {
    'stage2': {
        'mask_file_path': os.path.abspath('./mask.npy'),
    }
}
```

---

## Results Issues

### Issue: Poor denoising quality

**Symptoms:** Images still noisy after training

**Solutions:**

**Option 1: Train longer**
```python
config = {
    'num_epochs': 150,
    'early_stopping_patience': 20,
}
```

**Option 2: Increase model capacity**
```python
config = {
    'stage1': {'features': 96, 'num_layers': 3},
    'stage2': {'features': 96, 'num_layers': 4},
}
```

**Option 3: Enable verbose mode to diagnose**
```python
config = {'verbose': True}
```

**Option 4: Check if both stages needed**
- If only random noise: Stage 1 may be sufficient
- If structured patterns remain: Check Stage 2 mask

---

### Issue: Over-smoothed results

**Symptoms:** Images blurry, lost details

**Solutions:**

**Option 1: Reduce mask percentage**
```python
config = {
    'stage1': {'mask_percentage': 12.0},  # From 15.0
    'stage2': {'mask_percentage': 8.0},   # From 10.0
}
```

**Option 2: Early stopping**
```python
config = {
    'early_stopping': True,
    'early_stopping_patience': 5,  # Stop earlier
}
```

**Option 3: Reduce model capacity**
```python
config = {
    'stage1': {'features': 48, 'num_layers': 2},
}
```

---

### Issue: Structured noise remains

**Symptoms:** Patterns still visible after Stage 2

**Solutions:**

**Option 1: Check mask**
```python
import numpy as np
import matplotlib.pyplot as plt

mask = np.load('results/exp/stage2/model/stage2_mask.npy')
plt.imshow(mask, cmap='gray')
plt.title(f"Mask ({np.sum(mask)} pixels)")
plt.show()
```

**Option 2: Adjust extractor parameters**
```python
config = {
    'stage2': {
        'extractor': {
            'center_size': 15,  # Larger
            'base_percentile': 40,  # More lenient
            'max_true_pixels': 35,  # Allow more pixels
        }
    }
}
```

**Option 3: Try different mask source**
```python
config = {
    'stage2': {
        'mask_source': 'extractor',  # Extract from original
    }
}
```

**Option 4: Manual mask**
Create custom mask for known pattern (see [Custom Masks Tutorial](tutorials/custom-masks.md)).

---

## Inference Issues

### Issue: Out of memory during inference

**Solutions:**

**Option 1: Smaller patches**
```python
predictor = AutoStructN2VPredictor(
    model=model,
    patch_size=32,  # From 64
)
```

**Option 2: Less overlap**
```python
predictor = AutoStructN2VPredictor(
    model=model,
    stride=56,  # Closer to patch_size
)
```

**Option 3: Use CPU**
```python
predictor = AutoStructN2VPredictor(
    model=model,
    device='cpu',
)
```

---

### Issue: Artifacts at patch boundaries

**Symptoms:** Visible seams in denoised images

**Solutions:**

**Increase overlap:**
```python
predictor = AutoStructN2VPredictor(
    model=model,
    patch_size=64,
    stride=32,  # 50% overlap
)
```

**Or more:**
```python
stride=16  # 75% overlap
```

---

### Issue: Wrong model architecture

**Symptoms:**
```
RuntimeError: Error(s) in loading state_dict...
size mismatch...
```

**Solution:**

**Match training configuration:**
```python
# Check saved config
import json
with open('results/exp/config.json') as f:
    saved_config = json.load(f)

# Use same parameters
model = create_model(
    'stage2',
    features=saved_config['stage2']['features'],
    num_layers=saved_config['stage2']['num_layers'],
)
```

---

## Data Issues

### Issue: Not enough images

**Symptoms:**
```
ValueError: Need at least 3 images for train/val/test split
```

**Solution:**

**Option 1: Get more images**
Minimum 10 images recommended.

**Option 2: Adjust split ratio**
```python
config = {
    'split_ratio': (0.8, 0.1, 0.1),  # More for training
}
```

---

### Issue: Images wrong format

**Symptoms:**
```
FileNotFoundError: No images found with extension .tif
```

**Solutions:**

**Check extension:**
```python
import os
files = os.listdir('./data/')
print([f for f in files if f.endswith(('.tif', '.tiff'))])
```

**Change extension in config:**
```python
config = {
    'image_extension': '.tiff',  # Or '.png', etc.
}
```

**Convert images:**
```python
from PIL import Image
import glob

for img_path in glob.glob('./data/*.png'):
    img = Image.open(img_path)
    tif_path = img_path.replace('.png', '.tif')
    img.save(tif_path)
```

---

### Issue: Images corrupted

**Symptoms:**
```
OSError: cannot identify image file
```

**Solution:**

**Verify images:**
```python
from autoStructN2V.utils.image import verify_image
import glob

for img_path in glob.glob('./data/*.tif'):
    is_valid, msg = verify_image(img_path)
    if not is_valid:
        print(f"{img_path}: {msg}")
```

---

## TensorBoard Issues

### Issue: TensorBoard not showing data

**Solutions:**

**Check logs directory:**
```bash
ls results/experiment_name/stage1/logs/
# Should contain event files
```

**Correct logdir:**
```bash
tensorboard --logdir results/experiment_name/stage1/logs
```

**Wait for data:**
Training must start before data appears.

---

### Issue: Port already in use

**Symptoms:**
```
ERROR: TensorBoard could not bind to port 6006
```

**Solution:**

**Use different port:**
```bash
tensorboard --logdir results/exp/stage1/logs --port 6007
```

**Or kill existing:**
```bash
pkill -f tensorboard
tensorboard --logdir results/exp/stage1/logs
```

---

## Performance Issues

### Issue: High memory usage

**Solutions:**

**Reduce batch size:**
```python
config = {
    'stage1': {'batch_size': 1},
    'stage2': {'batch_size': 1},
}
```

**Disable data caching:**
```python
# DataLoader will not cache
```

**Process fewer patches:**
```python
config = {
    'stage1': {'patches_per_image': 50},
}
```

---

### Issue: Slow data loading

**Solutions:**

**Disable ROI:**
```python
config = {
    'stage1': {'use_roi': False},
}
```

**Reduce augmentation:**
```python
config = {
    'stage1': {'use_augmentation': False},
}
```

---

## Getting Further Help

If issues persist:

1. **Enable verbose mode:**
   ```python
   config = {'verbose': True}
   ```

2. **Check logs:**
   Look at TensorBoard logs for training curves

3. **Verify installation:**
   ```python
   import autoStructN2V
   print(autoStructN2V.__version__)
   ```

4. **GitHub Issues:**
   Open an issue with:
   - Error message
   - Configuration used
   - System information
   - Steps to reproduce

5. **Review documentation:**
   - [Basic Usage](tutorials/basic-usage.md)
   - [Configuration Reference](user-guide/configuration.md)
   - [Training Guide](user-guide/training.md)

---

## Common Error Messages

| Error | Likely Cause | Solution |
|-------|--------------|----------|
| `CUDA out of memory` | GPU memory exceeded | Reduce batch/patch size |
| `FileNotFoundError` | Path incorrect | Check paths exist |
| `ValueError: split_ratio must sum to 1.0` | Invalid ratio | Fix split_ratio tuple |
| `RuntimeError: size mismatch` | Wrong model config | Match training config |
| `OSError: cannot identify image` | Corrupted image | Verify/fix images |

---

**See Also:**
- [Configuration Reference](user-guide/configuration.md)
- [Training Guide](user-guide/training.md)
- [API Reference](api-reference/pipeline.md)
