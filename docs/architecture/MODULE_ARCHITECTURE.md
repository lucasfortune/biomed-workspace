# Module System Architecture

**Last Updated:** 2026-01-01
**Status:** ✅ Complete (Phase 4)
**Target Audience:** Developers building or maintaining modules

---

## Introduction

The Module System is the core architectural pattern of the Workspace version, enabling a **plugin-like extensible architecture** for biomedical image processing workflows. This document describes the module system design, lifecycle, communication patterns, and best practices for creating new modules.

### What This Document Covers

- Module system design philosophy
- ModuleLoader and registry architecture
- Module lifecycle (registered → loaded → active → deactivated)
- Module interface contract
- Communication patterns (module ↔ state, module ↔ backend, module ↔ module)
- Integration patterns and best practices

### Who Should Read This

- **Module developers** - Creating new processing modules
- **Frontend developers** - Understanding module integration
- **Architects** - Evaluating extensibility patterns
- **New contributors** - Learning how modules work

### Related Documentation

- [Module System Reference](../reference/MODULE_SYSTEM.md) - Complete ModuleLoader API
- [State Architecture](STATE_ARCHITECTURE.md) - State management patterns
- [Architecture Overview](OVERVIEW.md) - System-wide architecture
- [ADR-004](../decisions/004_module_system_design.md) - Module system design decision
- Module Creation Guide (Phase 3) - Step-by-step tutorial

---

## Design Philosophy

### Core Principles

**1. Plugin-Like Architecture**
- Modules are self-contained, independent units
- Easy to add new modules without modifying core
- Module isolation prevents cross-contamination

**2. Dynamic ES6 Imports**
- Lazy loading (load only when needed)
- Reduces initial page load time
- Native JavaScript feature (no framework required)

**3. Shared State via Injection**
- StateManager injected into each module
- Modules communicate via shared state
- Event-driven updates (reactive)

**4. Clean Lifecycle**
- Predictable activation/deactivation
- Cleanup requirements enforced
- Memory leak prevention

**5. Registry-Based Metadata**
- Centralized module definitions
- Metadata for UI rendering (cards)
- Input/output contracts

See [ADR-004: Module System Design](../decisions/004_module_system_design.md) for decision rationale.

---

## System Components

### 1. ModuleLoader

**Purpose:** Manage module registration, loading, and lifecycle

**File:** `/public/workspace/js/core/ModuleLoader.js`
**Size:** 303 lines
**Dependencies:** StateManager

**Responsibilities:**
- Register modules from registry
- Dynamically import module classes
- Instantiate and activate modules
- Manage active module state
- Handle deactivation and cleanup
- Return to hub/welcome view

**Key Properties:**
```javascript
{
  state: StateManager,           // Reference to state manager
  modules: Map,                  // Registered modules (id → config)
  activeModule: Object|null,     // Currently active module
  container: HTMLElement|null    // Module render container
}
```

---

### 2. Module Registry

**Purpose:** Centralized module definitions and metadata

**File:** `/public/workspace/js/modules/registry.js`
**Size:** 66 lines
**Format:** Array of module configuration objects

**Module Configuration Schema:**
```javascript
{
  id: 'segmentation',                    // Unique ID (required)
  name: 'U-Net Segmentation',            // Display name (required)
  description: 'Complete ML pipeline...', // Description
  icon: '🧩',                            // Emoji icon for UI
  path: '/workspace/js/modules/...',     // Module file path (required)
  inputs: ['image_stack', 'annotations'], // Input data types
  outputs: ['segmented_stack', 'model'], // Output data types
  color: '#4A90E2',                      // Accent color for UI
  status: 'available'                    // 'available' | 'coming_soon'
}
```

**Current Modules (8 implemented):**

