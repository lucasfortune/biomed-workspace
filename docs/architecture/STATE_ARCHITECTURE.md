# State Management Architecture

**Last Updated:** 2026-09-07 (v1.5.0 data-model consolidation)
**Status:** ✅ Complete
**Target Audience:** Developers working with state in the workspace version

---

## Introduction

This document describes the state management architecture used in the Biomedical Image Processing Workspace application. The system consists of **frontend state management** (workspace version) and **backend state storage** (both versions), with clear patterns for managing, synchronizing, and persisting application state.

### What This Document Covers

- Frontend state management (StateManager with mitt)
- Backend state storage (in-memory maps and session storage)
- State flow patterns and event-driven architecture
- State synchronization via Socket.IO
- Best practices and common patterns

### Who Should Read This

- **Frontend developers** - Understanding workspace state management
- **Backend developers** - Understanding session and in-memory state
- **New contributors** - Learning state patterns
- **Architects** - Evaluating state management approach

### Related Documentation

- [State Management Reference](../reference/STATE_MANAGEMENT.md) - Complete API documentation
- [Module Architecture](MODULE_ARCHITECTURE.md) - How modules interact with state
- [Socket Protocol](../reference/SOCKET_PROTOCOL.md) - Real-time state synchronization
- [ADR-003](../decisions/003_session_based_isolation.md) - Session-based isolation decision

---

## State Management Overview

### Two State Systems

The application uses **two distinct state management systems**:

**1. Frontend State (Workspace Version Only)**
- **Component:** StateManager class with mitt event emitter
- **Scope:** Client-side UI state
- **Lifetime:** Page session (lost on refresh)
- **Pattern:** Reactive, event-driven
- **Storage:** In-memory JavaScript object

**2. Backend State (Both Versions)**
- **Components:** Express session + in-memory Maps (`SessionTracker`) + per-workspace `metadata.json`
- **Scope:** Server-side persistence
- **Lifetime:** Session duration or server uptime (metadata.json persists with the workspace)
- **Pattern:** Request-based
- **Storage:** express-session (file-based) + `SessionTracker` Maps + `workspaces/<sessionId>/metadata.json` (the sole persistent store for the file registry and lineage)

```
┌─────────────────────────────────────────────────────────────┐
│                    FRONTEND STATE                           │
│              (Workspace Version Only)                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  StateManager (with mitt)                                  │
│  ├─ workspace: { sessionId, files, stats, ... }            │
│  ├─ modules: { segmentation, denoising, ... }              │
│  ├─ ui: { sidebarCollapsed, currentView, ... }             │
│  └─ user: { username, fullName, status, ... }              │
│                                                             │
│  Events: state:change, state:change:path                   │
│                                                             │
└────────────────────┬────────────────────────────────────────┘
                     │
                     │ API calls (fetch)
                     │ Real-time updates (Socket.IO)
                     │
┌────────────────────▼────────────────────────────────────────┐
│                   BACKEND STATE                             │
│                  (Both Versions)                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Express Session (req.session)                             │
│  ├─ user: { username, fullName, status, isAdmin }          │
│  ├─ uploadedFiles: [ ... ]                                 │
│  ├─ trainingConfig: { ... }                                │
│  ├─ currentTraining: trainingId                            │
│  └─ importedModel: { ... }                                 │
│                                                             │
│  In-Memory Maps (SessionTracker)                           │
│  ├─ trainingSessions (Map)                                 │
│  ├─ inferenceSessions (Map)                                │
│  ├─ meshSessions (Map)                                     │
│  ├─ denoisingSessions (Map)                                │
│  └─ jobSessions (Map, generic job registry:                │
│       preprocess / stitching / segcleanup /                │
│       DL-inference / filter jobs)                          │
│                                                             │
│  Per-Workspace Manifest (on disk, persistent)              │
│  └─ workspaces/<sessionId>/metadata.json                   │
│       (file registry, lineage, schema 1.2.0)               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Frontend State (Workspace Version)

### StateManager with mitt

The workspace version uses a **centralized state management system** built on top of the [mitt](https://github.com/developit/mitt) event emitter library.

**File:** `/public/workspace/js/core/StateManager.js`
**Size:** 240 lines
**Dependencies:** mitt (event emitter)

**Key Features:**
- Centralized state tree
- Reactive updates via events
- Dot-notation path access
- Subscribe/unsubscribe pattern
- Built-in notification system
- Debug logging

---

### State Tree Structure

```javascript
{
  workspace: {
    sessionId: 'abc123...', // Express session ID
    initialized: true,       // Workspace initialized?
    files: [                 // Manifest entries from metadata.json
      { name: 'file1.tif', displayName: 'file1.tif', category: 'uploads', ... }
    ],
    stats: {                 // Workspace statistics
      fileCount: 5,
      totalSize: 1024000
    },
    activeModule: 'segmentation' // Currently active module ID
  },

  modules: {
    segmentation: {
      active: true,          // Module is active?
      currentTask: null,     // Current task state
      history: []            // Task history
    },
    denoising: {
      active: false,
      currentTask: null,
      history: []
    },
    annotation: {
      active: false,
      currentFile: null,
      history: []
    },
    mesh: {
      active: false,
      currentTask: null,
      history: []
    }
  },

  ui: {
    sidebarCollapsed: false,  // Sidebar state
    currentView: 'welcome',   // Current view ('welcome' | 'module')
    loading: false,           // Global loading state
    notifications: [          // Notification queue
      {
        id: 'notif_1234567890',
        type: 'success',
        message: 'File uploaded',
        timestamp: '2025-11-27T10:00:00.000Z'
      }
    ]
  },

  user: {
    username: 'john',
    fullName: 'John Doe',
    status: 'active',        // 'pending' | 'active' | 'rejected'
    isAdmin: false
  }
}
```

---

### StateManager API

#### update(path, value)

Update state at a given path and emit events.

```javascript
// Update a top-level property
stateManager.update('workspace.initialized', true);

