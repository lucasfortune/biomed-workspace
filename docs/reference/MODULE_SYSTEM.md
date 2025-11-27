# Module System Reference

> **ModuleLoader API and module lifecycle management for workspace version**

This document provides comprehensive documentation for the ModuleLoader class and the module system architecture. The module system enables dynamic loading, activation, and lifecycle management of workspace modules.

**Last Updated:** 2025-11-27
**Files:**
- `public/workspace/js/core/ModuleLoader.js`
- `public/workspace/js/modules/registry.js`

---

## Overview

The ModuleLoader provides a **plugin-like architecture** for workspace modules. Key features:

- **Dynamic Loading:** Modules loaded on-demand via ES6 dynamic imports
- **Lifecycle Management:** Activate/deactivate modules with proper cleanup
- **State Integration:** Modules receive StateManager instance
- **Memory Management:** Unload modules to free memory
- **Registry System:** Centralized module configuration

---

## Architecture

### Module Lifecycle

```
┌─────────────┐
│  Registered │  (module config in registry)
└──────┬──────┘
       │ load()
       ▼
┌─────────────┐
│   Loaded    │  (module class imported, instance created)
└──────┬──────┘
       │ activate()
       ▼
┌─────────────┐
│   Active    │  (module UI rendered, event listeners attached)
└──────┬──────┘
       │ deactivate()
       ▼
┌─────────────┐
│  Inactive   │  (module UI cleared, listeners removed)
└──────┬──────┘
       │ unload() [optional]
       ▼
┌─────────────┐
│  Unloaded   │  (instance destroyed, memory freed)
└─────────────┘
```

### Module Storage

```javascript
this.modules = new Map(); // moduleId → module config + instance

// Module entry structure:
{
  id: 'segmentation',
  name: 'U-Net Segmentation',
  description: '...',
  icon: '🧩',
  path: '/workspace/js/modules/segmentation/SegmentationModule.js',
  inputs: ['image_stack', 'annotations'],
  outputs: ['segmented_stack', 'trained_model', 'visualization'],
  color: '#4A90E2',
  status: 'available',  // 'available' | 'coming_soon'
  loaded: false,        // Has module been imported?
  instance: null,       // Module class instance
  loadedAt: null        // ISO timestamp of loading
}
```

---

## API Reference

### Constructor

#### new ModuleLoader(stateManager)

Create a new ModuleLoader instance.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| stateManager | StateManager | Yes | StateManager instance for state access |

**Example:**
```javascript
const stateManager = new StateManager();
const moduleLoader = new ModuleLoader(stateManager);
```

**What it creates:**
- `this.state` - Reference to StateManager
- `this.modules` - Map of registered modules
- `this.activeModule` - Currently active module reference
- `this.container` - Container element for rendering

---

### Configuration Methods

#### setContainer(container)

Set the container element where modules will be rendered.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| container | HTMLElement | Yes | DOM element for module rendering |

**Example:**
```javascript
const moduleView = document.getElementById('module-view');
moduleLoader.setContainer(moduleView);
```

**Behavior:**
- Stores reference to container element
- Modules will render into this container via `activate()`

---

### Registration Methods

#### register(moduleConfig)

Register a single module.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| moduleConfig | Object | Yes | Module configuration object |

**Module Config Structure:**

```javascript
{
  id: 'segmentation',           // Required: Unique module ID
  name: 'U-Net Segmentation',   // Required: Display name
  description: '...',            // Optional: Module description
  icon: '🧩',                    // Optional: Emoji icon (default: '📦')
  path: '/workspace/js/...',     // Required: Path to module file
  inputs: ['image_stack'],       // Optional: Expected input types
  outputs: ['segmented_stack'],  // Optional: Output types
  color: '#4A90E2',              // Optional: Theme color (default: '#4A90E2')
  status: 'available'            // Optional: 'available' | 'coming_soon' (default: 'available')
}
```

**Example:**
```javascript
moduleLoader.register({
  id: 'segmentation',
  name: 'U-Net Segmentation',
  description: 'Complete ML pipeline for image segmentation',
  icon: '🧩',
  path: '/workspace/js/modules/segmentation/SegmentationModule.js',
  inputs: ['image_stack', 'annotations'],
  outputs: ['segmented_stack', 'trained_model', 'visualization'],
  color: '#4A90E2',
  status: 'available'
});
```

