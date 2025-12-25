# Deep Learning Denoising Module - Product Specification

**Version:** 1.0
**Last Updated:** 2025-12-25
**Status:** Draft

---

## Table of Contents

1. [Overview](#1-overview)
2. [Module Architecture](#2-module-architecture)
3. [User Flow & Steps](#3-user-flow--steps)
4. [Data Management](#4-data-management)
5. [Configuration Presets](#5-configuration-presets)
6. [Real-Time Communication](#6-real-time-communication)
7. [Python Backend Integration](#7-python-backend-integration)
8. [UI Components](#8-ui-components)
9. [State Management](#9-state-management)
10. [Error Handling](#10-error-handling)
11. [Testing Requirements](#11-testing-requirements)
12. [Implementation Roadmap](#12-implementation-roadmap)

---

## 1. Overview

### 1.1 Purpose

The Deep Learning Denoising Module provides self-supervised denoising capabilities for microscopy TIFF image stacks. Unlike traditional denoising methods that require clean reference images, this module uses Noise2Void-based techniques that learn to denoise from the noisy data itself.

### 1.2 Denoising Methods

The module supports two denoising approaches, both powered by the autoStructN2V Python library:

| Method | Description | Best For |
|--------|-------------|----------|
| **N2V (Noise2Void)** | Single-stage denoising using random blind-spot masking | Random, uncorrelated noise (thermal noise, shot noise) |
| **autoStructN2V** | Two-stage pipeline: N2V + Structured N2V with automatic mask extraction | Random noise + structured artifacts (scan lines, camera patterns, periodic interference) |

**Key Insight:** When users select "N2V mode", the module uses the autoStructN2V pipeline with `run_stage2: False`. This simplifies the backend to a single Python module while providing both capabilities.

### 1.3 Target Users

- Microscopy researchers with noisy image data
- Users who lack clean ground-truth images for traditional denoising
- Researchers dealing with structured noise patterns from scanning equipment

### 1.4 Key Features

- Self-supervised learning (no ground truth required)
- Automatic structural noise pattern detection
- Interactive mask parameter adjustment
- Real-time training progress visualization
- Integration with workspace file management
- Test data for evaluation before custom uploads

---

## 2. Module Architecture

### 2.1 Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        DL Denoising Module                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │   Step 1    │  │   Step 2    │  │   Step 3    │  │   Step 4    │    │
│  │    Data     │──▶│   Config    │──▶│  Training   │──▶│ Inference   │    │
│  │  Selection  │  │             │  │             │  │             │    │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    │
│        │                │                │                │            │
│        ▼                ▼                ▼                ▼            │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                      DenoisingAPI.js                            │   │
│  │  (uploadData, validateFile, configure, startTraining,          │   │
│  │   regenerateMask, runInference)                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                    │                                    │
└────────────────────────────────────│────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Node.js Backend                                 │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌────────────────┐   ┌────────────────┐   ┌────────────────┐          │
│  │ denoising.     │   │ DenoisingServ- │   │ SessionTracker │          │
│  │ routes.js      │──▶│ ice.js         │──▶│ .js            │          │
│  └────────────────┘   └────────────────┘   └────────────────┘          │
│                              │                                          │
│                              ▼                                          │
│                    ┌────────────────┐                                   │
│                    │  pythonRunner  │                                   │
│                    │   .js          │                                   │
│                    └────────────────┘                                   │
│                              │                                          │
└──────────────────────────────│──────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     Python Backend                                      │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │               autostructn2v_wrapper.py                         │    │
│  │  (Entry point for web integration)                             │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                              │                                          │
│                              ▼                                          │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │                   autoStructN2V Library                        │    │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐          │    │
│  │  │ Pipeline │ │ Models   │ │ Masking  │ │ Inference│          │    │
│  │  │          │ │(FlexUNet)│ │(Extractor│ │(Predictor│          │    │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘          │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.2 File Structure

```
public/workspace/js/modules/denoising/
├── DenoisingModule.js          # Main module class
├── DenoisingAPI.js             # Backend API client
├── components/
│   ├── MaskVisualization.js    # Mask preview and display
│   ├── MaskParameterPanel.js   # Interactive parameter adjustment
│   ├── DualColumnConfig.js     # Stage 1/Stage 2 config layout
│   └── TrainingProgress.js     # Progress charts and metrics
├── helpers/
│   ├── validation.js           # Client-side validation
│   └── charts.js               # Chart.js integration
└── css/
    └── denoising.css           # Module styling

src/routes/
└── denoising.routes.js         # Denoising API endpoints

src/services/
└── DenoisingService.js         # Denoising business logic

python/
├── autostructn2v_wrapper.py    # Web integration wrapper
├── validate_denoising_tiff.py  # TIFF validation for denoising
└── extract_mask_preview.py     # Mask extraction preview

config/
└── denoising_presets.json      # Configuration presets
```

### 2.3 Module Registration

```javascript
// In modules/registry.js
{
  id: 'denoising-dl',
  name: 'Deep Learning Denoising',
  description: 'Self-supervised denoising with N2V and autoStructN2V',
  icon: '🔬',
  path: '/workspace/js/modules/denoising/DenoisingModule.js',
  inputs: ['raw_images'],
  outputs: ['denoised_images'],
  color: '#9B59B6',
  status: 'available'
}
```

---

## 3. User Flow & Steps

### 3.1 Step Configuration

```javascript
const config = {
  id: 'denoising-dl',
  name: 'Deep Learning Denoising Pipeline',
  cssPath: '/workspace/js/modules/denoising/css/denoising.css',
  steps: [
    {
      id: 'upload',
      name: 'Data Selection',
      canNavigate: true
    },
    {
      id: 'config',
      name: 'Configuration',
      canNavigate: (module) => module.filesValidated && module.methodSelected
    },
    {
      id: 'training',
      name: 'Training',
      canNavigate: (module) => module.configSaved
    },
    {
      id: 'inference',
      name: 'Inference',
      canNavigate: (module) => module.trainingComplete
    }
  ]
};
```

### 3.2 Step 1: Data Selection

#### 3.2.1 UI Layout

```
┌──────────────────────────────────────────────────────────────────────┐
│  ← Back to Hub                      Deep Learning Denoising          │
├──────────────────────────────────────────────────────────────────────┤
│  [1. Data] ──── [2. Config] ──── [3. Training] ──── [4. Inference]   │
│     ●              ○                  ○                  ○           │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  SELECT NOISY IMAGE DATA                                       │  │
│  │                                                                │  │
│  │  ┌──────────────────────────────────────────────────────────┐  │  │
│  │  │  📁 Raw Images                                           │  │  │
│  │  │  ┌──────────────────────────────────┐  ┌──────────────┐  │  │  │
│  │  │  │ Select from workspace...      ▼ │  │   Upload     │  │  │  │
│  │  │  └──────────────────────────────────┘  └──────────────┘  │  │  │
│  │  │                                                          │  │  │
│  │  │  [ ] Use test data                                       │  │  │
│  │  └──────────────────────────────────────────────────────────┘  │  │
│  │                                                                │  │
│  │  ┌──────────────────────────────────────────────────────────┐  │  │
│  │  │  VALIDATION RESULTS                                      │  │  │
│  │  │  ✓ Format: TIFF Stack                                    │  │  │
│  │  │  ✓ Dimensions: 512 x 512 x 100 slices                    │  │  │
│  │  │  ✓ Bit depth: 16-bit                                     │  │  │
│  │  │  ✓ File size: 52.4 MB                                    │  │  │
│  │  └──────────────────────────────────────────────────────────┘  │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  SELECT DENOISING METHOD                                       │  │
│  │                                                                │  │
│  │  ┌─────────────────────────┐  ┌─────────────────────────────┐  │  │
│  │  │  ○ N2V                  │  │  ○ autoStructN2V            │  │  │
│  │  │                         │  │                             │  │  │
│  │  │  Standard Noise2Void    │  │  Two-stage pipeline for     │  │  │
│  │  │  for random noise       │  │  random + structured noise  │  │  │
│  │  │  (thermal, shot noise)  │  │  (scan lines, patterns)     │  │  │
│  │  │                         │  │                             │  │  │
│  │  │  Single training stage  │  │  Stage 1 + Mask Analysis    │  │  │
│  │  │                         │  │  + Stage 2                  │  │  │
│  │  └─────────────────────────┘  └─────────────────────────────┘  │  │
│  │                                                                │  │
│  │  ⚠ Method selection cannot be changed after proceeding        │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                      │
│                                                    [ Next → ]        │
└──────────────────────────────────────────────────────────────────────┘
```

#### 3.2.2 Requirements

| Requirement | Description |
|-------------|-------------|
| File format | TIFF image stack (.tif, .tiff) |
| Channels | Single channel (grayscale) |
| Bit depth | 8-bit (uint8) or 16-bit (uint16) |
| Minimum images | 10 slices (20+ recommended) |
| Method selection | Required before proceeding; **locked after Step 1** |

#### 3.2.3 Validation

- File format check (TIFF stack)
- Dimension extraction (width, height, slices)
- Bit depth detection
- File size validation against upload limits

#### 3.2.4 State After Step 1

```javascript
{
  filesValidated: true,
  methodSelected: true,
  selectedMethod: 'n2v' | 'autostructn2v',
  uploadedFiles: {
    raw_images: {
      path: '/workspaces/{sessionId}/uploads/denoising/noisy_stack.tif',
      filename: 'noisy_stack.tif',
      dimensions: { width: 512, height: 512, slices: 100 },
      bitDepth: 16,
      fileSize: 52428800
    }
  }
}
```

---

### 3.3 Step 2: Configuration

Step 2 differs significantly based on the selected method.

#### 3.3.1 N2V Configuration (Single Column)

```
┌──────────────────────────────────────────────────────────────────────┐
│  ← Back to Hub                      Deep Learning Denoising          │
├──────────────────────────────────────────────────────────────────────┤
│  [1. Data] ──── [2. Config] ──── [3. Training] ──── [4. Inference]   │
│     ✓              ●                  ○                  ○           │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  N2V CONFIGURATION                           [Load Preset ▼]   │  │
│  │                                                                │  │
│  │  ─── Dataset Configuration ───────────────────────────────     │  │
│  │  Patch Size           [  32  ▼]    (32, 48, 64, 96, 128)       │  │
│  │  Patches per Image    [  100  ]    (50-500)                    │  │
│  │  Batch Size           [   4  ▼]    (1, 2, 4, 8, 16, 32)        │  │
│  │  Mask Percentage      [ 15.0  ] %  (10-30%)                    │  │
│  │  Data Augmentation    [✓]          (Flips, rotations)          │  │
│  │                                                                │  │
│  │  ─── Model Architecture ──────────────────────────────────     │  │
│  │  Number of Features   [  64  ▼]    (32, 48, 64, 96, 128)       │  │
│  │  Number of Layers     [   2  ▼]    (2, 3, 4)                   │  │
│  │                                                                │  │
│  │  ─── Training Parameters ─────────────────────────────────     │  │
│  │  Learning Rate        [1e-4  ▼]    (1e-5, 5e-5, 1e-4, 2e-4)    │  │
│  │  Number of Epochs     [  100  ]    (10-500)                    │  │
│  │  Early Stopping       [✓]          Patience: [ 10 ]            │  │
│  │                                                                │  │
│  │  ▶ Advanced Options (collapsed)                                │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                      │
│                                           [← Previous]  [ Next → ]   │
└──────────────────────────────────────────────────────────────────────┘
```

**Advanced Options (Collapsed by Default):**
- Resize Convolution toggle (default: true)
- Upsampling Mode: bilinear, nearest, bicubic (default: bilinear)
- Masking Strategy: local_mean, zeros, random (default: local_mean)

*Note: ROI Selection is not available for standard N2V. It is only used in autoStructN2V for mask extraction.*

#### 3.3.2 autoStructN2V Configuration (Two-Column Grid)

```
┌────────────────────────────────────────────────────────────────────────────┐
│  ← Back to Hub                      Deep Learning Denoising                │
├────────────────────────────────────────────────────────────────────────────┤
│  [1. Data] ──── [2. Config] ──── [3. Training] ──── [4. Inference]         │
│     ✓              ●                  ○                  ○                 │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  autoStructN2V CONFIGURATION                        [Load Preset ▼]  │  │
│  │                                                                      │  │
│  │  ┌───────────── STAGE 1 ─────────────┐ ┌───────── STAGE 2 ─────────┐ │  │
│  │  │                                   │ │                           │ │  │
│  │  │ ─── Dataset ───────────────────   │ │ ─── Dataset ───────────   │ │  │
│  │  │ Patch Size       [  32  ▼]        │ │ Patch Size   [  64  ▼]    │ │  │
│  │  │ Patches/Image    [  100  ]        │ │ Patches/Img  [  200  ]    │ │  │
│  │  │ Batch Size       [   4  ▼]        │ │ Batch Size   [   2  ▼]    │ │  │
│  │  │ Mask %           [ 15.0  ]        │ │ Mask %       [ 10.0  ]    │ │  │
│  │  │ Augmentation     [✓]              │ │ Augmentation [✓]          │ │  │
│  │  │                                   │ │                           │ │  │
│  │  │ ─── Architecture ──────────────   │ │ ─── Architecture ───────  │ │  │
│  │  │ Features         [  64  ▼]        │ │ Features     [  64  ▼]    │ │  │
│  │  │ Layers           [   2  ▼]        │ │ Layers       [   3  ▼]    │ │  │
│  │  │                                   │ │                           │ │  │
│  │  │ ─── Training ──────────────────   │ │ ─── Training ───────────  │ │  │
│  │  │ Learning Rate    [1e-4  ▼]        │ │ Learn Rate   [1e-5  ▼]    │ │  │
│  │  │ Epochs           [  100  ]        │ │ Epochs       [  100  ]    │ │  │
│  │  │ Early Stopping   [✓] Pat: [10]    │ │ Early Stop   [✓] Pat:[10] │ │  │
│  │  │                                   │ │                           │ │  │
│  │  └───────────────────────────────────┘ └───────────────────────────┘ │  │
│  │                                                                      │  │
│  │  ▶ Advanced Options                                                  │  │
│  │  ▶ Mask Extractor Configuration                                      │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                            │
│                                              [← Previous]  [ Next → ]      │
└────────────────────────────────────────────────────────────────────────────┘
```

**Advanced Options (Collapsed by Default):**

| Option | Stage 1 | Stage 2 | Description |
|--------|---------|---------|-------------|
| ROI Selection | ✓ (default: true) | - | Enable ROI-based patch selection for mask extraction |
| ROI Threshold | 0.5 | - | Intensity threshold for ROI detection |
| Resize Convolution | ✓ (default: true) | ✓ (default: true) | Use resize convolution instead of transposed conv |
| Upsampling Mode | bilinear | bilinear | Options: bilinear, nearest, bicubic |

**Mask Extractor Configuration (Collapsed):**

| Parameter | Default | Range | Description |
|-----------|---------|-------|-------------|
| Adaptive Thresholding | true | toggle | Use distance-based threshold decay |
| Base Percentile | 50 | 30-70 | Base threshold for ring analysis |
| Percentile Decay | 1.15 | 1.0-1.3 | Threshold increase per ring |
| Max Masked Pixels | 25 | 10-40 | Maximum pixels in final mask kernel |

#### 3.3.3 Configuration Parameters Reference

**Common Parameters (Both Stages):**

| Parameter | Type | Default Stage 1 | Default Stage 2 | Range | Description |
|-----------|------|-----------------|-----------------|-------|-------------|
| `patch_size` | int | 32 | 64 | 32-128 | Size of training patches |
| `patches_per_image` | int | 100 | 200 | 50-500 | Patches extracted per image |
| `batch_size` | int | 4 | 2 | 1-32 | Training batch size |
| `mask_percentage` | float | 15.0 | 10.0 | 5.0-30.0 | Percentage of pixels masked |
| `use_augmentation` | bool | true | true | - | Enable data augmentation |
| `features` | int | 64 | 64 | 32-128 | U-Net base features |
| `num_layers` | int | 2 | 3 | 2-5 | U-Net depth |
| `learning_rate` | float | 1e-4 | 1e-5 | 1e-6 to 1e-3 | Optimizer learning rate |
| `num_epochs` | int | 100 | 100 | 10-500 | Maximum training epochs |
| `early_stopping` | bool | true | true | - | Enable early stopping |
| `early_stopping_patience` | int | 10 | 10 | 5-50 | Epochs without improvement |
| `use_resize_conv` | bool | true | true | - | Use resize convolution |
| `upsampling_mode` | str | 'bilinear' | 'bilinear' | bilinear/nearest/bicubic | Upsampling method |

**Stage 1 Only:**

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| `use_roi` | bool | true | - | Enable ROI-based patch selection |
| `roi_threshold` | float | 0.5 | 0.3-0.7 | Intensity threshold for ROI |

**Mask Extractor Parameters:**

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| `adapt_autocorr` | bool | true | - | Adaptive thresholding |
| `adapt_CB` | float | 50.0 | 5.0-100.0 | Base coefficient |
| `adapt_DF` | float | 0.95 | 0.8-0.99 | Distance decay factor |
| `center_size` | int | 10 | 7-25 | Analysis region size |
| `base_percentile` | float | 50 | 30-70 | Base threshold percentile |
| `percentile_decay` | float | 1.15 | 1.0-1.3 | Decay per ring |
| `max_true_pixels` | int | 25 | 10-40 | Max pixels in mask |

---

### 3.4 Step 3: Training

#### 3.4.1 N2V Training (Single Stage)

```
┌──────────────────────────────────────────────────────────────────────┐
│  ← Back to Hub                      Deep Learning Denoising          │
├──────────────────────────────────────────────────────────────────────┤
│  [1. Data] ──── [2. Config] ──── [3. Training] ──── [4. Inference]   │
│     ✓              ✓                  ●                  ○           │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  N2V TRAINING                                                  │  │
│  │                                                                │  │
│  │  ┌──────────────────────────────────────────────────────────┐  │  │
│  │  │  📊 Configuration Summary                                │  │  │
│  │  │  • Patch Size: 32x32  • Features: 64  • Layers: 2        │  │  │
│  │  │  • Epochs: 100  • Learning Rate: 1e-4  • Batch Size: 4   │  │  │
│  │  └──────────────────────────────────────────────────────────┘  │  │
│  │                                                                │  │
│  │                      [ Start Training ]                        │  │
│  │                                                                │  │
│  │  ─── Training Progress ───────────────────────────────────     │  │
│  │                                                                │  │
│  │  Epoch: 45 / 100                    [████████████░░░░░░░] 45%  │  │
│  │  Current Loss: 0.0234               Best Loss: 0.0198          │  │
│  │  Time Elapsed: 12:34                Est. Remaining: 15:20      │  │
│  │                                                                │  │
│  │  ┌─────────────────────────────────────────────────────────┐   │  │
│  │  │                    LOSS CURVES                          │   │  │
│  │  │    ▲                                                    │   │  │
│  │  │  L │    ╲                                               │   │  │
│  │  │  o │     ╲   ──── Train Loss                            │   │  │
│  │  │  s │      ╲_ ──── Val Loss                              │   │  │
│  │  │  s │        ╲___                                        │   │  │
│  │  │    │            ╲____                                   │   │  │
│  │  │    └──────────────────────────────────────────▶         │   │  │
│  │  │                      Epoch                              │   │  │
│  │  └─────────────────────────────────────────────────────────┘   │  │
│  │                                                                │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                      │
│                                           [← Previous] (disabled)    │
└──────────────────────────────────────────────────────────────────────┘
```

#### 3.4.2 autoStructN2V Training (Three Collapsible Sections)

```
┌───────────────────────────────────────────────────────────────────────────┐
│  ← Back to Hub                        Deep Learning Denoising             │
├───────────────────────────────────────────────────────────────────────────┤
│  [1. Data] ──── [2. Config] ──── [3. Training] ──── [4. Inference]        │
│     ✓              ✓                  ●                  ○                │
├───────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  Overall Progress: [█████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░] 25%   │
│  Stage 1: ✓ Complete  |  Mask: ✓ Extracted  |  Stage 2: ● In Progress     │
│                                                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │  ▼ STAGE 1: N2V Training                               [Complete ✓] │  │
│  ├─────────────────────────────────────────────────────────────────────┤  │
│  │  Epoch: 100/100 • Final Loss: 0.0198 • Duration: 25:12              │  │
│  │                                                                     │  │
│  │  ┌─────────────────────────────────────────────────────────────┐    │  │
│  │  │                    STAGE 1 LOSS CURVES                      │    │  │
│  │  │  [Chart showing train/val loss convergence]                 │    │  │
│  │  └─────────────────────────────────────────────────────────────┘    │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │  ▼ INTERIM RESULTS: Mask Extraction                    [Complete ✓] │  │
│  ├─────────────────────────────────────────────────────────────────────┤  │
│  │                                                                     │  │
│  │  ┌───────────────────────────┐  ┌─────────────────────────────────┐ │  │
│  │  │   EXTRACTED MASK KERNEL   │  │   MASK PARAMETERS               │ │  │
│  │  │                           │  │                                 │ │  │
│  │  │     ░ ░ ░ ░ ░ ░ ░ ░ ░     │  │   Base Percentile   [ 50 ]     │ │  │
│  │  │     ░ ░ ░ ░ ░ ░ ░ ░ ░     │  │   Percentile Decay  [1.15]     │ │  │
│  │  │     ░ ░ ░ █ ░ ░ ░ ░ ░     │  │   Max Pixels        [ 25 ]     │ │  │
│  │  │     ░ ░ █ █ █ ░ ░ ░ ░     │  │   Adaptive Thresh   [✓]        │ │  │
│  │  │     ░ ░ ░ █ ░ ░ ░ ░ ░     │  │                                 │ │  │
│  │  │     ░ ░ ░ ░ ░ ░ ░ ░ ░     │  │   Detected: Cross pattern      │ │  │
│  │  │     ░ ░ ░ ░ ░ ░ ░ ░ ░     │  │   Active pixels: 5             │ │  │
│  │  │                           │  │                                 │ │  │
│  │  │   [11 x 11 kernel]        │  │   [ Regenerate Mask ]           │ │  │
│  │  └───────────────────────────┘  └─────────────────────────────────┘ │  │
│  │                                                                     │  │
│  │  ┌─────────────────────────────────────────────────────────────┐    │  │
│  │  │  ℹ Mask kernel shows detected structural noise pattern.     │    │  │
│  │  │    Dark pixels (█) indicate correlated noise positions.     │    │  │
│  │  │    This pattern will be tiled across training patches.      │    │  │
│  │  └─────────────────────────────────────────────────────────────┘    │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │  ▼ STAGE 2: Structured N2V Training                 [In Progress ●] │  │
│  ├─────────────────────────────────────────────────────────────────────┤  │
│  │  Epoch: 45/100                  [████████████░░░░░░░░] 45%          │  │
│  │  Current Loss: 0.0156           Best Loss: 0.0142                   │  │
│  │  Time Elapsed: 18:45            Est. Remaining: 22:30               │  │
│  │                                                                     │  │
│  │  ┌─────────────────────────────────────────────────────────────┐    │  │
│  │  │                    STAGE 2 LOSS CURVES                      │    │  │
│  │  │  [Chart showing train/val loss in progress]                 │    │  │
│  │  └─────────────────────────────────────────────────────────────┘    │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                                                           │
└───────────────────────────────────────────────────────────────────────────┘
```

#### 3.4.3 Empty Mask Detection

When the mask extractor detects no significant structural noise pattern (e.g., mask has < 2 active pixels or only contains the center pixel), the following UI should appear:

```
┌─────────────────────────────────────────────────────────────────────────┐
│  ▼ INTERIM RESULTS: Mask Extraction                        [Warning ⚠]  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  ⚠ LOW STRUCTURAL NOISE DETECTED                                  │  │
│  │                                                                   │  │
│  │  The mask extractor found minimal structural noise patterns.      │  │
│  │  Active pixels detected: 1 (only center pixel)                    │  │
│  │                                                                   │  │
│  │  This suggests your data primarily contains random noise,         │  │
│  │  which Stage 1 (N2V) has already addressed effectively.           │  │
│  │                                                                   │  │
│  │  RECOMMENDATIONS:                                                 │  │
│  │  • Use the Stage 1 results (N2V denoising) for your final output  │  │
│  │  • Adjust mask parameters and regenerate if you believe           │  │
│  │    structural noise exists but wasn't detected                    │  │
│  │                                                                   │  │
│  │  ┌──────────────────────┐  ┌──────────────────────────────┐       │  │
│  │  │ Use N2V Results      │  │ Adjust Parameters & Retry    │       │  │
│  │  │ (Skip Stage 2)       │  │                              │       │  │
│  │  └──────────────────────┘  └──────────────────────────────┘       │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

#### 3.4.4 Training Complete State

After training completes (either N2V only or full autoStructN2V):

```javascript
{
  trainingComplete: true,
  currentTrainingId: 'train_1703512345678',
  trainingResults: {
    method: 'autostructn2v',  // or 'n2v'
    stage1: {
      finalLoss: 0.0198,
      bestEpoch: 95,
      duration: '25:12'
    },
    stage2: {  // null if N2V only
      finalLoss: 0.0142,
      bestEpoch: 88,
      duration: '35:45'
    },
    maskInfo: {  // null if N2V only
      activePixels: 5,
      kernelSize: 11,
      pattern: 'cross'
    }
  }
}
```

---

### 3.5 Step 4: Inference

#### 3.5.1 UI Layout

```
┌──────────────────────────────────────────────────────────────────────┐
│  ← Back to Hub                      Deep Learning Denoising          │
├──────────────────────────────────────────────────────────────────────┤
│  [1. Data] ──── [2. Config] ──── [3. Training] ──── [4. Inference]   │
│     ✓              ✓                  ✓                  ●           │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  SELECT INFERENCE DATA                                         │  │
│  │                                                                │  │
│  │  ○ Use training data (recommended for initial evaluation)      │  │
│  │  ○ Upload new data                                             │  │
│  │                                                                │  │
│  │  ┌──────────────────────────────────────────────────────────┐  │  │
│  │  │  📁 Inference Images                                     │  │  │
│  │  │  ┌──────────────────────────────────┐  ┌──────────────┐  │  │  │
│  │  │  │ Select from workspace...      ▼ │  │   Upload     │  │  │  │
│  │  │  └──────────────────────────────────┘  └──────────────┘  │  │  │
│  │  └──────────────────────────────────────────────────────────┘  │  │
│  │                                                                │  │
│  │  ┌──────────────────────────────────────────────────────────┐  │  │
│  │  │  VALIDATION                                   [Strict]   │  │  │
│  │  │  ✓ Dimensions match: 512 x 512 x 80 slices               │  │  │
│  │  │  ✓ Bit depth compatible: 16-bit                          │  │  │
│  │  │  ✓ Ready for inference                                   │  │  │
│  │  └──────────────────────────────────────────────────────────┘  │  │
│  │                                                                │  │
│  │                        [ Run Inference ]                       │  │
│  │                                                                │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ─── Inference Progress ──────────────────────────────────────────   │
│                                                                      │
│  Processing slice 40 / 80              [████████████░░░░░░░░] 50%    │
│  Time Elapsed: 02:15                   Est. Remaining: 02:20         │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

#### 3.5.2 Inference Complete

```
┌──────────────────────────────────────────────────────────────────────┐
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  ✓ INFERENCE COMPLETE                                          │  │
│  │                                                                │  │
│  │  Successfully denoised 80 slices in 04:35                      │  │
│  │                                                                │  │
│  │  Output saved to:                                              │  │
│  │  /workspaces/.../results/denoising/train_1703.../n2v_denoised.tif  │  │
│  │                                                                │  │
│  │  ┌─────────────────────┐  ┌─────────────────────────────┐      │  │
│  │  │  View in Image      │  │  Start New Analysis         │      │  │
│  │  │  Viewer             │  │                             │      │  │
│  │  └─────────────────────┘  └─────────────────────────────┘      │  │
│  │                                                                │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

#### 3.5.3 Strict Validation Requirements

| Property | Requirement | Error Message |
|----------|-------------|---------------|
| Width | Must match training data | "Image width (X) does not match training data (Y)" |
| Height | Must match training data | "Image height (X) does not match training data (Y)" |
| Bit depth | Must be compatible (8 or 16-bit) | "Bit depth (X-bit) not compatible with trained model" |
| Format | Must be TIFF stack | "File must be a TIFF image stack" |

---

## 4. Data Management

### 4.1 Directory Structure

```
/workspaces/{sessionId}/
├── uploads/
│   └── denoising/
│       └── {filename}.tif           # Uploaded noisy data
│
├── models/
│   └── denoising/
│       └── {trainingId}/
│           ├── config.json          # Full configuration
│           ├── results.json         # Training metrics & summary
│           ├── stage1_model.pth     # Stage 1 (N2V) model
│           ├── stage2_model.pth     # Stage 2 model (if autoStructN2V)
│           └── extracted_mask.npy   # Mask kernel (if autoStructN2V)
│
└── results/
    └── denoising/
        └── {trainingId}/
            ├── n2v_denoised.tif         # If N2V method
            ├── autostructn2v_denoised.tif  # If autoStructN2V method
            ├── {method}_metadata.json   # Processing metadata
            └── comparison/              # Optional comparison images
                ├── original_slice_50.png
                └── denoised_slice_50.png
```

### 4.2 Filename Convention

Output files include the method name as a prefix for consistency across all denoising methods:

| Method | Output Filename |
|--------|-----------------|
| N2V | `n2v_denoised.tif` |
| autoStructN2V | `autostructn2v_denoised.tif` |
| Gaussian (Filter) | `gaussian_denoised.tif` |
| NLM (Filter) | `nlm_denoised.tif` |

### 4.3 Config.json Structure

```json
{
  "trainingId": "train_1703512345678",
  "method": "autostructn2v",
  "createdAt": "2025-12-25T12:00:00Z",
  "inputFile": {
    "path": "/workspaces/abc123/uploads/denoising/noisy_stack.tif",
    "dimensions": {"width": 512, "height": 512, "slices": 100},
    "bitDepth": 16
  },
  "stage1": {
    "patch_size": 32,
    "patches_per_image": 100,
    "batch_size": 4,
    "mask_percentage": 15.0,
    "use_augmentation": true,
    "features": 64,
    "num_layers": 2,
    "learning_rate": 0.0001,
    "num_epochs": 100,
    "use_roi": true,
    "roi_threshold": 0.5
  },
  "stage2": {
    "patch_size": 64,
    "patches_per_image": 200,
    "batch_size": 2,
    "mask_percentage": 10.0,
    "use_augmentation": true,
    "features": 64,
    "num_layers": 3,
    "learning_rate": 0.00001,
    "num_epochs": 100,
    "extractor": {
      "adapt_autocorr": true,
      "base_percentile": 50,
      "percentile_decay": 1.15,
      "max_true_pixels": 25
    }
  }
}
```

### 4.4 Results.json Structure

```json
{
  "trainingId": "train_1703512345678",
  "status": "complete",
  "stage1": {
    "startedAt": "2025-12-25T12:00:00Z",
    "completedAt": "2025-12-25T12:25:12Z",
    "duration": "25:12",
    "finalLoss": 0.0198,
    "bestEpoch": 95,
    "trainLossHistory": [0.5, 0.3, ...],
    "valLossHistory": [0.52, 0.31, ...]
  },
  "maskExtraction": {
    "completedAt": "2025-12-25T12:25:45Z",
    "kernelSize": 11,
    "activePixels": 5,
    "patternType": "cross"
  },
  "stage2": {
    "startedAt": "2025-12-25T12:25:50Z",
    "completedAt": "2025-12-25T13:01:35Z",
    "duration": "35:45",
    "finalLoss": 0.0142,
    "bestEpoch": 88,
    "trainLossHistory": [0.08, 0.06, ...],
    "valLossHistory": [0.085, 0.062, ...]
  },
  "inference": {
    "completedAt": "2025-12-25T13:06:10Z",
    "slicesProcessed": 100,
    "outputPath": "/workspaces/abc123/results/denoising/train_1703.../autostructn2v_denoised.tif"
  }
}
```

---

## 5. Configuration Presets

### 5.1 Preset File Location

`/config/denoising_presets.json`

### 5.2 Preset Structure

```json
{
  "presets": {
    "fast": {
      "name": "Fast",
      "description": "Quick experiments with reduced quality",
      "stage1": {
        "patch_size": 32,
        "patches_per_image": 50,
        "batch_size": 16,
        "features": 48,
        "num_layers": 2,
        "learning_rate": 0.0002,
        "num_epochs": 50
      },
      "stage2": {
        "patch_size": 48,
        "patches_per_image": 100,
        "batch_size": 8,
        "features": 48,
        "num_layers": 2,
        "learning_rate": 0.00005,
        "num_epochs": 50
      }
    },
    "balanced": {
      "name": "Balanced",
      "description": "Good balance of quality and speed (default)",
      "stage1": {
        "patch_size": 32,
        "patches_per_image": 100,
        "batch_size": 4,
        "features": 64,
        "num_layers": 2,
        "learning_rate": 0.0001,
        "num_epochs": 100
      },
      "stage2": {
        "patch_size": 64,
        "patches_per_image": 200,
        "batch_size": 2,
        "features": 64,
        "num_layers": 3,
        "learning_rate": 0.00001,
        "num_epochs": 100
      }
    },
    "high_quality": {
      "name": "High Quality",
      "description": "Best results, longer training time",
      "stage1": {
        "patch_size": 64,
        "patches_per_image": 200,
        "batch_size": 8,
        "features": 96,
        "num_layers": 3,
        "learning_rate": 0.0002,
        "num_epochs": 150
      },
      "stage2": {
        "patch_size": 128,
        "patches_per_image": 300,
        "batch_size": 4,
        "features": 96,
        "num_layers": 4,
        "learning_rate": 0.000005,
        "num_epochs": 150
      }
    }
  },
  "maskExtractor": {
    "default": {
      "adapt_autocorr": true,
      "adapt_CB": 50.0,
      "adapt_DF": 0.95,
      "center_size": 10,
      "base_percentile": 50,
      "percentile_decay": 1.15,
      "max_true_pixels": 25
    }
  }
}
```

---

## 6. Real-Time Communication

### 6.1 Socket.IO Events

**Room Structure:**
- Training room: `denoising-${trainingId}`
- Inference room: `denoising-inference-${inferenceId}`

**Events Emitted by Server:**

| Event | Stage | Data Structure |
|-------|-------|----------------|
| `denoising-stage1-progress` | Stage 1 | `{epoch, totalEpochs, trainLoss, valLoss, learningRate}` |
| `denoising-stage1-complete` | Stage 1 | `{finalLoss, bestEpoch, duration, modelPath}` |
| `denoising-mask-progress` | Mask | `{status: 'extracting' \| 'analyzing' \| 'complete'}` |
| `denoising-mask-result` | Mask | `{kernelSize, activePixels, pattern, maskPath, previewUrl}` |
| `denoising-stage2-progress` | Stage 2 | `{epoch, totalEpochs, trainLoss, valLoss, learningRate}` |
| `denoising-stage2-complete` | Stage 2 | `{finalLoss, bestEpoch, duration, modelPath}` |
| `denoising-training-complete` | All | `{trainingId, method, results}` |
| `denoising-inference-progress` | Inference | `{currentSlice, totalSlices, progressPercent}` |
| `denoising-inference-complete` | Inference | `{outputPath, metadataPath, slicesProcessed}` |
| `denoising-error` | Any | `{stage, message, details}` |

### 6.2 Client-Side Integration

```javascript
class DenoisingModule extends BaseModule {
  initializeSocket() {
    this.socket = io();

    this.socket.on('connect', () => {
      if (this.currentTrainingId) {
        this.socket.emit('join-denoising', this.currentTrainingId);
      }
    });

    this.socket.on('denoising-stage1-progress', (data) => {
      this.updateStage1Progress(data);
    });

    this.socket.on('denoising-mask-result', (data) => {
      this.showMaskResults(data);
    });

    this.socket.on('denoising-stage2-progress', (data) => {
      this.updateStage2Progress(data);
    });

    this.socket.on('denoising-training-complete', (data) => {
      this.onTrainingComplete(data);
    });

    this.socket.on('denoising-error', (data) => {
      this.handleTrainingError(data);
    });
  }
}
```

---

## 7. Python Backend Integration

### 7.1 Wrapper Script

**File:** `python/autostructn2v_wrapper.py`

```python
#!/usr/bin/env python3
"""
Web integration wrapper for autoStructN2V.

Usage:
    python autostructn2v_wrapper.py --config config.json --mode train
    python autostructn2v_wrapper.py --config config.json --mode inference
    python autostructn2v_wrapper.py --config config.json --mode extract_mask
"""

import sys
import json
import argparse
from pathlib import Path

# Import autoStructN2V library
sys.path.insert(0, str(Path(__file__).parent / 'autoStructN2V'))
from autoStructN2V.pipeline import run_pipeline
from autoStructN2V.masking import StructuralNoiseExtractor, create_full_mask
from autoStructN2V.inference import AutoStructN2VPredictor

def emit_progress(stage: str, data: dict):
    """Emit progress message for Node.js to parse."""
    message = {"stage": stage, **data}
    print(f"DENOISING_PROGRESS:{json.dumps(message)}", flush=True)

def emit_result(stage: str, data: dict):
    """Emit result message for Node.js to parse."""
    message = {"stage": stage, **data}
    print(f"DENOISING_RESULT:{json.dumps(message)}", flush=True)

def emit_error(stage: str, message: str, details: str = None):
    """Emit error message for Node.js to parse."""
    data = {"stage": stage, "message": message}
    if details:
        data["details"] = details
    print(f"DENOISING_ERROR:{json.dumps(data)}", flush=True)

class ProgressCallback:
    """Callback class to emit training progress."""

    def __init__(self, stage: str):
        self.stage = stage

    def on_epoch_end(self, epoch: int, total_epochs: int,
                     train_loss: float, val_loss: float, lr: float):
        emit_progress(self.stage, {
            "epoch": epoch,
            "totalEpochs": total_epochs,
            "trainLoss": train_loss,
            "valLoss": val_loss,
            "learningRate": lr
        })

def run_training(config: dict):
    """Run training with progress callbacks."""
    # Configure progress callbacks
    config['progress_callback_stage1'] = ProgressCallback('stage1')
    config['progress_callback_stage2'] = ProgressCallback('stage2')

    # Run pipeline
    results = run_pipeline(config)

    # Emit completion
    emit_result('complete', {
        "trainingId": config['training_id'],
        "method": 'autostructn2v' if config.get('run_stage2', True) else 'n2v',
        "outputDir": str(results['experiment_dir'])
    })

def run_inference(config: dict):
    """Run inference with progress reporting."""
    # Implementation details...
    pass

def extract_mask_preview(config: dict):
    """Extract mask with given parameters and return preview."""
    # Implementation details...
    pass

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--config', required=True, help='Path to config JSON')
    parser.add_argument('--mode', required=True,
                        choices=['train', 'inference', 'extract_mask'])
    args = parser.parse_args()

    with open(args.config) as f:
        config = json.load(f)

    try:
        if args.mode == 'train':
            run_training(config)
        elif args.mode == 'inference':
            run_inference(config)
        elif args.mode == 'extract_mask':
            extract_mask_preview(config)
    except Exception as e:
        emit_error('fatal', str(e), traceback.format_exc())
        sys.exit(1)
```

### 7.2 Progress Message Protocol

**Training Progress:**
```
DENOISING_PROGRESS:{"stage":"stage1","epoch":45,"totalEpochs":100,"trainLoss":0.0234,"valLoss":0.0256,"learningRate":0.0001}
```

**Mask Extraction:**
```
DENOISING_PROGRESS:{"stage":"mask","status":"analyzing","progress":50}
DENOISING_RESULT:{"stage":"mask","kernelSize":11,"activePixels":5,"pattern":"cross","maskPath":"/path/to/mask.npy"}
```

**Completion:**
```
DENOISING_RESULT:{"stage":"complete","trainingId":"train_123","method":"autostructn2v","outputDir":"/path/to/output"}
```

**Error:**
```
DENOISING_ERROR:{"stage":"stage2","message":"CUDA out of memory","details":"...traceback..."}
```

---

## 8. UI Components

### 8.1 Reusable Components (from Segmentation)

| Component | Source | Usage |
|-----------|--------|-------|
| `FileSelector` | `/workspace/js/core/components/FileSelector.js` | Data upload step |
| `ValidationDisplay` | `/workspace/js/core/components/ValidationDisplay.js` | Validation results |
| `StepNavigator` | `/workspace/js/core/components/StepNavigator.js` | Step progress bar |
| `BaseModule` | `/workspace/js/core/BaseModule.js` | Module base class |

### 8.2 New Components

#### 8.2.1 MaskVisualization

**Purpose:** Display the extracted mask kernel with annotations

**Features:**
- Render boolean mask as pixel grid
- Color coding: true pixels (dark/purple), false pixels (light/gray)
- Kernel size label
- Active pixel count
- Pattern description

#### 8.2.2 MaskParameterPanel

**Purpose:** Interactive parameter adjustment for mask regeneration

**Features:**
- Slider controls for numeric parameters
- Toggle switches for boolean options
- "Regenerate Mask" button
- Loading state during regeneration
- Comparison view (before/after)

#### 8.2.3 DualColumnConfig

**Purpose:** Side-by-side Stage 1/Stage 2 configuration

**Features:**
- Two-column responsive grid
- Synchronized scrolling (optional)
- Copy Stage 1 → Stage 2 button
- Individual stage reset buttons

#### 8.2.4 CollapsibleSection

**Purpose:** Expandable/collapsible content sections

**Features:**
- Header with expand/collapse icon
- Smooth animation
- Remembers state across renders
- Status badge (Complete, In Progress, Pending)

### 8.3 Chart Integration

Use Chart.js (already available in project) for:
- Training loss curves (train/val per stage)
- Combined multi-stage loss visualization
- Epoch progress indicators

---

## 9. State Management

### 9.1 Module State Structure

```javascript
{
  // Step 1 state
  filesValidated: false,
  methodSelected: false,
  selectedMethod: null,  // 'n2v' | 'autostructn2v'
  uploadedFiles: {
    raw_images: null
  },
  validationResults: null,

  // Step 2 state
  configSaved: false,
  configuration: {
    stage1: {...},
    stage2: {...},
    extractor: {...}
  },
  selectedPreset: 'balanced',

  // Step 3 state
  currentTrainingId: null,
  trainingInProgress: false,
  trainingComplete: false,
  stage1Complete: false,
  maskExtracted: false,
  stage2Complete: false,
  trainingResults: null,
  maskResults: null,

  // Step 4 state
  inferenceDataSelected: false,
  inferenceInProgress: false,
  inferenceComplete: false,
  inferenceResults: null,

  // UI state
  expandedSections: {
    stage1Training: true,
    interimResults: true,
    stage2Training: true,
    advancedOptions: false,
    maskExtractor: false
  }
}
```

### 9.2 StateManager Integration

```javascript
// Save state
this.state.update('modules.denoising', this.moduleState);

// Restore state
const savedState = this.state.get('modules.denoising');
if (savedState) {
  this.moduleState = savedState;
  this.restoreUI();
}
```

### 9.3 Resume Capability

```javascript
async checkForResume() {
  const savedState = this.state.get('modules.denoising');

  if (savedState?.trainingInProgress && savedState?.currentTrainingId) {
    // Rejoin Socket.IO room
    this.socket.emit('join-denoising', savedState.currentTrainingId);

    // Check training status from server
    const status = await this.api.getTrainingStatus(savedState.currentTrainingId);

    if (status.stillRunning) {
      // Restore progress UI
      this.restoreTrainingProgress(status);
    } else if (status.complete) {
      // Training completed while away
      this.onTrainingComplete(status.results);
    } else {
      // Training failed
      this.handleTrainingError(status.error);
    }
  }
}
```

---

## 10. Error Handling

### 10.1 Error Categories

| Category | Examples | User Action |
|----------|----------|-------------|
| **Validation Errors** | Invalid file format, dimension mismatch | Re-upload correct file |
| **Configuration Errors** | Invalid parameter values | Adjust parameters |
| **Training Errors** | GPU OOM, convergence failure | Reduce batch size, adjust config |
| **Mask Errors** | No structural noise detected | Use N2V only or adjust params |
| **Inference Errors** | Model loading failure, dimension mismatch | Check model files, validate input |

### 10.2 Error Display Patterns

**Inline Validation Errors:**
```html
<div class="validation-error">
  <span class="error-icon">⚠</span>
  <span class="error-message">Patch size must be a power of 2 (32, 64, 128)</span>
</div>
```

**Training Error Modal:**
```html
<div class="error-modal">
  <h3>Training Error</h3>
  <p class="error-summary">CUDA out of memory during Stage 2</p>
  <details>
    <summary>Technical Details</summary>
    <pre>RuntimeError: CUDA out of memory. Tried to allocate 512 MiB...</pre>
  </details>
  <div class="error-actions">
    <button>Reduce Batch Size & Retry</button>
    <button>Use Stage 1 Results Only</button>
  </div>
</div>
```

### 10.3 Recovery Strategies

| Error | Recovery Strategy |
|-------|-------------------|
| GPU OOM (Stage 1) | Reduce batch size to 2, reduce patch size |
| GPU OOM (Stage 2) | Reduce batch size to 1, reduce patch size |
| No structural noise | Suggest switching to N2V mode |
| Convergence failure | Suggest different learning rate, more epochs |
| File validation failure | Show specific requirements, allow re-upload |

---

## 11. Testing Requirements

### 11.1 Test Data

| File | Purpose | Location |
|------|---------|----------|
| `denoising_test_noisy.tif` | Noisy test stack (100 slices) | `/test_data/denoising/` |
| `denoising_test_structured.tif` | Stack with structured noise | `/test_data/denoising/` |

### 11.2 Validation Test Cases

| Test Case | Input | Expected Result |
|-----------|-------|-----------------|
| Valid TIFF stack | 512x512x100, 16-bit | Validation passes |
| Wrong format | .png file | Error: Must be TIFF |
| Too few slices | 5 slices | Warning: Recommend 20+ |
| 8-bit data | 8-bit TIFF | Validation passes |
| RGB image | 3-channel TIFF | Error: Must be grayscale |

### 11.3 UI Test Scenarios

| Scenario | Steps | Verification |
|----------|-------|--------------|
| Full N2V workflow | Upload → Configure → Train → Infer | Results saved correctly |
| Full autoStructN2V workflow | Upload → Configure → Train (2 stages) → Infer | Mask extracted, both stages complete |
| Mask regeneration | After Stage 1 → Adjust params → Regenerate | New mask displayed |
| Empty mask detection | Data with no structured noise | Suggestion to use N2V shown |
| Resume after disconnect | Disconnect during training → Reconnect | Progress restored |

---

## 12. Implementation Roadmap

### Phase 1: Foundation
- [ ] Create module file structure
- [ ] Implement DenoisingModule class extending BaseModule
- [ ] Create DenoisingAPI.js with endpoint methods
- [ ] Add route stubs in src/routes/denoising.routes.js
- [ ] Register module in registry.js

### Phase 2: Step 1 - Data Selection
- [ ] Integrate FileSelector for raw images
- [ ] Add method selection UI (N2V vs autoStructN2V)
- [ ] Implement TIFF validation for denoising
- [ ] Add test data loading capability
- [ ] Wire up "Next" navigation

### Phase 3: Step 2 - Configuration
- [ ] Create DualColumnConfig component
- [ ] Implement CollapsibleSection component
- [ ] Build N2V config form (single column)
- [ ] Build autoStructN2V config form (dual column)
- [ ] Add preset loading from backend
- [ ] Implement config validation

### Phase 4: Step 3 - Training (N2V)
- [ ] Create Python wrapper script
- [ ] Implement training start endpoint
- [ ] Add Socket.IO room management
- [ ] Build training progress UI
- [ ] Add loss curve charts
- [ ] Handle training completion

### Phase 5: Step 3 - Training (autoStructN2V)
- [ ] Add Stage 1 training section
- [ ] Implement mask extraction progress
- [ ] Create MaskVisualization component
- [ ] Create MaskParameterPanel component
- [ ] Add mask regeneration endpoint
- [ ] Implement empty mask detection
- [ ] Add Stage 2 training section
- [ ] Handle multi-stage completion

### Phase 6: Step 4 - Inference
- [ ] Add inference data selection
- [ ] Implement strict validation
- [ ] Create inference endpoint
- [ ] Add inference progress UI
- [ ] Handle results display
- [ ] Add Image Viewer integration

### Phase 7: Polish
- [ ] Add error handling throughout
- [ ] Implement state persistence/resume
- [ ] Add configuration presets file
- [ ] Write integration tests
- [ ] Documentation and comments

---

## Appendix A: N2V vs autoStructN2V Decision Guide

| Noise Characteristic | Recommended Method |
|---------------------|-------------------|
| Random, uncorrelated (thermal, shot noise) | N2V |
| Visible scan lines | autoStructN2V |
| Periodic patterns | autoStructN2V |
| Camera fixed-pattern noise | autoStructN2V |
| Unknown noise type | Start with autoStructN2V, check mask |
| Very weak noise | N2V (fewer artifacts) |

## Appendix B: Memory Requirements

| Configuration | Approximate GPU Memory |
|---------------|----------------------|
| Fast preset (Stage 1) | ~2 GB |
| Fast preset (Stage 2) | ~3 GB |
| Balanced preset (Stage 1) | ~4 GB |
| Balanced preset (Stage 2) | ~6 GB |
| High Quality (Stage 1) | ~8 GB |
| High Quality (Stage 2) | ~12 GB |

## Appendix C: References

- [Noise2Void Paper](https://arxiv.org/abs/1811.10980)
- [Structured Noise2Void](https://github.com/juglab/n2v)
- autoStructN2V Documentation: `/docs/autoStructN2V/docs/`
- autoStructN2V Codebase: `/docs/autoStructN2V/codebase/`
- Segmentation Module: `/public/workspace/js/modules/segmentation/`
