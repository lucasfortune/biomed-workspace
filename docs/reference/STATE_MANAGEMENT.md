# State Management Reference

> **StateManager API and event-based state system for workspace version**

This document provides comprehensive documentation for the StateManager class, which provides centralized state management with event-based subscriptions for the workspace version of the application.

**Last Updated:** 2025-11-27
**File:** `public/workspace/js/core/StateManager.js`
**Dependencies:** `mitt` (event emitter library)

---

## Overview

The StateManager uses **event-driven state management** with the lightweight `mitt` library. It provides:

- **Centralized State:** Single source of truth for all application state
- **Reactive Updates:** Automatic UI updates via event subscriptions
- **Nested Path Access:** Dot-notation for accessing nested state properties
- **Event System:** Fine-grained subscriptions to specific state changes
- **Debugging:** Built-in logging and state inspection

---

## Architecture

### State Tree Structure

```javascript
{
  workspace: {
    sessionId: null,          // Express session ID
    initialized: false,       // Workspace setup complete
    files: [],                // File tree structure
    stats: null,              // Workspace statistics
    activeModule: null        // Currently active module ID
  },
  modules: {
    segmentation: {
      active: false,          // Module is active
      currentTask: null,      // Current task data
      history: []             // Task history
    },
    denoising: {
      active: false,
      currentTask: null,
      history: []
    },
    annotation: {
      active: false,
      currentFile: null,      // Currently editing file
      history: []
    },
    mesh: {
      active: false,
      currentTask: null,
      history: []
    }
  },
  ui: {
    sidebarCollapsed: true,   // Sidebar visibility
    currentView: 'welcome',   // Active view
    loading: false,           // Global loading state
    notifications: []         // Notification queue
  },
  user: {
    username: null,           // Current username
    fullName: null,           // User's full name
    status: null,             // User status (pending/active)
    isAdmin: false            // Admin privileges
  }
}
```

### Event System

The StateManager emits events when state changes:

**Global change event:**
```javascript
'state:change' → { path, value, oldValue }
```

**Path-specific change event:**
```javascript
'state:change:workspace.files' → { value, oldValue }
```

**Reset event:**
```javascript
'state:reset' → { previousState }
```

---

## API Reference

### Constructor

#### new StateManager()

Creates a new StateManager instance.

**Example:**
```javascript
const stateManager = new StateManager();
```

**What it does:**
- Initializes state tree with default values
- Creates mitt event emitter instance
- Binds all methods to instance

---

### Core Methods

#### update(path, value)

Update state at a given path.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| path | string | Dot-notation path (e.g., 'workspace.files') |
| value | any | New value to set |

**Returns:** `void`

**Example:**
```javascript
// Update workspace files
stateManager.update('workspace.files', [
  { name: 'image1.tif', size: 1024000 },
  { name: 'image2.tif', size: 2048000 }
]);

// Update nested property
stateManager.update('modules.segmentation.active', true);

// Update user status
stateManager.update('user.status', 'active');
```

**Behavior:**
- Navigates nested path and updates value
- Creates intermediate objects if they don't exist
- Emits two events:
  - `state:change` (global)
  - `state:change:${path}` (path-specific)
- Logs change to console

**Events Emitted:**
```javascript
// Global event
{ path: 'workspace.files', value: [...], oldValue: [...] }

// Path-specific event
{ value: [...], oldValue: [...] }
```

---

#### get(path)

Get state value at a given path.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| path | string | Dot-notation path (e.g., 'workspace.sessionId') |

**Returns:** `any` - Value at path, or `undefined` if not found

**Example:**
```javascript
// Get simple value
const sessionId = stateManager.get('workspace.sessionId');
// Returns: "abc123..." or null

// Get nested object
const segmentation = stateManager.get('modules.segmentation');
// Returns: { active: false, currentTask: null, history: [] }

// Get array
const files = stateManager.get('workspace.files');
// Returns: [] or [...]

// Get non-existent path
const missing = stateManager.get('does.not.exist');
// Returns: undefined
```

**Behavior:**
- Returns `undefined` for non-existent paths
- Does not create intermediate objects
- Returns direct reference (not a copy)

---

#### subscribe(path, callback)

Subscribe to state changes at a specific path (includes children).

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| path | string | Dot-notation path to watch |
| callback | Function | Called when path or children change |

**Callback Signature:**
```javascript
(newValue, oldValue) => void
```

**Returns:** `Function` - Unsubscribe function

**Example:**
```javascript
// Subscribe to workspace changes
const unsubscribe = stateManager.subscribe('workspace', (workspace, oldWorkspace) => {
  console.log('Workspace changed:', workspace);
});

// Subscribe to specific property
stateManager.subscribe('workspace.files', (files, oldFiles) => {
  console.log('Files changed:', files);
  updateFileList(files);
});

// Subscribe to module state
stateManager.subscribe('modules.segmentation', (module, oldModule) => {
  if (module.active !== oldModule?.active) {
    console.log('Segmentation module active state changed');
  }
});

// Unsubscribe when no longer needed
unsubscribe();
```

