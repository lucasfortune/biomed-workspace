# Module Framework Documentation

**Last Updated:** 2025-12-22
**Framework Version:** 1.0
**Target Audience:** Developers creating or maintaining workspace modules

---

## Overview

The Module Framework provides a consistent structure for building workspace modules. It includes:

- **BaseModule** - Abstract base class with lifecycle management and step navigation
- **Reusable Components** - StepNavigator, FileSelector, ValidationDisplay
- **Shared CSS** - Design tokens and common styles via `module-base.css`

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     Module Framework                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────┐    ┌──────────────────────────────┐    │
│  │   BaseModule    │    │        Components            │    │
│  │                 │    │                              │    │
│  │ • activate()    │    │ • StepNavigator              │    │
│  │ • deactivate()  │    │ • FileSelector               │    │
│  │ • goToStep()    │    │ • ValidationDisplay          │    │
│  │ • render()      │    │ • (more coming)              │    │
│  │ • loadCSS()     │    │                              │    │
│  └────────┬────────┘    └──────────────────────────────┘    │
│           │                                                  │
│           ▼                                                  │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              module-base.css                         │    │
│  │                                                      │    │
│  │  CSS Variables: --module-primary, --module-bg, etc.  │    │
│  │  Common Styles: .btn, .step-nav, .validation-*, etc. │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Your Module                               │
│                                                              │
│  class MyModule extends BaseModule {                         │
│    constructor(stateManager) {                               │
│      super(stateManager, { ... config ... });                │
│    }                                                         │
│    render() { ... }                                          │
│  }                                                           │
└─────────────────────────────────────────────────────────────┘
```

---

## Quick Start

### 1. Extend BaseModule

```javascript
import BaseModule from '/workspace/js/core/BaseModule.js';

class MyModule extends BaseModule {
  constructor(stateManager) {
    super(stateManager, {
      id: 'mymodule',
      name: 'My Module',
      cssPath: '/workspace/js/modules/mymodule/css/mymodule.css',
      steps: [
        { id: 'upload', name: 'Upload Data' },
        { id: 'process', name: 'Process' },
        { id: 'results', name: 'Results' }
      ]
    });
  }

  render() {
    this.container.innerHTML = `
      ${this.renderHeader()}
      ${this.renderStepNav()}
      <div class="step-contents">
        <!-- Your step content here -->
      </div>
    `;
  }
}

export default MyModule;
```

### 2. Use Components

```javascript
import { StepNavigator, FileSelector, ValidationDisplay }
  from '/workspace/js/core/components/index.js';

// In your initialize() method:
this.stepNavigator = new StepNavigator({
  steps: this.config.steps,
  currentStep: this.currentStep,
  onStepClick: (step) => this.goToStep(step),
  canNavigate: (step) => this.canNavigateToStep(step)
});

this.validationDisplay = new ValidationDisplay('validationContainer');
```

### 3. Import Shared CSS

```css
/* In your module's CSS file */
@import url('/workspace/js/core/css/module-base.css');

/* Add module-specific styles below */
```

---

## BaseModule API Reference

### Constructor

```javascript
constructor(stateManager, config)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `stateManager` | StateManager | The centralized state manager instance |
| `config` | Object | Module configuration (see below) |

#### Config Object

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | string | Yes | Unique module identifier |
| `name` | string | Yes | Display name |
| `cssPath` | string | No | Path to module CSS file |
| `steps` | Array | No | Step configuration array |

### Lifecycle Methods

#### `async activate()`
Called when the module is loaded. Default implementation:
1. Gets container element
2. Loads CSS (if `config.cssPath` specified)
3. Calls `loadDependencies()`
4. Calls `render()`
5. Calls `initialize()`

**Note:** Loading overlay is handled by ModuleLoader - don't call `showLoading()` in activate.

#### `async deactivate()`
Called when leaving the module. Default implementation clears container HTML.

#### `cleanup()`
Optional cleanup method for releasing resources.

### Abstract Methods (Must Override)

#### `render()`
Render the module UI into `this.container`. Must be implemented by subclass.

### Optional Override Methods

#### `async loadDependencies()`
Load external dependencies (scripts, libraries). Override for custom loading.

#### `async initialize()`
Initialize components after render. Called automatically after `render()`.

### Step Navigation Methods

#### `goToStep(stepNumber)`
Navigate to a specific step (1-indexed).

```javascript
this.goToStep(2); // Go to step 2
```

#### `nextStep()`
Navigate to the next step.

#### `previousStep()`
Navigate to the previous step.

#### `canNavigateToStep(stepNumber)`
Check if navigation to a step is allowed. Override for custom logic.

```javascript
canNavigateToStep(stepNumber) {
  if (stepNumber === 2) {
    return this.filesUploaded;
  }
  return super.canNavigateToStep(stepNumber);
}
```

### Utility Methods

#### `async loadCSS(path, id)`
Load a CSS file dynamically.

```javascript
await this.loadCSS('/path/to/styles.css', 'my-styles');
```

#### `async loadScript(src)`
Load a JavaScript file dynamically.

```javascript
await this.loadScript('/socket.io/socket.io.js');
```

