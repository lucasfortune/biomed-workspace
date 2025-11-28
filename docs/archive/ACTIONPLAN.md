# Biomedical Image Processing Workspace - Transformation Action Plan

## Executive Summary
Transform the existing linear segmentation pipeline into a modular, IDE-like biomedical image processing workspace while maintaining the current application's functionality throughout the transition.

**Timeline**: 12-16 weeks total (can stop at any phase)  
**Approach**: Incremental development with vanilla JS + lightweight libraries  
**Priority**: Denoising and segmentation modules first, annotation tool last

---

## Phase 1: Foundation & Architecture Setup ✅ COMPLETE
**Duration**: 2 weeks
**Value Delivered**: Parallel development environment, improved code organization
**Can Stop Here**: No - preparatory phase
**Status**: ✅ **COMPLETED** - All deliverables implemented and tested

### Goals
- ✅ Set up new modular architecture alongside existing app
- ✅ Implement state management system
- ✅ Create base UI layout structure
- ✅ Install and configure helper libraries

### Implementation Steps

#### 1.1 Project Structure Reorganization
```
/viz_app/
├── /public/
│   ├── /classic/           # Current app (moved here, remains functional)
│   │   ├── index.html       
│   │   └── /js/            
│   ├── /workspace/         # New modular app
│   │   ├── index.html      
│   │   ├── /js/
│   │   │   ├── /core/      # Core functionality
│   │   │   ├── /modules/   # Processing modules
│   │   │   ├── /components/# Reusable UI components
│   │   │   └── /utils/     # Utility functions
│   │   └── /css/
│   └── welcome.html        # Updated to link both versions
```

#### 1.2 Install Helper Libraries
```json
{
  "dependencies": {
    "mitt": "^3.0.0",           // Event system (200 bytes)
    "split.js": "^1.6.0",       // Resizable panels
    "sortablejs": "^1.15.0",    // Drag-drop functionality
    "inspire-tree": "^7.0.0",   // File tree component
    "cash-dom": "^8.1.0",       // jQuery-like helpers (10KB)
    "navigo": "^8.0.0"          // Client-side routing
  }
}
```

#### 1.3 Core State Management Implementation
```javascript
// /workspace/js/core/StateManager.js
class StateManager {
  constructor() {
    this.state = {
      workspace: {
        sessionId: null,
        files: [],
        activeModule: null,
        moduleStates: {}
      }
    };
    this.events = mitt();
  }
  
  update(path, value) {
    // Update nested state properties
    this.setNestedProperty(this.state, path, value);
    this.events.emit('state:change', { path, value });
  }
  
  subscribe(path, callback) {
    this.events.on('state:change', (data) => {
      if (data.path.startsWith(path)) {
        callback(this.getNestedProperty(this.state, path));
      }
    });
  }
}
```

#### 1.4 Base Layout Template
```html
<!-- /workspace/index.html -->
<!DOCTYPE html>
<html>
<head>
  <title>Biomedical Image Processing Workspace</title>
  <link rel="stylesheet" href="css/workspace.css">
</head>
<body>
  <div id="workspace-container">
    <!-- Collapsible Sidebar -->
    <aside id="sidebar" class="sidebar collapsed">
      <div class="sidebar-toggle">☰</div>
      <div class="sidebar-content">
        <div id="file-browser"></div>
        <div id="session-info"></div>
      </div>
    </aside>
    
    <!-- Main Content Area -->
    <main id="main-content">
      <div id="welcome-view" class="view active"></div>
      <div id="module-view" class="view"></div>
    </main>
  </div>
  
  <script src="js/core/StateManager.js"></script>
  <script src="js/core/ModuleLoader.js"></script>
  <script src="js/workspace.js"></script>
</body>
</html>
```

### Deliverables
- [x] **New project structure created** - `/public/classic/` and `/public/workspace/` directories with proper organization
- [x] **Libraries installed and configured** - `mitt` (3.0.0) and `split.js` (1.6.0) installed via npm and loaded via CDN
- [x] **State management system functional** - Full `StateManager` class with nested property updates, subscriptions, and event system
- [x] **Base layout rendering** - Complete workspace HTML with collapsible sidebar, module view, and welcome hub
- [x] **Current app still accessible at `/classic`** - Server routes configured, welcome page updated with version selection

### Implementation Summary

**What Was Built:**
1. **Complete Project Restructure**:
   - All original app code moved to `/public/classic/` (fully functional)
   - New modular structure created in `/public/workspace/`
   - Organized into `/core/`, `/modules/`, `/components/` subdirectories

2. **Core Systems**:
   - `StateManager.js` - Centralized state with mitt event system (240 lines)
   - `ModuleLoader.js` - Dynamic module loading and lifecycle management (302 lines)
   - `WorkspaceAPI.js` - API client for all backend endpoints (296 lines)
   - `workspace.js` - Main application controller (335 lines)

3. **Module System**:
   - Module registry with 5 modules defined (segmentation, denoising, annotation, mesh, visualization)
   - `SegmentationModule.js` - Placeholder implementation ready for Phase 2 integration
   - Dynamic import system for lazy loading modules

4. **UI Components**:
   - Collapsible sidebar with user info and workspace stats
   - Module cards grid in welcome view
   - Loading overlay and notification system
   - Comprehensive CSS (562 lines)

