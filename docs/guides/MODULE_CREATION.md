# Module Creation Guide

**Last Updated:** 2026-01-01
**Estimated Time:** 1-2 hours for first module (using framework)
**Difficulty:** Intermediate
**Target Audience:** Developers adding new processing modules to the Workspace version
**8 Modules Implemented:** Segmentation, DL Denoising, Filter Denoising, Annotation, Mesh, Visualization, Image Viewer, Template

---

> **New: Module Framework Available!**
>
> We now have a **BaseModule framework** with reusable components that significantly
> simplifies module creation. New modules should use this framework.
>
> **Quick Links:**
> - [Module Framework Documentation](MODULE_FRAMEWORK.md) - API reference and guides
> - [Template Module](/public/workspace/js/modules/template/) - Copy and customize
>
> The example below shows the traditional approach. For the recommended approach
> using the framework, see the [Using the Framework](#using-the-framework) section.

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

3. **Register in `registry.js`**

4. **See the template's README** for the full checklist

### Framework Benefits

- **BaseModule** handles lifecycle, step navigation, CSS loading
- **StepNavigator** component for consistent step UI
- **FileSelector** component for file selection with test data support
- **ValidationDisplay** component for success/error messages
- **InfoPanel** component for context-sensitive help integration
- **LoadingOverlay** component for processing states
- **ProgressIndicator** component for long-running operations
- **Shared CSS variables** for consistent styling (light/dark mode)

For full documentation, see [Module Framework](MODULE_FRAMEWORK.md).

### Available Core Components (11 total)

Located in `/public/workspace/js/core/components/`:

| Component | Purpose |
|-----------|---------|
| FileSelector | File selection with validation and help icons |
| InfoPanel | Help panel container with tabs |
| InfoArticle | Article rendering with markdown |
| InfoGlossary | Terminology definitions |
| InfoSearch | Full-text help search |
| LoadingOverlay | Loading state display |
| MetricCard | Statistics display |
| NavigationButtons | Step navigation controls |
| ProgressIndicator | Progress bar |
| StepNavigator | Step-based workflow |
| ValidationDisplay | Validation feedback |

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

Every module MUST implement:
```javascript
class MyModule {
  constructor(stateManager) {
    // Initialize with state manager
  }

  async activate() {
    // Render UI, attach listeners, subscribe to state
  }

  async deactivate() {
    // Clean up listeners, clear UI, unsubscribe
  }
}

export default MyModule;
```

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

# Create module directory
mkdir -p denoising

# Create module file
touch denoising/DenoisingModule.js
```

### Final Structure

```
public/workspace/js/modules/
├── registry.js
├── segmentation/
│   └── SegmentationModule.js
└── denoising/              # NEW
    └── DenoisingModule.js  # NEW
```

---

## Step 3: Create Module Class

### Basic Module Template

Open `denoising/DenoisingModule.js` and create the basic structure:

```javascript
/**
 * DenoisingModule - Remove noise from electron microscopy images
 */
class DenoisingModule {
  constructor(stateManager) {
    // Store state manager reference
    this.state = stateManager;

    // UI container reference
    this.container = null;

    // State subscriptions (for cleanup)
    this.unsubscribers = [];

    // Socket.IO connection (if needed)
    this.socket = null;

    // Module-specific properties
    this.currentTask = null;

    console.log('[DenoisingModule] Initialized');
  }

  /**
   * Activate module - render UI and set up listeners
   */
  async activate() {
    console.log('[DenoisingModule] Activating...');

    // Get container
    this.container = document.getElementById('module-view');
    if (!this.container) {
      throw new Error('Module container not found');
    }

    // Render UI
    this.render();

    // Attach event listeners
    this.attachEventListeners();

    // Subscribe to state changes
    this.subscribeToState();

    // Initialize module state
    this.state.update('modules.denoising.currentTask', null);
    this.state.update('modules.denoising.history', []);

    console.log('[DenoisingModule] Activated');
  }

  /**
   * Render module UI
   */
  render() {
    this.container.innerHTML = `
      <div class="module-header">
        <button id="denoising-back-btn" class="btn-back">← Back to Hub</button>
        <h2>🔊 Deep Learning Denoising</h2>
        <p class="module-description">Remove noise from electron microscopy images</p>
      </div>

      <div class="module-content">
        <!-- File Upload Section -->
        <section class="module-section">
          <h3>1. Upload Noisy Images</h3>
          <div class="upload-container">
            <input type="file" id="denoising-file-input" accept=".tif,.tiff" />
            <button id="denoising-upload-btn" class="btn-primary">Upload TIFF Stack</button>
          </div>
          <div id="denoising-file-info" class="file-info"></div>
        </section>

        <!-- Processing Section -->
        <section class="module-section">
          <h3>2. Configure Denoising</h3>
          <div class="config-form">
            <label>
              Model Type:
              <select id="denoising-model-select">
                <option value="gaussian">Gaussian Denoising</option>
                <option value="deep">Deep Learning (U-Net)</option>
                <option value="nlm">Non-Local Means</option>
              </select>
            </label>
            <label>
              Noise Level:
              <input type="range" id="denoising-noise-level" min="1" max="10" value="5" />
              <span id="denoising-noise-value">5</span>
            </label>
          </div>
          <button id="denoising-start-btn" class="btn-primary" disabled>Start Denoising</button>
        </section>

        <!-- Progress Section -->
        <section class="module-section" id="denoising-progress-section" style="display:none;">
          <h3>3. Processing...</h3>
          <div class="progress-container">
            <progress id="denoising-progress-bar" max="100" value="0"></progress>
            <span id="denoising-progress-text">0%</span>
          </div>
          <div id="denoising-progress-details"></div>
        </section>

        <!-- Results Section -->
        <section class="module-section" id="denoising-results-section" style="display:none;">
          <h3>4. Results</h3>
          <div class="results-container">
            <div id="denoising-results-info"></div>
            <button id="denoising-download-btn" class="btn-primary">Download Denoised Images</button>
            <button id="denoising-reset-btn" class="btn-secondary">Process Another</button>
          </div>
        </section>
      </div>
    `;
  }

  /**
   * Attach event listeners
   */
  attachEventListeners() {
    // Back button
    const backBtn = document.getElementById('denoising-back-btn');
    backBtn.addEventListener('click', () => this.handleBack());

    // File input
    const fileInput = document.getElementById('denoising-file-input');
    fileInput.addEventListener('change', (e) => this.handleFileSelect(e));

    // Upload button
    const uploadBtn = document.getElementById('denoising-upload-btn');
    uploadBtn.addEventListener('click', () => this.handleUpload());

    // Noise level slider
    const noiseLevel = document.getElementById('denoising-noise-level');
    noiseLevel.addEventListener('input', (e) => {
      document.getElementById('denoising-noise-value').textContent = e.target.value;
    });

    // Start button
    const startBtn = document.getElementById('denoising-start-btn');
    startBtn.addEventListener('click', () => this.handleStart());

    // Download button (will be attached after results)
    // Reset button (will be attached after results)
  }

  /**
   * Subscribe to state changes
   */
  subscribeToState() {
    // Subscribe to workspace files
    const unsubFiles = this.state.subscribe('workspace.files', (files) => {
      this.onWorkspaceFilesChange(files);
    });
    this.unsubscribers.push(unsubFiles);

    // Subscribe to module progress
    const unsubProgress = this.state.subscribe('modules.denoising.progress', (progress) => {
      this.onProgressUpdate(progress);
    });
    this.unsubscribers.push(unsubProgress);
  }

  /**
   * Handle back to hub
   */
  handleBack() {
    if (window.workspace && window.workspace.returnToHub) {
      window.workspace.returnToHub();
    }
  }

  /**
   * Handle file selection
   */
  handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Display file info
    const fileInfo = document.getElementById('denoising-file-info');
    fileInfo.innerHTML = `
      <p><strong>Selected:</strong> ${file.name}</p>
      <p><strong>Size:</strong> ${(file.size / 1024 / 1024).toFixed(2)} MB</p>
    `;

    // Store file reference
    this.selectedFile = file;
  }

  /**
   * Handle file upload
   */
  async handleUpload() {
    if (!this.selectedFile) {
      this.state.notify('error', 'Please select a file first');
      return;
    }

    try {
      this.state.update('ui.loading', true);

      // Create form data
      const formData = new FormData();
      formData.append('file', this.selectedFile);

      // Upload via API
      const response = await fetch('/api/denoising/upload', {
        method: 'POST',
        body: formData
      });

      const result = await response.json();

      if (result.success) {
        this.state.notify('success', 'File uploaded successfully', 3000);
        this.uploadedFilePath = result.filePath;

        // Enable start button
        document.getElementById('denoising-start-btn').disabled = false;
      } else {
        throw new Error(result.error || 'Upload failed');
      }

    } catch (error) {
      console.error('[DenoisingModule] Upload error:', error);
      this.state.notify('error', `Upload failed: ${error.message}`, 5000);
    } finally {
      this.state.update('ui.loading', false);
    }
  }

  /**
   * Handle start denoising
   */
  async handleStart() {
    if (!this.uploadedFilePath) {
      this.state.notify('error', 'Please upload a file first');
      return;
    }

    try {
      this.state.update('ui.loading', true);

      // Get configuration
      const modelType = document.getElementById('denoising-model-select').value;
      const noiseLevel = document.getElementById('denoising-noise-level').value;

      // Start denoising
      const response = await fetch('/api/denoising/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filePath: this.uploadedFilePath,
          modelType,
          noiseLevel: parseInt(noiseLevel)
        })
      });

      const result = await response.json();

      if (result.success) {
        this.currentTask = {
          taskId: result.taskId,
          startTime: Date.now()
        };

        // Show progress section
        document.getElementById('denoising-progress-section').style.display = 'block';

        // Set up Socket.IO for progress updates
        this.setupSocketIO(result.taskId);

        this.state.notify('info', 'Denoising started...', 3000);
      } else {
        throw new Error(result.error || 'Failed to start denoising');
      }

    } catch (error) {
      console.error('[DenoisingModule] Start error:', error);
      this.state.notify('error', `Failed to start: ${error.message}`, 5000);
    } finally {
      this.state.update('ui.loading', false);
    }
  }

  /**
   * Set up Socket.IO for real-time progress
   */
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

  /**
   * Handle progress update
   */
  onProgressUpdate(progress) {
    if (!progress) return;

    // Update progress bar
    const progressBar = document.getElementById('denoising-progress-bar');
    const progressText = document.getElementById('denoising-progress-text');
    const progressDetails = document.getElementById('denoising-progress-details');

    if (progressBar) {
      progressBar.value = progress.percent || 0;
      progressText.textContent = `${(progress.percent || 0).toFixed(1)}%`;
    }

    if (progressDetails) {
      progressDetails.innerHTML = `
        <p>Slice: ${progress.currentSlice || 0} / ${progress.totalSlices || 0}</p>
        <p>Elapsed: ${this.formatDuration(Date.now() - this.currentTask.startTime)}</p>
      `;
    }
  }

  /**
   * Handle completion
   */
  handleComplete(result) {
    console.log('[DenoisingModule] Processing complete:', result);

    // Hide progress, show results
    document.getElementById('denoising-progress-section').style.display = 'none';
    document.getElementById('denoising-results-section').style.display = 'block';

    // Display results
    const resultsInfo = document.getElementById('denoising-results-info');
    resultsInfo.innerHTML = `
      <div class="success-message">
        <h4>✓ Denoising Complete!</h4>
        <p>Output: ${result.outputPath}</p>
        <p>Processing time: ${this.formatDuration(result.duration)}</p>
      </div>
    `;

    // Attach download button listener
    const downloadBtn = document.getElementById('denoising-download-btn');
    downloadBtn.addEventListener('click', () => {
      window.location.href = `/api/denoising/download/${result.taskId}`;
    });

    // Attach reset button listener
    const resetBtn = document.getElementById('denoising-reset-btn');
    resetBtn.addEventListener('click', () => this.reset());

    // Update state
    this.state.update('modules.denoising.currentTask', null);
    this.state.update('modules.denoising.lastResult', result);

    // Add to history
    const history = this.state.get('modules.denoising.history') || [];
    history.push({
      timestamp: Date.now(),
      result
    });
    this.state.update('modules.denoising.history', history);

    // Notification
    this.state.notify('success', 'Denoising completed!', 5000);

    // Disconnect socket
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  /**
   * Handle error
   */
  handleError(error) {
    console.error('[DenoisingModule] Error:', error);

    this.state.notify('error', `Processing failed: ${error.message}`, 5000);

    // Hide progress section
    document.getElementById('denoising-progress-section').style.display = 'none';

    // Disconnect socket
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }

    // Clear current task
    this.currentTask = null;
    this.state.update('modules.denoising.currentTask', null);
  }

  /**
   * Reset module to initial state
   */
  reset() {
    // Hide results section
    document.getElementById('denoising-results-section').style.display = 'none';

    // Clear file input
    document.getElementById('denoising-file-input').value = '';
    document.getElementById('denoising-file-info').innerHTML = '';

    // Reset form
    document.getElementById('denoising-model-select').value = 'gaussian';
    document.getElementById('denoising-noise-level').value = 5;
    document.getElementById('denoising-noise-value').textContent = '5';

    // Disable start button
    document.getElementById('denoising-start-btn').disabled = true;

    // Clear state
    this.selectedFile = null;
    this.uploadedFilePath = null;
    this.currentTask = null;
  }

  /**
   * Handle workspace files change
   */
  onWorkspaceFilesChange(files) {
    // Could display available files for selection
    console.log('[DenoisingModule] Workspace files updated:', files);
  }

  /**
   * Format duration (ms to human readable)
   */
  formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    if (minutes > 0) {
      return `${minutes}m ${remainingSeconds}s`;
    }
    return `${seconds}s`;
  }

  /**
   * Deactivate module - clean up
   */
  async deactivate() {
    console.log('[DenoisingModule] Deactivating...');

    // Unsubscribe from state
    this.unsubscribers.forEach(unsub => unsub());
    this.unsubscribers = [];

    // Disconnect socket
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }

    // Clear UI
    if (this.container) {
      this.container.innerHTML = '';
    }

    // Clear references
    this.selectedFile = null;
    this.uploadedFilePath = null;
    this.currentTask = null;

    console.log('[DenoisingModule] Deactivated');
  }

  /**
   * Optional cleanup (called on unload)
   */
  cleanup() {
    console.log('[DenoisingModule] Cleanup');
    // Release any additional resources
  }
}

