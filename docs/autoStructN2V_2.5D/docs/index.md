# autoStructN2V Documentation

Welcome to the comprehensive documentation for **autoStructN2V**, a two-stage self-supervised deep learning framework for microscopy image denoising.

## What is autoStructN2V?

autoStructN2V extends the Noise2Void (N2V) approach to handle both random and structured noise patterns in microscopy images. It combines two specialized training stages:

- **Stage 1**: Standard Noise2Void removes random, uncorrelated noise using single-pixel blind-spot masking
- **Stage 2**: Structured Noise2Void removes correlated noise patterns (camera artifacts, scan lines, periodic noise) using learned structural masks

## Quick Links

### Getting Started
- [Installation & Quick Start](getting-started.md) - Get up and running quickly
- [Basic Usage Tutorial](tutorials/basic-usage.md) - Your first denoising pipeline

### User Guides
- [Pipeline Guide](user-guide/pipeline.md) - Using `run_pipeline()` for end-to-end denoising
- [Configuration Reference](user-guide/configuration.md) - Complete configuration options
- [Training Guide](user-guide/training.md) - Training best practices and tips
- [Inference Guide](user-guide/inference.md) - Using trained models to denoise images

### Core Concepts
- [System Architecture](concepts/architecture.md) - High-level system design
- [Two-Stage Approach](concepts/two-stage-approach.md) - Understanding Stage 1 vs Stage 2
- [Structural Mask Extraction](concepts/structural-mask-extraction.md) - How structural masks are created
- [ROI Selection](concepts/roi-selection.md) - Intelligent patch selection

### Tutorials
- [Basic Usage](tutorials/basic-usage.md) - Complete beginner walkthrough
- [Custom Masks](tutorials/custom-masks.md) - Creating and using custom structural masks
- [Advanced Configuration](tutorials/advanced-configuration.md) - Advanced scenarios

### API Reference
- [Pipeline Module](api-reference/pipeline.md) - `run_pipeline()`, configuration, data splitting
- [Models Module](api-reference/models.md) - U-Net architecture and model factory
- [Datasets Module](api-reference/datasets.md) - PyTorch dataset classes
- [Masking Module](api-reference/masking.md) - Mask creation and structural extraction
- [Trainers Module](api-reference/trainers.md) - Training logic and callbacks
- [Inference Module](api-reference/inference.md) - Prediction and visualization
- [Utils Module](api-reference/utils.md) - Utility functions

### Additional Resources
- [Troubleshooting](troubleshooting.md) - Common issues and solutions

## Key Features

### Flexible Two-Stage Pipeline
- Run both stages sequentially for complete denoising
- Run stages independently for experimentation
- Multiple mask source options for Stage 2

### Advanced Architecture
- Flexible U-Net with configurable depth and features
- Resize convolution to prevent checkerboard artifacts
- Batch normalization and ELU activation for stable training

### Intelligent Data Handling
- ROI-based patch selection (background vs structure)
- Data augmentation (flips, rotations)
- Automatic train/validation/test splitting

### Structural Noise Analysis
- Autocorrelation-based pattern detection
- Ring-based thresholding algorithm
- Adaptive processing for various noise types

### Production Ready
- Comprehensive configuration validation
- Early stopping to prevent overfitting
- TensorBoard integration for monitoring
- Checkpoint saving and loading
- Batch inference for directories

## Example Usage

```python
from autoStructN2V.pipeline import run_pipeline

# Define configuration
config = {
    'input_dir': './my_noisy_images/',
    'output_dir': './results/',
    'experiment_name': 'my_experiment',
    'device': 'cuda',
    'verbose': True,

    # Enable both stages
    'run_stage1': True,
    'run_stage2': True,

    # Stage 1: Remove random noise
    'stage1': {
        'patch_size': 32,
        'batch_size': 4,
        'learning_rate': 1e-4,
    },

    # Stage 2: Remove structured noise
    'stage2': {
        'patch_size': 64,
        'batch_size': 2,
        'learning_rate': 1e-5,
        'mask_source': 'stage1',  # Learn from Stage 1 output
    }
}

# Run pipeline
results = run_pipeline(config)
print(f"Results saved to: {results['final_results_dir']}")
```

## System Requirements

- **Python**: 3.7 or higher
- **PyTorch**: 1.8.0 or higher
- **CUDA**: Optional but recommended for GPU acceleration
- **RAM**: 8GB minimum, 16GB recommended
- **GPU**: 4GB VRAM minimum for small images, 8GB+ for larger datasets

## Navigation

Use the links above to navigate to specific topics. Each page includes:
- Detailed explanations with examples
- Cross-references to related topics
- Code snippets you can copy and use
- Parameter tables with descriptions

## Version Information

**Current Version**: 0.1.0

**Author**: Lucas Fortune (lucas.fortune@hhu.de)

## License

This project is distributed under the MIT License.

---

**Next Steps**: Start with the [Getting Started Guide](getting-started.md) to install and run your first pipeline.
