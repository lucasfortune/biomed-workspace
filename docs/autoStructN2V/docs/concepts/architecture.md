# System Architecture

High-level overview of the autoStructN2V system design and component organization.

## Overview

autoStructN2V is organized into modular components that work together to provide a complete denoising pipeline:

```
┌─────────────────────────────────────────────────┐
│             User Configuration                   │
└────────────────┬────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────┐
│          Pipeline Orchestrator                   │
│     (config validation, directory setup)         │
└────────┬────────────────────────────────────────┘
         │
         ├──────────► Data Splitting Module
         │                   │
         │                   ▼
         │            ┌──────────────┐
         │            │ Train/Val/   │
         │            │ Test Sets    │
         │            └──────┬───────┘
         │                   │
         ▼                   ▼
┌────────────────┐    ┌──────────────┐
│  Stage 1       │    │  DataLoaders │
│  Training      │◄───┤  (Datasets)  │
└────────┬───────┘    └──────────────┘
         │
         ├──────► Stage 1 Model (U-Net)
         │
         ├──────► Denoised Patches
         │             │
         │             ▼
         │    ┌────────────────────┐
         │    │ Structural Noise   │
         │    │ Extractor          │
         │    │ (Autocorrelation)  │
         │    └─────────┬──────────┘
         │              │
         │              ▼
         │        ┌──────────────┐
         │        │ Structural   │
         │        │ Mask         │
         │        └──────┬───────┘
         │               │
         ▼               ▼
┌────────────────┐    ┌──────────────┐
│  Stage 2       │◄───┤ Full Mask +  │
│  Training      │    │ Prediction   │
└────────┬───────┘    │ Kernel       │
         │            └──────────────┘
         ├──────► Stage 2 Model (U-Net)
         │
         ▼
┌──────────────────────┐
│  Inference Module    │
│  (Patch-based)       │
└─────────┬────────────┘
          │
          ▼
┌─────────────────────┐
│  Denoised Images    │
└─────────────────────┘
```

## Core Components

### 1. Pipeline Module (`pipeline/`)

**Purpose**: High-level orchestration and workflow management

**Components**:
- **`runner.py`**: Main pipeline execution, coordinates all stages
- **`config.py`**: Configuration validation and default values
- **`data.py`**: Dataset splitting and DataLoader creation

**Responsibilities**:
- Validate user configuration
- Create output directory structure
- Split dataset into train/val/test
- Coordinate Stage 1 and Stage 2 training
- Manage mask creation workflow
- Execute inference on final images

**Key Functions**:
- `run_pipeline()`: Main entry point
- `create_stage2_mask()`: Orchestrate mask creation
- `denoise_directory()`: Apply trained model to images

### 2. Models Module (`models/`)

**Purpose**: Neural network architectures

**Components**:
- **`unet.py`**: Flexible U-Net implementation
- **`auto_struct_n2v.py`**: AutoStructN2V model wrapper
- **`factory.py`**: Model creation utilities

**Architecture Details**:

**FlexibleUNet**:
```
Input (1, H, W)
     ↓
[Encoder Block 1] ──→ skip1
     ↓ (MaxPool)
[Encoder Block 2] ──→ skip2
     ↓ (MaxPool)
     ...
     ↓
[Bottleneck]
     ↓
[Decoder Block 1] ←── skip(N-1)
     ↑ (Upsample)
[Decoder Block 2] ←── skip(N-2)
     ↑ (Upsample)
     ...
     ↓
Output (1, H, W)
```

**Key Features**:
- Configurable depth (num_layers)
- Configurable capacity (features)
- Resize convolution to prevent artifacts
- Skip connections for detail preservation
- Batch normalization for stability
- ELU activation for smooth gradients

### 3. Datasets Module (`datasets/`)

**Purpose**: Data loading and augmentation

**Components**:
- **`base.py`**: Base dataset with common functionality
- **`training.py`**: Training dataset with masking
- **`validation.py`**: Validation dataset
- **`testing.py`**: Test dataset for full images

**Data Flow**:
```
Image Files
     ↓
Load & Normalize
     ↓
ROI Detection (optional)
     ↓
Extract Patches
     ↓
Apply Augmentation (training only)
     ↓
Apply Masks (training only)
     ↓
Return (input, target, mask) tensors
```