| ID | Name | Status | Phase |
|----|------|--------|-------|
| `segmentation` | U-Net Segmentation | ✅ Available | Phase 2 |
| `denoising-dl` | Deep Learning Denoising (N2V) | ✅ Available | Phase 4 |
| `denoising-filter` | Filter-Based Denoising | ✅ Available | Phase 4 |
| `annotation` | Quick Annotation Tool | ✅ Available | Phase 4 |
| `mesh` | Surface Mesh Generation | ✅ Available | Phase 4 |
| `visualization` | 3D Visualization | ✅ Available | Phase 4 |
| `imageviewer` | TIFF Stack Gallery | ✅ Available | Phase 4 |
| `template` | Module Starter Template | ✅ Available | Phase 4 |

---

### 3. BaseModule (Abstract Base Class)

**Purpose:** Provides reusable functionality for all modules

**File:** `/public/workspace/js/core/BaseModule.js`
**Size:** ~600 lines

**Key Features:**
- Step-based navigation framework
- CSS/script loading utilities
- Lifecycle management helpers
- Progress tracking and loading overlays
- Help panel integration

**Usage:**
```javascript
import BaseModule from '../../core/BaseModule.js';

class MyModule extends BaseModule {
  constructor(stateManager) {
    super(stateManager, 'mymodule');
    this.steps = ['select', 'configure', 'process', 'results'];
  }

  async activate() {
    await super.activate();
    // Additional activation logic
  }

  renderStep(stepIndex) {
    // Render current step UI
  }
}
```

**Provided Methods:**
- `loadCSS(path)` - Dynamically load module CSS
- `loadScript(path)` - Dynamically load module scripts
- `nextStep()` / `prevStep()` - Step navigation
- `showLoading(message)` / `hideLoading()` - Loading overlay
- `showProgress(percent, message)` - Progress indicator

---

### 4. Core UI Components

**Purpose:** Reusable UI components shared across modules

**Directory:** `/public/workspace/js/core/components/`

| Component | Purpose |
|-----------|---------|
| `FileSelector.js` | File selection with validation and help integration |
| `InfoPanel.js` | Help panel container with tabs |
| `InfoArticle.js` | Article rendering with markdown support |
| `InfoGlossary.js` | Terminology definitions |
| `InfoSearch.js` | Full-text search across help articles |
| `LoadingOverlay.js` | Loading state display |
| `MetricCard.js` | Statistics display cards |
| `NavigationButtons.js` | Step navigation controls |
| `ProgressIndicator.js` | Progress bar component |
| `StepNavigator.js` | Step-based workflow navigation |
| `ValidationDisplay.js` | Validation feedback display |

**Usage:**
```javascript
import { FileSelector } from '../../core/components/FileSelector.js';

// In module's activate()
this.fileSelector = new FileSelector({
  container: this.container.querySelector('.file-select'),
  onSelect: (file) => this.handleFileSelect(file),
  fileTypes: ['tif', 'tiff'],
  helpArticleId: 'segmentation-file-selection'
});
```

---

### 5. Module Interface

**Purpose:** Contract that all modules must implement

**Required Structure:**
```javascript
class MyModule {
  constructor(stateManager) {
    this.state = stateManager;
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

**Optional Methods:**
```javascript
cleanup() {
  // Release resources, clear caches
}
```

---

## Module Lifecycle

### Lifecycle States

```
┌─────────────┐
│  Registered │  Module added to registry
└──────┬──────┘
       │
       │ ModuleLoader.load(moduleId)
       │
       ▼
┌─────────────┐
│   Loaded    │  Module class imported, instance created
└──────┬──────┘
       │
       │ instance.activate()
       │
       ▼
┌─────────────┐
│   Active    │  Module UI rendered, event listeners attached
└──────┬──────┘
       │
       │ ModuleLoader.deactivate()
       │
       ▼
┌─────────────┐
│ Deactivated │  Module UI cleared, listeners removed
└──────┬──────┘
       │
       │ ModuleLoader.unload() (optional)
       │
       ▼
┌─────────────┐
│  Unloaded   │  Module instance destroyed, memory freed
└─────────────┘
```

---

### Lifecycle Phases

#### Phase 1: Registration

**When:** Application initialization

**Process:**
```javascript
// In workspace.js
import moduleRegistry from '/workspace/js/modules/registry.js';