// Update a nested property
stateManager.update('modules.segmentation.active', true);

// Update with complex value
stateManager.update('workspace.files', [
  { name: 'file1.tif', size: 1024 },
  { name: 'file2.tif', size: 2048 }
]);
```

**Behavior:**
1. Navigates to parent object via dot notation
2. Creates missing intermediate objects
3. Updates value
4. Emits two events:
   - `state:change` (global, all changes)
   - `state:change:${path}` (specific path)
5. Logs change to console

**Events Emitted:**
```javascript
{
  path: 'workspace.files',
  value: [ ... ],  // new value
  oldValue: [ ... ] // previous value
}
```

---

#### get(path)

Retrieve state value at a given path.

```javascript
// Get nested value
const files = stateManager.get('workspace.files');
// Returns: [ { name: 'file1.tif', ... }, ... ]

// Get top-level value
const workspace = stateManager.get('workspace');
// Returns: { sessionId: '...', initialized: true, ... }

// Get non-existent path
const invalid = stateManager.get('workspace.nonexistent');
// Returns: undefined
```

**Returns:** Value at path, or `undefined` if not found

---

#### subscribe(path, callback)

Subscribe to state changes at a specific path (includes child paths).

```javascript
// Subscribe to workspace.files and any child changes
const unsubscribe = stateManager.subscribe('workspace.files', (newValue, oldValue) => {
  console.log('Files changed:', newValue);
  updateFileListUI(newValue);
});

// Unsubscribe when done
unsubscribe();
```

**Behavior:**
- Triggers on exact path match OR child path changes
- Example: `subscribe('workspace')` triggers for `workspace.files`, `workspace.stats`, etc.

**Returns:** Unsubscribe function

---

#### subscribeExact(path, callback)

Subscribe to state changes at an exact path only (no children).

```javascript
// Subscribe only to workspace.initialized
const unsubscribe = stateManager.subscribeExact('workspace.initialized', ({ value, oldValue }) => {
  console.log('Workspace initialized:', value);
});

// Unsubscribe
unsubscribe();
```

**Behavior:**
- Only triggers for exact path changes
- More efficient than `subscribe()` if you don't need child changes

**Returns:** Unsubscribe function

---

#### notify(type, message, duration)

Add a notification to the UI notification system.

```javascript
// Success notification (auto-remove after 5 seconds)
stateManager.notify('success', 'File uploaded successfully', 5000);

// Error notification (auto-remove after 8 seconds)
stateManager.notify('error', 'Upload failed', 8000);

// Persistent notification (duration = 0)
stateManager.notify('info', 'Training in progress...', 0);

