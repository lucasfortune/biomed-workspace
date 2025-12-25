# Implementation Plan: Filter-Based Denoising Module

## Overview

Implement the filter-based denoising module following the BaseModule framework pattern, with dual-button module card support for switching between filter-based and deep learning denoising.

## Phase 1: Dual-Button Module Card Support

### 1.1 Update Module Registry

**File:** `public/workspace/js/modules/registry.js`

Add new card type with launch options:

```javascript
{
  id: 'denoising',
  name: 'Denoising',
  description: 'Self-supervised and filter-based image denoising',
  icon: '🔬',
  color: '#9B59B6',
  status: 'available',
  cardType: 'multi-launch',
  launchOptions: [
    {
      id: 'denoising-dl',
      label: 'Deep Learning',
      sublabel: 'N2V / autoN2V',
      path: '/workspace/js/modules/denoising/DenoisingModule.js',
      status: 'coming_soon'
    },
    {
      id: 'denoising-filter',
      label: 'Filter-Based',
      sublabel: 'Gaussian / NLM',
      path: '/workspace/js/modules/denoising-filter/FilterDenoisingModule.js',
      status: 'available'
    }
  ],
  inputs: ['raw_images'],
  outputs: ['denoised_images']
}
```

### 1.2 Update Workspace Card Rendering

**File:** `public/workspace/js/workspace.js`

Modify `renderModuleCards()` to handle `cardType: 'multi-launch'`:

```javascript
renderModuleCards() {
  const grid = document.getElementById('modules-grid');
  const modules = this.moduleLoader.getAllModules();

  grid.innerHTML = modules.map(module => {
    if (module.cardType === 'multi-launch') {
      return this.renderMultiLaunchCard(module);
    }
    return this.renderSingleLaunchCard(module);
  }).join('');
}

renderMultiLaunchCard(module) {
  const buttons = module.launchOptions.map(opt => {
    if (opt.status === 'coming_soon') {
      return `<button class="btn-launch btn-launch-half" disabled>
        ${opt.label}<br><small>${opt.sublabel}</small>
      </button>`;
    }
    return `<button class="btn-launch btn-launch-half"
            onclick="workspace.loadModule('${opt.id}')">
      ${opt.label}<br><small>${opt.sublabel}</small>
    </button>`;
  }).join('');

  return `
    <div class="module-card" style="--card-color: ${module.color}">
      <div class="module-icon">${module.icon}</div>
      <h3>${module.name}</h3>
      <p>${module.description}</p>
      <div class="module-buttons-dual">${buttons}</div>
    </div>
  `;
}
```

### 1.3 Add CSS for Dual Buttons

**File:** `public/workspace/css/workspace.css`

```css
.module-buttons-dual {
  display: flex;
  gap: 0.5rem;
  width: 100%;
}

.btn-launch-half {
  flex: 1;
  padding: 0.5rem;
  font-size: 0.85rem;
  line-height: 1.3;
}

.btn-launch-half small {
  opacity: 0.8;
  font-size: 0.75rem;
}
```

---

## Phase 2: Module File Structure

### 2.1 Create Directory Structure

```
public/workspace/js/modules/denoising-filter/
├── FilterDenoisingModule.js    # Main module class
├── FilterDenoisingAPI.js       # API client (optional, can use inline fetch)
└── css/
    └── filter-denoising.css    # Module-specific styles
```

### 2.2 FilterDenoisingModule.js Structure

```javascript
import BaseModule from '../../core/BaseModule.js';

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

class FilterDenoisingModule extends BaseModule {
  constructor(stateManager) {
    super(stateManager, config);

    // State flags for step navigation
    this.filesValidated = false;
    this.configSaved = false;
    this.processingComplete = false;

    // Module data
    this.uploadedFile = null;
    this.selectedMethod = 'gaussian';
    this.parameters = { /* defaults */ };
    this.results = null;
  }

  async loadDependencies() {
    // No external dependencies needed for filter-based
    this.dependenciesLoaded = true;
  }

  render() {
    this.container.innerHTML = `
      ${this.renderHeader()}
      <div class="module-content">
        ${this.renderStepNav()}
        <div class="steps-container">
          ${this.renderStep1()}
          ${this.renderStep2()}
          ${this.renderStep3()}
        </div>
      </div>
    `;
  }

  // Step rendering methods...
  // Event handlers...
  // API calls...
}

export default FilterDenoisingModule;
```

---

## Phase 3: Step 1 - Data Selection

### 3.1 UI Components

- FileSelector component (reuse from core/components)
- Test data checkbox
- Validation display

### 3.2 Implementation