moduleRegistry.forEach(moduleConfig => {
  moduleLoader.register(moduleConfig);
});
```

**What Happens:**
1. ModuleLoader validates config (requires `id`, `name`, `path`)
2. Stores config in internal Map: `modules.set(id, {...})`
3. Adds default values for optional fields
4. Logs registration

**Module State After:** Registered but not loaded

---

#### Phase 2: Loading

**When:** User clicks "Launch Module"

**Process:**
```javascript
// User clicks module card
await moduleLoader.load('segmentation');
```

**What Happens:**
1. Check if module exists
2. Check if status !== 'coming_soon'
3. Deactivate current module (if any)
4. Dynamic import: `await import(modulePath)`
5. Instantiate: `new ModuleClass.default(stateManager)`
6. Store instance in module config
7. Mark as loaded
8. Proceed to activation

**Module State After:** Loaded (class imported, instance created)

**Error Handling:**
```javascript
try {
  await moduleLoader.load(moduleId);
} catch (error) {
  // Module import failed or activation threw error
  state.notify('error', `Failed to load module: ${error.message}`);
}
```

---

#### Phase 3: Activation

**When:** Immediately after loading (automatically)

**Process:**
```javascript
// ModuleLoader.load() calls this
await module.instance.activate();
```

**What Happens (in Module):**
1. Get container element (`#module-view`)
2. Render UI to container
3. Attach event listeners
4. Subscribe to state changes
5. Initialize module state
6. Fetch initial data (if needed)

**State Updates (by ModuleLoader):**
```javascript
state.update('workspace.activeModule', moduleId);
state.update(`modules.${moduleId}.active`, true);
state.update('ui.currentView', 'module');
```

**Module State After:** Active (UI rendered, listeners attached)

**Example Activation:**
```javascript
async activate() {
  this.container = document.getElementById('module-view');

  // Subscribe to state
  this.unsubscribers = [];
  const unsub = this.state.subscribe('workspace.files', (files) => {
    this.updateFileSelector(files);
  });
  this.unsubscribers.push(unsub);

  // Render UI
  this.render();

  // Initialize module
  this.state.update('modules.segmentation.currentTask', null);
}
```

---

#### Phase 4: Deactivation

**When:** User clicks "Back to Hub" or loads another module

**Process:**
```javascript
await moduleLoader.deactivate();
// OR
await moduleLoader.returnToHub();
```

**What Happens (in Module):**
1. Unsubscribe from all state changes
2. Remove event listeners
3. Clear UI container
4. Clear temporary module state (optional)

**State Updates (by ModuleLoader):**
```javascript
state.update(`modules.${moduleId}.active`, false);
state.update('workspace.activeModule', null);
state.update('ui.currentView', 'welcome'); // if returning to hub
```

**Module State After:** Deactivated (UI cleared, listeners removed, instance still in memory)

**Example Deactivation:**
```javascript
async deactivate() {
  // Unsubscribe all
  if (this.unsubscribers) {
    this.unsubscribers.forEach(unsub => unsub());
    this.unsubscribers = [];
  }

  // Remove event listeners
  if (this.uploadBtn) {
    this.uploadBtn.removeEventListener('click', this.handleUpload);
  }

  // Clear UI
  if (this.container) {
    this.container.innerHTML = '';
  }

  // Clear temporary state (optional)
  this.state.update('modules.segmentation.currentTask', null);
}
```

---

#### Phase 5: Unloading (Optional)

**When:** Explicitly called to free memory

**Process:**
```javascript
await moduleLoader.unload('segmentation');
```

**What Happens:**
1. Deactivate if currently active
2. Call `module.cleanup()` (if defined)
3. Clear instance reference
4. Mark as not loaded

**Module State After:** Unloaded (back to registered state)

**When to Unload:**
- Memory constraints
- Module not used frequently
- Development/testing (force reload)

**Note:** Not commonly needed - loaded modules remain in memory for fast re-activation.

---

## ModuleLoader API

### Constructor

```javascript
const moduleLoader = new ModuleLoader(stateManager);
```

**Parameters:**
- `stateManager` - StateManager instance

---

### register(moduleConfig)

Register a module from configuration.