// Custom duration (3 seconds)
stateManager.notify('warning', 'Low disk space', 3000);
```

**Parameters:**
- `type`: 'success' | 'error' | 'info' | 'warning'
- `message`: Notification text
- `duration`: Milliseconds (0 = persistent)

**Behavior:**
1. Creates notification object with unique ID
2. Adds to `ui.notifications` array
3. Auto-removes after duration (if > 0)
4. Updates UI via state subscription

**Returns:** Notification ID (for manual removal)

---

#### removeNotification(notificationId)

Manually remove a notification.

```javascript
const notifId = stateManager.notify('info', 'Processing...', 0);

// Later...
stateManager.removeNotification(notifId);
```

---

#### getState()

Get a deep copy of the entire state tree.

```javascript
const stateCopy = stateManager.getState();
console.log(stateCopy);
```

**Returns:** Deep cloned state object (safe to mutate)

---

#### reset()

Reset state to initial values.

```javascript
stateManager.reset();
```

**Behavior:**
1. Resets all state to default values
2. Emits `state:reset` event with previous state
3. Logs to console

**Use Case:** Session reset, logout, cleanup

---

#### logState()

Log current state to console (for debugging).

```javascript
// In browser console:
workspace.state.logState();
```

**Output:** Pretty-printed state tree

---

### State Flow Patterns

#### Update → Emit → Subscribe → React

The standard reactive flow:

```
User Action (e.g., click "Upload File")
   │
   ▼
Event Handler
   │
   ▼
stateManager.update('workspace.files', newFiles)
   │
   ├─► Update internal state tree
   ├─► Emit: 'state:change' (global)
   └─► Emit: 'state:change:workspace.files' (specific)
         │
         ▼
   Subscribed Components
         │
         ├─► File Browser UI
         ├─► Stats Panel
         └─► Module UI
               │
               ▼
         Update DOM (re-render)
```

**Example:**
```javascript
// Component subscribes on initialization
stateManager.subscribe('workspace.files', (files) => {
  renderFileList(files);
});

// Later, user uploads file
async function handleFileUpload(file) {
  const response = await api.uploadFile(file);
  const updatedFiles = response.files;

  // Update state (triggers subscribers)
  stateManager.update('workspace.files', updatedFiles);

  // UI automatically updates via subscription
}
```

---

#### Module State Management

**Pattern:** Per-module state in `modules.*`

```javascript
// When module activates
stateManager.update('modules.segmentation.active', true);
stateManager.update('workspace.activeModule', 'segmentation');

// Module stores task state
stateManager.update('modules.segmentation.currentTask', {
  type: 'training',
  status: 'in_progress',
  trainingId: 'abc123'
});

// Add to history
const history = stateManager.get('modules.segmentation.history') || [];
history.push({
  timestamp: Date.now(),
  task: 'training',
  result: 'success'
});
stateManager.update('modules.segmentation.history', history);

// When module deactivates
stateManager.update('modules.segmentation.active', false);
stateManager.update('modules.segmentation.currentTask', null);
stateManager.update('workspace.activeModule', null);
```

---

#### Notification Flow

```
Error Occurs
   │
   ▼
stateManager.notify('error', 'Upload failed', 5000)
   │
   ├─► Create notification object
   ├─► Add to ui.notifications array
   ├─► Emit state change event
   │
   ▼
UI Subscriber (Notification Panel)
   │
   ├─► Render notification
   ├─► Set 5-second timer
   │
   ▼
Auto-remove after 5 seconds
   │
   └─► removeNotification(id)
         │
         └─► Update ui.notifications
               │
               └─► UI removes notification
```

---

### Event System (mitt)

StateManager uses [mitt](https://github.com/developit/mitt) for event emission.

**Why mitt?**
- Tiny (200 bytes)
- Simple API
- No dependencies
- Vanilla JS compatible

**Event Types:**

| Event | When Emitted | Payload |
|-------|-------------|---------|
| `state:change` | Any state update | `{ path, value, oldValue }` |
| `state:change:${path}` | Specific path update | `{ value, oldValue }` |
| `state:reset` | State reset | `{ previousState }` |

**Example:**
```javascript
// Global state change listener
stateManager.events.on('state:change', ({ path, value, oldValue }) => {
  console.log(`State changed: ${path}`, value);
});

// Specific path listener
stateManager.events.on('state:change:workspace.files', ({ value, oldValue }) => {
  console.log('Files changed:', value);
});