#### `showLoading(title, description)`
Show a loading overlay. Use for long operations within the module.

```javascript
this.showLoading('Processing', 'Please wait...');
```

#### `hideLoading()`
Hide the loading overlay.

#### `renderHeader(title, subtitle)`
Returns HTML for the module header with back button.

```javascript
this.container.innerHTML = this.renderHeader('My Module', 'Step 1 of 3');
```

#### `renderStepNav()`
Returns HTML for the step navigation bar.

---

## Component API Reference

### StepNavigator

Renders a step navigation bar with progress indicator.

#### Constructor

```javascript
const stepNav = new StepNavigator({
  steps: [
    { id: 'upload', name: 'Upload' },
    { id: 'config', name: 'Configure' },
    { id: 'process', name: 'Process' }
  ],
  currentStep: 1,
  onStepClick: (stepNumber) => this.goToStep(stepNumber),
  canNavigate: (stepNumber) => this.canNavigateToStep(stepNumber)
});
```

| Option | Type | Description |
|--------|------|-------------|
| `steps` | Array | Array of step objects with `id` and `name` |
| `currentStep` | number | Current active step (1-indexed) |
| `onStepClick` | Function | Callback when a step is clicked |
| `canNavigate` | Function | Function to check if navigation is allowed |

#### Methods

| Method | Description |
|--------|-------------|
| `render()` | Returns HTML string for the step navigator |
| `init(container)` | Initialize after render, attaches event listeners |
| `update(stepNumber)` | Update the current step |
| `setStepState(stepNumber, state)` | Set step state: 'active', 'completed', 'blocked' |

---

### FileSelector

A file selection component supporting workspace files, uploads, and test data.

#### Constructor

```javascript
const fileSelector = new FileSelector({
  id: 'raw_images',
  fileType: 'raw_images',
  title: 'Raw Images',
  icon: '📁',
  showTestData: true,
  stateManager: this.state,
  onSelect: (fileInfo) => this.onFileSelected('raw_images', fileInfo),
  onUpload: (file, result) => this.onFileUploaded('raw_images', file, result)
});
```

| Option | Type | Description |
|--------|------|-------------|
| `id` | string | Unique identifier |
| `fileType` | string | Type for upload endpoint |
| `title` | string | Display title |
| `icon` | string | Icon emoji |
| `showTestData` | boolean | Show "Use Test Data" option |
| `stateManager` | StateManager | State manager instance |
| `onSelect` | Function | Callback when file is selected |
| `onUpload` | Function | Callback when file is uploaded |

#### Methods

| Method | Description |
|--------|-------------|
| `render()` | Returns HTML string |
| `init()` | Initialize after render |
| `setSelectedFile(fileInfo)` | Programmatically set selected file |
| `refresh()` | Refresh file list |

---

### ValidationDisplay

Displays validation messages with success/error/info styling.

#### Constructor

```javascript
const validation = new ValidationDisplay('validationContainer');
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `containerId` | string | ID of the container element |

#### Methods

| Method | Description |
|--------|-------------|
| `show(type, title, details)` | Show message with type: 'success', 'error', 'info', 'warning' |
| `showSuccess(title, details)` | Show success message |
| `showError(title, details)` | Show error message |
| `showInfo(title, details)` | Show info message |
| `showWarning(title, details)` | Show warning message |
| `showLoading(message)` | Show loading state |
| `hide()` | Hide the display |

#### Details Format

Details can be a string or array of objects:

```javascript
// String
validation.showError('Validation Failed', 'File format not supported');