```javascript
renderStep1() {
  return `
    <div class="step-content" data-step="1">
      <h3>Select Image Data</h3>
      <div class="card">
        <div id="file-selector-container"></div>
        <div class="checkbox-field">
          <input type="checkbox" id="use-test-data">
          <label for="use-test-data">Use test data</label>
        </div>
      </div>
      <div id="validation-display"></div>
      ${this.renderNavigationButtons({ showPrevious: false, nextDisabled: true })}
    </div>
  `;
}

async initializeStep1() {
  // Initialize FileSelector component
  this.fileSelector = new FileSelector({
    container: '#file-selector-container',
    fileType: 'raw_images',
    onSelect: (file) => this.handleFileSelected(file),
    onUpload: (file) => this.handleFileUploaded(file)
  });

  // Test data checkbox handler
  document.getElementById('use-test-data').addEventListener('change', (e) => {
    if (e.target.checked) this.loadTestData();
  });
}

async handleFileValidated(result) {
  this.filesValidated = result.success;
  this.uploadedFile = result.file;
  this.updateStepNavigation();
  // Enable next button
}
```

---

## Phase 4: Step 2 - Configuration

### 4.1 UI Components

- Method selector (radio buttons: Gaussian / NLM)
- Dynamic parameter form based on selected method
- Parameter descriptions/tooltips

### 4.2 Parameter Definitions

**Gaussian Filter:**
| Parameter | Type | Default | Range | UI |
|-----------|------|---------|-------|-----|
| sigma | float | 1.5 | 0.5-5.0 | Slider + number input |
| kernel_size | int | 5 | 3,5,7,9,11 | Dropdown select |

**Non-Local Means:**
| Parameter | Type | Default | Range | UI |
|-----------|------|---------|-------|-----|
| h | float | 10 | 1-30 | Slider + number input |
| template_window | int | 7 | 3-21 (odd) | Dropdown |
| search_window | int | 21 | 7-51 (odd) | Dropdown |

### 4.3 Implementation

```javascript
renderStep2() {
  return `
    <div class="step-content" data-step="2">
      <h3>Configure Denoising</h3>

      <div class="card">
        <h4>Select Method</h4>
        <div class="method-selector">
          <label class="method-option">
            <input type="radio" name="method" value="gaussian" checked>
            <span class="method-label">
              <strong>Gaussian Filter</strong>
              <small>Smooths by averaging with Gaussian weights</small>
            </span>
          </label>
          <label class="method-option">
            <input type="radio" name="method" value="nlm">
            <span class="method-label">
              <strong>Non-Local Means</strong>
              <small>Preserves edges while reducing noise</small>
            </span>
          </label>
        </div>
      </div>

      <div class="card" id="parameters-container">
        ${this.renderGaussianParams()}
      </div>

      ${this.renderNavigationButtons({ showPrevious: true })}
    </div>
  `;
}

renderGaussianParams() {
  return `
    <h4>Gaussian Parameters</h4>
    <div class="form-field">
      <label>Sigma (σ)</label>
      <div class="slider-input">
        <input type="range" id="sigma" min="0.5" max="5" step="0.1" value="1.5">
        <input type="number" id="sigma-value" value="1.5" step="0.1">
      </div>
      <small>Controls blur strength. Higher = more smoothing.</small>
    </div>
    <div class="form-field">
      <label>Kernel Size</label>
      <select id="kernel-size">
        <option value="3">3 × 3</option>
        <option value="5" selected>5 × 5</option>
        <option value="7">7 × 7</option>
        <option value="9">9 × 9</option>
        <option value="11">11 × 11</option>
      </select>
      <small>Size of filter window.</small>
    </div>
  `;
}

renderNLMParams() {
  return `
    <h4>Non-Local Means Parameters</h4>
    <div class="form-field">
      <label>Filter Strength (h)</label>
      <div class="slider-input">
        <input type="range" id="h" min="1" max="30" value="10">
        <input type="number" id="h-value" value="10">
      </div>
      <small>Higher = more denoising, may blur details.</small>
    </div>
    <div class="form-field">
      <label>Template Window Size</label>
      <select id="template-window">
        ${[3,5,7,9,11,13,15,17,19,21].map(v =>
          `<option value="${v}" ${v===7?'selected':''}>${v}</option>`
        ).join('')}
      </select>
      <small>Patch size to compare (odd numbers).</small>
    </div>
    <div class="form-field">
      <label>Search Window Size</label>
      <select id="search-window">
        ${[7,11,15,21,31,41,51].map(v =>
          `<option value="${v}" ${v===21?'selected':''}>${v}</option>`
        ).join('')}
      </select>
      <small>Area to search for similar patches.</small>
    </div>
  `;
}
```

---

## Phase 5: Step 3 - Processing

### 5.1 UI Components

- Configuration summary
- Start button
- Spinner during processing
- Success section with results