// Reset listener
stateManager.events.on('state:reset', ({ previousState }) => {
  console.log('State was reset. Previous state:', previousState);
});
```

---

## Backend State (Both Versions)

### Express Session Storage

**File:** `src/middleware/session.middleware.js` (uses `SESSION_CONFIG` from `src/config/constants.js`)
**Storage:** File-based (`session-file-store`, `./sessions/` under `DATA_DIR`)
**Lifetime:** 48 h (`RETENTION_HOURS`) - the session cookie/TTL and the workspace cleanup grace period both derive from the same constant

**Session Configuration:**
```javascript
// src/middleware/session.middleware.js
return session({
  store: new FileStore({ path: sessionsDir, ttl: SESSION_CONFIG.ttl, retries: 0, secret: env.SESSION_SECRET }),
  secret: env.SESSION_SECRET,      // required
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: isProduction,          // HTTPS in production
    httpOnly: true,
    sameSite: 'lax',
    maxAge: SESSION_CONFIG.cookieMaxAge   // 48 h
  }
});
```

The same middleware is shared with Socket.IO (`io.engine.use(sessionMiddleware)` in `server.js`), so socket handshakes carry the express session.

---

### Session Data Structure

```javascript
req.session = {
  // Added by express-session
  id: 'abc123...',           // Unique session ID
  cookie: { ... },            // Cookie settings

  // Added by authentication
  user: {
    username: 'john',
    fullName: 'John Doe',
    status: 'active',        // 'pending' | 'active' | 'rejected'
    isAdmin: false
  },

  // Added by upload endpoints
  uploadedFiles: {
    training: 'workspaces/abc123/uploads/training.tif',
    annotation: 'workspaces/abc123/uploads/annotation.tif',
    inference: 'workspaces/abc123/uploads/inference.tif'
  },

  // Added by training configuration
  trainingConfig: {
    patchSize: 128,
    learningRate: 0.001,
    epochs: 10,
    batchSize: 4,
    validationSplit: 0.2
  },

  // Added by training endpoint
  currentTraining: 'training_uuid_123',

  // Added by model import
  importedModel: {
    modelPath: 'workspaces/abc123/uploads/imported_models/model.pth',
    configPath: 'workspaces/abc123/uploads/imported_models/config.json',
    validated: true,
    validation: { ... }
  }
};
```

---

### In-Memory Maps (SessionTracker)

**File:** `src/services/SessionTracker.js`
**Purpose:** Track running/finished jobs and map every job ID to its owning session

`SessionTracker` holds dedicated maps for **training**, **inference**, **mesh** and **denoising** sessions, plus a **generic job registry** (`jobSessions`) covering preprocess, stitching, segcleanup, DL-inference and filter jobs. `getJobOwner(jobId)` resolves the owning session across all of these - used for Socket.IO room-join ownership checks and for job status/cancel/download endpoint authorization (other sessions' jobs return 404).

**Training Sessions:**
```javascript
sessionTracker.trainingSessions.set(trainingId, {
  id: trainingId,
  sessionId: req.session.id,
  status: 'running',         // 'running' | 'completed' | 'failed'
  startTime: Date.now(),
  config: { ... },
  progress: {
    epoch: 5,
    totalEpochs: 10,
    metrics: { ... }
  },
  result: null,              // Set on completion
  error: null                // Set on failure
});
```

**Inference Sessions:**
```javascript
sessionTracker.inferenceSessions.set(inferenceId, {
  id: inferenceId,
  sessionId: req.session.id,
  status: 'running',         // 'running' | 'completed' | 'failed'
  startTime: Date.now(),
  modelPath: 'workspaces/<sessionId>/models/segmentation/...',
  dataPath: 'workspaces/<sessionId>/uploads/...',
  outputPath: 'workspaces/<sessionId>/results/segmentation/...',
  progress: {
    currentSlice: 50,
    totalSlices: 100,
    progressPercent: 50
  },
  result: null,
  error: null
});
```

**Generic Job Registry:**
```javascript
// preprocess / stitching / segcleanup / DL-inference / filter jobs
sessionTracker.jobSessions.set(jobId, { sessionId, type, ... });
sessionTracker.getJobOwner(jobId);  // → owning sessionId (any map)
```

---

### State Persistence

**What Persists:**
- ✅ Session data (req.session) - via express-session (file store, survives restarts within the 48 h TTL)
- ✅ The workspace directory `workspaces/<sessionId>/` - uploads, models, results, annotations on disk
- ✅ `metadata.json` - the **sole persistent store** for the file registry, lineage and provenance (schema version 1.2.0). `loadMetadata()` runs `normalizeManifest()` on read, upgrading legacy manifests (categories to uploads/models/results, legacy lineage shapes to the canonical `{processType, processedAt, inputs[], processId}`)

**What Doesn't Persist (Lost on Server Restart):**
- ❌ All SessionTracker Maps (training/inference/mesh/denoising/jobSessions)
- ❌ Active WebSocket connections

**Implications:**
- Server restart clears in-flight jobs
- Sessions persist across restarts (file store) until their 48 h TTL
- Workspace files remain on disk until the cleanup service removes them (48 h after last activity) or the user deletes the workspace on logout

**Production Consideration:**
- Use Redis for session storage at scale
- Use Redis for SessionTracker Maps
- Orphan cleanup is handled by `CleanupService` (runs every 15 minutes, `RETENTION_HOURS` grace period)

---

## State Synchronization

### Real-Time Updates (Socket.IO)

**Pattern:** Server → Client via Socket.IO events

```
Backend                          Frontend
   │                                │
   │  Training in progress          │
   │  Python emits: PROGRESS:       │
   │                                │
   ├─ Parse progress JSON           │
   ├─ Update trainingSessions Map   │
   │                                │
   │  io.to(room).emit('training-progress', data)
   └────────────────────────────────►│
                                     │
                              Update StateManager
                              stateManager.update(
                                'modules.segmentation.progress',
                                data
                              )
                                     │
                                     ▼
                              UI Updates (subscriptions)