5. **Backend Integration**:
   - 4 new API endpoints: `/api/workspace/init`, `/status`, `/files`, `/stats`
   - Routes for both `/classic` and `/workspace` applications
   - Updated welcome page with version selection cards

**Key Files Created** (15 files total):
- `/public/workspace/index.html`
- `/public/workspace/css/workspace.css`
- `/public/workspace/js/workspace.js`
- `/public/workspace/js/core/StateManager.js`
- `/public/workspace/js/core/ModuleLoader.js`
- `/public/workspace/js/core/WorkspaceAPI.js`
- `/public/workspace/js/modules/registry.js`
- `/public/workspace/js/modules/segmentation/SegmentationModule.js`
- Plus all classic app files moved to `/public/classic/`

**Server Routes Added**:
```javascript
app.get('/classic', requireAuth, ...) // Classic app
app.get('/workspace', requireAuth, ...) // New workspace
app.post('/api/workspace/init', requireAuth, ...)
app.get('/api/workspace/status', requireAuth, ...)
app.get('/api/workspace/files', requireAuth, ...)
app.get('/api/workspace/stats', requireAuth, ...)
```

---

## Phase 2: Core Module System & Welcome Hub ✅ COMPLETE
**Duration**: 2 weeks
**Value Delivered**: Module architecture, professional welcome interface, full segmentation integration
**Can Stop Here**: Yes - functional module system with complete segmentation pipeline
**Status**: ✅ **COMPLETED** - Segmentation module fully integrated

### Goals
- Create module registration and loading system
- Build welcome/hub page with module cards
- Convert existing segmentation workflow into first module
- Implement module switching

### Implementation Steps

#### 2.1 Module System Architecture
```javascript
// /workspace/js/core/ModuleLoader.js
class ModuleLoader {
  constructor(stateManager) {
    this.modules = new Map();
    this.activeModule = null;
    this.state = stateManager;
  }
  
  register(moduleConfig) {
    this.modules.set(moduleConfig.id, {
      ...moduleConfig,
      loaded: false,
      instance: null
    });
  }
  
  async load(moduleId) {
    const module = this.modules.get(moduleId);
    if (!module) throw new Error(`Module ${moduleId} not found`);
    
    if (!module.loaded) {
      // Dynamically import module
      const ModuleClass = await import(module.path);
      module.instance = new ModuleClass.default(this.state);
      module.loaded = true;
    }
    
    // Deactivate current module
    if (this.activeModule) {
      this.activeModule.instance.deactivate();
    }
    
    // Activate new module
    this.activeModule = module;
    module.instance.activate();
    
    // Update UI
    document.getElementById('welcome-view').classList.remove('active');
    document.getElementById('module-view').classList.add('active');
  }
}
```

#### 2.2 Module Configuration Registry
```javascript
// /workspace/js/modules/registry.js
export const moduleRegistry = [
  {
    id: 'segmentation',
    name: 'U-Net Segmentation',
    description: 'Train and run deep learning segmentation models',
    icon: '🧩',
    path: '/js/modules/segmentation/SegmentationModule.js',
    inputs: ['image_stack', 'annotations?'],
    outputs: ['segmented_stack', 'model'],
    color: '#4A90E2'
  },
  {
    id: 'denoising',
    name: 'Deep Learning Denoising',
    description: 'Remove noise from electron microscopy images',
    icon: '🔊',
    path: '/js/modules/denoising/DenoisingModule.js',
    inputs: ['image_stack'],
    outputs: ['denoised_stack'],
    color: '#50C878',
    status: 'coming_soon'
  },
  {
    id: 'annotation',
    name: 'Quick Annotation',
    description: 'Simple brush-based annotation tool',
    icon: '✏️',
    path: '/js/modules/annotation/AnnotationModule.js',
    inputs: ['image_stack'],
    outputs: ['annotations'],
    color: '#FF6B6B',
    status: 'coming_soon'
  },
  {
    id: 'mesh',
    name: 'Surface Mesh Generation',
    description: 'Convert segmentations to 3D surface meshes',
    icon: '🎯',
    path: '/js/modules/mesh/MeshModule.js',
    inputs: ['segmented_stack'],
    outputs: ['mesh_file'],
    color: '#9B59B6',
    status: 'coming_soon'
  }
];
```

#### 2.3 Welcome Hub Interface
```javascript
// /workspace/js/components/WelcomeHub.js
class WelcomeHub {
  constructor(moduleLoader) {
    this.moduleLoader = moduleLoader;
    this.container = document.getElementById('welcome-view');
  }
  
  render() {
    const modulesHtml = moduleRegistry.map(module => `
      <div class="module-card ${module.status || ''}" 
           data-module="${module.id}">
        <div class="module-icon">${module.icon}</div>
        <h3>${module.name}</h3>
        <p>${module.description}</p>
        <div class="module-io">
          <span class="inputs">↓ ${module.inputs.join(', ')}</span>
          <span class="outputs">↑ ${module.outputs.join(', ')}</span>
        </div>
        ${module.status === 'coming_soon' 
          ? '<div class="status-badge">Coming Soon</div>'
          : '<button class="btn-launch">Launch Module</button>'}
      </div>
    `).join('');
    
    this.container.innerHTML = `
      <div class="welcome-hub">
        <header class="hub-header">
          <h1>Biomedical Image Processing Workspace</h1>
          <p>Select a processing module to begin</p>
        </header>
        
        <div class="modules-grid">
          ${modulesHtml}
        </div>
        
        <footer class="hub-footer">
          <div class="resources">
            <h4>Resources</h4>
            <a href="#" class="resource-link">📚 Documentation</a>
            <a href="#" class="resource-link">🔬 Publications</a>
            <a href="https://github.com/yourusername/viz_app" 
               class="resource-link">💻 GitHub</a>
          </div>
        </footer>
      </div>
    `;
    
    this.attachEvents();
  }
  
  attachEvents() {
    this.container.querySelectorAll('.btn-launch').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const moduleId = e.target.closest('.module-card').dataset.module;
        this.moduleLoader.load(moduleId);
      });
    });
  }
}
```