**Masking Strategies**:
- **Stage 1**: Random single-pixel blind spots
- **Stage 2**: Structured pattern with multiple pixels

### 4. Masking Module (`masking/`)

**Purpose**: Mask creation and structural noise analysis

**Components**:
- **`kernels.py`**: Basic mask kernel creation
- **`structure.py`**: Structural noise extraction (StructuralNoiseExtractor)
- **`utilities.py`**: Mask manipulation utilities

**Structural Extraction Process**:
```
Noisy Image Patches
     ↓
Compute Autocorrelation (FFT)
     ↓
Average Across Patches
     ↓
Normalize & Log Transform
     ↓
Crop to Center Region
     ↓
Ring-Based Analysis
     ↓
Percentile Thresholding
     ↓
Connected Component Selection
     ↓
Limit to max_true_pixels
     ↓
Binary Structural Mask (e.g., 11x11)
     ↓
Create Full Mask (tile across patch)
     ↓
(Full Mask, Prediction Kernel)
```

### 5. Trainers Module (`trainers/`)

**Purpose**: Training loop implementation

**Components**:
- **`base.py`**: Base trainer with common functionality
- **`auto_struct_n2v.py`**: AutoStructN2V trainer
- **`callbacks.py`**: Training callbacks (EarlyStopping)

**Training Loop**:
```
For each epoch:
    ┌─ Training Phase ─┐
    │ For each batch:  │
    │   Forward pass   │
    │   Calculate loss │
    │   Backward pass  │
    │   Update weights │
    └──────────────────┘
           ↓
    ┌─ Validation Phase ─┐
    │ For each batch:     │
    │   Forward pass      │
    │   Calculate loss    │
    └─────────────────────┘
           ↓
    ┌─ Checkpointing ─┐
    │ Save if best    │
    │ Early stopping? │
    │ LR scheduling   │
    └─────────────────┘
```

**Stage-Specific Behavior**:
- **Stage 1**: Returns denoised patches for mask creation
- **Stage 2**: Saves final model and mask

### 6. Inference Module (`inference/`)

**Purpose**: Apply trained models to new images

**Components**:
- **`predictor.py`**: Prediction class (AutoStructN2VPredictor)
- **`visualization.py`**: Result visualization utilities

**Inference Pipeline**:
```
Large Image
     ↓
Split into Overlapping Patches
     ↓
┌─────────────────────┐
│ For each patch:     │
│   Normalize         │
│   Model forward     │
│   Collect output    │
└─────────────────────┘
     ↓
Weighted Averaging in Overlaps
     ↓
Reconstruct Full Image
     ↓
Denoised Image
```

**Patch Blending**:
- Center-weighted mask for each patch
- Overlapping regions averaged
- Smooth transitions, no seams

### 7. Utils Module (`utils/`)

**Purpose**: Shared utility functions

**Components**:
- **`image.py`**: Image I/O and processing
- **`patching.py`**: Patch extraction/reconstruction
- **`training.py`**: Training utilities (seed setting, validation)
- **`mask_utils.py`**: Advanced mask utilities

## Data Flow

### Training Data Flow

```
Raw Images (.tif files)
     ↓
┌─ Data Splitting ─────────────────┐
│ Random split: 70/15/15           │
│ Copy to train/val/test dirs      │
└──────────────┬───────────────────┘
               │
               ├──► Train Set
               ├──► Val Set
               └──► Test Set
                         │
                         ▼
┌─ Dataset Classes ────────────────┐
│ Load images                      │
│ Extract patches                  │
│ Apply augmentation (train only)  │
│ Apply masking (train only)       │
└──────────────┬───────────────────┘
               │
               ▼
┌─ DataLoaders ────────────────────┐
│ Batch creation                   │
│ Shuffling (train only)           │
│ Multi-process loading            │
└──────────────┬───────────────────┘
               │
               ▼
         Training Loop
```

### Mask Creation Data Flow