```

**Room joins are ownership-checked:** Socket.IO shares the express-session middleware (`io.engine.use(sessionMiddleware)` in `server.js`), and every join of a job room is verified against the job's owning session (`isRoomJoinAllowed` in `src/sockets/index.js` + `SessionTracker.getJobOwner()`). A client can only join rooms for jobs its own session started.

**Training Progress:**
```javascript
// Backend (src/helpers/pythonRunner.js + src/sockets/*)
pythonProcess.stdout.on('data', (data) => {
  const line = data.toString();
  if (line.startsWith('PROGRESS:')) {
    const progress = JSON.parse(line.substring(9));

    // Update in-memory map
    sessionTracker.trainingSessions.get(trainingId).progress = progress;

    // Broadcast to clients
    io.to(`training-${trainingId}`).emit('training-progress', progress);
  }
});

// Frontend (workspace)
socket.on('training-progress', (progress) => {
  // Update state
  stateManager.update('modules.segmentation.progress', progress);

  // UI reacts via subscription
});
```

See [Socket Protocol](../reference/SOCKET_PROTOCOL.md) for complete event documentation.

---

### API-Based Synchronization

**Pattern:** Client → Server via HTTP, Server → Client via response

```
Frontend                         Backend
   │                                │
   │  User uploads file             │
   │  POST /upload-data             │
   ├────────────────────────────────►│
   │                                │
   │                         Save file to disk
   │                         Update req.session
   │                         Validate TIFF
   │                                │
   │  { success: true, files: [...] }
   │◄────────────────────────────────┤
   │                                │
   ▼
Update StateManager
stateManager.update('workspace.files', files)
```

---

## State Consistency

### Session ID as Source of Truth

**All file paths are session-scoped inside the workspace:**
```
workspaces/<sessionId>/uploads/
workspaces/<sessionId>/models/segmentation/<trainingId>/
workspaces/<sessionId>/results/<module>/<jobId>/
```

**Why session-based (not user-based)?**
- Same user can have multiple concurrent sessions
- Clean separation for debugging
- Easy cleanup (retention cleanup or workspace deletion on logout)
- Security: Session ID harder to guess

See [ADR-003: Session-Based Isolation](../decisions/003_session_based_isolation.md).

---

### Debugging State Issues

**Frontend (Workspace):**
```javascript
// In browser console
workspace.state.logState();
workspace.state.get('workspace');
workspace.state.get('modules.segmentation');
```

**Backend:**
```javascript
// In route handler
console.log('Session ID:', req.session.id);
console.log('Session data:', req.session);
console.log('Uploaded files:', req.session.uploadedFiles);