#### 2.4 Segmentation Module Wrapper
```javascript
// /workspace/js/modules/segmentation/SegmentationModule.js
export default class SegmentationModule {
  constructor(stateManager) {
    this.state = stateManager;
    this.container = document.getElementById('module-view');
    // Reuse existing segmentation code
    this.existingApp = null;
  }
  
  activate() {
    // Load the existing segmentation workflow
    this.container.innerHTML = `
      <div class="module-header">
        <button class="btn-back" onclick="backToHub()">← Back to Hub</button>
        <h2>U-Net Segmentation Pipeline</h2>
      </div>
      <div id="segmentation-container"></div>
    `;
    
    // Initialize existing segmentation code in the container
    this.loadExistingSegmentation();
  }
  
  deactivate() {
    // Cleanup
    if (this.existingApp) {
      this.existingApp.cleanup();
    }
  }
  
  loadExistingSegmentation() {
    // Load your existing app.js functionality here
    // This allows you to reuse all your existing code
  }
}
```

### Deliverables
- [x] **Module registration system working** - ModuleLoader with dynamic imports fully functional
- [x] **Welcome hub displaying all modules** - Complete welcome view with module cards
- [x] **Segmentation module successfully wrapped and functional** - Full 5-step workflow integrated (1050 lines)
- [x] **Module switching working smoothly** - Activate/deactivate lifecycle working
- [x] **Resources section with links** - Welcome footer with GitHub and documentation links

### Implementation Summary

**What Was Built:**
1. **Complete SegmentationModule (1050 lines)**:
   - Dynamic dependency loading (Socket.IO, Chart.js, Three.js, UTIF)
   - Dynamic CSS loading
   - Full 5-step workflow UI (Data Upload → Configuration → Training → Inference → 3D Visualization)
   - Socket.IO integration for real-time progress updates
   - Chart.js integration for training metrics
   - Session state persistence and resume capability
   - Proper lifecycle management (activate/deactivate/cleanup)

2. **Helper Scripts Copied & Adapted**:
   - `fileUpload.js` (242 lines) - File upload handling with drag-and-drop
   - `training.js` (206 lines) - Training workflow and progress tracking
   - `inference.js` (277 lines) - Inference workflow and results handling
   - `charts.js` (153 lines) - Chart.js integration and updates
   - `navigation.js` (401 lines) - Step navigation logic
   - `utils.js` (108 lines) - Utility functions
   - `socket.js` (34 lines) - Socket.IO setup
   - `visualization/` folder (entire Three.js visualization system)

3. **CSS Integration**:
   - `segmentation.css` - Combined styles from steps.css, charts.css, components.css
   - Dynamic loading of base styles (base.css, layout.css, modals.css)

4. **Module Registry Updated**:
   - Segmentation module status changed from placeholder to 'available'
   - Description updated to reflect complete pipeline

**Architecture Highlights:**
- **Hybrid approach**: Reused classic JS files with minimal adaptation
- **Module-scoped state**: All global variables from classic app converted to module properties
- **Dependency management**: Smart loading only when needed (checks if already loaded)
- **Session persistence**: Can resume training/inference if user switches modules
- **Proper cleanup**: Disconnects Socket.IO, destroys charts, disposes Three.js resources

**Key Files Modified/Created** (10+ files):
- ✨ `/workspace/js/modules/segmentation/SegmentationModule.js` (1050 lines, NEW)
- `/workspace/js/modules/segmentation/css/segmentation.css` (NEW)
- `/workspace/js/modules/segmentation/*.js` (8 helper files copied)
- `/workspace/js/modules/segmentation/visualization/` (9 Three.js files copied)
- `/workspace/js/modules/registry.js` (updated status)

**Integration Approach:**
- Kept classic app completely untouched
- Classic helper scripts work as-is with global functions
- Module coordinates everything through instance methods
- Real-time communication via Socket.IO maintained
- All existing backend endpoints reused (no server changes needed)

**Testing Status:**
- Server starts successfully on port 3000
- Module can be launched from workspace hub
- Ready for end-to-end workflow testing

---

## Phase 3: File Browser & Workspace Management
**Duration**: 3 weeks  
**Value Delivered**: Persistent file management, professional IDE-like interface  
**Can Stop Here**: Yes - complete workspace with segmentation module

### Goals
- Implement collapsible sidebar with file browser
- Create persistent workspace file system
- Add file upload/download capabilities
- Implement file preview functionality

### Implementation Steps

