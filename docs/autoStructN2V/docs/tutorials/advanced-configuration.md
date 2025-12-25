# Advanced Configuration Tutorial

Advanced scenarios and configuration patterns for experienced users.

## Overview

This tutorial covers:
1. Multi-dataset workflows
2. Performance optimization
3. Custom training strategies
4. Debugging and troubleshooting
5. Production deployment

**Prerequisites**: Completed [Basic Usage](basic-usage.md) and [Custom Masks](custom-masks.md) tutorials

## Scenario 1: Multi-Dataset Workflow

### Training on Multiple Datasets

Combine datasets for more robust training:

```python
from autoStructN2V.pipeline import run_pipeline
import shutil
import os

# Merge datasets
combined_dir = './combined_data/'
os.makedirs(combined_dir, exist_ok=True)

datasets = [
    './dataset1/',
    './dataset2/',
    './dataset3/',
]

for ds in datasets:
    for img in os.listdir(ds):
        if img.endswith('.tif'):
            src = os.path.join(ds, img)
            dst = os.path.join(combined_dir, f"{os.path.basename(ds)}_{img}")
            shutil.copy(src, dst)

# Train on combined data
config = {
    'input_dir': combined_dir,
    'experiment_name': 'multi_dataset',
    'random_seed': 42,
}

results = run_pipeline(config)
```

### Transfer Learning Across Datasets

Train on one dataset, apply to another:

```python
# Phase 1: Train on high-quality dataset
config_train = {
    'input_dir': './high_quality_data/',
    'experiment_name': 'source_training',
}
results_train = run_pipeline(config_train)

# Phase 2: Apply learned mask to new dataset
config_transfer = {
    'input_dir': './new_target_data/',
    'experiment_name': 'transfer_learning',

    'run_stage1': False,
    'run_stage2': True,

    'stage2': {
        'mask_source': 'file',
        'mask_file_path': results_train['stage2_mask_path'],
    }
}
results_transfer = run_pipeline(config_transfer)
```

## Scenario 2: Performance Optimization

### Maximum Quality Configuration

For publication-quality results:

```python
config_max_quality = {
    'input_dir': './data/',
    'experiment_name': 'publication_quality',
    'device': 'cuda',

    # Extended training
    'num_epochs': 200,
    'early_stopping': True,
    'early_stopping_patience': 25,

    'stage1': {
        # Large model capacity
        'features': 128,
        'num_layers': 4,

        # Large patches for context
        'patch_size': 128,
        'batch_size': 4,  # Limited by memory

        # Aggressive learning
        'learning_rate': 2e-4,

        # Many patches for diversity
        'patches_per_image': 250,

        # High masking for strong signal
        'mask_percentage': 20.0,

        # Artifact reduction
        'use_resize_conv': True,
        'upsampling_mode': 'bicubic',

        # ROI selection
        'use_roi': True,
        'select_background': True,
        'roi_threshold': 0.5,

        # Augmentation
        'use_augmentation': True,
    },

    'stage2': {
        'features': 128,
        'num_layers': 4,
        'patch_size': 256,
        'batch_size': 2,
        'learning_rate': 5e-6,
        'patches_per_image': 400,
        'mask_percentage': 8.0,
        'use_resize_conv': True,
        'upsampling_mode': 'bicubic',

        # Fine-tuned extractor
        'extractor': {
            'center_size': 20,
            'base_percentile': 55,
            'percentile_decay': 1.1,
            'center_ratio_threshold': 0.25,
            'max_true_pixels': 35,
        }
    }
}

results = run_pipeline(config_max_quality)
```

### Maximum Speed Configuration

For rapid experimentation:

```python
config_max_speed = {
    'input_dir': './data/',
    'experiment_name': 'fast_experiment',
    'device': 'cuda',

    # Minimal epochs
    'num_epochs': 30,
    'early_stopping': False,  # Skip early stopping overhead

    'stage1': {
        # Small model
        'features': 32,
        'num_layers': 2,

        # Small patches
        'patch_size': 32,

        # Large batches (maximize GPU)
        'batch_size': 32,

        # Aggressive learning rate
        'learning_rate': 5e-4,

        # Fewer patches
        'patches_per_image': 40,

        # Disable ROI (faster)
        'use_roi': False,

        # Disable augmentation (faster)
        'use_augmentation': False,
    },

    'stage2': {
        'features': 32,
        'num_layers': 2,
        'patch_size': 48,
        'batch_size': 16,
        'learning_rate': 2e-5,
        'patches_per_image': 80,
        'use_roi': False,
        'use_augmentation': False,
    }
}

results = run_pipeline(config_max_speed)
```

### Memory-Efficient Configuration

For limited GPU memory:

```python
config_memory_efficient = {
    'input_dir': './data/',
    'experiment_name': 'low_memory',
    'device': 'cuda',

    'stage1': {
        # Minimal model size
        'features': 24,
        'num_layers': 2,

        # Small patches
        'patch_size': 24,

        # Batch size of 1
        'batch_size': 1,

        # Fewer patches per image
        'patches_per_image': 50,
    },

    'stage2': {
        'features': 24,
        'num_layers': 2,
        'patch_size': 32,
        'batch_size': 1,
        'patches_per_image': 75,
    }
}

results = run_pipeline(config_memory_efficient)
```

## Scenario 3: Custom Training Strategies

### Progressive Training

Start small, refine with larger model:

```python
# Phase 1: Quick baseline
config_phase1 = {
    'input_dir': './data/',
    'experiment_name': 'phase1_baseline',
    'num_epochs': 50,

    'stage1': {'features': 32, 'num_layers': 2},
    'stage2': {'features': 32, 'num_layers': 2},
}
results_phase1 = run_pipeline(config_phase1)

# Phase 2: Refined training
config_phase2 = {
    'input_dir': './data/',
    'experiment_name': 'phase2_refined',
    'num_epochs': 100,

    'stage1': {'features': 64, 'num_layers': 3},

    'stage2': {
        'features': 64,
        'num_layers': 3,

        # Reuse mask from phase 1
        'mask_source': 'file',
        'mask_file_path': results_phase1['stage2_mask_path'],
    }
}
results_phase2 = run_pipeline(config_phase2)
```

### Ensemble Training

Train multiple models with different seeds:

```python
import numpy as np

seeds = [42, 123, 456, 789, 1011]
models = []

for seed in seeds:
    config = {
        'input_dir': './data/',
        'experiment_name': f'ensemble_seed_{seed}',
        'random_seed': seed,
    }

    results = run_pipeline(config)
    models.append(results['stage2_model_path'])

print(f"Trained {len(models)} models")

# Use ensemble for inference (manual implementation needed)
```

### Cross-Validation

K-fold cross-validation:

```python
import numpy as np
from sklearn.model_selection import KFold

# Get all image paths
image_files = [f for f in os.listdir('./data/') if f.endswith('.tif')]

# 5-fold CV
kfold = KFold(n_splits=5, shuffle=True, random_seed=42)

for fold_idx, (train_idx, val_idx) in enumerate(kfold.split(image_files)):
    print(f"Training fold {fold_idx + 1}/5")

    # Create fold-specific directory
    fold_dir = f'./data_fold_{fold_idx}/'
    os.makedirs(fold_dir, exist_ok=True)

    # Copy training images
    for idx in train_idx:
        src = os.path.join('./data/', image_files[idx])
        dst = os.path.join(fold_dir, image_files[idx])
        shutil.copy(src, dst)

    # Train on this fold
    config = {
        'input_dir': fold_dir,
        'experiment_name': f'cv_fold_{fold_idx}',
        'random_seed': 42,
    }

    results = run_pipeline(config)

    # Evaluate on validation set...
```

## Scenario 4: Debugging and Monitoring

### Verbose Configuration

Maximum debugging information:

```python
config_debug = {
    'input_dir': './data/',
    'experiment_name': 'debug_run',

    # Enable all verbosity
    'verbose': True,

    # Short run for debugging
    'num_epochs': 10,

    'stage1': {
        # Smaller for faster debugging
        'features': 32,
        'num_layers': 2,
        'batch_size': 2,
        'patches_per_image': 20,
    },

    'stage2': {
        'features': 32,
        'num_layers': 2,
        'batch_size': 1,
        'patches_per_image': 30,

        # Verbose mask extraction
        'extractor': {
            'center_size': 10,
            'base_percentile': 50,
        }
    }
}

results = run_pipeline(config_debug)
```

### Custom Logging

Add custom logging:

```python
import logging

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('training.log'),
        logging.StreamHandler()
    ]
)

logger = logging.getLogger(__name__)

logger.info("Starting pipeline...")
config = {
    'input_dir': './data/',
    'experiment_name': 'logged_experiment',
}

try:
    results = run_pipeline(config)
    logger.info(f"Pipeline completed successfully: {results['final_results_dir']}")
except Exception as e:
    logger.error(f"Pipeline failed: {str(e)}", exc_info=True)
    raise
```

### Checkpointing Strategy

Save checkpoints frequently:

```python
config = {
    'input_dir': './data/',
    'experiment_name': 'checkpoint_test',

    # Enable early stopping (auto-checkpoints best model)
    'early_stopping': True,
    'early_stopping_patience': 10,

    # Models are automatically saved to:
    # - results/experiment_name/stage1/model/stage1_model.pth
    # - results/experiment_name/stage2/model/stage2_model.pth
}

results = run_pipeline(config)

# Checkpoint paths
print(f"Stage 1 checkpoint: {results['stage1_model_path']}")
print(f"Stage 2 checkpoint: {results['stage2_model_path']}")
```

## Scenario 5: Production Deployment