```javascript
moduleLoader.register({
  id: 'mymodule',
  name: 'My Module',
  description: 'Does something useful',
  path: '/workspace/js/modules/mymodule/MyModule.js',
  icon: '🎯',
  inputs: ['input_type'],
  outputs: ['output_type'],
  color: '#4A90E2',
  status: 'available'
});
```

**Throws:** Error if missing required fields (id, name, path)

---

### registerAll(modules)

Register multiple modules at once.

```javascript
moduleLoader.registerAll(moduleRegistry);
```

---

### load(moduleId)

Load and activate a module.

```javascript
const instance = await moduleLoader.load('segmentation');
```

**Returns:** Promise<ModuleInstance|null>
**Throws:** Error if load/activation fails

**Behavior:**
- Deactivates current module first
- Dynamic imports module class
- Instantiates and activates
- Updates state

---

### deactivate()

Deactivate current module.

```javascript
await moduleLoader.deactivate();
```

**Behavior:**
- Calls `module.deactivate()`
- Updates state
- Clears activeModule reference

---

### returnToHub()

Deactivate module and return to welcome view.

```javascript
await moduleLoader.returnToHub();
```

**Behavior:**
- Deactivates current module
- Updates UI state to 'welcome'
- Shows welcome view, hides module view

---

### unload(moduleId)

Unload a module to free memory.

```javascript
await moduleLoader.unload('segmentation');
```

**Behavior:**
- Deactivates if active
- Calls `module.cleanup()` (if exists)
- Clears instance
- Marks as not loaded

---

### reload(moduleId)

Unload and immediately reload a module.

```javascript
await moduleLoader.reload('segmentation');
```

**Use Case:** Development, testing, force refresh

---

### getModuleInfo(moduleId)

Get module metadata.

```javascript
const info = moduleLoader.getModuleInfo('segmentation');
// Returns: { id, name, description, icon, status, loaded, active }
```

---

### getAllModules()

Get all registered modules.

```javascript
const modules = moduleLoader.getAllModules();
// Returns: Array of module info objects
```

---

### isLoaded(moduleId)

Check if module is loaded.

```javascript
if (moduleLoader.isLoaded('segmentation')) {
  // Module is loaded
}
```

---

### isActive(moduleId)

Check if module is active.

```javascript
if (moduleLoader.isActive('segmentation')) {
  // Module is currently active
}
```

---

### getActiveModule()

Get currently active module info.

```javascript
const active = moduleLoader.getActiveModule();
// Returns: { id, name, ... } or null
```

---

## Module Interface Contract

### Required Methods

#### constructor(stateManager)

**Purpose:** Initialize module with state manager

**Parameters:**
- `stateManager` - StateManager instance for state access

**Requirements:**
- Store stateManager reference
- Initialize instance properties
- DO NOT render UI here (use activate())

**Example:**
```javascript
constructor(stateManager) {
  this.state = stateManager;
  this.container = null;
  this.unsubscribers = [];
  this.sockets = [];

  // Initialize module-specific properties
  this.currentTraining = null;
  this.currentInference = null;
}
```

---

#### async activate()

**Purpose:** Render UI and attach listeners

**Requirements:**
- Get container element (`#module-view`)
- Render UI to container
- Attach event listeners
- Subscribe to state changes (store unsubscribers)
- Initialize module state
- Fetch initial data (if needed)

**Returns:** Promise (can be async)

**Example:**
```javascript
async activate() {
  this.container = document.getElementById('module-view');

  if (!this.container) {
    throw new Error('Module container not found');
  }

  // Render UI
  this.render();

  // Subscribe to state
  const unsubFiles = this.state.subscribe('workspace.files', (files) => {
    this.updateFileSelector(files);
  });
  this.unsubscribers.push(unsubFiles);

  // Attach event listeners
  this.attachEventListeners();

  // Initialize state
  this.state.update('modules.segmentation.currentTask', null);

  // Load initial data
  await this.loadWorkspaceFiles();
}
```

---

#### async deactivate()

**Purpose:** Clean up and remove UI