**Validation:**
- Throws error if `id`, `name`, or `path` missing
- All other fields optional with defaults

**Behavior:**
- Stores module config in `this.modules` Map
- Sets `loaded: false`, `instance: null`, `loadedAt: null`
- Logs registration to console

---

#### registerAll(modules)

Register multiple modules at once.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| modules | Array | Yes | Array of module configuration objects |

**Example:**
```javascript
const moduleRegistry = [
  {
    id: 'segmentation',
    name: 'U-Net Segmentation',
    path: '/workspace/js/modules/segmentation/SegmentationModule.js',
    // ...
  },
  {
    id: 'denoising',
    name: 'Deep Learning Denoising',
    path: '/workspace/js/modules/denoising/DenoisingModule.js',
    // ...
  }
];

moduleLoader.registerAll(moduleRegistry);
```

**Behavior:**
- Calls `register()` for each module
- Continues on error (logs but doesn't throw)

---

### Module Loading Methods

#### load(moduleId)

Load and activate a module.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| moduleId | string | Yes | ID of module to load |

**Returns:** `Promise<Object|null>` - Module instance, or null if coming soon

**Example:**
```javascript
try {
  const module = await moduleLoader.load('segmentation');
  console.log('Module loaded:', module);
} catch (error) {
  console.error('Failed to load module:', error);
}
```

**Behavior:**

**Pre-checks:**
1. Verifies module is registered (throws if not found)
2. If `status === 'coming_soon'`:
   - Shows notification: "Module is coming soon!"
   - Returns `null`
   - Does not load

**Loading sequence:**
1. Updates UI: `stateManager.update('ui.loading', true)`
2. Deactivates current module if any
3. **If not already loaded:**
   - Dynamic import: `await import(module.path)`
   - Creates instance: `new ModuleClass.default(stateManager)`
   - Sets `loaded: true`, `loadedAt: <timestamp>`
4. **If already loaded:**
   - Reuses existing instance
5. Sets `this.activeModule = module`
6. Calls `module.instance.activate()`
7. Updates state:
   - `workspace.activeModule` → moduleId
   - `modules.${moduleId}.active` → true
   - `ui.currentView` → 'module'
   - `ui.loading` → false

**Error Handling:**
- Catches and logs errors
- Shows error notification
- Sets `ui.loading` → false
- Rethrows error

**State Changes:**
```javascript
// Before load
state.ui.loading === false
state.workspace.activeModule === null
state.ui.currentView === 'welcome'

// During load
state.ui.loading === true

// After load
state.ui.loading === false
state.workspace.activeModule === 'segmentation'
state.modules.segmentation.active === true
state.ui.currentView === 'module'
```

---

#### deactivate()

Deactivate the currently active module.

**Returns:** `Promise<void>`

**Example:**
```javascript
await moduleLoader.deactivate();
```

**Behavior:**
1. If no active module, returns immediately
2. Calls `module.instance.deactivate()` if method exists
3. Updates state: `modules.${moduleId}.active` → false
4. Sets `this.activeModule = null`
5. Logs deactivation

**Error Handling:**
- Logs error but rethrows
- Module may be in inconsistent state if error occurs

---

#### returnToHub()

Deactivate current module and return to welcome view.

**Returns:** `Promise<void>`

**Example:**
```javascript
await moduleLoader.returnToHub();
```

**Behavior:**
1. Calls `deactivate()`
2. Updates state:
   - `workspace.activeModule` → null
   - `ui.currentView` → 'welcome'
3. Shows welcome view, hides module view:
   - Adds 'active' class to `#welcome-view`
   - Removes 'active' class from `#module-view`

**Use Cases:**
- User clicks "Back to Hub" button
- Module encounters fatal error
- Programmatic navigation to hub

---

#### unload(moduleId)

Unload a module to free memory.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| moduleId | string | Yes | ID of module to unload |

**Returns:** `Promise<void>`

**Example:**
```javascript
// Unload unused module to free memory
await moduleLoader.unload('denoising');
```

**Behavior:**
1. If module not loaded, returns immediately
2. If module is active, deactivates it first
3. Calls `module.instance.cleanup()` if method exists
4. Clears instance:
   - `module.instance = null`
   - `module.loaded = false`
   - `module.loadedAt = null`
5. Logs unload

**When to use:**
- Module no longer needed
- Memory optimization
- Module needs to be reloaded

---

#### reload(moduleId)

Reload a module (unload then load).

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| moduleId | string | Yes | ID of module to reload |

**Returns:** `Promise<Object>` - New module instance

**Example:**
```javascript
// Reload module after code changes
await moduleLoader.reload('segmentation');
```

**Behavior:**
1. Calls `unload(moduleId)`
2. Calls `load(moduleId)`

**Use Cases:**
- Development: reload after code changes
- Error recovery: fresh start for broken module
- Force re-initialization

---

### Query Methods

#### getModuleInfo(moduleId)

Get information about a module.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| moduleId | string | Yes | ID of module |

**Returns:** `Object|null` - Module info, or null if not found

**Example:**
```javascript
const info = moduleLoader.getModuleInfo('segmentation');
console.log(info);
// {
//   id: 'segmentation',
//   name: 'U-Net Segmentation',
//   description: '...',
//   icon: '🧩',
//   status: 'available',
//   loaded: true,
//   active: true
// }
```

**Returned Fields:**
- `id` - Module ID
- `name` - Display name
- `description` - Module description
- `icon` - Emoji icon
- `status` - 'available' | 'coming_soon'
- `loaded` - Is module loaded?
- `active` - Is module active?

**Note:** Does not return `path`, `instance`, or internal fields.

---

#### getAllModules()

Get information about all registered modules.

**Returns:** `Array<Object>` - Array of module info objects

**Example:**
```javascript
const modules = moduleLoader.getAllModules();
console.log(`Found ${modules.length} modules`);

modules.forEach(module => {
  console.log(`${module.icon} ${module.name} - ${module.status}`);
});
```

**Returned Array:**
```javascript
[
  {
    id: 'segmentation',
    name: 'U-Net Segmentation',
    description: '...',
    icon: '🧩',
    inputs: ['image_stack', 'annotations'],
    outputs: ['segmented_stack', 'trained_model'],
    color: '#4A90E2',
    status: 'available',
    loaded: true,
    active: true
  },
  {
    id: 'denoising',
    // ...
  }
]
```

**Use Cases:**
- Rendering module cards in hub view
- Module selection UI
- Admin/debug views

---

#### isLoaded(moduleId)

Check if a module is loaded.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| moduleId | string | Yes | ID of module |

**Returns:** `boolean` - True if loaded, false otherwise

**Example:**
```javascript
if (!moduleLoader.isLoaded('segmentation')) {
  console.log('Segmentation module not loaded yet');
}
```

---

#### isActive(moduleId)

Check if a module is active.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| moduleId | string | Yes | ID of module |

**Returns:** `boolean` - True if active, false otherwise

**Example:**
```javascript
if (moduleLoader.isActive('segmentation')) {
  console.log('Segmentation module is currently active');
}
```

**Note:** Only one module can be active at a time.

---

#### getActiveModule()

Get information about the currently active module.

**Returns:** `Object|null` - Active module info, or null if none active

**Example:**
```javascript
const active = moduleLoader.getActiveModule();

if (active) {
  console.log(`Active module: ${active.name}`);
} else {
  console.log('No active module (on hub view)');
}
```

**Returned Object:**
Same structure as `getModuleInfo()` result.

---

## Module Implementation

### Module Class Structure

Every module must implement this interface:

```javascript
class MyModule {
  /**
   * Constructor receives StateManager instance
   */
  constructor(stateManager) {
    this.state = stateManager;
    this.container = null;
    // Initialize module-specific properties
  }

  /**
   * REQUIRED: Called when module is activated
   */
  async activate() {
    this.container = document.getElementById('module-view');
    this.render();
    this.attachEventListeners();
  }

  /**
   * REQUIRED: Called when module is deactivated
   */
  async deactivate() {
    this.removeEventListeners();
    if (this.container) {
      this.container.innerHTML = '';
    }
  }

  /**
   * OPTIONAL: Called when module is unloaded
   * Use for cleanup: timers, connections, etc.
   */
  async cleanup() {
    // Clear timers
    clearInterval(this.updateInterval);

    // Close connections
    if (this.socket) {
      this.socket.disconnect();
    }

    // Release resources
    this.data = null;
  }

  /**
   * Module-specific methods
   */
  render() {
    // Render UI
  }

  attachEventListeners() {
    // Attach listeners
  }

  removeEventListeners() {
    // Remove listeners
  }
}

export default MyModule;
```

### Minimal Module Example

```javascript
// /workspace/js/modules/example/ExampleModule.js

class ExampleModule {
  constructor(stateManager) {
    this.state = stateManager;
    this.container = null;
  }

  async activate() {
    this.container = document.getElementById('module-view');

    this.container.innerHTML = `
      <div class="module-header">
        <button class="btn-back" onclick="workspace.returnToHub()">
          ← Back to Hub
        </button>
        <h2>Example Module</h2>
      </div>
      <div class="module-content">
        <p>Hello from Example Module!</p>
      </div>
    `;

    console.log('Example module activated');
  }

  async deactivate() {
    if (this.container) {
      this.container.innerHTML = '';
    }
    console.log('Example module deactivated');
  }
}

export default ExampleModule;
```

**Register in registry.js:**
```javascript
{
  id: 'example',
  name: 'Example Module',
  description: 'A simple example module',
  icon: '🎯',
  path: '/workspace/js/modules/example/ExampleModule.js',
  inputs: [],
  outputs: [],
  color: '#FF6B6B',
  status: 'available'
}
```

---

## Module Registry

### Registry File Structure

**File:** `public/workspace/js/modules/registry.js`

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
  {
    id: 'denoising',
    name: 'Deep Learning Denoising',
    description: 'Remove noise from electron microscopy images',
    icon: '🔊',
    path: '/workspace/js/modules/denoising/DenoisingModule.js',
    inputs: ['image_stack'],
    outputs: ['denoised_stack'],
    color: '#50C878',
    status: 'coming_soon'
  }
  // ... more modules
];
```

### Using the Registry

**In workspace.js:**
```javascript
import moduleRegistry from './modules/registry.js';