// Check training session
const training = sessionTracker.trainingSessions.get(trainingId);
console.log('Training session:', training);
```

**Common Issues:**
1. **Session lost** - Check cookie, session timeout (48 h)
2. **Files not found** - Verify session ID matches the workspace directory; check `metadata.json`
3. **State not updating** - Check event subscriptions
4. **Workspace gone** - Retention cleanup (48 h after last activity) or workspace deleted on logout

See [Troubleshooting Guide](../guides/TROUBLESHOOTING.md).

---

## Best Practices

### Frontend State (Workspace)

**Do:**
- ✅ Use StateManager for all global state
- ✅ Subscribe to state changes (reactive)
- ✅ Update state via `update()` method only
- ✅ Use dot notation for nested paths
- ✅ Unsubscribe when component unmounts
- ✅ Use `notify()` for user feedback

**Don't:**
- ❌ Mutate state directly (`this.state.workspace.files = ...`)
- ❌ Store large data in state (use server storage)
- ❌ Forget to unsubscribe (memory leaks)
- ❌ Use state for temporary UI state (use local variables)

**Example:**
```javascript
// ✅ Good
class MyModule {
  constructor(stateManager) {
    this.state = stateManager;
    this.unsubscribers = [];
  }

  activate() {
    // Subscribe to state
    const unsub = this.state.subscribe('workspace.files', (files) => {
      this.renderFiles(files);
    });
    this.unsubscribers.push(unsub);
  }

  deactivate() {
    // Unsubscribe
    this.unsubscribers.forEach(unsub => unsub());
    this.unsubscribers = [];
  }

  handleUpload(file) {
    // Update state (reactive)
    const files = this.state.get('workspace.files') || [];
    this.state.update('workspace.files', [...files, file]);
  }
}

// ❌ Bad
class BadModule {
  activate() {
    // Direct mutation (won't trigger events)
    this.state.state.workspace.files.push(newFile);

    // Forgot to unsubscribe (memory leak)
    this.state.subscribe('workspace.files', (files) => {
      this.renderFiles(files);
    });
  }

  deactivate() {
    // No cleanup!
  }
}
```

---

### Backend State

**Do:**
- ✅ Use req.session for user-specific data
- ✅ Use Maps for temporary process data
- ✅ Validate session exists before use
- ✅ Clean up Maps on completion/error
- ✅ Consider Redis for production

**Don't:**
- ❌ Store large files in session (use disk)
- ❌ Store sensitive data in session unencrypted
- ❌ Forget to clean up Maps (memory leaks)
- ❌ Rely on in-memory state in production

**Example:**
```javascript
// ✅ Good
app.post('/start-training', requireAuth, async (req, res) => {
  // Validate session
  if (!req.session.uploadedFiles) {
    return res.status(400).json({ error: 'No files uploaded' });
  }

  const trainingId = uuidv4();

  // Store in Map
  trainingSessions.set(trainingId, {
    id: trainingId,
    sessionId: req.session.id,
    status: 'running',
    startTime: Date.now()
  });

  // Clean up on completion
  pythonProcess.on('exit', (code) => {
    if (code === 0) {
      trainingSessions.get(trainingId).status = 'completed';
    } else {
      trainingSessions.get(trainingId).status = 'failed';
    }

    // Could delete after some time
    setTimeout(() => {
      trainingSessions.delete(trainingId);
    }, 60000); // Keep for 1 minute
  });
});

// ❌ Bad
app.post('/bad-endpoint', (req, res) => {
  // No session check!
  const files = req.session.uploadedFiles; // Could be undefined

  // Store in Map but never clean up
  trainingSessions.set(trainingId, { ... });

  // No cleanup on error!
});
```

---

## Common Patterns

### Pattern 1: Loading Data into State

```javascript
async function loadWorkspaceData() {
  try {
    // Show loading
    stateManager.update('ui.loading', true);

    // Fetch from backend
    const response = await api.getWorkspaceStatus();

    // Update state
    stateManager.update('workspace.sessionId', response.sessionId);
    stateManager.update('workspace.files', response.files);
    stateManager.update('workspace.stats', response.stats);
    stateManager.update('workspace.initialized', true);

    // Hide loading
    stateManager.update('ui.loading', false);

    // Notify success
    stateManager.notify('success', 'Workspace loaded', 3000);
  } catch (error) {
    stateManager.update('ui.loading', false);
    stateManager.notify('error', 'Failed to load workspace', 5000);
  }
}
```

---

### Pattern 2: Module State Lifecycle

```javascript
class SegmentationModule {
  constructor(stateManager) {
    this.state = stateManager;
    this.unsubscribers = [];
  }