**Requirements:**
- Unsubscribe from all state changes
- Remove all event listeners
- Close WebSocket connections (if any)
- Clear UI container
- Optionally clear module state

**Returns:** Promise (can be async)

**Example:**
```javascript
async deactivate() {
  // Unsubscribe from state
  this.unsubscribers.forEach(unsub => unsub());
  this.unsubscribers = [];

  // Close sockets
  this.sockets.forEach(socket => socket.close());
  this.sockets = [];

  // Remove event listeners
  this.removeEventListeners();

  // Clear UI
  if (this.container) {
    this.container.innerHTML = '';
  }

  // Clear temporary state (optional)
  this.state.update('modules.segmentation.currentTask', null);
}
```

---

### Optional Methods

#### cleanup()

**Purpose:** Release resources and clear caches

**When Called:** During module unload (rare)

**Example:**
```javascript
cleanup() {
  // Release large data structures
  this.cachedData = null;

  // Clear Three.js resources
  if (this.renderer) {
    this.renderer.dispose();
  }

  // Clear intervals/timeouts
  if (this.interval) {
    clearInterval(this.interval);
  }
}
```

---

## Communication Patterns

### Module ↔ State

**Pattern:** Modules interact with centralized state via StateManager

#### Reading State

```javascript
// Get workspace files
const files = this.state.get('workspace.files');

// Get module state
const currentTask = this.state.get('modules.segmentation.currentTask');

// Get user info
const user = this.state.get('user');
```

#### Updating State

```javascript
// Update module state
this.state.update('modules.segmentation.currentTask', {
  type: 'training',
  status: 'in_progress',
  trainingId: 'abc123'
});

// Update workspace state
this.state.update('workspace.stats', {
  fileCount: 10,
  totalSize: 1024000
});

// Show notification
this.state.notify('success', 'Training started!', 5000);
```

#### Subscribing to State

```javascript
// Subscribe to file changes
const unsub = this.state.subscribe('workspace.files', (files) => {
  this.updateFileSelector(files);
});

// Store for cleanup
this.unsubscribers.push(unsub);
```

See [State Architecture](STATE_ARCHITECTURE.md) for details.

---

### Module ↔ Backend

**Pattern:** Modules use WorkspaceAPI or fetch for backend communication

#### Using WorkspaceAPI

```javascript
import { api } from '../core/WorkspaceAPI.js';

// Upload training data
const response = await api.uploadTrainingData(formData);

// Start training
const training = await api.startTraining(config);

// Run inference
const inference = await api.runInference(data);
```

#### Direct Fetch (if needed)

```javascript
const response = await fetch('/api/custom-endpoint', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(data)
});

const result = await response.json();
```

See [API Endpoints](../reference/API_ENDPOINTS.md) for backend API.

---

### Module ↔ Module

**Pattern:** Modules communicate via shared state (event-driven)

**Example:** Module A produces output, Module B consumes it

```javascript
// Module A: Produces segmentation result
this.state.update('modules.segmentation.output', {
  type: 'segmented_stack',
  path: '/results/abc123/segmented.tif',
  metadata: { ... }
});

// Module B: Subscribes to segmentation output
this.state.subscribe('modules.segmentation.output', (output) => {
  if (output && output.type === 'segmented_stack') {
    // Use output as input
    this.loadSegmentationInput(output);
  }
});
```

**Future:** Module pipeline chaining (Phase 4+)

---

## Integration Patterns

### Pattern 1: Wrap Existing Code

**Use Case:** Migrate Classic version functionality to Workspace module

**Strategy:**
- Keep existing functions separate
- Module calls existing functions
- Minimal refactoring

**Example:**
```javascript
// Existing classic code (app.js)
function uploadTrainingData(formData) {
  // ... existing logic ...
}

// Segmentation module (wraps existing)
class SegmentationModule {
  async activate() {
    this.render();
  }

  handleUpload() {
    // Call existing function
    uploadTrainingData(this.formData);
  }
}
```

**Advantages:**
- Fast migration
- Low risk
- Code reuse

**Disadvantages:**
- Not fully modular
- May have dependencies on global state