// Export module
export default DenoisingModule;
```

---

## Step 4: Register Module

### Update Module Registry

Open `public/workspace/js/modules/registry.js` and add your module:

```javascript
const moduleRegistry = [
  {
    id: 'segmentation',
    name: 'U-Net Segmentation',
    description: 'Complete ML pipeline: Data Upload → Training → Inference → 3D Visualization',
    icon: '🧩',
    path: '/workspace/js/modules/segmentation/SegmentationModule.js',
    inputs: ['image_stack', 'annotations'],
    outputs: ['segmented_stack', 'trained_model', 'visualization'],
    color: '#4A90E2',
    status: 'available'
  },
  // ADD YOUR MODULE HERE
  {
    id: 'denoising',
    name: 'Deep Learning Denoising',
    description: 'Remove noise from electron microscopy images using advanced denoising algorithms',
    icon: '🔊',
    path: '/workspace/js/modules/denoising/DenoisingModule.js',
    inputs: ['image_stack'],
    outputs: ['denoised_stack'],
    color: '#50C878',
    status: 'available'  // Change from 'coming_soon' to 'available'
  },
  // ... other modules
];
```

### Configuration Fields

| Field | Description | Required |
|-------|-------------|----------|
| `id` | Unique module identifier (lowercase, no spaces) | ✅ Yes |
| `name` | Display name shown in UI | ✅ Yes |
| `description` | Brief description (1-2 sentences) | No |
| `icon` | Emoji icon for module card | No |
| `path` | Absolute path to module file | ✅ Yes |
| `inputs` | Array of input data types | No |
| `outputs` | Array of output data types | No |
| `color` | Hex color for module card | No |
| `status` | 'available' or 'coming_soon' | No |

---

## Step 5: Add Backend Endpoints (if needed)

If your module needs server-side processing, add endpoints to `server.js`:

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

## Step 7: Add Styling (Optional)

### Module-Specific Styles

Add to `public/workspace/css/workspace.css`:

```css
/* Denoising Module Specific Styles */
.module-section {
  margin-bottom: 2rem;
  padding: 1.5rem;
  background: #f9f9f9;
  border-radius: 8px;
}