#### 3.1 File System Structure
```javascript
// /workspace/js/core/FileManager.js
class FileManager {
  constructor(stateManager) {
    this.state = stateManager;
    this.fileTree = null;
    this.initializeTree();
  }
  
  async initializeTree() {
    // Fetch workspace structure from server
    const response = await fetch('/api/workspace/files');
    const files = await response.json();
    
    this.fileTree = new InspireTree({
      data: this.transformToTreeData(files)
    });
    
    this.render();
  }
  
  transformToTreeData(files) {
    return {
      text: 'Workspace',
      children: [
        {
          text: 'Uploads',
          icon: '📁',
          children: [
            { text: 'Raw Images', icon: '🖼️', children: [] },
            { text: 'Annotations', icon: '🏷️', children: [] },
            { text: 'Processed', icon: '⚙️', children: [] }
          ]
        },
        {
          text: 'Models',
          icon: '🧠',
          children: [
            { text: 'Segmentation', children: [] },
            { text: 'Denoising', children: [] }
          ]
        },
        {
          text: 'Results',
          icon: '📊',
          children: []
        }
      ]
    };
  }
  
  render() {
    const container = document.getElementById('file-browser');
    const dom = new InspireTreeDOM(this.fileTree, {
      target: container
    });
  }
  
  async uploadFile(file, category) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('category', category);
    
    const response = await fetch('/api/workspace/upload', {
      method: 'POST',
      body: formData
    });
    
    if (response.ok) {
      const fileInfo = await response.json();
      this.addFileToTree(fileInfo);
      this.state.update('workspace.files', 
        [...this.state.workspace.files, fileInfo]);
    }
  }
}
```

#### 3.2 Sidebar Implementation
```javascript
// /workspace/js/components/Sidebar.js
class Sidebar {
  constructor(fileManager, stateManager) {
    this.fileManager = fileManager;
    this.state = stateManager;
    this.container = document.getElementById('sidebar');
    this.isCollapsed = true;
    this.init();
  }
  
  init() {
    this.setupToggle();
    this.setupDropZone();
    this.render();
  }
  
  setupToggle() {
    const toggle = this.container.querySelector('.sidebar-toggle');
    toggle.addEventListener('click', () => {
      this.isCollapsed = !this.isCollapsed;
      this.container.classList.toggle('collapsed');
      
      // Use Split.js for resizable panels when expanded
      if (!this.isCollapsed && !this.splitter) {
        this.splitter = Split(['#sidebar', '#main-content'], {
          sizes: [25, 75],
          minSize: [200, 400],
          gutterSize: 4
        });
      }
    });
  }
  
  setupDropZone() {
    const dropZone = document.createElement('div');
    dropZone.className = 'drop-zone';
    dropZone.innerHTML = `
      <div class="drop-zone-content">
        <p>📁 Drop files here</p>
        <button class="btn-upload">Or click to browse</button>
        <input type="file" multiple hidden>
      </div>
    `;
    
    // Drag and drop handlers
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('drag-over');
    });
    
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      const files = Array.from(e.dataTransfer.files);
      files.forEach(file => this.handleFileUpload(file));
    });
    
    this.container.querySelector('.sidebar-content').prepend(dropZone);
  }
  
  async handleFileUpload(file) {
    // Determine file category based on extension/type
    const category = this.categorizeFile(file);
    await this.fileManager.uploadFile(file, category);
  }
  
  categorizeFile(file) {
    if (file.name.includes('annotation')) return 'annotations';
    if (file.name.endsWith('.pth')) return 'models';
    if (file.name.endsWith('.tif')) return 'raw_images';
    return 'misc';
  }
}
```

#### 3.3 File Preview Component
```javascript
// /workspace/js/components/FilePreview.js
class FilePreview {
  constructor() {
    this.previewModal = null;
    this.init();
  }
  
  init() {
    // Create preview modal
    this.previewModal = document.createElement('div');
    this.previewModal.className = 'file-preview-modal';
    this.previewModal.innerHTML = `
      <div class="preview-content">
        <div class="preview-header">
          <span class="preview-title"></span>
          <button class="close-preview">×</button>
        </div>
        <div class="preview-body"></div>
      </div>
    `;
    document.body.appendChild(this.previewModal);
  }
  
  async preview(fileInfo) {
    const { type, path, name } = fileInfo;
    
    this.previewModal.querySelector('.preview-title').textContent = name;
    const body = this.previewModal.querySelector('.preview-body');
    
    switch(type) {
      case 'tiff':
        body.innerHTML = await this.renderTiffPreview(path);
        break;
      case 'model':
        body.innerHTML = await this.renderModelInfo(path);
        break;
      case 'mesh':
        body.innerHTML = await this.render3DPreview(path);
        break;
      default:
        body.innerHTML = '<p>Preview not available</p>';
    }
    
    this.previewModal.classList.add('active');
  }
  
  async renderTiffPreview(path) {
    // Reuse your existing TIFF viewing code
    return `
      <div class="tiff-viewer">
        <canvas id="preview-canvas"></canvas>
        <div class="slice-controls">
          <button>← Prev</button>
          <span>Slice 1/100</span>
          <button>Next →</button>
        </div>
      </div>
    `;
  }
}
```