// Array of details
validation.showSuccess('Validation Passed', [
  { label: 'Dimensions', value: '512x512x100' },
  { label: 'Data Type', value: 'uint8' },
  { label: 'File Size', value: '52 MB' }
]);
```

---

## CSS Variables Reference

The framework uses CSS custom properties for consistent styling. Import `module-base.css` to use these variables.

### Colors

| Variable | Value | Description |
|----------|-------|-------------|
| `--module-primary` | #667eea | Primary accent color |
| `--module-primary-dark` | #5568d3 | Darker primary |
| `--module-secondary` | #764ba2 | Secondary accent |
| `--module-gradient` | linear-gradient(...) | Primary gradient |

### Status Colors

| Variable | Description |
|----------|-------------|
| `--module-success-bg` | Success background (#d4edda) |
| `--module-success-border` | Success border (#c3e6cb) |
| `--module-success-text` | Success text (#155724) |
| `--module-error-bg` | Error background (#f8d7da) |
| `--module-error-border` | Error border (#f5c6cb) |
| `--module-error-text` | Error text (#721c24) |
| `--module-info-bg` | Info background (#d1ecf1) |
| `--module-warning-bg` | Warning background (#fff3cd) |

### Neutral Colors

| Variable | Description |
|----------|-------------|
| `--module-bg` | Module background (#f6f8fa) |
| `--module-card-bg` | Card background (white) |
| `--module-border` | Standard border (#e1e4e8) |
| `--module-border-dark` | Darker border (#d1d5da) |
| `--module-text-primary` | Primary text (#24292e) |
| `--module-text-secondary` | Secondary text (#6a737d) |

### Spacing

| Variable | Value |
|----------|-------|
| `--module-spacing-xs` | 8px |
| `--module-spacing-sm` | 16px |
| `--module-spacing-md` | 20px |
| `--module-spacing-lg` | 24px |
| `--module-spacing-xl` | 30px |
| `--module-spacing-xxl` | 40px |

### Typography & Borders

| Variable | Value |
|----------|-------|
| `--module-font-family` | System font stack |
| `--module-radius-sm` | 6px |
| `--module-radius-md` | 8px |
| `--module-radius-lg` | 10px |
| `--module-radius-xl` | 12px |

### Shadows & Transitions

| Variable | Description |
|----------|-------------|
| `--module-shadow-sm` | Small shadow |
| `--module-shadow-md` | Medium shadow |
| `--module-shadow-button` | Button shadow |
| `--module-transition-fast` | 0.2s ease |
| `--module-transition-normal` | 0.3s ease |

---

## Step Configuration Guide

### Basic Step Configuration

```javascript
{
  steps: [
    { id: 'upload', name: 'Data Upload' },
    { id: 'config', name: 'Configuration' },
    { id: 'train', name: 'Training' },
    { id: 'inference', name: 'Inference' }
  ]
}
```

### Conditional Navigation

Override `canNavigateToStep()` for conditional logic:

```javascript
canNavigateToStep(stepNumber) {
  switch(stepNumber) {
    case 1:
      return true; // Always accessible
    case 2:
      return this.filesValidated; // Requires validation
    case 3:
      return this.configSaved; // Requires config
    case 4:
      return this.trainingComplete || this.hasImportedModel;
    default:
      return false;
  }
}
```

### Step State Flags

Track step completion with instance properties:

```javascript
constructor(stateManager) {
  super(stateManager, config);

  // Step condition flags
  this.filesValidated = false;
  this.configSaved = false;
  this.trainingComplete = false;
}

// Update flags when conditions are met
onValidationSuccess() {
  this.filesValidated = true;
}
```

---

## Migration Guide

### Migrating from Custom Module to BaseModule

#### Step 1: Update Imports

```javascript
// Before
class MyModule {
  constructor(stateManager) { ... }
}

// After
import BaseModule from '/workspace/js/core/BaseModule.js';

class MyModule extends BaseModule {
  constructor(stateManager) {
    super(stateManager, {
      id: 'mymodule',
      name: 'My Module',
      cssPath: '/path/to/css'
    });
  }
}
```

#### Step 2: Use renderHeader() and renderStepNav()

```javascript
render() {
  this.container.innerHTML = `
    ${this.renderHeader()}
    ${this.renderStepNav()}
    <div class="step-contents">
      <!-- Step content -->
    </div>
  `;
}
```

#### Step 3: Initialize Components in initialize()

```javascript
async initialize() {
  // Initialize StepNavigator
  this.stepNavigator = new StepNavigator({
    steps: this.config.steps,
    currentStep: this.currentStep,
    onStepClick: (step) => this.goToStep(step),
    canNavigate: (step) => this.canNavigateToStep(step)
  });
  this.stepNavigator.init(this.container);

  // Initialize other components...
}
```

#### Step 4: Update goToStep() Calls

```javascript
// Update step navigator when step changes
goToStep(stepNumber) {
  super.goToStep(stepNumber);

  if (this.stepNavigator) {
    this.stepNavigator.update(stepNumber);
  }
}
```

#### Step 5: Replace Inline Validation with ValidationDisplay

```javascript
// Before
const div = document.getElementById('result');
div.className = 'success';
div.innerHTML = '<h4>Success!</h4><p>Details...</p>';

// After
this.validationDisplay.showSuccess('Success!', [
  { label: 'Status', value: 'Completed' }
]);
```

#### Step 6: Update CSS to Import Base

```css
/* At top of your module CSS */
@import url('/workspace/js/core/css/module-base.css');

/* Remove duplicate styles that are now in base */
```

---

## File Structure

```
/public/workspace/js/
├── core/
│   ├── BaseModule.js           # Base class
│   ├── index.js                # Core exports
│   ├── css/
│   │   └── module-base.css     # Shared styles
│   └── components/
│       ├── index.js            # Component exports
│       ├── StepNavigator.js
│       ├── FileSelector.js
│       └── ValidationDisplay.js
│
└── modules/
    ├── registry.js             # Module registry
    ├── segmentation/
    │   ├── SegmentationModule.js
    │   └── css/
    │       └── segmentation-modern.css
    └── imageviewer/
        ├── ImageViewerModule.js
        └── css/
            └── imageviewer.css
```

---

## Related Documentation

- [Module Creation Guide](MODULE_CREATION.md) - Step-by-step module creation
- [Module Architecture](../architecture/MODULE_ARCHITECTURE.md) - System design
- [State Architecture](../architecture/STATE_ARCHITECTURE.md) - State management

---

**Navigation:**
← [Module Creation](MODULE_CREATION.md) | [Guides](.) | [Troubleshooting](TROUBLESHOOTING.md) →