.module-section h3 {
  margin-top: 0;
  color: #333;
  border-bottom: 2px solid #50C878;
  padding-bottom: 0.5rem;
}

.upload-container {
  display: flex;
  gap: 1rem;
  align-items: center;
}

.config-form {
  display: grid;
  gap: 1rem;
  margin-bottom: 1rem;
}

.config-form label {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.progress-container {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.progress-container progress {
  flex: 1;
  height: 30px;
}

.results-container {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.success-message {
  padding: 1rem;
  background: #d4edda;
  border: 1px solid #c3e6cb;
  border-radius: 4px;
  color: #155724;
}

.file-info {
  margin-top: 0.5rem;
  padding: 0.5rem;
  background: #e9ecef;
  border-radius: 4px;
  font-size: 0.9rem;
}
```

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
- Attach listeners in `activate()` or `attachEventListeners()`
- Remove listeners in `deactivate()`
- Use named functions for easier removal:
```javascript
this.handleUpload = this.handleUpload.bind(this);
uploadBtn.addEventListener('click', this.handleUpload);
// Later: uploadBtn.removeEventListener('click', this.handleUpload);
```

**❌ DON'T:**
- Use anonymous functions (can't remove):
```javascript
uploadBtn.addEventListener('click', () => this.handleUpload());
// Can't remove this later!
```

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
- Show loading states
- Disable buttons during processing
- Show progress updates
- Provide reset/clear functionality
- Use semantic HTML

**❌ DON'T:**
- Block UI without feedback
- Allow duplicate submissions
- Leave UI in inconsistent state

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

- [Module Architecture](../architecture/MODULE_ARCHITECTURE.md) - Complete architecture
- [Module System Reference](../reference/MODULE_SYSTEM.md) - ModuleLoader API
- [State Architecture](../architecture/STATE_ARCHITECTURE.md) - State management
- [API Endpoints](../reference/API_ENDPOINTS.md) - Backend endpoints
- [ADR-004](../decisions/004_module_system_design.md) - Why dynamic imports?

---

**Navigation:**
← [Troubleshooting](TROUBLESHOOTING.md) | [Guides](.) | [Deployment](DEPLOYMENT.md) →

---

**Last Updated:** 2025-11-27
**Guide Version:** 1.0
**Tested With:** Workspace Phase 2