#### 3.4 Backend API Updates
```javascript
// server.js additions
// Workspace file management endpoints
app.get('/api/workspace/files', (req, res) => {
  const sessionId = req.session.id;
  const workspacePath = path.join('workspaces', sessionId);
  
  // Return file tree structure
  const files = getDirectoryTree(workspacePath);
  res.json(files);
});

app.post('/api/workspace/upload', upload.single('file'), (req, res) => {
  const sessionId = req.session.id;
  const category = req.body.category;
  const file = req.file;
  
  // Organize file in workspace structure
  const targetPath = path.join('workspaces', sessionId, category, file.filename);
  // Move file to organized location
  fs.renameSync(file.path, targetPath);
  
  res.json({
    id: generateFileId(),
    name: file.originalname,
    path: targetPath,
    category: category,
    size: file.size,
    uploadDate: new Date()
  });
});

app.get('/api/workspace/download/:fileId', (req, res) => {
  // Handle file downloads
  const fileId = req.params.fileId;
  const fileInfo = getFileInfo(fileId);
  res.download(fileInfo.path, fileInfo.name);
});
```

### Deliverables
- [ ] Collapsible sidebar with file tree
- [ ] Drag-and-drop file upload
- [ ] File categorization and organization
- [ ] File preview for TIFF stacks
- [ ] Download functionality
- [ ] Session persistence

---

## Phase 4: Denoising Module Integration
**Duration**: 2 weeks  
**Value Delivered**: Second major processing capability  
**Can Stop Here**: Yes - two complete processing modules

### Goals
- Integrate Python denoising algorithm
- Create denoising module UI
- Implement progress tracking
- Enable result comparison view

### Implementation Steps

#### 4.1 Denoising Module Frontend
```javascript
// /workspace/js/modules/denoising/DenoisingModule.js
export default class DenoisingModule {
  constructor(stateManager) {
    this.state = stateManager;
    this.container = document.getElementById('module-view');
    this.socket = null;
  }
  
  activate() {
    this.render();
    this.initializeSocket();
  }
  
  render() {
    this.container.innerHTML = `
      <div class="module-denoising">
        <div class="module-header">
          <button class="btn-back" onclick="backToHub()">← Back</button>
          <h2>Deep Learning Denoising</h2>
        </div>
        
        <div class="denoising-workflow">
          <!-- Step 1: Select Input -->
          <div class="workflow-step">
            <h3>1. Select Input Data</h3>
            <div class="file-selector">
              <select id="input-select">
                <option>Select TIFF stack...</option>
              </select>
              <button class="btn-preview">Preview</button>
            </div>
          </div>
          
          <!-- Step 2: Configure -->
          <div class="workflow-step">
            <h3>2. Denoising Parameters</h3>
            <div class="config-grid">
              <label>
                Model:
                <select id="model-select">
                  <option>Pre-trained Model v1</option>
                  <option>Custom Model</option>
                </select>
              </label>
              <label>
                Noise Level:
                <input type="range" min="1" max="10" value="5">
              </label>
              <label>
                Batch Size:
                <input type="number" value="4" min="1" max="16">
              </label>
            </div>
          </div>
          
          <!-- Step 3: Process -->
          <div class="workflow-step">
            <h3>3. Run Denoising</h3>
            <button class="btn-primary" onclick="startDenoising()">
              Start Denoising
            </button>
            <div class="progress-container" style="display:none">
              <div class="progress-bar">
                <div class="progress-fill"></div>
              </div>
              <span class="progress-text">Processing...</span>
            </div>
          </div>
          
          <!-- Step 4: Results -->
          <div class="workflow-step">
            <h3>4. Results</h3>
            <div class="results-viewer" style="display:none">
              <div class="comparison-view">
                <div class="before">
                  <h4>Original</h4>
                  <canvas id="original-canvas"></canvas>
                </div>
                <div class="after">
                  <h4>Denoised</h4>
                  <canvas id="denoised-canvas"></canvas>
                </div>
              </div>
              <button class="btn-download">Download Result</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }
  
  async startDenoising() {
    const config = this.getConfiguration();
    
    const response = await fetch('/api/denoising/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    });
    
    if (response.ok) {
      const { denoisingId } = await response.json();
      this.trackProgress(denoisingId);
    }
  }
  
  trackProgress(denoisingId) {
    this.socket.on(`denoising-progress-${denoisingId}`, (data) => {
      this.updateProgressBar(data.progress);
      
      if (data.complete) {
        this.displayResults(data.resultPath);
      }
    });
  }
}
```

#### 4.2 Backend Denoising Integration
```javascript
// server.js additions
app.post('/api/denoising/start', async (req, res) => {
  const sessionId = req.session.id;
  const denoisingId = uuid.v4();
  const config = req.body;
  
  // Start Python denoising process
  const pythonProcess = spawn('python', [
    'python/denoise_model.py',
    '--input', config.inputPath,
    '--output', path.join('workspaces', sessionId, 'results', 'denoised'),
    '--model', config.modelPath,
    '--config', JSON.stringify(config),
    '--denoising_id', denoisingId
  ]);
  
  pythonProcess.stdout.on('data', (data) => {
    const output = data.toString();
    
    // Parse progress updates
    if (output.startsWith('PROGRESS:')) {
      const progress = JSON.parse(output.substring(9));
      io.to(`session-${sessionId}`).emit(`denoising-progress-${denoisingId}`, progress);
    }
  });
  
  res.json({ success: true, denoisingId });
});
```

#### 4.3 Python Denoising Script Template
```python
# python/denoise_model.py
import argparse
import json
import sys
import numpy as np
import tifffile
from pathlib import Path

def send_progress(current, total, denoising_id):
    """Send progress update to Node.js"""
    progress_data = {
        "current": current,
        "total": total,
        "progress": (current / total) * 100,
        "denoising_id": denoising_id
    }
    print(f"PROGRESS:{json.dumps(progress_data)}", flush=True)