// Register all modules
moduleLoader.registerAll(moduleRegistry);

// Render module cards
moduleRegistry.forEach(module => {
  renderModuleCard(module);
});
```

---

## Usage Patterns

### Basic Module Loading

```javascript
// Initialize
const stateManager = new StateManager();
const moduleLoader = new ModuleLoader(stateManager);

// Register modules
moduleLoader.registerAll(moduleRegistry);

// Set container
const moduleView = document.getElementById('module-view');
moduleLoader.setContainer(moduleView);

// Load module
document.getElementById('btn-segmentation').addEventListener('click', async () => {
  await moduleLoader.load('segmentation');
});

// Return to hub
document.getElementById('btn-back').addEventListener('click', async () => {
  await moduleLoader.returnToHub();
});
```

---

### Module Switching

```javascript
// Switch between modules
async function switchModule(newModuleId) {
  const current = moduleLoader.getActiveModule();

  if (current && current.id === newModuleId) {
    console.log('Module already active');
    return;
  }

  try {
    await moduleLoader.load(newModuleId);
    console.log(`Switched to ${newModuleId}`);
  } catch (error) {
    console.error('Failed to switch module:', error);
  }
}
```

---

### Module Status Handling

```javascript
// Handle coming_soon modules
async function loadModuleWithStatusCheck(moduleId) {
  const info = moduleLoader.getModuleInfo(moduleId);

  if (!info) {
    stateManager.notify('error', 'Module not found');
    return;
  }

  if (info.status === 'coming_soon') {
    stateManager.notify('info', `${info.name} is coming soon!`);
    return;
  }

  await moduleLoader.load(moduleId);
}
```

---

### Memory Management Pattern

```javascript
// Unload modules not in use
async function optimizeMemory() {
  const active = moduleLoader.getActiveModule();

  for (const module of moduleLoader.getAllModules()) {
    // Skip active module
    if (active && module.id === active.id) {
      continue;
    }

    // Unload if loaded
    if (module.loaded) {
      await moduleLoader.unload(module.id);
      console.log(`Unloaded ${module.name}`);
    }
  }
}