```
Stage 1 Denoised Patches
     ↓
┌─ StructuralNoiseExtractor ─┐
│ Compute autocorrelations   │
│ Average across patches     │
│ Ring-based analysis        │
│ Extract binary pattern     │
└──────────┬─────────────────┘
           │
           ▼
Single Kernel (e.g., 11x11 boolean)
           │
           ▼
┌─ create_full_mask() ───────┐
│ Tile kernel across patch   │
│ Add random pixels          │
│ Enforce mask_percentage    │
│ Create prediction kernel   │
└──────────┬─────────────────┘
           │
           ▼
(Full Mask, Prediction Kernel)
           │
           ▼
   Stage 2 Training
```

## Design Patterns

### 1. Configuration-Driven Design

All behavior controlled by configuration dictionary:
- Single source of truth
- Easy experimentation
- Validation at entry point
- Clear separation of concerns

### 2. Modular Architecture

Each module has clear responsibility:
- Easy to test
- Easy to extend
- Easy to understand
- Minimal coupling

### 3. Factory Pattern

Model creation abstracted:
```python
model = create_model('stage1', features=64, num_layers=2)
```
- Hides complexity
- Ensures consistency
- Easy to add new models

### 4. Template Method Pattern

Base trainer defines structure, subclasses customize:
```python
class BaseTrainer:
    def train(self, ...):
        # Template method
        for epoch in range(num_epochs):
            self.train_epoch(...)
            self.validate_epoch(...)
            # ...

class AutoStructN2VTrainer(BaseTrainer):
    # Customize specific behaviors
```

### 5. Strategy Pattern

Different masking strategies:
```python
masking_strategy:
    0 → local_mean_strategy()
    1 → zeros_strategy()
    2 → random_strategy()
```

## Key Design Decisions

### 1. Patch-Based Processing

**Rationale**:
- Memory efficiency for large images
- Enables data augmentation
- Natural batching for training

**Tradeoffs**:
- Requires overlap management
- Potential boundary artifacts

### 2. Separate Stage Training

**Rationale**:
- Independent stage execution
- Mask reusability
- Easier debugging

**Tradeoffs**:
- Cannot do end-to-end training
- Two separate training runs

### 3. Autocorrelation-Based Mask Extraction

**Rationale**:
- Unsupervised (no ground truth needed)
- Robust to various noise types
- Mathematically principled

**Tradeoffs**:
- Computationally intensive
- Many hyperparameters

### 4. Resize Convolution Over Transposed Convolution

**Rationale**:
- Eliminates checkerboard artifacts
- Better visual quality
- Separates upsampling from learning

**Tradeoffs**:
- Slightly more complex
- May be marginally slower

### 5. Configuration Validation

**Rationale**:
- Fail fast with clear errors
- Prevents invalid states
- Better user experience

**Tradeoffs**:
- More validation code
- Potential rigidity

## Performance Considerations

### Memory Management

- **Patch-based processing**: Limits memory usage
- **Gradient checkpointing**: Available for deeper networks
- **Mixed precision**: Optional for faster training

### Computational Efficiency

- **GPU utilization**: Batch processing, parallel dataloading
- **Caching**: ROI preprocessing cached
- **Vectorization**: NumPy/PyTorch operations

### Scalability

- **Dataset size**: Handles arbitrary number of images
- **Image size**: Patch-based approach scales to any size
- **Model size**: Configurable capacity

## Extension Points

### Adding New Models

1. Implement model in `models/`
2. Update `factory.py`
3. No other changes needed

### Adding New Masking Strategies

1. Add strategy to `datasets/training.py`
2. Update `apply_mask()` method
3. Document in configuration

### Adding New Metrics

1. Implement in `utils/` or `inference/`
2. Call during training or inference
3. Log to TensorBoard

### Adding New Data Formats

1. Update `utils/image.py` loading functions
2. Handle format-specific normalization
3. Update documentation

## See Also

- [Two-Stage Approach](two-stage-approach.md) - Understanding Stage 1 vs Stage 2
- [Structural Mask Extraction](structural-mask-extraction.md) - Mask creation details
- [API Reference](../api-reference/pipeline.md) - Technical API documentation

---

**Next**: [Two-Stage Approach](two-stage-approach.md) to understand how the stages work.