def denoise_stack(input_path, output_path, model_path, config, denoising_id):
    """
    Your denoising algorithm implementation here
    """
    # Load TIFF stack
    stack = tifffile.imread(input_path)
    num_slices = stack.shape[0]
    
    # Initialize your denoising model
    # model = load_denoising_model(model_path)
    
    denoised_stack = np.zeros_like(stack)
    
    for i in range(num_slices):
        # Apply denoising to each slice
        # denoised_stack[i] = model.denoise(stack[i])
        
        # For now, placeholder processing
        denoised_stack[i] = stack[i]  # Replace with actual denoising
        
        # Send progress
        send_progress(i + 1, num_slices, denoising_id)
    
    # Save result
    tifffile.imwrite(output_path, denoised_stack)
    
    return output_path

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--model', required=True)
    parser.add_argument('--config', required=True)
    parser.add_argument('--denoising_id', required=True)
    
    args = parser.parse_args()
    config = json.loads(args.config)
    
    result = denoise_stack(
        args.input, 
        args.output, 
        args.model, 
        config, 
        args.denoising_id
    )
    
    print(json.dumps({"success": True, "result": result}), flush=True)
```

### Deliverables
- [ ] Denoising module UI complete
- [ ] File selection from workspace
- [ ] Parameter configuration interface
- [ ] Real-time progress tracking
- [ ] Before/after comparison view
- [ ] Result saving to workspace

---

## Phase 5: Basic Annotation Tool
**Duration**: 1 week  
**Value Delivered**: Complete in-platform workflow capability  
**Can Stop Here**: Yes - full workflow from raw data to segmentation

### Goals
- Implement simple brush-based annotation tool
- Support multi-slice annotation
- Export annotations as TIFF stack
- Integrate with workspace file system

### Implementation Steps

#### 5.1 Annotation Module Core
```javascript
// /workspace/js/modules/annotation/AnnotationModule.js
export default class AnnotationModule {
  constructor(stateManager) {
    this.state = stateManager;
    this.container = document.getElementById('module-view');
    this.canvas = null;
    this.ctx = null;
    this.currentSlice = 0;
    this.imageStack = null;
    this.annotationStack = [];
    this.tool = 'brush';
    this.brushSize = 10;
    this.currentClass = 1;
    this.isDrawing = false;
  }
  
  activate() {
    this.render();
    this.initializeCanvas();
    this.setupEventHandlers();
  }
  
  render() {
    this.container.innerHTML = `
      <div class="annotation-module">
        <div class="module-header">
          <button class="btn-back" onclick="backToHub()">← Back</button>
          <h2>Quick Annotation Tool</h2>
        </div>
        
        <div class="annotation-workspace">
          <!-- Toolbar -->
          <div class="annotation-toolbar">
            <div class="tool-group">
              <button class="tool-btn active" data-tool="brush">
                🖌️ Brush
              </button>
              <button class="tool-btn" data-tool="eraser">
                🧹 Eraser
              </button>
              <button class="tool-btn" data-tool="fill">
                🪣 Fill
              </button>
            </div>
            
            <div class="tool-settings">
              <label>
                Size:
                <input type="range" id="brush-size" 
                       min="1" max="50" value="10">
                <span id="size-display">10px</span>
              </label>
              
              <label>
                Class:
                <select id="class-select">
                  <option value="0" style="background:#000">Background</option>
                  <option value="1" style="background:#f00">Class 1</option>
                  <option value="2" style="background:#0f0">Class 2</option>
                  <option value="3" style="background:#00f">Class 3</option>
                </select>
              </label>
            </div>
            
            <div class="tool-actions">
              <button onclick="annotator.clearSlice()">Clear Slice</button>
              <button onclick="annotator.clearAll()">Clear All</button>
            </div>
          </div>
          
          <!-- Canvas Area -->
          <div class="annotation-canvas-container">
            <canvas id="image-canvas"></canvas>
            <canvas id="annotation-canvas"></canvas>
            <div class="canvas-info">
              <span>Zoom: 100%</span>
              <span>Slice: <span id="slice-num">1</span>/<span id="total-slices">1</span></span>
            </div>
          </div>
          
          <!-- Slice Navigation -->
          <div class="slice-navigation">
            <button onclick="annotator.previousSlice()">← Previous</button>
            <input type="range" id="slice-slider" min="0" value="0">
            <button onclick="annotator.nextSlice()">Next →</button>
          </div>
          
          <!-- Actions -->
          <div class="annotation-actions">
            <button class="btn-primary" onclick="annotator.saveAnnotations()">
              💾 Save Annotations
            </button>
            <button onclick="annotator.exportTiff()">
              📥 Export as TIFF
            </button>
          </div>
        </div>
      </div>
    `;
  }
  