**Behavior:**
- Triggers on changes to specified path **and all children**
- Example: Subscribing to `'workspace'` triggers on:
  - `'workspace.sessionId'`
  - `'workspace.files'`
  - `'workspace.stats'`
  - Any other `'workspace.*'` change
- Callback receives current value (fetched via `get()`) and old value
- Returns unsubscribe function for cleanup

---

#### subscribeExact(path, callback)

Subscribe to state changes at an exact path only (no children).

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| path | string | Exact dot-notation path to watch |
| callback | Function | Called only when this exact path changes |

**Callback Signature:**
```javascript
({ value, oldValue }) => void
```

**Returns:** `Function` - Unsubscribe function

**Example:**
```javascript
// Subscribe to exact path only
const unsubscribe = stateManager.subscribeExact('workspace.sessionId', ({ value, oldValue }) => {
  console.log(`Session ID changed from ${oldValue} to ${value}`);
});

// This will NOT trigger for 'workspace.files' changes
stateManager.subscribeExact('workspace', ({ value }) => {
  // Only triggers when entire workspace object is replaced
  console.log('Workspace object replaced:', value);
});

// Unsubscribe
unsubscribe();
```

**Behavior:**
- Only triggers on exact path changes
- Does **not** trigger on child path changes
- More performant for specific property watches
- Callback receives `{ value, oldValue }` object

**Comparison: subscribe() vs subscribeExact()**

| Feature | subscribe() | subscribeExact() |
|---------|-------------|------------------|
| Triggers on children | ✅ Yes | ❌ No |
| Callback signature | `(value, oldValue)` | `({ value, oldValue })` |
| Use case | Watch object and all properties | Watch single property |
| Performance | Checks all changes | Only exact path |

---

#### getState()

Get the entire state tree as a deep copy.

**Returns:** `Object` - Complete state tree (deep copy)

**Example:**
```javascript
const currentState = stateManager.getState();
console.log(currentState);
// {
//   workspace: { sessionId: "abc", initialized: true, ... },
//   modules: { segmentation: { ... }, ... },
//   ui: { ... },
//   user: { ... }
// }
```

**Behavior:**
- Returns deep copy via `JSON.parse(JSON.stringify())`
- Safe to modify without affecting state
- Useful for:
  - Debugging
  - Logging
  - State snapshots
  - Testing

**Note:** Functions and circular references are not preserved.

---

#### reset()

Reset state to initial values.

**Returns:** `void`

**Example:**
```javascript
// Reset entire state
stateManager.reset();

// Listen for reset event
stateManager.events.on('state:reset', ({ previousState }) => {
  console.log('State was reset. Previous state:', previousState);
});
```

**Behavior:**
- Resets all state to constructor defaults
- Emits `'state:reset'` event with previous state
- Does **not** clear event listeners
- Logs reset to console

**Use Cases:**
- User logout
- Session reset
- Module cleanup
- Testing

---

### Notification Methods

#### notify(type, message, duration)

Add notification to state and auto-remove after duration.

**Parameters:**

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| type | string | Yes | - | Notification type ('success', 'error', 'info', 'warning') |
| message | string | Yes | - | Notification message text |
| duration | number | No | 5000 | Duration in milliseconds (0 = persistent) |

**Returns:** `string` - Notification ID

**Example:**
```javascript
// Success notification (auto-removes after 5 seconds)
const id = stateManager.notify('success', 'File uploaded successfully');

// Error notification (auto-removes after 5 seconds)
stateManager.notify('error', 'Failed to connect to server');

// Info notification with custom duration
stateManager.notify('info', 'Processing...', 10000);

// Persistent notification (duration = 0)
const persistentId = stateManager.notify('warning', 'Unsaved changes', 0);

// Manually remove persistent notification later
stateManager.removeNotification(persistentId);
```

**Notification Object Structure:**
```javascript
{
  id: "notif_1638123456789",
  type: "success",
  message: "File uploaded successfully",
  timestamp: "2025-11-27T12:00:00.000Z"
}
```

**Behavior:**
- Adds notification to `ui.notifications` array
- Generates unique ID: `notif_${Date.now()}`
- Automatically removes after duration (unless duration = 0)
- Updates state via `update()` (triggers subscriptions)

**Notification Types:**

| Type | Use Case |
|------|----------|
| `success` | Operation completed successfully |
| `error` | Operation failed or error occurred |
| `info` | Informational message |
| `warning` | Warning or caution message |

---

#### removeNotification(notificationId)