---

### Pattern 2: Fresh Implementation

**Use Case:** New modules (denoising, annotation, mesh)

**Strategy:**
- Build UI from scratch
- Use StateManager for all state
- Use WorkspaceAPI for backend

**Example:**
```javascript
class DenoisingModule {
  constructor(stateManager) {
    this.state = stateManager;
  }

  async activate() {
    this.render();
    this.attachListeners();
  }

  render() {
    this.container.innerHTML = `
      <div class="module-header">
        <button class="btn-back">← Back</button>
        <h2>🔊 Denoising</h2>
      </div>
      <div class="module-content">
        <!-- Custom UI -->
      </div>
    `;
  }

  async denoise(file) {
    const response = await api.denoise(file);
    this.state.update('modules.denoising.output', response);
  }
}
```

**Advantages:**
- Clean modular architecture
- Fully reactive
- Easy to maintain

---

### Pattern 3: Hybrid Approach

**Use Case:** Reuse Python scripts, new UI

**Strategy:**
- Reuse existing Python backend scripts
- Build new module UI
- Maintain backward compatibility

**Example:**
```javascript
class MeshModule {
  async activate() {
    // New UI
    this.render();
  }

  async generateMesh(segmentationFile) {
    // Calls existing Python script
    const response = await fetch('/api/generate-mesh', {
      method: 'POST',
      body: JSON.stringify({ file: segmentationFile })
    });

    // Backend spawns existing mesh.py script
    const result = await response.json();

    this.state.update('modules.mesh.output', result);
  }
}
```

**Advantages:**
- Reuse battle-tested Python code
- New UI improves UX
- Gradual migration

---

## Module Isolation

### UI Container Isolation

**Pattern:** Each module renders into `#module-view` container

```javascript
async activate() {
  this.container = document.getElementById('module-view');
  this.container.innerHTML = `...`; // Module UI
}

async deactivate() {
  this.container.innerHTML = ''; // Clear on deactivate
}
```

**Benefits:**
- No DOM conflicts between modules
- Clean slate for each module
- Easy cleanup

---

### Event Listener Isolation

**Pattern:** Modules attach/remove their own listeners

```javascript
activate() {
  this.uploadBtn = document.getElementById('upload-btn');
  this.handleUpload = this.handleUpload.bind(this);
  this.uploadBtn.addEventListener('click', this.handleUpload);
}

deactivate() {
  if (this.uploadBtn) {
    this.uploadBtn.removeEventListener('click', this.handleUpload);
  }
}
```

**Benefits:**
- No listener leaks
- No cross-module interference

---

### State Subscription Isolation

**Pattern:** Modules store unsubscribe functions and clean up

```javascript
activate() {
  this.unsubscribers = [];

  const unsub1 = this.state.subscribe('workspace.files', (files) => {
    this.updateFiles(files);
  });

  const unsub2 = this.state.subscribe('modules.segmentation.progress', (progress) => {
    this.updateProgress(progress);
  });

  this.unsubscribers.push(unsub1, unsub2);
}

deactivate() {
  this.unsubscribers.forEach(unsub => unsub());
  this.unsubscribers = [];
}
```

**Benefits:**
- No memory leaks
- No stale subscriptions

---

## Extensibility

### Adding a New Module

**Steps:**

1. **Create module directory:**
   ```bash
   mkdir -p public/workspace/js/modules/yourmodule
   ```

2. **Create module class:**
   ```javascript
   // YourModule.js
   class YourModule {
     constructor(stateManager) {
       this.state = stateManager;
     }

     async activate() {
       // Render UI
     }

     async deactivate() {
       // Cleanup
     }
   }

   export default YourModule;
   ```

3. **Register in registry:**
   ```javascript
   // registry.js
   {
     id: 'yourmodule',
     name: 'Your Module',
     description: 'What it does',
     icon: '🎯',
     path: '/workspace/js/modules/yourmodule/YourModule.js',
     inputs: ['input_type'],
     outputs: ['output_type'],
     color: '#4A90E2',
     status: 'available'
   }
   ```