// Call periodically or on memory pressure
setInterval(optimizeMemory, 300000); // Every 5 minutes
```

---

### Error Recovery Pattern

```javascript
// Reload module on error
async function handleModuleError(moduleId, error) {
  console.error(`Module ${moduleId} error:`, error);

  // Notify user
  stateManager.notify('error', `Module crashed: ${error.message}`);

  // Return to hub
  await moduleLoader.returnToHub();

  // Offer to reload
  const reload = confirm('Reload module?');
  if (reload) {
    await moduleLoader.reload(moduleId);
  }
}
```

---

## State Integration

### Module Accessing State

```javascript
class MyModule {
  constructor(stateManager) {
    this.state = stateManager;
  }

  async activate() {
    // Get current workspace info
    const sessionId = this.state.get('workspace.sessionId');
    const files = this.state.get('workspace.files');

    // Update module state
    this.state.update('modules.mymodule.currentTask', {
      id: 'task-1',
      status: 'processing'
    });

    // Subscribe to changes
    this.unsubscribe = this.state.subscribe('workspace.files', (files) => {
      this.onFilesChange(files);
    });
  }

  async deactivate() {
    // Unsubscribe
    if (this.unsubscribe) {
      this.unsubscribe();
    }
  }
}
```

### Module State Structure

Each module has dedicated state:

```javascript
state.modules.mymodule = {
  active: false,          // Managed by ModuleLoader
  currentTask: null,      // Module-specific
  history: []             // Module-specific
}
```

**Best Practices:**
- Only update your module's state
- Don't modify other modules' state
- Use `workspace` state for shared data
- Clean up subscriptions in `deactivate()`

---

## Testing

### Unit Testing ModuleLoader

```javascript
describe('ModuleLoader', () => {
  let stateManager;
  let moduleLoader;

  beforeEach(() => {
    stateManager = new StateManager();
    moduleLoader = new ModuleLoader(stateManager);
  });

  test('should register module', () => {
    moduleLoader.register({
      id: 'test',
      name: 'Test Module',
      path: '/modules/test/TestModule.js'
    });

    expect(moduleLoader.isLoaded('test')).toBe(false);
    expect(moduleLoader.getModuleInfo('test')).toBeTruthy();
  });

  test('should load module', async () => {
    // Mock dynamic import
    jest.mock('/modules/test/TestModule.js', () => ({
      default: class TestModule {
        activate() {}
        deactivate() {}
      }
    }));

    moduleLoader.register({
      id: 'test',
      name: 'Test',
      path: '/modules/test/TestModule.js'
    });

    await moduleLoader.load('test');

    expect(moduleLoader.isLoaded('test')).toBe(true);
    expect(moduleLoader.isActive('test')).toBe(true);
  });
});
```

---

## Related Documentation

**Architecture:**
- [State Management](STATE_MANAGEMENT.md) - How modules interact with state
- [API Endpoints](API_ENDPOINTS.md) - Backend API for modules
- [Socket Protocol](SOCKET_PROTOCOL.md) - Real-time updates for modules

**Guides:**
- [Module Creation Guide](../guides/MODULE_CREATION.md) - Step-by-step module creation

**Implementation:**
- ModuleLoader: `public/workspace/js/core/ModuleLoader.js:1-303`
- Registry: `public/workspace/js/modules/registry.js:1-66`
- Segmentation Module: `public/workspace/js/modules/segmentation/SegmentationModule.js`

---

**Navigation:**
← [State Management](STATE_MANAGEMENT.md) | [Documentation Index](../INDEX.md) | Next: [Socket Protocol](SOCKET_PROTOCOL.md) →

---

**Status:** ✅ Complete
**Phase:** Phase 1 Complete, Phase 2 Active
**Last Updated:** 2025-11-27