### Inference-Only Setup

Deploy trained models for inference:

```python
from autoStructN2V.inference import AutoStructN2VPredictor
from autoStructN2V.models import create_model
import torch

class ProductionPredictor:
    def __init__(self, model_path, config):
        # Load model
        self.model = create_model('stage2', **config)
        checkpoint = torch.load(model_path, map_location='cpu')
        self.model.load_state_dict(checkpoint['model_state_dict'])
        self.model.eval()

        # Create predictor
        self.predictor = AutoStructN2VPredictor(
            model=self.model,
            device='cuda' if torch.cuda.is_available() else 'cpu',
            patch_size=config.get('patch_size', 64),
        )

    def denoise(self, input_path, output_path):
        """Denoise single image."""
        return self.predictor.denoise_image(input_path, output_path, show=False)

    def denoise_batch(self, input_dir, output_dir):
        """Denoise directory."""
        return self.predictor.process_directory(input_dir, output_dir, show=False)

# Usage
predictor = ProductionPredictor(
    model_path='./models/stage2_model.pth',
    config={'features': 64, 'num_layers': 2, 'patch_size': 64}
)

predictor.denoise_batch('./incoming/', './denoised/')
```

### API Service

Wrap in REST API:

```python
from flask import Flask, request, send_file
import io
from PIL import Image

app = Flask(__name__)

# Initialize predictor
predictor = ProductionPredictor(
    model_path='./models/stage2_model.pth',
    config={'features': 64, 'num_layers': 2}
)

@app.route('/denoise', methods=['POST'])
def denoise_endpoint():
    # Get uploaded file
    file = request.files['image']

    # Save temporarily
    temp_input = '/tmp/input.tif'
    temp_output = '/tmp/output.tif'
    file.save(temp_input)

    # Denoise
    predictor.denoise(temp_input, temp_output)

    # Return result
    return send_file(temp_output, mimetype='image/tiff')

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
```

### Docker Deployment

Create `Dockerfile`:

```dockerfile
FROM pytorch/pytorch:latest

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

RUN pip install -e .

ENV MODEL_PATH=/app/models/stage2_model.pth

CMD ["python", "api_service.py"]
```

Build and run:
```bash
docker build -t autostruct-n2v .
docker run -p 5000:5000 -v $(pwd)/models:/app/models autostruct-n2v
```

## Advanced Parameter Combinations

### For Strong Periodic Noise

```python
config = {
    'input_dir': './periodic_noise_data/',
    'experiment_name': 'periodic_noise',

    'stage2': {
        'mask_source': 'extractor',

        'extractor': {
            'center_size': 25,  # Large to capture periodicity
            'base_percentile': 40,  # Lenient
            'percentile_decay': 1.05,  # Slow decay
            'center_ratio_threshold': 0.2,
            'max_true_pixels': 50,  # Large mask
        }
    }
}
```

### For Subtle Structured Noise

```python
config = {
    'input_dir': './subtle_noise_data/',
    'experiment_name': 'subtle_noise',

    'stage2': {
        'extractor': {
            'center_size': 15,
            'base_percentile': 30,  # Very lenient
            'use_center_proximity': False,  # Don't filter
            'max_true_pixels': 20,
        }
    }
}
```

### For Multiple Noise Types

```python
config = {
    'input_dir': './mixed_noise_data/',
    'experiment_name': 'mixed_noise',

    'stage1': {
        # Strong capacity for random noise
        'features': 96,
        'num_layers': 3,
        'mask_percentage': 18.0,
    },

    'stage2': {
        # Strong capacity for structured noise
        'features': 96,
        'num_layers': 4,

        'extractor': {
            'center_size': 18,
            'base_percentile': 45,
            'max_true_pixels': 35,
        }
    }
}
```

## Troubleshooting Advanced Scenarios

### Out of Memory with Large Models

```python
# Enable gradient checkpointing (manual implementation)
# Or use smaller batches with gradient accumulation

config = {
    'stage1': {
        'batch_size': 1,  # Process one at a time
        # Manually accumulate gradients over N batches
    }
}
```

### Inconsistent Results

```python
# Ensure reproducibility
config = {
    'random_seed': 42,
    'num_workers': 0,  # Disable multiprocessing for determinism
}
```

### Slow Convergence

```python
# Try cyclic learning rate (manual implementation)
# Or increase initial learning rate

config = {
    'stage1': {
        'learning_rate': 5e-4,  # Higher starting point
    }
}
```

## See Also

- [Configuration Reference](../user-guide/configuration.md) - All parameters
- [Training Guide](../user-guide/training.md) - Training best practices
- [Troubleshooting](../troubleshooting.md) - Common issues
- [API Reference](../api-reference/pipeline.md) - Technical documentation

---

**Congratulations!** You've completed all tutorials. Refer to the [API Reference](../api-reference/pipeline.md) for detailed technical documentation.