### 5.2 Implementation

```javascript
renderStep3() {
  return `
    <div class="step-content" data-step="3">
      <h3>Processing</h3>

      <div class="card" id="ready-section">
        <h4>Ready to Process</h4>
        <div id="config-summary"></div>
        <button class="btn btn-primary" id="start-btn">
          Start Denoising
        </button>
      </div>

      <div class="card" id="processing-section" style="display:none">
        <div class="spinner"></div>
        <p>Processing images...</p>
        <p id="processing-status"></p>
      </div>

      <div class="card" id="results-section" style="display:none">
        <div class="success-message">
          <h4>✓ Processing Complete</h4>
          <p id="results-info"></p>
        </div>
        <div class="button-group">
          <button class="btn btn-primary" id="view-results-btn">
            View in Image Viewer
          </button>
          <button class="btn btn-secondary" id="new-analysis-btn">
            Start New Analysis
          </button>
        </div>
      </div>

      ${this.renderNavigationButtons({ showPrevious: true, showNext: false })}
    </div>
  `;
}

async startProcessing() {
  this.showProcessing();

  try {
    const response = await fetch('/api/denoising/filter/process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inputPath: this.uploadedFile.path,
        method: this.selectedMethod,
        parameters: this.parameters
      })
    });

    const result = await response.json();

    if (result.success) {
      this.showResults(result);
    } else {
      throw new Error(result.error);
    }
  } catch (error) {
    this.showError(error.message);
  }
}
```

---

## Phase 6: Backend Integration

### 6.1 Add Routes

**File:** `src/routes/denoising.routes.js` (new file)

```javascript
const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

function createDenoisingRoutes({ requireAuth, workspaceManager }) {
  const router = express.Router();

  router.post('/filter/process', requireAuth, async (req, res) => {
    const { inputPath, method, parameters } = req.body;
    const sessionId = req.session.id;

    // Generate processing ID
    const processingId = `filter_${Date.now()}`;

    // Create output directory
    const outputDir = path.join('workspaces', sessionId, 'results', 'denoising', processingId);
    fs.mkdirSync(outputDir, { recursive: true });

    // Determine output filename
    const outputFilename = `${method}_denoised.tif`;
    const outputPath = path.join(outputDir, outputFilename);

    // Build Python command
    const args = [
      'python/filter_denoising.py',
      '--input', inputPath,
      '--output', outputPath,
      '--method', method
    ];

    // Add method-specific parameters
    if (method === 'gaussian') {
      args.push('--sigma', parameters.sigma.toString());
      args.push('--kernel', parameters.kernel_size.toString());
    } else if (method === 'nlm') {
      args.push('--h', parameters.h.toString());
      args.push('--template', parameters.template_window.toString());
      args.push('--search', parameters.search_window.toString());
    }

    // Run Python script
    const pythonProcess = spawn('python', args);

    let stdout = '';
    let stderr = '';

    pythonProcess.stdout.on('data', (data) => { stdout += data; });
    pythonProcess.stderr.on('data', (data) => { stderr += data; });

    pythonProcess.on('close', (code) => {
      if (code === 0) {
        // Parse result
        const resultLine = stdout.split('\n').find(l => l.startsWith('FILTER_RESULT:'));
        const result = resultLine ? JSON.parse(resultLine.substring(14)) : {};

        res.json({
          success: true,
          processingId,
          outputPath: outputPath,
          outputFilename,
          ...result
        });
      } else {
        res.status(500).json({
          success: false,
          error: stderr || 'Processing failed'
        });
      }
    });
  });

  return router;
}

module.exports = createDenoisingRoutes;
```

### 6.2 Register Routes

**File:** `src/app.js`

```javascript
const denoisingRoutes = require('./routes/denoising.routes');
// ...
app.use('/api/denoising', denoisingRoutes({ requireAuth, workspaceManager }));
```

### 6.3 Python Script

**File:** `python/filter_denoising.py`