4. **Add backend endpoints (if needed):**
   ```javascript
   // server.js
   app.post('/api/yourmodule/process', requireAuth, async (req, res) => {
     // Your endpoint logic
   });
   ```

5. **Test:**
   - Restart server
   - Navigate to `/workspace`
   - Click "Launch Module"

See Module Creation Guide (Phase 3) for detailed tutorial.

---

### Module Dependencies (Future)

**Not yet implemented, planned for Phase 4+**

**Vision:**
```javascript
{
  id: 'mesh',
  dependencies: ['segmentation'],  // Requires segmentation output
  inputs: ['segmented_stack']
}
```

**Behavior:**
- Check dependencies before load
- Suggest module execution order
- Enable pipeline chaining

---

### Module Marketplace Vision (Future)

**Long-term vision:**
- Third-party modules
- Module package manager
- Module sandboxing (iframes?)
- Module versioning
- Module publishing

---

## Best Practices

### Module Development

**Do:**
- ✅ Follow interface contract (constructor, activate, deactivate)
- ✅ Clean up on deactivate (unsubscribe, remove listeners)
- ✅ Use StateManager for all global state
- ✅ Store unsubscribe functions for cleanup
- ✅ Test activation/deactivation multiple times
- ✅ Handle errors gracefully
- ✅ Log to console for debugging
- ✅ Use WorkspaceAPI for backend calls

**Don't:**
- ❌ Store state in global variables
- ❌ Forget to unsubscribe (memory leaks)
- ❌ Mutate state directly
- ❌ Leave event listeners attached
- ❌ Assume module will never deactivate
- ❌ Hardcode paths or IDs
- ❌ Block UI thread (use async/await)

---

### Error Handling

**Module-Level:**
```javascript
async activate() {
  try {
    await this.loadData();
    this.render();
  } catch (error) {
    console.error('[SegmentationModule] Activation failed:', error);
    this.state.notify('error', `Failed to load module: ${error.message}`);
    throw error; // Re-throw for ModuleLoader to handle
  }
}
```

**Operation-Level:**
```javascript
async handleUpload(file) {
  try {
    this.state.update('ui.loading', true);
    const response = await api.uploadFile(file);
    this.state.update('workspace.files', response.files);
    this.state.notify('success', 'File uploaded!', 3000);
  } catch (error) {
    console.error('[SegmentationModule] Upload failed:', error);
    this.state.notify('error', `Upload failed: ${error.message}`, 5000);
  } finally {
    this.state.update('ui.loading', false);
  }
}
```

---

### Memory Management

**Clean Up Resources:**
```javascript
deactivate() {
  // Unsubscribe state
  this.unsubscribers.forEach(unsub => unsub());
  this.unsubscribers = [];

  // Close sockets
  if (this.socket) {
    this.socket.disconnect();
    this.socket = null;
  }

  // Clear intervals
  if (this.interval) {
    clearInterval(this.interval);
    this.interval = null;
  }

  // Clear large data
  this.cachedData = null;

  // Clear UI
  this.container.innerHTML = '';
}
```

---

## Related Documentation

### Architecture

- [Architecture Overview](OVERVIEW.md) - System-wide architecture
- [State Architecture](STATE_ARCHITECTURE.md) - State management patterns
- [Dual Version Design](DUAL_VERSION_DESIGN.md) - Classic vs Workspace

### Reference

- [Module System Reference](../reference/MODULE_SYSTEM.md) - Complete API documentation
- [State Management Reference](../reference/STATE_MANAGEMENT.md) - StateManager API
- [API Endpoints](../reference/API_ENDPOINTS.md) - Backend API

### Decisions

- [ADR-004](../decisions/004_module_system_design.md) - Module system design rationale

### Guides

- Module Creation Guide (Phase 3) - Step-by-step tutorial

---

**Navigation:**
← [State Architecture](STATE_ARCHITECTURE.md) | [Architecture Docs](.) | [Authentication](AUTHENTICATION.md) →

---

**Document Status:** ✅ Complete (Phase 4)
**Last Updated:** 2026-01-01
**Maintained By:** Development Team