  async activate() {
    // Set module active
    this.state.update('modules.segmentation.active', true);
    this.state.update('workspace.activeModule', 'segmentation');

    // Subscribe to relevant state
    const unsub1 = this.state.subscribe('workspace.files', (files) => {
      this.updateFileSelector(files);
    });

    const unsub2 = this.state.subscribe('modules.segmentation.progress', (progress) => {
      this.updateProgressBar(progress);
    });

    this.unsubscribers.push(unsub1, unsub2);

    // Render UI
    this.render();
  }

  async deactivate() {
    // Unsubscribe all
    this.unsubscribers.forEach(unsub => unsub());
    this.unsubscribers = [];

    // Clear module state
    this.state.update('modules.segmentation.active', false);
    this.state.update('modules.segmentation.currentTask', null);
    this.state.update('workspace.activeModule', null);

    // Clear UI
    this.container.innerHTML = '';
  }
}
```

---

### Pattern 3: Optimistic Updates

```javascript
async function deleteFile(filename) {
  // Get current files
  const currentFiles = stateManager.get('workspace.files');

  // Optimistic update (assume success)
  const optimisticFiles = currentFiles.filter(f => f.name !== filename);
  stateManager.update('workspace.files', optimisticFiles);

  try {
    // Delete on server
    await api.deleteFile(filename);

    // Success notification
    stateManager.notify('success', 'File deleted', 3000);
  } catch (error) {
    // Revert on error
    stateManager.update('workspace.files', currentFiles);
    stateManager.notify('error', 'Failed to delete file', 5000);
  }
}
```

---

## Diagrams

### State Flow Diagram

```
User Action
   │
   ▼
Event Handler
   │
   ▼
StateManager.update()
   │
   ├─► Update State Tree
   ├─► Emit Events
   │     │
   │     ├─► state:change (global)
   │     └─► state:change:path (specific)
   │
   ▼
Subscribers
   │
   ├─► UI Component 1 (re-render)
   ├─► UI Component 2 (re-render)
   └─► Module (update)
```

---

### Session State Lifecycle

```
User Logs In
   │
   ▼
Express Creates Session
   │
   ├─► Generate session ID
   ├─► Set cookie
   └─► req.session created
   │
   ▼
User Uploads Files
   │
   ├─► Save to workspaces/<sessionId>/uploads/
   ├─► Register in workspaces/<sessionId>/metadata.json
   └─► Update req.session.uploadedFiles
   │
   ▼
User Trains Model
   │
   ├─► Create training entry in SessionTracker Map
   ├─► Spawn Python process
   └─► Update req.session.currentTraining
   │
   ▼
User Runs Inference
   │
   ├─► Create inference entry in SessionTracker Map
   ├─► Spawn Python process
   └─► Generate result files (results/segmentation/<id>/)
   │
   ▼
User Logs Out (there is no /reset-session; logout + login is the reset)
   │
   ├─► Optional: delete workspaces/<sessionId>/ (confirmation dialog)
   ├─► Clear in-memory SessionTracker entries
   └─► Session destroyed
   │
   ▼
Session Expires (48 h after last activity)
   │
   ├─► Session file removed (TTL)
   └─► CleanupService deletes workspaces/<sessionId>/ on the same schedule
```

---

## Related Documentation

### Architecture

- [Architecture Overview](OVERVIEW.md) - System-wide architecture
- [Module Architecture](MODULE_ARCHITECTURE.md) - Module system design

### Reference

- [State Management Reference](../reference/STATE_MANAGEMENT.md) - Complete StateManager API
- [Socket Protocol](../reference/SOCKET_PROTOCOL.md) - Real-time events
- [API Endpoints](../reference/API_ENDPOINTS.md) - Backend endpoints

### Decisions

- [ADR-003](../decisions/003_session_based_isolation.md) - Session-based isolation rationale

### Guides

- [Troubleshooting](../guides/TROUBLESHOOTING.md) - Common issues

---

**Navigation:**
← [Architecture Overview](OVERVIEW.md) | [Architecture Docs](.) | [Module Architecture](MODULE_ARCHITECTURE.md) →

---

**Document Status:** ✅ Complete
**Last Updated:** 2026-09-07 (v1.5.0)
**Maintained By:** Development Team