Remove notification by ID.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| notificationId | string | Yes | Notification ID to remove |

**Returns:** `void`

**Example:**
```javascript
// Add persistent notification
const id = stateManager.notify('info', 'Loading...', 0);

// Remove it when done
setTimeout(() => {
  stateManager.removeNotification(id);
}, 3000);

// Subscribe to notifications to handle removals
stateManager.subscribe('ui.notifications', (notifications) => {
  notifications.forEach(notif => {
    console.log(`${notif.type}: ${notif.message}`);
  });
});
```

**Behavior:**
- Filters out notification with matching ID
- Updates `ui.notifications` array
- Triggers subscriptions
- Does nothing if ID not found

---

### Debugging Methods

#### logState()

Log the current state to console.

**Returns:** `void`

**Example:**
```javascript
// Log entire state
stateManager.logState();
// Console output:
// [StateManager] Current State: { workspace: {...}, modules: {...}, ui: {...}, user: {...} }
```

**Behavior:**
- Calls `getState()` to get deep copy
- Logs with `[StateManager]` prefix
- Useful for debugging in browser console

**Usage in Browser Console:**
```javascript
// Access from global workspace object
workspace.state.logState();
```

---

## Usage Patterns

### Initializing StateManager

**In workspace.js:**
```javascript
// Create StateManager instance
const stateManager = new StateManager();

// Initialize with user data
stateManager.update('user', {
  username: userData.username,
  fullName: userData.fullName,
  status: userData.status,
  isAdmin: userData.isAdmin
});

// Initialize workspace
const workspaceInfo = await api.initializeWorkspace();
stateManager.update('workspace.sessionId', workspaceInfo.sessionId);
stateManager.update('workspace.initialized', true);
```

---

### Module Activation Pattern

**Activating a module:**
```javascript
async function loadModule(moduleId) {
  // Update active module
  stateManager.update('workspace.activeModule', moduleId);
  stateManager.update(`modules.${moduleId}.active`, true);

  // Load module class
  const module = await import(`./modules/${moduleId}/${moduleId}Module.js`);

  // Module can access state
  const instance = new module.default(stateManager);
  await instance.activate();
}
```

**Deactivating a module:**
```javascript
async function deactivateModule(moduleId) {
  stateManager.update(`modules.${moduleId}.active`, false);
  stateManager.update(`modules.${moduleId}.currentTask`, null);
  stateManager.update('workspace.activeModule', null);
}
```

---

### Reactive UI Pattern

**Update UI based on state changes:**
```javascript
class WorkspaceUI {
  constructor(stateManager) {
    this.state = stateManager;

    // Subscribe to loading state
    this.state.subscribe('ui.loading', (loading) => {
      this.toggleLoadingSpinner(loading);
    });

    // Subscribe to notifications
    this.state.subscribe('ui.notifications', (notifications) => {
      this.renderNotifications(notifications);
    });

    // Subscribe to sidebar state
    this.state.subscribeExact('ui.sidebarCollapsed', ({ value }) => {
      this.updateSidebar(value);
    });
  }

  toggleLoadingSpinner(loading) {
    const spinner = document.getElementById('loading-spinner');
    spinner.style.display = loading ? 'block' : 'none';
  }

  renderNotifications(notifications) {
    const container = document.getElementById('notifications');
    container.innerHTML = notifications.map(n => `
      <div class="notification ${n.type}">
        ${n.message}
        <button onclick="workspace.state.removeNotification('${n.id}')">×</button>
      </div>
    `).join('');
  }

  updateSidebar(collapsed) {
    document.getElementById('sidebar').classList.toggle('collapsed', collapsed);
  }
}
```

---

### Task History Pattern

**Recording task history:**
```javascript
function recordTaskCompletion(moduleId, task) {
  const history = stateManager.get(`modules.${moduleId}.history`) || [];

  const historyEntry = {
    id: task.id,
    type: task.type,
    timestamp: new Date().toISOString(),
    result: task.result
  };

  // Add to history
  stateManager.update(`modules.${moduleId}.history`, [...history, historyEntry]);

  // Clear current task
  stateManager.update(`modules.${moduleId}.currentTask`, null);
}
```

---

### Cleanup Pattern

**Cleanup subscriptions when component is destroyed:**
```javascript
class ModuleComponent {
  constructor(stateManager) {
    this.state = stateManager;
    this.subscriptions = [];

    // Store unsubscribe functions
    this.subscriptions.push(
      this.state.subscribe('workspace.files', this.onFilesChange.bind(this))
    );

    this.subscriptions.push(
      this.state.subscribe('ui.loading', this.onLoadingChange.bind(this))
    );
  }

  onFilesChange(files) {
    // Handle files change
  }

  onLoadingChange(loading) {
    // Handle loading change
  }

  cleanup() {
    // Unsubscribe all
    this.subscriptions.forEach(unsubscribe => unsubscribe());
    this.subscriptions = [];
  }
}
```