  initializeCanvas() {
    this.canvas = document.getElementById('annotation-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.imageCanvas = document.getElementById('image-canvas');
    this.imageCtx = this.imageCanvas.getContext('2d');
  }
  
  setupEventHandlers() {
    // Tool selection
    document.querySelectorAll('.tool-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.selectTool(e.target.dataset.tool);
      });
    });
    
    // Brush size
    document.getElementById('brush-size').addEventListener('input', (e) => {
      this.brushSize = parseInt(e.target.value);
      document.getElementById('size-display').textContent = `${this.brushSize}px`;
    });
    
    // Class selection
    document.getElementById('class-select').addEventListener('change', (e) => {
      this.currentClass = parseInt(e.target.value);
    });
    
    // Drawing events
    this.setupDrawingEvents();
    
    // Slice navigation
    document.getElementById('slice-slider').addEventListener('input', (e) => {
      this.loadSlice(parseInt(e.target.value));
    });
  }
  
  setupDrawingEvents() {
    this.canvas.addEventListener('mousedown', (e) => {
      this.isDrawing = true;
      this.draw(e.offsetX, e.offsetY);
    });
    
    this.canvas.addEventListener('mousemove', (e) => {
      if (this.isDrawing) {
        this.draw(e.offsetX, e.offsetY);
      }
    });
    
    this.canvas.addEventListener('mouseup', () => {
      this.isDrawing = false;
      this.saveCurrentAnnotation();
    });
    
    // Touch support
    this.canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      const rect = this.canvas.getBoundingClientRect();
      this.isDrawing = true;
      this.draw(touch.clientX - rect.left, touch.clientY - rect.top);
    });
  }
  
  draw(x, y) {
    if (this.tool === 'eraser') {
      this.ctx.globalCompositeOperation = 'destination-out';
    } else {
      this.ctx.globalCompositeOperation = 'source-over';
      const colors = ['#000000', '#FF0000', '#00FF00', '#0000FF'];
      this.ctx.fillStyle = colors[this.currentClass] + '80'; // 50% opacity
    }
    
    this.ctx.beginPath();
    this.ctx.arc(x, y, this.brushSize, 0, 2 * Math.PI);
    this.ctx.fill();
  }
  
  floodFill(x, y, targetClass) {
    // Simple flood fill implementation
    // Would need proper implementation for production
    console.log('Flood fill not yet implemented');
  }
  
  saveCurrentAnnotation() {
    // Save current canvas to annotation stack
    const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
    this.annotationStack[this.currentSlice] = imageData;
  }
  
  async loadImageStack(filePath) {
    // Load TIFF stack for annotation
    const response = await fetch(`/api/workspace/file/${filePath}`);
    const arrayBuffer = await response.arrayBuffer();
    
    // Parse TIFF (reuse your existing TIFF loading code)
    // this.imageStack = parsedTiff;
    
    this.updateSliceInfo();
  }
  
  loadSlice(sliceIndex) {
    this.currentSlice = sliceIndex;
    
    // Load image slice
    if (this.imageStack && this.imageStack[sliceIndex]) {
      // Draw image on background canvas
      // Implementation depends on your TIFF format
    }
    
    // Load existing annotations if any
    if (this.annotationStack[sliceIndex]) {
      this.ctx.putImageData(this.annotationStack[sliceIndex], 0, 0);
    } else {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
    
    document.getElementById('slice-num').textContent = sliceIndex + 1;
  }
  
  async exportTiff() {
    // Convert annotation stack to TIFF format
    const formData = new FormData();
    formData.append('annotations', this.annotationStackToBlob());
    formData.append('filename', 'annotations.tif');
    
    const response = await fetch('/api/annotation/export', {
      method: 'POST',
      body: formData
    });
    
    if (response.ok) {
      const blob = await response.blob();
      this.downloadBlob(blob, 'annotations.tif');
    }
  }
}
```

#### 5.2 Backend Support for Annotations
```javascript
// server.js additions
app.post('/api/annotation/export', upload.single('annotations'), async (req, res) => {
  const sessionId = req.session.id;
  const annotationsPath = path.join('workspaces', sessionId, 'annotations');
  
  // Process annotation data and create TIFF
  // This would need proper TIFF creation logic
  
  res.download(annotationsPath);
});
```

### Deliverables
- [ ] Basic drawing tools (brush, eraser)
- [ ] Multi-slice support
- [ ] Class/label selection
- [ ] Save/load annotations
- [ ] Export as TIFF stack
- [ ] Integration with file browser

---

## Phase 6: Mesh Generation Module
**Duration**: 1 week  
**Value Delivered**: Complete pipeline to simulation-ready meshes  
**Can Stop Here**: Yes - full platform complete

### Goals
- Extract mesh generation from current visualizer
- Create dedicated mesh module
- Add mesh export options
- Support multiple mesh formats

### Implementation Steps

#### 6.1 Mesh Module Implementation
```javascript
// /workspace/js/modules/mesh/MeshModule.js
export default class MeshModule {
  constructor(stateManager) {
    this.state = stateManager;
    this.container = document.getElementById('module-view');
    this.meshData = null;
  }
  
  activate() {
    this.render();
    this.initializeThreeJS();
  }
  
