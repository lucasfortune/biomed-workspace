# Filter-Based Denoising Module - Product Specification

**Version:** 1.0
**Last Updated:** 2025-12-25
**Status:** Draft

---

## Table of Contents

1. [Overview](#1-overview)
2. [Module Card & Navigation](#2-module-card--navigation)
3. [User Flow & Steps](#3-user-flow--steps)
4. [Filter Methods](#4-filter-methods)
5. [Data Management](#5-data-management)
6. [Backend Integration](#6-backend-integration)
7. [UI Components](#7-ui-components)
8. [State Management](#8-state-management)
9. [Error Handling](#9-error-handling)
10. [Implementation Roadmap](#10-implementation-roadmap)

---

## 1. Overview

### 1.1 Purpose

The Filter-Based Denoising Module provides fast, traditional denoising methods for microscopy TIFF image stacks. Unlike the Deep Learning-based module which requires training, filter-based methods apply mathematical transformations directly to the image data, producing immediate results.

### 1.2 Comparison with DL-Based Denoising

| Aspect | Filter-Based | Deep Learning |
|--------|--------------|---------------|
| **Speed** | Seconds to minutes | Hours (training required) |
| **Setup** | No training needed | Requires training phase |
| **Quality** | Good for general noise | Superior for complex noise patterns |
| **Adaptability** | Fixed algorithms | Learns from data |
| **Best For** | Quick processing, known noise types | Unknown/complex noise, structured artifacts |

### 1.3 Available Methods

| Method | Description | Best For |
|--------|-------------|----------|
| **Gaussian Filter** | Smooths images by averaging with Gaussian-weighted neighbors | General smoothing, reducing high-frequency noise |
| **Non-Local Means (NLM)** | Compares patches across the image to preserve edges while denoising | Edge-preserving denoising, textured regions |

### 1.4 Target Users

- Researchers needing quick denoising without training overhead
- Users with well-characterized noise (Gaussian, salt-and-pepper)
- Preprocessing step before DL-based methods
- Quick quality assessment of noisy data

---

## 2. Module Card & Navigation

### 2.1 Dual-Button Module Card

The Denoising module is unique in having two launch options accessible from the same card on the workspace main page.

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│                          🔬                                 │
│                                                             │
│                      Denoising                              │
│                                                             │
│     Self-supervised and filter-based image denoising        │
│                                                             │
│  ┌─────────────────────┐  ┌─────────────────────────────┐  │
│  │   Deep Learning     │  │      Filter-Based           │  │
│  │   N2V / autoN2V     │  │   Gaussian / NLM            │  │
│  └─────────────────────┘  └─────────────────────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Module Registry Update

The module registry needs to support a new card type with multiple launch buttons:

```javascript
// In modules/registry.js
{
  id: 'denoising',
  name: 'Denoising',
  description: 'Self-supervised and filter-based image denoising',
  icon: '🔬',
  color: '#9B59B6',
  status: 'available',
  // New: Multiple launch options
  cardType: 'multi-launch',
  launchOptions: [
    {
      id: 'denoising-dl',
      label: 'Deep Learning',
      sublabel: 'N2V / autoN2V',
      path: '/workspace/js/modules/denoising/DenoisingModule.js'
    },
    {
      id: 'denoising-filter',
      label: 'Filter-Based',
      sublabel: 'Gaussian / NLM',
      path: '/workspace/js/modules/denoising-filter/FilterDenoisingModule.js'
    }
  ],
  inputs: ['raw_images'],
  outputs: ['denoised_images']
}
```

---

## 3. User Flow & Steps

### 3.1 Step Configuration

```javascript
const config = {
  id: 'denoising-filter',
  name: 'Filter-Based Denoising',
  cssPath: '/workspace/js/modules/denoising-filter/css/filter-denoising.css',
  steps: [
    {
      id: 'upload',
      name: 'Data Selection',
      canNavigate: true
    },
    {
      id: 'config',
      name: 'Configuration',
      canNavigate: (module) => module.filesValidated
    },
    {
      id: 'processing',
      name: 'Processing',
      canNavigate: (module) => module.configSaved
    }
  ]
};
```

### 3.2 Step 1: Data Selection

```
┌──────────────────────────────────────────────────────────────────────┐
│  ← Back to Hub                      Filter-Based Denoising           │
├──────────────────────────────────────────────────────────────────────┤
│  [1. Data] ──── [2. Config] ──── [3. Processing]                     │
│     ●              ○                    ○                            │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  SELECT IMAGE DATA                                             │  │
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
│                                                    [ Next → ]        │
└──────────────────────────────────────────────────────────────────────┘
```

#### 3.2.1 Requirements

| Requirement | Description |
|-------------|-------------|
| File format | TIFF image stack (.tif, .tiff) |
| Channels | Single channel (grayscale) |
| Bit depth | 8-bit (uint8) or 16-bit (uint16) |
| Minimum images | 1 slice (no minimum for filter methods) |

#### 3.2.2 Test Data

Uses the same test data as the DL Denoising module:
- Location: `/test_data/denoising/`
- Files: `denoising_test_noisy.tif`

### 3.3 Step 2: Configuration

```
┌──────────────────────────────────────────────────────────────────────┐
│  ← Back to Hub                      Filter-Based Denoising           │
├──────────────────────────────────────────────────────────────────────┤
│  [1. Data] ──── [2. Config] ──── [3. Processing]                     │
│     ✓              ●                    ○                            │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  SELECT DENOISING METHOD                                       │  │
│  │                                                                │  │
│  │  ┌─────────────────────────┐  ┌─────────────────────────────┐  │  │
│  │  │  ● Gaussian Filter      │  │  ○ Non-Local Means          │  │  │
│  │  │                         │  │                             │  │  │
│  │  │  Smooths by averaging   │  │  Preserves edges while      │  │  │
│  │  │  with Gaussian weights  │  │  reducing noise             │  │  │
│  │  └─────────────────────────┘  └─────────────────────────────┘  │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  GAUSSIAN FILTER PARAMETERS                                    │  │
│  │                                                                │  │
│  │  Sigma (σ)                                                     │  │
│  │  ├────────────●──────────────────────────────────┤  [ 1.5 ]    │  │
│  │  0.5                                            5.0            │  │
│  │  Controls blur strength. Higher = more smoothing.              │  │
│  │                                                                │  │
│  │  Kernel Size                                                   │  │
│  │  ┌───────────────────────────────────────────────────────┐     │  │
│  │  │  5 x 5                                             ▼ │     │  │
│  │  └───────────────────────────────────────────────────────┘     │  │
│  │  Size of the filter window. Larger = considers more pixels.   │  │
│  │                                                                │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                      │
│                                           [← Previous]  [ Next → ]   │
└──────────────────────────────────────────────────────────────────────┘
```

#### 3.3.1 NLM Configuration View

When Non-Local Means is selected:

```
┌────────────────────────────────────────────────────────────────┐
│  NON-LOCAL MEANS PARAMETERS                                    │
│                                                                │
│  Filter Strength (h)                                           │
│  ├────────────────●────────────────────────────────┤  [ 10 ]   │
│  1                                                30           │
│  Higher values = more noise removal, but may blur details.     │
│                                                                │
│  Template Window Size                                          │
│  ┌───────────────────────────────────────────────────────┐     │
│  │  7                                                 ▼ │     │
│  └───────────────────────────────────────────────────────┘     │
│  Size of patches to compare (odd numbers: 3, 5, 7, ..., 21).   │
│                                                                │
│  Search Window Size                                            │
│  ┌───────────────────────────────────────────────────────┐     │
│  │  21                                                ▼ │     │
│  └───────────────────────────────────────────────────────┘     │
│  Area to search for similar patches (odd numbers: 7-51).       │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

### 3.4 Step 3: Processing

```
┌──────────────────────────────────────────────────────────────────────┐
│  ← Back to Hub                      Filter-Based Denoising           │
├──────────────────────────────────────────────────────────────────────┤
│  [1. Data] ──── [2. Config] ──── [3. Processing]                     │
│     ✓              ✓                    ●                            │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  READY TO PROCESS                                              │  │
│  │                                                                │  │
│  │  ┌──────────────────────────────────────────────────────────┐  │  │
│  │  │  📊 Configuration Summary                                │  │  │
│  │  │  • Method: Gaussian Filter                               │  │  │
│  │  │  • Sigma: 1.5                                            │  │  │
│  │  │  • Kernel Size: 5 x 5                                    │  │  │
│  │  │  • Input: noisy_stack.tif (100 slices)                   │  │  │
│  │  └──────────────────────────────────────────────────────────┘  │  │
│  │                                                                │  │
│  │                    [ Start Denoising ]                         │  │
│  │                                                                │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                      │
│                                           [← Previous]               │
└──────────────────────────────────────────────────────────────────────┘
```

#### 3.4.1 Processing State

```
┌────────────────────────────────────────────────────────────────┐
│  PROCESSING                                                    │
│                                                                │
│                         ◐                                      │
│                                                                │
│                  Processing images...                          │
│                                                                │
│            Applying Gaussian filter to 100 slices              │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

#### 3.4.2 Success State

```
┌────────────────────────────────────────────────────────────────┐
│  ✓ PROCESSING COMPLETE                                         │
│                                                                │
│  Successfully denoised 100 slices                              │
│                                                                │
│  Output saved as:                                              │
│  gaussian_denoised.tif                                         │
│                                                                │
│  ┌─────────────────────┐  ┌─────────────────────────────┐      │
│  │  View in Image      │  │  Start New Analysis         │      │
│  │  Viewer             │  │                             │      │
│  └─────────────────────┘  └─────────────────────────────┘      │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

## 4. Filter Methods

### 4.1 Gaussian Filter

#### 4.1.1 Description

The Gaussian filter applies a weighted average using a Gaussian kernel. Pixels closer to the center contribute more to the average than distant pixels.

#### 4.1.2 Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| `sigma` | float | 1.5 | 0.5 - 5.0 | Standard deviation of Gaussian. Higher = more blur. |
| `kernel_size` | int | 5 | 3, 5, 7, 9, 11 | Size of the filter window. Must be odd. |

#### 4.1.3 Implementation Notes

```python
from scipy.ndimage import gaussian_filter

# Apply 2D Gaussian to each slice
for i, slice in enumerate(stack):
    denoised[i] = gaussian_filter(slice, sigma=sigma)
```

#### 4.1.4 Use Cases

- General noise reduction
- Preprocessing before edge detection
- Smoothing high-frequency noise

### 4.2 Non-Local Means (NLM)

#### 4.2.1 Description

NLM compares small patches around each pixel with patches elsewhere in the image. Similar patches contribute to the weighted average, preserving edges and textures while removing noise.

#### 4.2.2 Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| `h` | float | 10 | 1 - 30 | Filter strength. Higher = more denoising, potential blur. |
| `template_window_size` | int | 7 | 3, 5, 7, ..., 21 | Size of patches to compare. Must be odd. |
| `search_window_size` | int | 21 | 7, 9, ..., 51 | Area to search for similar patches. Must be odd. |

#### 4.2.3 Implementation Notes

```python
from skimage.restoration import denoise_nl_means, estimate_sigma

# Estimate noise level
sigma_est = estimate_sigma(slice)

# Apply NLM with estimated sigma
denoised = denoise_nl_means(
    slice,
    h=h * sigma_est,
    patch_size=template_window_size,
    patch_distance=search_window_size // 2,
    fast_mode=True
)
```

#### 4.2.4 Use Cases

- Edge-preserving denoising
- Textured regions
- When Gaussian blur is too aggressive

---

## 5. Data Management

### 5.1 Directory Structure

```
/workspaces/{sessionId}/
├── uploads/
│   └── denoising/
│       └── {filename}.tif           # Uploaded noisy data (shared with DL)
│
└── results/
    └── denoising/
        └── {processingId}/
            ├── gaussian_denoised.tif    # If Gaussian method
            ├── gaussian_metadata.json
            │
            ├── nlm_denoised.tif         # If NLM method
            └── nlm_metadata.json
```

### 5.2 Filename Convention

Output files include the method name as a prefix:
- Gaussian: `gaussian_denoised.tif`
- NLM: `nlm_denoised.tif`

This applies to both filter-based and DL-based denoising:
- N2V: `n2v_denoised.tif`
- autoStructN2V: `autostructn2v_denoised.tif`

### 5.3 Metadata Structure

```json
{
  "processingId": "filter_1703512345678",
  "method": "gaussian",
  "createdAt": "2025-12-25T12:00:00Z",
  "inputFile": {
    "path": "/workspaces/abc123/uploads/denoising/noisy_stack.tif",
    "filename": "noisy_stack.tif",
    "dimensions": {"width": 512, "height": 512, "slices": 100},
    "bitDepth": 16
  },
  "parameters": {
    "sigma": 1.5,
    "kernel_size": 5
  },
  "output": {
    "path": "/workspaces/abc123/results/denoising/filter_1703.../gaussian_denoised.tif",
    "filename": "gaussian_denoised.tif"
  },
  "processingTime": "2.5s"
}
```

---

## 6. Backend Integration

### 6.1 File Structure

```
python/
└── filter_denoising.py        # Main processing script

src/routes/
└── denoising.routes.js        # Add filter endpoints (extend existing)

public/workspace/js/modules/denoising-filter/
├── FilterDenoisingModule.js   # Main module class
├── FilterDenoisingAPI.js      # API client
└── css/
    └── filter-denoising.css   # Module styling
```

### 6.2 Python Script

**File:** `python/filter_denoising.py`

```python
#!/usr/bin/env python3
"""
Filter-based denoising for TIFF stacks.

Usage:
    python filter_denoising.py --input input.tif --output output.tif \
                               --method gaussian --sigma 1.5 --kernel 5
"""

import sys
import json
import argparse
import numpy as np
from pathlib import Path
import tifffile
from scipy.ndimage import gaussian_filter
from skimage.restoration import denoise_nl_means, estimate_sigma

def emit_result(data: dict):
    """Emit result message for Node.js to parse."""
    print(f"FILTER_RESULT:{json.dumps(data)}", flush=True)

def emit_error(message: str, details: str = None):
    """Emit error message for Node.js to parse."""
    data = {"success": False, "message": message}
    if details:
        data["details"] = details
    print(f"FILTER_ERROR:{json.dumps(data)}", flush=True)

def apply_gaussian(stack: np.ndarray, sigma: float, kernel_size: int) -> np.ndarray:
    """Apply Gaussian filter to each slice."""
    result = np.zeros_like(stack)
    for i in range(stack.shape[0]):
        result[i] = gaussian_filter(stack[i], sigma=sigma)
    return result

def apply_nlm(stack: np.ndarray, h: float, template_size: int, search_size: int) -> np.ndarray:
    """Apply Non-Local Means to each slice."""
    result = np.zeros_like(stack, dtype=np.float64)
    for i in range(stack.shape[0]):
        slice_norm = stack[i].astype(np.float64) / stack[i].max()
        sigma_est = estimate_sigma(slice_norm)
        denoised = denoise_nl_means(
            slice_norm,
            h=h * sigma_est,
            patch_size=template_size,
            patch_distance=search_size // 2,
            fast_mode=True
        )
        result[i] = denoised * stack[i].max()
    return result.astype(stack.dtype)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', required=True, help='Input TIFF path')
    parser.add_argument('--output', required=True, help='Output TIFF path')
    parser.add_argument('--method', required=True, choices=['gaussian', 'nlm'])
    parser.add_argument('--sigma', type=float, default=1.5)
    parser.add_argument('--kernel', type=int, default=5)
    parser.add_argument('--h', type=float, default=10)
    parser.add_argument('--template', type=int, default=7)
    parser.add_argument('--search', type=int, default=21)
    args = parser.parse_args()

    try:
        # Load stack
        stack = tifffile.imread(args.input)

        # Apply filter
        if args.method == 'gaussian':
            result = apply_gaussian(stack, args.sigma, args.kernel)
        else:
            result = apply_nlm(stack, args.h, args.template, args.search)

        # Save result
        tifffile.imwrite(args.output, result)

        emit_result({
            "success": True,
            "output_path": args.output,
            "slices_processed": stack.shape[0]
        })

    except Exception as e:
        emit_error(str(e))
        sys.exit(1)

if __name__ == '__main__':
    main()
```

### 6.3 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `POST /api/denoising/filter/process` | POST | Start filter-based denoising |
| `GET /api/denoising/filter/status/:id` | GET | Get processing status |

### 6.4 Request/Response Format

**Request:**
```json
{
  "inputPath": "/workspaces/.../noisy_stack.tif",
  "method": "gaussian",
  "parameters": {
    "sigma": 1.5,
    "kernel_size": 5
  }
}
```

**Response:**
```json
{
  "success": true,
  "processingId": "filter_1703512345678",
  "outputPath": "/workspaces/.../gaussian_denoised.tif",
  "metadataPath": "/workspaces/.../gaussian_metadata.json",
  "slicesProcessed": 100,
  "processingTime": "2.5s"
}
```

---

## 7. UI Components

### 7.1 Reusable Components

| Component | Source | Usage |
|-----------|--------|-------|
| `FileSelector` | `/workspace/js/core/components/FileSelector.js` | Data selection |
| `ValidationDisplay` | `/workspace/js/core/components/ValidationDisplay.js` | Validation results |
| `StepNavigator` | `/workspace/js/core/components/StepNavigator.js` | Step progress |
| `BaseModule` | `/workspace/js/core/BaseModule.js` | Module base class |

### 7.2 New Components

#### 7.2.1 MethodSelector

**Purpose:** Radio-button selector for filter method with method descriptions

**Features:**
- Radio buttons for Gaussian / NLM
- Description text for each method
- Visual highlight on selection
- Triggers dynamic parameter form update

#### 7.2.2 DynamicParameterForm

**Purpose:** Renders appropriate parameter inputs based on selected method

**Features:**
- Slider inputs with value display
- Dropdown selects for discrete options
- Descriptive help text for each parameter
- Input validation

---

## 8. State Management

### 8.1 Module State Structure

```javascript
{
  // Step 1 state
  filesValidated: false,
  uploadedFiles: {
    raw_images: null
  },
  validationResults: null,

  // Step 2 state
  configSaved: false,
  selectedMethod: 'gaussian',  // 'gaussian' | 'nlm'
  parameters: {
    gaussian: {
      sigma: 1.5,
      kernel_size: 5
    },
    nlm: {
      h: 10,
      template_window_size: 7,
      search_window_size: 21
    }
  },

  // Step 3 state
  processingId: null,
  isProcessing: false,
  processingComplete: false,
  results: null
}
```

### 8.2 StateManager Integration

```javascript
// Save state
this.state.update('modules.denoising-filter', this.moduleState);

// Restore state (optional, filter processing is fast)
const savedState = this.state.get('modules.denoising-filter');
```

**Note:** Since filter processing is fast (seconds), resume capability is less critical than for DL training.

---

## 9. Error Handling

### 9.1 Error Categories

| Category | Examples | User Action |
|----------|----------|-------------|
| **Validation Errors** | Invalid file format, unsupported bit depth | Re-upload correct file |
| **Parameter Errors** | Invalid sigma, kernel size | Adjust parameters |
| **Processing Errors** | Memory error, file write failure | Reduce image size, check disk space |

### 9.2 Error Display

```
┌────────────────────────────────────────────────────────────────┐
│  ⚠ PROCESSING ERROR                                            │
│                                                                │
│  Failed to process images: Memory allocation failed            │
│                                                                │
│  Try reducing the image size or closing other applications.    │
│                                                                │
│  ┌─────────────────────┐                                       │
│  │  Try Again          │                                       │
│  └─────────────────────┘                                       │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

## 10. Implementation Roadmap

### Phase 1: Foundation
- [ ] Create module file structure
- [ ] Implement FilterDenoisingModule class extending BaseModule
- [ ] Create FilterDenoisingAPI.js
- [ ] Add filter endpoints to denoising.routes.js
- [ ] Update module registry for dual-button card

### Phase 2: Step 1 - Data Selection
- [ ] Integrate FileSelector for raw images
- [ ] Connect to shared test data
- [ ] Implement validation display
- [ ] Wire up "Next" navigation

### Phase 3: Step 2 - Configuration
- [ ] Create MethodSelector component
- [ ] Build Gaussian parameter form
- [ ] Build NLM parameter form
- [ ] Implement dynamic form switching
- [ ] Add parameter validation

### Phase 4: Step 3 - Processing
- [ ] Create Python filter_denoising.py script
- [ ] Implement processing endpoint
- [ ] Add spinner UI
- [ ] Handle success state
- [ ] Add Image Viewer integration

### Phase 5: Integration
- [ ] Test with workspace file management
- [ ] Verify output file naming convention
- [ ] Test dual-button card navigation
- [ ] Error handling throughout

---

## Appendix A: Parameter Recommendations

### Gaussian Filter

| Noise Level | Sigma | Kernel Size |
|-------------|-------|-------------|
| Low | 0.5 - 1.0 | 3 |
| Medium | 1.0 - 2.0 | 5 |
| High | 2.0 - 3.0 | 7 |

### Non-Local Means

| Noise Level | h | Template | Search |
|-------------|---|----------|--------|
| Low | 5 - 10 | 5 | 15 |
| Medium | 10 - 15 | 7 | 21 |
| High | 15 - 25 | 9 | 31 |

## Appendix B: Performance Estimates

| Method | 512x512x100 Stack | Notes |
|--------|-------------------|-------|
| Gaussian | ~2-5 seconds | Very fast |
| NLM | ~30-60 seconds | Slower but preserves edges |

## Appendix C: References

- [scipy.ndimage.gaussian_filter](https://docs.scipy.org/doc/scipy/reference/generated/scipy.ndimage.gaussian_filter.html)
- [skimage.restoration.denoise_nl_means](https://scikit-image.org/docs/stable/api/skimage.restoration.html#skimage.restoration.denoise_nl_means)
- DL Denoising Module Spec: `/docs/vision/spec_files/DL_DENOISING_MODULE_PRODUCT_SPEC.md`