---

## Event Reference

### Global Events

#### state:change

Emitted on any state change.

**Event Data:**
```javascript
{
  path: 'workspace.files',
  value: [...],
  oldValue: [...]
}
```

**Subscribe:**
```javascript
stateManager.events.on('state:change', ({ path, value, oldValue }) => {
  console.log(`State changed at ${path}`);
});
```

---

#### state:reset

Emitted when state is reset.

**Event Data:**
```javascript
{
  previousState: { /* complete previous state */ }
}
```

**Subscribe:**
```javascript
stateManager.events.on('state:reset', ({ previousState }) => {
  console.log('State was reset. Previous:', previousState);
});
```

---

### Path-Specific Events

#### state:change:${path}

Emitted when specific path changes.

**Event Name Examples:**
- `state:change:workspace.files`
- `state:change:modules.segmentation.active`
- `state:change:ui.loading`

**Event Data:**
```javascript
{
  value: <new value>,
  oldValue: <old value>
}
```

**Subscribe:**
```javascript
stateManager.events.on('state:change:workspace.files', ({ value, oldValue }) => {
  console.log('Files changed:', value);
});
```

---

## State Validation

### Type Safety

The StateManager does not enforce type safety. It's recommended to validate state before use:

```javascript
function updateFiles(files) {
  if (!Array.isArray(files)) {
    console.error('Files must be an array');
    return;
  }

  stateManager.update('workspace.files', files);
}

function updateSessionId(sessionId) {
  if (typeof sessionId !== 'string') {
    console.error('Session ID must be a string');
    return;
  }

  stateManager.update('workspace.sessionId', sessionId);
}
```

---

## Performance Considerations

### Subscription Performance

**Good:**
```javascript
// Subscribe to specific path
stateManager.subscribe('workspace.files', callback);
```

**Better:**
```javascript
// Subscribe to exact path (more performant)
stateManager.subscribeExact('workspace.files', callback);
```

**Best:**
```javascript
// Only subscribe when component is active
class Component {
  activate() {
    this.unsubscribe = stateManager.subscribe('workspace.files', this.onFiles);
  }

  deactivate() {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }
}
```

---

### Update Batching

Avoid multiple updates in tight loops:

**Bad:**
```javascript
files.forEach(file => {
  const files = stateManager.get('workspace.files') || [];
  stateManager.update('workspace.files', [...files, file]);
});
// Triggers N updates
```

**Good:**
```javascript
const currentFiles = stateManager.get('workspace.files') || [];
const newFiles = [...currentFiles, ...files];
stateManager.update('workspace.files', newFiles);
// Triggers 1 update
```

---

### Memory Management

StateManager holds references to all state. For large data:

**Good Practice:**
```javascript
// Store large data elsewhere, keep references in state
stateManager.update('workspace.fileIds', fileIds);
// Load full file data on demand from API
```

**Avoid:**
```javascript
// Don't store huge objects in state
stateManager.update('workspace.allFileData', hugeArray);
```

---

## Testing

### Unit Testing StateManager

```javascript
// Example test
describe('StateManager', () => {
  let stateManager;

  beforeEach(() => {
    stateManager = new StateManager();
  });

  test('should update state', () => {
    stateManager.update('workspace.sessionId', 'abc123');
    expect(stateManager.get('workspace.sessionId')).toBe('abc123');
  });

  test('should notify subscribers', (done) => {
    stateManager.subscribe('workspace.files', (files) => {
      expect(files).toEqual(['file1.tif']);
      done();
    });

    stateManager.update('workspace.files', ['file1.tif']);
  });

  test('should reset state', () => {
    stateManager.update('workspace.sessionId', 'abc123');
    stateManager.reset();
    expect(stateManager.get('workspace.sessionId')).toBeNull();
  });
});
```

---

## Related Documentation

**Architecture:**
- [Module System](MODULE_SYSTEM.md) - How modules interact with StateManager
- [API Endpoints](API_ENDPOINTS.md) - Backend API that populates state
- [Socket Protocol](SOCKET_PROTOCOL.md) - Real-time state updates

**Guides:**
- [Module Creation Guide](../guides/MODULE_CREATION.md) - Using StateManager in modules

**Implementation:**
- File: `public/workspace/js/core/StateManager.js:1-240`
- Usage: `public/workspace/js/workspace.js`
- Dependencies: `mitt` event emitter library

---

**Navigation:**
← [API Endpoints](API_ENDPOINTS.md) | [Documentation Index](../INDEX.md) | Next: [Module System](MODULE_SYSTEM.md) →

---

**Status:** ✅ Complete
**Phase:** Phase 1 Complete, Phase 2 In Use
**Last Updated:** 2025-11-27