```python
#!/usr/bin/env python3
"""
Filter-based denoising for TIFF stacks.
Uses scipy and skimage for Gaussian and Non-Local Means filtering.
"""

import sys
import json
import argparse
import numpy as np
import tifffile
from scipy.ndimage import gaussian_filter
from skimage.restoration import denoise_nl_means, estimate_sigma

def emit_result(data):
    print(f"FILTER_RESULT:{json.dumps(data)}", flush=True)

def emit_error(message):
    print(f"FILTER_ERROR:{json.dumps({'error': message})}", flush=True)

def apply_gaussian(stack, sigma, kernel_size):
    """Apply Gaussian filter to each slice."""
    result = np.zeros_like(stack, dtype=np.float64)
    for i in range(stack.shape[0]):
        result[i] = gaussian_filter(stack[i].astype(np.float64), sigma=sigma)
    return result.astype(stack.dtype)

def apply_nlm(stack, h, template_size, search_size):
    """Apply Non-Local Means to each slice."""
    result = np.zeros_like(stack, dtype=np.float64)
    for i in range(stack.shape[0]):
        slice_norm = stack[i].astype(np.float64)
        if slice_norm.max() > 0:
            slice_norm = slice_norm / slice_norm.max()
        sigma_est = estimate_sigma(slice_norm)
        denoised = denoise_nl_means(
            slice_norm,
            h=h * sigma_est,
            patch_size=template_size,
            patch_distance=search_size // 2,
            fast_mode=True
        )
        result[i] = denoised * stack[i].max() if stack[i].max() > 0 else denoised
    return result.astype(stack.dtype)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--method', required=True, choices=['gaussian', 'nlm'])
    parser.add_argument('--sigma', type=float, default=1.5)
    parser.add_argument('--kernel', type=int, default=5)
    parser.add_argument('--h', type=float, default=10)
    parser.add_argument('--template', type=int, default=7)
    parser.add_argument('--search', type=int, default=21)
    args = parser.parse_args()

    try:
        stack = tifffile.imread(args.input)

        if args.method == 'gaussian':
            result = apply_gaussian(stack, args.sigma, args.kernel)
        else:
            result = apply_nlm(stack, args.h, args.template, args.search)

        tifffile.imwrite(args.output, result)

        emit_result({
            'success': True,
            'slices_processed': stack.shape[0],
            'method': args.method
        })

    except Exception as e:
        emit_error(str(e))
        sys.exit(1)

if __name__ == '__main__':
    main()
```

---

## Phase 7: CSS Styling

**File:** `public/workspace/js/modules/denoising-filter/css/filter-denoising.css`

```css
/* Method selector styling */
.method-selector {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.method-option {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 1rem;
  border: 2px solid var(--module-border, #e0e0e0);
  border-radius: 8px;
  cursor: pointer;
  transition: border-color 0.2s, background-color 0.2s;
}

.method-option:hover {
  background-color: var(--module-hover-bg, #f5f5f5);
}

.method-option input:checked + .method-label {
  color: var(--module-primary, #4A90E2);
}

.method-option:has(input:checked) {
  border-color: var(--module-primary, #4A90E2);
  background-color: var(--module-primary-bg, #e8f4fc);
}

.method-label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.method-label small {
  color: var(--module-text-secondary, #666);
}

/* Slider + number input combo */
.slider-input {
  display: flex;
  gap: 1rem;
  align-items: center;
}

.slider-input input[type="range"] {
  flex: 1;
}

.slider-input input[type="number"] {
  width: 80px;
}

/* Processing states */
.processing-spinner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  padding: 2rem;
}

.success-message {
  padding: 1.5rem;
  background: var(--module-success-bg, #d4edda);
  border-radius: 8px;
  margin-bottom: 1rem;
}

.success-message h4 {
  margin: 0 0 0.5rem 0;
  color: var(--module-success-text, #155724);
}

/* Button group */
.button-group {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
}
```

---

## Implementation Order

1. **Phase 1**: Dual-button card support (registry + workspace.js + CSS)
2. **Phase 2**: Create module directory and base class structure
3. **Phase 6.3**: Create Python script (can test independently)
4. **Phase 3**: Implement Step 1 (Data Selection)
5. **Phase 4**: Implement Step 2 (Configuration)
6. **Phase 5 + 6.1-6.2**: Implement Step 3 + Backend routes
7. **Phase 7**: CSS refinements

---

## Files to Create/Modify

| File | Action |
|------|--------|
| `public/workspace/js/modules/registry.js` | Modify |
| `public/workspace/js/workspace.js` | Modify |
| `public/workspace/css/workspace.css` | Modify |
| `public/workspace/js/modules/denoising-filter/FilterDenoisingModule.js` | Create |
| `public/workspace/js/modules/denoising-filter/css/filter-denoising.css` | Create |
| `python/filter_denoising.py` | Create |
| `src/routes/denoising.routes.js` | Create |
| `src/app.js` | Modify |

---

## Testing Checklist

- [ ] Dual-button card renders correctly
- [ ] Both buttons work (filter available, DL disabled)
- [ ] Module loads and step navigation works
- [ ] File upload and validation works
- [ ] Test data loads correctly
- [ ] Method switching updates parameter form
- [ ] Parameter inputs sync (slider ↔ number)
- [ ] Processing runs successfully
- [ ] Results display correctly
- [ ] "View in Image Viewer" works
- [ ] "Start New Analysis" resets module
- [ ] Back to Hub works
- [ ] No console errors