  render() {
    this.container.innerHTML = `
      <div class="mesh-module">
        <div class="module-header">
          <button class="btn-back" onclick="backToHub()">← Back</button>
          <h2>Surface Mesh Generation</h2>
        </div>
        
        <div class="mesh-workflow">
          <div class="workflow-step">
            <h3>1. Select Segmentation</h3>
            <select id="segmentation-select">
              <option>Select segmented TIFF stack...</option>
            </select>
          </div>
          
          <div class="workflow-step">
            <h3>2. Mesh Parameters</h3>
            <div class="parameters">
              <label>
                Smoothing:
                <input type="range" min="0" max="10" value="5">
              </label>
              <label>
                Decimation:
                <input type="range" min="0" max="90" value="50">
                <span>50% reduction</span>
              </label>
              <label>
                Export Format:
                <select id="format-select">
                  <option value="obj">OBJ</option>
                  <option value="stl">STL</option>
                  <option value="ply">PLY</option>
                  <option value="gltf">glTF</option>
                </select>
              </label>
            </div>
          </div>
          
          <div class="workflow-step">
            <h3>3. Generate & Preview</h3>
            <button class="btn-primary" onclick="generateMesh()">
              Generate Mesh
            </button>
            <div id="mesh-preview"></div>
          </div>
          
          <div class="workflow-step">
            <h3>4. Export</h3>
            <button class="btn-download" disabled>
              Download Mesh
            </button>
          </div>
        </div>
      </div>
    `;
  }
  
  async generateMesh() {
    const config = this.getConfiguration();
    
    const response = await fetch('/api/mesh/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    });
    
    if (response.ok) {
      const meshData = await response.json();
      this.displayMesh(meshData);
    }
  }
}
```

### Deliverables
- [ ] Mesh parameter configuration
- [ ] Multiple export formats
- [ ] 3D preview
- [ ] Mesh optimization options

---

## Phase 7: Polish & Integration
**Duration**: 2 weeks  
**Value Delivered**: Production-ready platform  
**Can Stop Here**: Complete

### Goals
- Add keyboard shortcuts
- Implement undo/redo
- Add help documentation
- Performance optimization
- User preferences
- Error recovery

### Implementation Steps

#### 7.1 Keyboard Shortcuts
```javascript
// /workspace/js/core/KeyboardManager.js
class KeyboardManager {
  constructor() {
    this.shortcuts = new Map();
    this.registerDefaultShortcuts();
  }
  
  registerDefaultShortcuts() {
    this.register('Ctrl+S', () => this.saveWorkspace());
    this.register('Ctrl+O', () => this.openFile());
    this.register('Ctrl+Z', () => this.undo());
    this.register('Ctrl+Y', () => this.redo());
    this.register('Escape', () => this.exitModule());
    this.register('F1', () => this.showHelp());
  }
  
  register(shortcut, callback) {
    this.shortcuts.set(shortcut, callback);
  }
}
```

#### 7.2 Help System
```javascript
// /workspace/js/components/HelpSystem.js
class HelpSystem {
  constructor() {
    this.tutorials = [];
    this.tooltips = new Map();
  }
  
  showInteractiveTutorial(module) {
    // Step-by-step guided tutorial
  }
  
  addContextualHelp(element, helpText) {
    // Hover tooltips
  }
}
```

### Deliverables
- [ ] Keyboard shortcut system
- [ ] Undo/redo functionality
- [ ] Interactive tutorials
- [ ] Performance monitoring
- [ ] Error recovery system
- [ ] User preferences storage

---

## Testing & Deployment Checklist

### Before Each Phase
- [ ] Create git branch for phase
- [ ] Backup current working version
- [ ] Document any breaking changes

### After Each Phase
- [ ] Test all existing functionality
- [ ] Update documentation
- [ ] Get user feedback if possible
- [ ] Merge to main branch

### Final Testing
- [ ] Cross-browser testing (Chrome, Firefox, Safari)
- [ ] Performance testing with large files
- [ ] Session persistence testing
- [ ] Error handling verification
- [ ] Security audit

---

## Risk Mitigation Strategies

### Technical Risks
1. **File Size Limitations**: Implement chunked uploads for large TIFF stacks
2. **Browser Memory**: Use web workers for heavy processing
3. **Session Management**: Implement session recovery mechanisms

### User Experience Risks
1. **Complexity**: Provide "Simple" and "Advanced" modes
2. **Learning Curve**: Include sample datasets and tutorials
3. **Data Loss**: Auto-save functionality

---

## Success Metrics

### Phase Completion Criteria
- Code passing all tests
- Documentation updated
- No regression in existing features
- User acceptance (if testing with users)

### Platform Success Indicators
- Processing time < 2x standalone scripts
- Browser memory usage < 2GB for typical datasets
- User can complete full workflow without leaving platform
- File organization intuitive to new users

---

## Maintenance & Future Enhancements

### Immediate Post-Launch
- Bug fixes based on user feedback
- Performance optimization
- Additional file format support

### Future Enhancements
- Collaborative features
- Cloud storage integration
- Advanced annotation tools
- Batch processing
- Workflow templates
- Plugin system for custom modules

---

## Resources & References

### Documentation
- [Three.js Documentation](https://threejs.org/docs/)
- [Socket.io Documentation](https://socket.io/docs/)
- [Inspire Tree Documentation](https://inspire-tree.com/)

### Tutorials
- [Building IDE-like Interfaces](https://www.smashingmagazine.com/2020/01/building-ide-interfaces/)
- [File System in Browser](https://web.dev/file-system-access/)
- [Canvas Drawing Techniques](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API)

### Your Existing Resources
- Current segmentation pipeline code
- Python processing scripts
- Three.js visualization modules
- Socket.io communication layer

---

## Notes

This plan is designed to be flexible. Each phase builds on the previous one but delivers standalone value. You can adjust timelines based on your availability and priorities. The key is maintaining momentum while keeping the existing application functional throughout the transformation.

Remember: **Perfect is the enemy of good**. Start with basic implementations and iterate based on user feedback.