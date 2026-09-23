# Module Creation Guide

**Last Updated:** 2026-09-03
**Estimated Time:** 1-2 hours for first module (using framework)
**Difficulty:** Intermediate
**Target Audience:** Developers adding new processing modules to the Workspace version

---

> **Every module extends BaseModule.**
>
> New modules are created by copying the template module, which already
> implements every convention in the UI contract. Do not hand-roll a module
> class - the framework owns the lifecycle, the step chrome, CSS loading and
> the shared components.
>
> **Quick Links:**
> - [Module Framework Documentation](MODULE_FRAMEWORK.md) - API reference
> - [Template module + UI contract README](../../public/workspace/js/modules/template/) - copy this

---

## Using the Framework

### Recommended Approach for New Modules

1. **Copy the template module:**
   ```bash
   cd public/workspace/js/modules
   cp -r template yourmodule
   ```

2. **Customize for your needs:**
   - Rename `TemplateModule.js` to `YourModule.js`
   - Update the class name and configuration
   - Implement your processing logic

3. **Register in `registry.js`** (see [Step 4](#step-4-register-module))

4. **See the template's README** - it is the UI contract, plus the full checklist

### Framework Benefits

- **BaseModule** handles lifecycle, step navigation, CSS load/unload, loading overlay
- **StepNavigator** for the step indicator bar, gated by `canNavigate`
- **NavigationButtons** for a Previous/Next row's state (optional)
- **FileSelector** for file selection, uploads and built-in test data
- **ValidationDisplay** for success/error/info/warning blocks
- **SliceViewerChrome** for the shared slice-viewer frame
- **`core/icons.js`** for the shared inline-SVG icon set
- **Shared CSS tokens and baselines** for consistent styling (light/dark mode)

For full documentation, see [Module Framework](MODULE_FRAMEWORK.md).

### Available Core Components (5)

Exported from `/public/workspace/js/core/components/index.js`:

| Component | Purpose |
|-----------|---------|
| StepNavigator | Step-based workflow navigation (attaches to `renderStepNav()` markup) |
| NavigationButtons | Previous/Next row state (labels, enabled, visible) |
| ValidationDisplay | Validation feedback, plus `renderContainer(id)` for its slot |
| FileSelector | File selection with uploads, test data and help icons |
| SliceViewerChrome | Shared slice-viewer header / slider / footer |

The help-panel components in the same directory (`InfoPanel`, `InfoArticle`,
`InfoGlossary`, `InfoSearch`) are loaded as classic `<script>` tags by
`workspace/index.html`, and `ResumeDialog` is dynamically imported by
`workspace.js`; none of them are exported from the index.

---

## Overview

This guide walks you through creating a new processing module for the Workspace version of the Biomedical Image Processing application. You'll learn how to build a complete module from scratch, integrate it with the module system, and test it.

### What You'll Learn

- Module system architecture and lifecycle
- Step-by-step module creation process
- State management integration
- Backend API integration
- UI design patterns for modules
- Testing and debugging techniques

### What You'll Build

A complete, working example module that demonstrates:
- Module structure and interface
- State management with StateManager
- API communication with WorkspaceAPI
- File upload and processing
- Real-time progress updates
- Results visualization

### Prerequisites

**Required Knowledge:**
- JavaScript ES6+ (classes, async/await, modules)
- HTML/CSS for UI
- Basic understanding of the workspace architecture

**Required Reading:**
- [Module Architecture](../architecture/MODULE_ARCHITECTURE.md) - Module system design
- [State Architecture](../architecture/STATE_ARCHITECTURE.md) - State management
- [API Endpoints](../reference/API_ENDPOINTS.md) - Backend API reference

**Required Setup:**
- Development environment running (`npm run dev`)
- Access to workspace version (`http://localhost:3000/workspace`)
- Browser DevTools open for debugging

---

## Module System Quick Refresher

### Module Lifecycle

```
Registration (startup)
   ↓
User clicks "Launch Module"
   ↓
Dynamic Import (ES6)
   ↓
Instantiation (new Module(stateManager))
   ↓
Activation (activate())
   ↓
Module Active (user interacts)
   ↓
User clicks "Back to Hub"
   ↓
Deactivation (deactivate())
   ↓
Module Inactive (still in memory)
```

### Module Interface Contract

`ModuleLoader` needs `activate()` and `deactivate()` - and `BaseModule`
provides both. A module therefore implements `render()` (required) and
overrides `initialize()` and `deactivate()`:

```javascript
import BaseModule from '/workspace/js/core/BaseModule.js';

class MyModule extends BaseModule {
  constructor(stateManager) {
    super(stateManager, { id: 'mymodule', name: 'My Module', cssPath: '...', steps: [...] });
  }

  render() { /* required: write the step markup into this.container */ }

  async initialize() { /* create components, setupEventListeners() */ }

  async deactivate() {
    this.reset();                 // reset on leave - DOM still exists here
    /* remove tracked listeners, disconnect sockets, delete window handle */
    await super.deactivate();
  }
}

export default MyModule;
```

`ModuleLoader` caches the instance between visits and calls `unloadCSS()`
after `deactivate()`.

See [Module Architecture](../architecture/MODULE_ARCHITECTURE.md) for complete details.

---

## Step 1: Plan Your Module

### Define Module Purpose

Before writing code, clearly define:

1. **What does your module do?**
   - Example: "Process TIFF images to remove noise using deep learning"

2. **What inputs does it need?**
   - Example: `['image_stack']` (noisy images)

3. **What outputs does it produce?**
   - Example: `['denoised_stack']` (cleaned images)

4. **What backend processing is required?**
   - Example: Spawn Python script for denoising

5. **Does it need real-time progress updates?**
   - Example: Yes, show denoising progress per slice

### Example: Denoising Module

Let's create a **Deep Learning Denoising Module** as our working example.

**Purpose:** Remove noise from electron microscopy images
**Inputs:** `image_stack` (noisy TIFF)
**Outputs:** `denoised_stack` (cleaned TIFF)
**Processing:** Python script with deep learning model
**Progress:** Real-time updates via Socket.IO

---

## Step 2: Create Module Directory

### Directory Structure

```bash
# Navigate to modules directory
cd public/workspace/js/modules

# Copy the template - it already has the class, the CSS and the README
cp -r template denoising
cd denoising
mv TemplateModule.js DenoisingModule.js
mv css/template.css css/denoising.css
```

### Final Structure

```
public/workspace/js/modules/
├── registry.js
├── template/               # never edited in place - always copied
├── segmentation/
│   └── SegmentationModule.js
└── denoising/                  # NEW
    ├── DenoisingModule.js      # NEW
    ├── css/denoising.css       # NEW - @imports module-base.css
    └── README.md               # NEW (optional)
```

The two largest modules (`segmentation/` and `denoising-dl/`) keep their markup in
`templates/Templates.js` and their logic in `handlers/*.js`; follow that split when a
single module file becomes hard to navigate.

---

## Step 3: Create Module Class

### Basic Module Template

Open `denoising/DenoisingModule.js`. The copied template already has the whole
skeleton; the parts you actually rewrite are the config, `render()`, the
component setup and the processing logic:

```javascript
import BaseModule from '/workspace/js/core/BaseModule.js';
import { StepNavigator, FileSelector, ValidationDisplay }
  from '/workspace/js/core/components/index.js';

/**
 * DenoisingModule - Remove noise from electron microscopy images
 */
class DenoisingModule extends BaseModule {
  constructor(stateManager) {
    super(stateManager, {
      id: 'denoising',
      name: 'Deep Learning Denoising',
      cssPath: '/workspace/js/modules/denoising/css/denoising.css',
      steps: [
        { id: 'upload', name: 'Data Upload' },
        { id: 'configure', name: 'Configure' },
        { id: 'process', name: 'Process' }
      ]
    });

    // Step condition flags (drive canNavigateToStep)
    this.filesValidated = false;
    this.configSaved = false;

    // Module state - never assign to this.config, BaseModule owns it
    this.uploadedFile = null;
    this.processingConfig = null;
    this.socket = null;

    // Tracked listeners so deactivate() can remove every one
    this.eventListeners = [];
  }

  /** Help icon that opens the info panel on a specific article */
  renderHelpIcon(articleId) {
    return `<span class="help-icon" data-info-id="${articleId}" title="Click for help">
      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 …"/></svg>
    </span>`;
  }

  render() {
    this.container.innerHTML = `
      <div class="denoising-module module-container">
        ${this.renderHeader()}
        ${this.renderStepNav()}
        <div class="step-contents">

          <div id="step1" class="step-content active">
            <div class="step-inner">
              <h3>Upload Noisy Images</h3>
              <p class="step-description">Select or upload the stack to denoise.</p>
              <div id="fileSelectorContainer"></div>
              ${ValidationDisplay.renderContainer('validationResult')}
              <div class="navigation-buttons">
                <div></div>
                <button id="step1Next" class="btn" disabled>Next: Configure</button>
              </div>
            </div>
          </div>

          <div id="step2" class="step-content">
            <div class="step-inner">
              <h3>Configure Denoising</h3>
              <div class="section-card">
                <h4>Model</h4>
                <div class="form-field">
                  <label for="modelType">Model type</label>
                  <select id="modelType">
                    <option value="n2v">Noise2Void</option>
                    <option value="autostructn2v">autoStructN2V</option>
                  </select>
                  <span class="field-hint">N2V is the safe default.</span>
                </div>
                <div class="form-field">
                  <label for="epochs">Epochs</label>
                  <input type="number" id="epochs" class="input-sm" value="30" min="1" max="500">
                </div>
              </div>
              <div class="navigation-buttons">
                <button id="step2Back" class="btn secondary">Back</button>
                <button id="step2Next" class="btn">Next: Process</button>
              </div>
            </div>
          </div>

          <div id="step3" class="step-content">
            <div class="step-inner">
              <h3>Processing</h3>

              <div id="processingProgress" class="progress-section" style="display: none;">
                <div class="progress-info">
                  <span>Denoising...</span><span id="progressPercent">0%</span>
                </div>
                <div class="progress-bar-container">
                  <div id="progressBar" class="job-progress-fill" style="width: 0%"></div>
                </div>
                <p id="progressStatus">Initializing...</p>
              </div>

              <div class="section-card success-card" id="processingResults" style="display: none;">
                <div class="success-header">
                  <span class="success-icon">&#10003;</span>
                  <span class="success-title">Denoising Complete</span>
                </div>
                <div id="resultsDetails" class="validation-details"></div>
                <div class="success-actions">
                  <button class="btn primary" id="openViewerBtn">Open in Image Viewer</button>
                  <button class="btn secondary" id="resetBtn">Start New Run</button>
                </div>
              </div>

              <!-- The job button is the nav row's right slot: exactly one
                   enabled red button on screen at a time -->
              <div class="navigation-buttons">
                <button id="step3Back" class="btn secondary">Back</button>
                <button id="startProcessingBtn" class="btn primary">
                  <span class="btn-glyph">&#9658;</span> Start Denoising
                </button>
              </div>
            </div>
          </div>

        </div>
      </div>
    `;
  }

  async initialize() {
    this.stepNavigator = new StepNavigator({
      steps: this.config.steps,
      currentStep: this.currentStep,
      onStepClick: (stepNum) => this.goToStep(stepNum),
      canNavigate: (stepNum) => this.canNavigateToStep(stepNum)
    });
    this.stepNavigator.init(this.container);

    this.validationDisplay = new ValidationDisplay('validationResult');

    this.fileSelector = new FileSelector({
      id: 'input_data',
      fileType: 'uploads',
      filterTags: ['raw'],
      title: 'Noisy Images',
      icon: 'image',                                              // core/icons.js name
      helpIconHtml: this.renderHelpIcon('denoising.step1.input'),
      showTestData: true,
      testDataKind: 'denoising',   // no isTestData branch needed
      stateManager: this.state,
      onSelect: (file) => this.onFileSelected(file),
      onUpload: (file, result) => this.onFileUploaded(file, result)
    });
    document.getElementById('fileSelectorContainer').innerHTML = this.fileSelector.render();
    await this.fileSelector.init();

    this.setupEventListeners();
    window.denoisingModule = this;   // debugging handle only
  }

  setupEventListeners() {
    const addListener = (element, event, handler) => {
      if (element) {
        element.addEventListener(event, handler);
        this.eventListeners.push({ element, event, handler });
      }
    };

    addListener(document.getElementById('backToHub'), 'click', () => window.workspace.returnToHub());
    addListener(document.getElementById('step1Next'), 'click', () => this.nextStep());
    addListener(document.getElementById('step2Back'), 'click', () => this.previousStep());
    addListener(document.getElementById('step2Next'), 'click', () => this.nextStep());
    addListener(document.getElementById('step3Back'), 'click', () => this.previousStep());
    addListener(document.getElementById('startProcessingBtn'), 'click', () => this.startProcessing());
    addListener(document.getElementById('openViewerBtn'), 'click', () => this.openInImageViewer());
    addListener(document.getElementById('resetBtn'), 'click', () => this.reset());
  }

  onFileSelected(fileInfo) {
    // The selector reports null when the user clears the dropdown
    if (!fileInfo) {
      this.uploadedFile = null;
      this.filesValidated = false;
      this.validationDisplay.hide();
      document.getElementById('step1Next').disabled = true;
      return;
    }
    this.uploadedFile = fileInfo;
    this.validationDisplay.showSuccess('File Selected', [
      { label: 'Name', value: fileInfo.name }
    ]);
    this.filesValidated = true;
    document.getElementById('step1Next').disabled = false;
  }

  /** Single source of truth for step gating - also feeds StepNavigator */
  canNavigateToStep(stepNumber) {
    switch (stepNumber) {
      case 1: return true;
      case 2: return this.filesValidated;
      case 3: return this.configSaved;
      default: return false;
    }
  }

  goToStep(stepNumber) {
    super.goToStep(stepNumber);
    this.stepNavigator?.update(stepNumber);
  }

  /** Hide the job button while the job runs and while the result card shows */
  setJobButtonVisible(visible) {
    const btn = document.getElementById('startProcessingBtn');
    if (btn) btn.style.display = visible ? '' : 'none';
  }

  /** Back to the constructor defaults - called by "Start New Run" and deactivate() */
  reset() {
    this.filesValidated = false;
    this.configSaved = false;
    this.uploadedFile = null;
    this.processingConfig = null;

    const progress = document.getElementById('processingProgress');
    if (progress) progress.style.display = 'none';
    const results = document.getElementById('processingResults');
    if (results) results.style.display = 'none';
    this.setJobButtonVisible(true);

    this.validationDisplay?.hide();
    this.fileSelector?.clearSelection();
    this.goToStep(1);
  }

  async deactivate() {
    this.reset();                       // DOM still exists here
    for (const { element, event, handler } of this.eventListeners) {
      element.removeEventListener(event, handler);
    }
    this.eventListeners = [];
    if (this.socket) { this.socket.disconnect(); this.socket = null; }
    delete window.denoisingModule;
    await super.deactivate();           // clears the container, resets the step
  }
}

export default DenoisingModule;
```

See the [template README](../../public/workspace/js/modules/template/README.md) for
the full UI contract (step markup, job button placement, success card, progress
bar, reset on leave, test data, and the styling rules) and
[Module Framework](MODULE_FRAMEWORK.md) for the component options.

### Socket.IO for real-time progress

```javascript
  setupSocketIO(taskId) {
    if (this.socket) {
      this.socket.disconnect();
    }

    this.socket = io();

    // Join task room
    this.socket.emit('join-denoising', taskId);

    // Listen for progress updates
    this.socket.on('denoising-progress', (progress) => {
      this.state.update('modules.denoising.progress', progress);
    });

    // Listen for completion
    this.socket.on('denoising-complete', (result) => {
      this.handleComplete(result);
    });

    // Listen for errors
    this.socket.on('denoising-error', (error) => {
      this.handleError(error);
    });
  }

  async startProcessing() {
    // Hide the job button, show progress
    this.setJobButtonVisible(false);
    document.getElementById('processingProgress').style.display = 'block';

    try {
      const response = await fetch('/api/denoising/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filePath: this.uploadedFile.path,
          inputFileIds: [this.uploadedFile.id],   // lineage, see below
          ...this.processingConfig
        })
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.error || 'Failed to start');

      this.setupSocketIO(result.taskId);
    } catch (error) {
      this.state.notify('error', `Failed to start: ${error.message}`, 5000);
      // Offer the job button again so the run can be retried
      document.getElementById('processingProgress').style.display = 'none';
      this.setJobButtonVisible(true);
    }
  }

  updateProgress(percent, status) {
    document.getElementById('progressBar').style.width = `${percent}%`;
    document.getElementById('progressPercent').textContent = `${percent}%`;
    document.getElementById('progressStatus').textContent = status;
  }

  handleComplete(result) {
    // Hide progress, show the success card. The job button stays hidden
    // until the user asks for another run ("Start New Run").
    document.getElementById('processingProgress').style.display = 'none';
    document.getElementById('processingResults').style.display = 'block';
    this.setJobButtonVisible(false);

    document.getElementById('resultsDetails').innerHTML = `
      <div class="detail-row"><span>Output:</span><span>${result.outputName}</span></div>
      <div class="detail-row"><span>Duration:</span><span>${result.duration}</span></div>
    `;

    this.state.notify('success', 'Denoising completed!', 5000);
    if (this.socket) { this.socket.disconnect(); this.socket = null; }
  }

  handleError(error) {
    this.state.notify('error', `Processing failed: ${error.message}`, 5000);
    document.getElementById('processingProgress').style.display = 'none';
    this.setJobButtonVisible(true);   // let the user retry
    if (this.socket) { this.socket.disconnect(); this.socket = null; }
  }
```

Note the result block is the shared `.section-card.success-card`, the progress
bar is `.progress-bar-container` + `.job-progress-fill`, and the completion
handler never re-attaches listeners: `#openViewerBtn` and `#resetBtn` are in
the static markup and were wired once in `setupEventListeners()`.

---

## Step 4: Register Module

### Update Module Registry

Open `public/workspace/js/modules/registry.js`. First add an inline SVG to the
`moduleIcons` map at the top of the file, then add the entry:

```javascript
const moduleIcons = {
  // ...
  denoising: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3z…"/></svg>`
};

const moduleRegistry = [
  // Hub order follows the processing pipeline: view, prepare, denoise,
  // annotate, segment, clean up, stitch, mesh, visualise.
  // ...
  {
    id: 'denoising',
    name: 'Deep Learning Denoising',
    description: 'Remove noise from electron microscopy images with a trained model',
    icon: moduleIcons.denoising,
    path: '/workspace/js/modules/denoising/DenoisingModule.js',
    inputs: ['image_stack'],
    outputs: ['denoised_stack'],
    status: 'available',           // change from 'coming_soon' when ready
    helpArticleId: 'denoising'
  },
  // ... other modules
];
```

### Configuration Fields

| Field | Description | Required |
|-------|-------------|----------|
| `id` | Unique module identifier (lowercase, no spaces) | ✅ Yes |
| `name` | Display name shown in UI | ✅ Yes |
| `description` | Brief description, at most 14 words | No |
| `icon` | Inline SVG from the `moduleIcons` map - **never an emoji** (ADR-005) | No |
| `path` | Absolute path to module file | ✅ Yes |
| `inputs` | Array of input data types | No |
| `outputs` | Array of output data types | No |
| `status` | 'available' or 'coming_soon' | No |
| `helpArticleId` | Article the card's help icon opens | No |

There is **no `color` field**: cards carry no per-module colour, because the
hub uses the single PoP accent. Insert your entry at the point in the array
where the module belongs in the processing pipeline.

---

## Step 5: Add Backend Endpoints (if needed)

If your module needs server-side processing, add a route file under
`src/routes/` (a factory function returning a router) and register it in
`src/app.js` - `server.js` is only the entry point. The sketch below shows the
handler bodies; existing route files such as
`src/routes/preprocess.routes.js` show the full pattern.

```javascript
// ============================================================================
// DENOISING MODULE ENDPOINTS
// ============================================================================

/**
 * Upload noisy images for denoising
 */
app.post('/api/denoising/upload', requireAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    // Validate TIFF file
    const validation = await validateTIFF(req.file.path);

    if (!validation.success) {
      return res.status(400).json({ success: false, error: validation.error });
    }

    res.json({
      success: true,
      filePath: req.file.path,
      filename: req.file.filename,
      validation
    });

  } catch (error) {
    console.error('Denoising upload error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Start denoising process
 */
app.post('/api/denoising/start', requireAuth, async (req, res) => {
  try {
    const { filePath, modelType, noiseLevel } = req.body;

    if (!filePath) {
      return res.status(400).json({ success: false, error: 'File path required' });
    }

    // Generate task ID
    const taskId = `denoise_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Output directory
    const outputDir = path.join('results', taskId);
    fs.mkdirSync(outputDir, { recursive: true });

    const outputPath = path.join(outputDir, 'denoised.tif');

    // Send response immediately
    res.json({
      success: true,
      taskId,
      status: 'starting'
    });

    // Start denoising process after delay (allow client to join socket room)
    setTimeout(() => {
      startDenoisingProcess(filePath, outputPath, modelType, noiseLevel, taskId, io);
    }, 1000);

  } catch (error) {
    console.error('Denoising start error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Download denoised result
 */
app.get('/api/denoising/download/:taskId', requireAuth, (req, res) => {
  const taskId = req.params.taskId;
  const resultPath = path.join('results', taskId, 'denoised.tif');

  if (!fs.existsSync(resultPath)) {
    return res.status(404).send('Result not found');
  }

  res.download(resultPath, 'denoised.tif');
});

/**
 * Start denoising process (spawns Python)
 */
function startDenoisingProcess(inputPath, outputPath, modelType, noiseLevel, taskId, io) {
  console.log(`[Denoising] Starting task ${taskId}`);

  const pythonProcess = spawn(PYTHON_PATH, [
    'python/denoise.py',
    inputPath,
    outputPath,
    '--model', modelType,
    '--noise-level', noiseLevel.toString()
  ]);

  // Parse progress from stdout
  pythonProcess.stdout.on('data', (data) => {
    const output = data.toString();
    const lines = output.split('\n');

    lines.forEach(line => {
      if (line.startsWith('DENOISE_PROGRESS:')) {
        const progress = JSON.parse(line.substring(17));
        io.to(`denoising-${taskId}`).emit('denoising-progress', progress);
      }
    });
  });

  // Handle completion
  pythonProcess.on('exit', (code) => {
    if (code === 0) {
      io.to(`denoising-${taskId}`).emit('denoising-complete', {
        taskId,
        outputPath,
        duration: Date.now() - parseInt(taskId.split('_')[1])
      });
    } else {
      io.to(`denoising-${taskId}`).emit('denoising-error', {
        error: 'Denoising process failed',
        code
      });
    }
  });

  // Handle errors
  pythonProcess.stderr.on('data', (data) => {
    console.error(`[Denoising] Error: ${data}`);
  });
}

// Socket.IO event for joining denoising room
io.on('connection', (socket) => {
  socket.on('join-denoising', (taskId) => {
    socket.join(`denoising-${taskId}`);
    console.log(`[Socket.IO] Client joined denoising-${taskId}`);
  });
});
```

---

## Step 6: Test Your Module

### Testing Checklist

#### 1. **Module Loads**
```javascript
// Open browser console at /workspace
workspace.moduleLoader.getAllModules()
// Your module should appear in the list
```

#### 2. **Module Activates**
- Click "Launch Module" on your module card
- UI should render without errors
- Check console for "[ModuleName] Activated" message

#### 3. **UI Renders Correctly**
- All sections visible
- Buttons functional
- Form elements work

#### 4. **State Management**
```javascript
// In browser console
workspace.state.get('modules.denoising')
// Should show: { active: true, currentTask: null, history: [] }
```

#### 5. **Event Listeners Work**
- File upload works
- Configuration changes work
- Start button enables/disables correctly

#### 6. **Backend Integration**
- File upload endpoint returns success
- Processing starts correctly
- Real-time progress updates work

#### 7. **Socket.IO Connection**
```javascript
// Check socket events in console
// Should see: "Client joined denoising-<taskId>"
```

#### 8. **Results Display**
- Results section shows after completion
- Download works
- Reset clears state

#### 9. **Module Deactivates**
- Click "Back to Hub"
- Check console for "[ModuleName] Deactivated"
- No memory leaks (listeners removed)

```javascript
// In browser console after deactivation
workspace.state.get('modules.denoising.active')
// Should be: false
```

#### 10. **Reactivation Works**
- Launch module again
- Everything works as before
- No duplicate listeners

---

## Step 7: Add Styling

Module styles go in the module's **own** stylesheet (`css/denoising.css`,
named by `config.cssPath`) - never in `workspace.css`. `BaseModule.loadCSS()`
loads it on activate and `ModuleLoader` calls `unloadCSS()` on deactivate.

```css
@import url('/workspace/js/core/css/module-base.css');

/* Every selector starts with the module root class: the sheet is unloaded
   when the module closes, so an unscoped rule leaks into other modules while
   yours is open and then disappears again. */
.denoising-module .preset-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--module-spacing-md);
}

/* Respond to the module area's width, not the viewport: .step-contents is a
   container query root named `module`. */
@container module (max-width: 900px) {
  .denoising-module .preset-grid { grid-template-columns: 1fr; }
}

/* Dark mode is free if you only use tokens; a literal hex is a bug. */
[data-theme="dark"] .denoising-module .preset-grid { /* rarely needed */ }
```

Rules of thumb:

- **Tokens, never literals** - `--module-primary(-light)`, `--module-bg*`,
  `--module-card-bg`, `--module-border(-dark)`, `--module-text-*`,
  `--module-spacing-*`, `--module-font-size-*`, `--module-radius-*`,
  `--module-shadow-*`, `--z-*`. The only allowed literals are neutral
  `rgba(0, 0, 0, x)` shadows and scrims.
- **Do not restyle the baselines** - `module-base.css` already sets
  zero-specificity `:where(.module-container)` rules for `h4`, `.field-hint`,
  `select`, `input[type=number|text|search]` and `input[type=checkbox|radio]`.
  Add layout only (`flex: 1`, `min-width: 0`, `width: 100%`), and use
  `class="input-sm"` for short numeric fields instead of a width rule.
- **Reuse the shared classes** - `.btn` family, `.section-card` /
  `.section-card.success-card`, `.progress-bar-container` +
  `.job-progress-fill`, `.metric-card`, `.form-field`, `.range-slider`,
  `.toggle-switch`. Never copy them into the module.
- **Icons from `core/icons.js`** - `import { icon } from
  '/workspace/js/core/icons.js'` and write `${icon('play')} Start`. No emoji.
  `FileSelector` takes an icon name string. The only kept glyph entities are
  `&#9658;` in a `.btn-glyph` job button and `&#10003;` in a `.success-icon`.

See [Module Framework → Styling](MODULE_FRAMEWORK.md#styling) for the full
token tables.

---

## Troubleshooting

### Common Issues

#### Module Not Appearing in Hub

**Problem:** Module card doesn't show up

**Solutions:**
1. Check `registry.js` - module added correctly?
2. Check `status` field - should be `'available'`, not `'coming_soon'`
3. Restart server (`npm run dev`)
4. Hard refresh browser (Ctrl+Shift+R)
5. Check console for registration errors

---

#### Module Won't Load

**Problem:** Clicking "Launch Module" does nothing or shows error

**Solutions:**
1. Check `path` in registry - absolute path correct?
2. Check module file exists at that path
3. Check module exports `default` class
4. Check browser console for import errors
5. Check module syntax (missing brackets, etc.)

Example error:
```
Failed to fetch dynamically imported module:
/workspace/js/modules/denoising/DenoisingModule.js
```
→ Check file path and file exists

---

#### State Not Updating

**Problem:** UI doesn't react to state changes

**Solutions:**
1. Check you're using `this.state.update()`, not direct mutation
2. Check subscription is set up correctly
3. Check `unsubscribers` array is storing unsubscribe functions
4. Check state path is correct (`'modules.denoising.progress'`)
5. Log state changes:
```javascript
this.state.subscribe('modules.denoising', (state) => {
  console.log('Denoising state changed:', state);
});
```

---

#### Socket.IO Not Connecting

**Problem:** No real-time updates

**Solutions:**
1. Check socket connection: `this.socket = io()`
2. Check joining room: `socket.emit('join-denoising', taskId)`
3. Check backend has socket handler:
```javascript
socket.on('join-denoising', (taskId) => {
  socket.join(`denoising-${taskId}`);
});
```
4. Check room name matches: `denoising-${taskId}` on both sides
5. Check Python is emitting progress
6. Check 1-second delay before starting process

---

#### Memory Leaks

**Problem:** Browser slows down after using module multiple times

**Solutions:**
1. Ensure `deactivate()` unsubscribes all state listeners:
```javascript
this.unsubscribers.forEach(unsub => unsub());
this.unsubscribers = [];
```
2. Ensure event listeners are removed
3. Ensure Socket.IO disconnects:
```javascript
if (this.socket) {
  this.socket.disconnect();
  this.socket = null;
}
```
4. Use Chrome DevTools → Memory → Take snapshot to find leaks

---

#### Backend Endpoint 404

**Problem:** API calls return 404 Not Found

**Solutions:**
1. Check endpoint path matches: `/api/denoising/upload`
2. Check endpoint added to `server.js`
3. Restart server (changes to server.js require restart)
4. Check middleware: `requireAuth` or `requireApproved`
5. Check request method: POST vs GET

---

## Best Practices

### 1. State Management

**✅ DO:**
- Always use `this.state.update()` to modify state
- Subscribe to state changes in `activate()`
- Unsubscribe in `deactivate()`
- Use specific state paths (`'modules.denoising.progress'`)

**❌ DON'T:**
- Mutate state directly: `this.state.state.modules.denoising.active = true`
- Forget to unsubscribe (memory leaks)
- Subscribe to overly broad paths (`'modules'`)

### 2. Event Listeners

**✅ DO:**
- Wire every button in `setupEventListeners()`, called from `initialize()`
- Track each listener as you add it, so `deactivate()` can remove them all -
  an arrow function is fine because you keep the reference:
```javascript
const addListener = (element, event, handler) => {
  if (element) {
    element.addEventListener(event, handler);
    this.eventListeners.push({ element, event, handler });
  }
};
addListener(document.getElementById('startProcessingBtn'), 'click', () => this.startProcessing());

// In deactivate():
for (const { element, event, handler } of this.eventListeners) {
  element.removeEventListener(event, handler);
}
this.eventListeners = [];
```
- Delegate from a stable parent for markup you rebuild with `innerHTML`, and
  read `data-action` off the button:
```javascript
addListener(document.getElementById('resultsDetails'), 'click', (event) => {
  const button = event.target.closest('button[data-action]');
  if (button?.dataset.action === 'open-viewer') this.openInImageViewer(button.dataset.fileId);
});
```

**❌ DON'T:**
- Write `onclick="..."` into `render()` output
- Expose `window.nextStep` / `window.startProcessing` free functions to make
  inline handlers work. A single `window.myModule = this` debugging handle is
  fine, as long as `deactivate()` deletes it.
- Add a listener without pushing it onto `this.eventListeners` - the instance
  is cached and re-rendered, so the next visit would stack a duplicate.

### 3. Error Handling

**✅ DO:**
- Wrap async operations in try/catch
- Show user-friendly error messages
- Log errors to console for debugging
- Update UI to reflect error state

**❌ DON'T:**
- Let errors crash the module silently
- Show technical error messages to users

### 4. Socket.IO

**✅ DO:**
- Disconnect socket in `deactivate()`
- Use unique room names per task
- Handle connection errors
- Use 1-second delay before starting backend process

**❌ DON'T:**
- Leave socket connections open
- Reuse socket connections
- Start process before client joins room

### 5. UI/UX

**✅ DO:**
- Put the primary long-running action in the nav row's right slot as
  `<button class="btn primary"><span class="btn-glyph">&#9658;</span> Start …</button>`,
  and hide it while the job runs and while the result card is shown - there
  must be exactly one enabled red button on screen
- Show progress with `.progress-bar-container` + `.job-progress-fill`
- Announce the result in a `.section-card.success-card`, whose secondary
  action is always labelled **Start New Run** (a "view the output" action is
  **Open in Image Viewer**, or **Open in 3D Visualization** for meshes)
- Offer the built-in test stack through `FileSelector`'s `testDataKind`
- Show slice numbers 1-based (`n / N`), even though the APIs are 0-based

**❌ DON'T:**
- Block UI without feedback
- Allow duplicate submissions
- Leave UI in inconsistent state
- Reintroduce `.validation-success` wrappers or `.result-actions` containers

### 6. Reset on Leave

`ModuleLoader` caches the module instance and `activate()` only re-renders, so
anything left in an instance field is still there on the user's next visit.
Put the fresh-state logic in a `reset()`, and call it from both "Start New Run"
and `deactivate()` (before `super.deactivate()`, while the DOM still exists):
clear the selected file, call `fileSelector.clearSelection()`, put config back
to the constructor defaults, drop result/job ids, and return to step 1.

---

## Lineage Tracking

### Overview

When your module processes files and creates outputs, you should track the **lineage** (provenance) of those files. This enables:
- Tracking the full processing history of any file
- Displaying processing chain in the file browser's "See Info" panel
- Future: Auto-detecting original data for visualization overlays

### Lineage Data Structure

Each processed file can have a `lineage` property in the workspace metadata:

```json
{
  "id": "file_xxx",
  "name": "denoised_result.tif",
  "category": "denoised",
  "lineage": {
    "processType": "denoising",
    "processedAt": "2025-12-23T10:30:00.000Z",
    "inputs": ["file_yyy"],
    "processId": "denoise_123"
  }
}
```

- **Uploaded files** - No `lineage` property (they are root files)
- **Processed files** - Have `lineage` with `inputs` pointing to source file IDs

### Frontend: Sending Input File IDs

When starting a processing operation, include the source file ID(s) in your API request:

```javascript
// In your module's start/process method
async startProcessing() {
  const requestBody = {
    filePath: this.uploadedFile.path,
    modelType: this.options.modelType
  };

  // IMPORTANT: Include input file IDs for lineage tracking
  if (this.uploadedFile && this.uploadedFile.id) {
    requestBody.inputFileIds = [this.uploadedFile.id];
    console.log('[MyModule] Including inputFileIds for lineage:', requestBody.inputFileIds);
  }

  const response = await fetch('/api/mymodule/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody)
  });
  // ...
}
```

For operations with multiple inputs (e.g., training uses images + annotations):

```javascript
requestBody.inputFileIds = [rawImagesFileId, annotationsFileId];
```

### Backend: Storing Lineage in Metadata

Use the `createLineage` helper and pass it when tracking output files:

```javascript
// In your route handler or service
const { createLineage } = require('../helpers/lineageHelpers');

// When processing completes, build lineage and track files
const lineage = inputFileIds && inputFileIds.length > 0
  ? createLineage('denoising', inputFileIds, taskId)
  : null;

// Track output file with lineage
workspaceManager.addFileToMetadata(sessionId, {
  name: 'denoised_result.tif',
  path: relativePath,
  category: 'denoised',
  size: fileSize,
  folderId: null,
  // Include lineage if available
  ...(lineage && { lineage })
});
```

### Process Types

Use consistent process type names across modules:

| Module | processType |
|--------|-------------|
| Segmentation/Inference | `segmentation` |
| Denoising | `denoising` |
| Mesh Generation | `meshGeneration` |
| Annotation | `annotation` |

### Backend Route Pattern

Complete example for a module route that tracks lineage:

```javascript
// In src/routes/mymodule.routes.js
const { createLineage } = require('../helpers/lineageHelpers');

router.post('/start', requireAuth, async (req, res) => {
  const { filePath, inputFileIds, options } = req.body;
  const sessionId = req.session.id;

  // Generate task ID
  const taskId = `mymodule_${Date.now()}`;

  // Store in session for tracking
  myModuleSessions.set(taskId, {
    sessionId,
    inputFileIds: inputFileIds || [],  // Store for lineage
    // ... other session data
  });

  // ... start processing ...
});

// When processing completes:
async function onProcessingComplete(taskId, result) {
  const session = myModuleSessions.get(taskId);

  // Build lineage from stored input file IDs
  const lineage = session.inputFileIds && session.inputFileIds.length > 0
    ? createLineage('myProcessType', session.inputFileIds, taskId)
    : null;

  // Track output files with lineage
  workspaceManager.addFileToMetadata(session.sessionId, {
    name: result.outputFileName,
    path: result.outputPath,
    category: 'mymodule_output',
    size: result.fileSize,
    ...(lineage && { lineage })
  });
}
```

### Lineage Display

When users right-click a file and select "See Info", the file browser automatically:
1. Fetches lineage from `/api/workspace/lineage/:fileId`
2. Displays processing history like: "Denoising → Segmentation → Mesh Generation"
3. Shows "Original Upload" for files without lineage

---

## Next Steps

### After Creating Your Module

1. **Test Thoroughly** - Follow testing checklist above
2. **Add Documentation** - Comment your code
3. **Create Python Script** (if needed) - Follow Python integration patterns
4. **Add to Git** - Commit your module
5. **Consider Module Specs** - Document in MODULE_SPECS.md (Day 4)

### Advanced Topics

See these guides for more:
- [State Architecture](../architecture/STATE_ARCHITECTURE.md) - Advanced state patterns
- [Socket Protocol](../reference/SOCKET_PROTOCOL.md) - Real-time communication
- [Python Integration](../reference/PYTHON_INTEGRATION.md) - Python script patterns

---

## Related Documentation

- [Module Framework](MODULE_FRAMEWORK.md) - BaseModule and component API reference
- [Template module README](../../public/workspace/js/modules/template/README.md) - the UI contract
- [Module Architecture](../architecture/MODULE_ARCHITECTURE.md) - Complete architecture
- [Module System Reference](../reference/MODULE_SYSTEM.md) - ModuleLoader API
- [State Architecture](../architecture/STATE_ARCHITECTURE.md) - State management
- [API Endpoints](../reference/API_ENDPOINTS.md) - Backend endpoints
- [ADR-004](../decisions/004_module_system_design.md) - Why dynamic imports?

---

**Navigation:**
← [Troubleshooting](TROUBLESHOOTING.md) | [Guides](.) | [Deployment](DEPLOYMENT.md) →

---

**Last Updated:** 2026-09-03
**Guide Version:** 2.0
**Tested With:** Workspace consolidation phase 5
