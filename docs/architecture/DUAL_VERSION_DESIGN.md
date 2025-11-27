# Dual Version Architecture

**Last Updated:** 2025-11-27
**Status:** ✅ Complete
**Target Audience:** Developers, architects

---

## Introduction

The Biomedical Image Processing Workspace exists in **two parallel versions** that serve different use cases while sharing the same backend infrastructure. This document explains why this architecture was chosen, how the versions differ, what they share, and how to work with each.

### Document Purpose

- Explain the rationale for dual versions
- Compare Classic vs Workspace architectures
- Document shared components
- Provide development workflows for each version
- Outline future migration strategy

### Target Audience

- **Developers** - Understand which version to work on
- **Architects** - Evaluate design decisions
- **New contributors** - Learn the system structure
- **Product managers** - Understand feature parity

### Related Documentation

- [Architecture Overview](OVERVIEW.md) - System-wide architecture
- [Module Architecture](MODULE_ARCHITECTURE.md) - Workspace module system
- [ADR-002](../decisions/002_dual_version_approach.md) - Decision rationale
- [File Structure](../reference/FILE_STRUCTURE.md) - Codebase organization

---

## Executive Summary

**Why Two Versions?**

The dual-version approach was chosen to enable **incremental innovation** without breaking a **stable, working application**.

**Classic Version:**
- Linear, step-by-step workflow
- Single-page application
- Complete and stable
- Best for: Simple segmentation tasks

**Workspace Version:**
- Modular, IDE-like interface
- Module system with dynamic loading
- In active development (Phase 2 complete)
- Best for: Complex multi-module workflows

**Shared:**
- Same backend (Express server)
- Same ML pipeline (Python scripts)
- Same authentication system
- Same file storage structure

See [ADR-002: Dual Version Approach](../decisions/002_dual_version_approach.md) for detailed decision rationale.

---

## Classic Version (v1)

### Overview

The **Classic Version** is the original biomedical image segmentation application with a linear workflow for training U-Net models and running inference.

**Status:** ✅ **Stable, fully functional**
**Route:** `/classic`
**Location:** `/public/classic/`
**Development Start:** Phase 1
**Current State:** Complete, maintenance mode

### Architecture

**Application Type:** Single-page application (SPA)
**UI Pattern:** Linear, step-by-step workflow
**State Management:** Local variables and DOM state
**Module System:** Monolithic (no modules)

```
┌────────────────────────────────────────────────┐
│           Classic Version Architecture          │
├────────────────────────────────────────────────┤
│                                                 │
│  index.html (Single Page)                      │
│     │                                           │
│     ├─ app.js (Main Controller)                │
│     ├─ socket.js (WebSocket Connection)        │
│     ├─ training.js (Training UI)               │
│     ├─ inference.js (Inference UI)             │
│     ├─ visualization.js (Three.js Viewer)      │
│     └─ utils.js (Helpers)                      │
│                                                 │
│  Direct API calls (fetch)                      │
│     │                                           │
│     ▼                                           │
│  Backend API Endpoints                         │
│                                                 │
└────────────────────────────────────────────────┘
```

### File Structure

```
/public/classic/
├── index.html                 # Main page (all UI in one file)
├── /js/
│   ├── app.js                # Main application controller (~800 lines)
│   │                         # - Initializes all components
│   │                         # - Handles navigation between steps
│   │                         # - Manages global state
│   ├── socket.js             # Socket.IO connection manager
│   │                         # - Establishes connection
│   │                         # - Handles training/inference events
│   ├── training.js           # Training UI and logic
│   │                         # - Upload training data
│   │                         # - Configure parameters
│   │                         # - Display progress charts
│   ├── inference.js          # Inference UI and logic
│   │                         # - Upload inference data
│   │                         # - Run inference
│   │                         # - Display results
│   ├── visualization.js      # Three.js 3D visualization
│   │                         # - Render point clouds
│   │                         # - Interactive controls
│   │                         # - Class filtering
│   └── utils.js              # Utility functions
│                             # - File handling
│                             # - Validation
│                             # - Formatting
└── /css/
    └── styles.css            # Classic UI styling
```

### User Workflow

**Linear 5-Step Process:**

```
Step 1: Upload Training Data
   ↓
Step 2: Configure Training Parameters
   ↓
Step 3: Train Model (real-time progress)
   ↓
Step 4: Upload Inference Data
   ↓
Step 5: Run Inference & Visualize Results
```

**Navigation:**
- Step-by-step progression
- Can go back to previous steps
- Each step shows/hides relevant UI sections
- Progress indicator shows current step

### Features

**Complete Feature Set:**
- ✅ Upload training images and annotations (TIFF)
- ✅ Use test data (for pending users)
- ✅ Configure training (patch size, learning rate, epochs, etc.)
- ✅ Train U-Net model with real-time progress
- ✅ View training charts (loss, accuracy per epoch)
- ✅ Upload inference images
- ✅ Import pretrained models (.pth + .json)
- ✅ Run inference with progress tracking
- ✅ Download segmentation results (TIFF)
- ✅ 3D visualization of results (Three.js)
- ✅ Class filtering in visualization
- ✅ Original data overlay
- ✅ Session reset

### State Management

**Pattern:** Local state + DOM state
**No centralized state management**

```javascript
// State stored in local variables
let uploadedFiles = null;
let trainingConfig = null;
let currentTraining = null;
let inferenceResult = null;

// DOM state
document.getElementById('step1-panel').style.display = 'block';
document.getElementById('progress-bar').value = 50;
```

**Advantages:**
- Simple, straightforward
- No framework overhead
- Easy to understand

**Disadvantages:**
- State scattered across files
- No reactive updates
- Manual DOM manipulation

### API Integration

**Pattern:** Direct fetch calls

```javascript
// Example: Upload training data
async function uploadTrainingData(formData) {
  const response = await fetch('/upload-data', {
    method: 'POST',
    body: formData
  });
  const result = await response.json();
  return result;
}
```

**Socket.IO:**
```javascript
// Join training room
socket.emit('join-training', trainingId);

// Listen for progress
socket.on('training-progress', (progress) => {
  updateProgressUI(progress);
});
```

### Strengths

- ✅ **Stable** - Fully tested and working
- ✅ **Simple** - Easy to understand and maintain
- ✅ **Complete** - All features implemented
- ✅ **Fast** - No framework overhead
- ✅ **Proven** - Used successfully by users

### Limitations

- ❌ **Monolithic** - All code in single namespace
- ❌ **No modularity** - Can't easily add new features
- ❌ **Linear workflow** - Can't handle complex pipelines
- ❌ **State management** - Manual, error-prone
- ❌ **Scalability** - Hard to extend with new modules

### Future Status

**Maintenance Mode:**
- Bug fixes only
- No new features
- Will remain available indefinitely
- Users can choose classic for simple workflows

**Eventual Deprecation:**
- Once Workspace version reaches feature parity
- Migration path will be provided
- Timeline: TBD (not before Phase 4+)

---

## Workspace Version (v2)

### Overview

The **Workspace Version** is the new modular interface designed for complex multi-module workflows with an IDE-like experience.

**Status:** 🚧 **Phase 2 Complete, Segmentation Module In Progress**
**Route:** `/workspace`
**Location:** `/public/workspace/`
**Development Start:** Phase 2
**Current State:** Foundation complete, first module being integrated

### Architecture

**Application Type:** Modular workspace with dynamic module loading
**UI Pattern:** Module-based, non-linear workflow
**State Management:** Centralized with event-driven updates (StateManager + mitt)
**Module System:** Dynamic ES6 imports with lifecycle management

```
┌────────────────────────────────────────────────────────────┐
│           Workspace Version Architecture                   │
├────────────────────────────────────────────────────────────┤
│                                                             │
│  index.html (Shell)                                        │
│     │                                                       │
│     └─ workspace.js (Main Controller)                      │
│           │                                                 │
│           ├─ StateManager (Centralized State)              │
│           │    └─ mitt (Event Emitter)                     │
│           │                                                 │
│           ├─ ModuleLoader (Dynamic Loading)                │
│           │    └─ Registry (Module Definitions)            │
│           │                                                 │
│           └─ WorkspaceAPI (Unified API Client)             │
│                                                             │
│  Dynamically Loaded Modules:                               │
│     │                                                       │
│     ├─ SegmentationModule                                  │
│     ├─ DenoisingModule (future)                            │
│     ├─ AnnotationModule (future)                           │
│     └─ ... (extensible)                                    │
│                                                             │
└────────────────────────────────────────────────────────────┘
```

### File Structure

```
/public/workspace/
├── index.html                      # Workspace shell (minimal HTML)
├── /js/
│   ├── workspace.js                # Main workspace controller
│   │                               # - Initialize core systems
│   │                               # - Set up UI
│   │                               # - Register modules
│   │
│   ├── /core/                      # Core workspace systems
│   │   ├── StateManager.js         # Centralized state with events
│   │   │                           # - State tree management
│   │   │                           # - Event emission (mitt)
│   │   │                           # - Reactive subscriptions
│   │   │
│   │   ├── ModuleLoader.js         # Dynamic module loading
│   │   │                           # - Module registration
│   │   │                           # - Lifecycle management
│   │   │                           # - activate/deactivate
│   │   │
│   │   └── WorkspaceAPI.js         # Backend API client
│   │                               # - Unified API methods
│   │                               # - Error handling
│   │                               # - Category-based organization
│   │
│   └── /modules/                   # Processing modules
│       ├── registry.js             # Module definitions
│       │                           # - Module metadata
│       │                           # - Inputs/outputs
│       │                           # - Status (available/coming_soon)
│       │
│       └── segmentation/           # Segmentation module
│           └── SegmentationModule.js
│
└── /css/
    └── workspace.css               # Workspace-specific styling
```

### User Workflow

**Non-Linear, Module-Based:**

```
Welcome Hub (Module Cards)
   │
   ├─► Launch Segmentation Module
   │      │
   │      ├─ Upload data
   │      ├─ Train model
   │      ├─ Run inference
   │      └─ Back to hub
   │
   ├─► Launch Denoising Module (future)
   │      │
   │      └─ Process images → Output
   │
   ├─► Launch Annotation Module (future)
   │      │
   │      └─ Annotate images → Output
   │
   └─► Module Chaining (future)
          └─ Denoise → Segment → Mesh
```

**Navigation:**
- Hub-centric (always can return to hub)
- Module-specific workflows
- Module switching
- Pipeline chaining (future)

### Features

**Phase 2 Complete:**
- ✅ Workspace initialization
- ✅ StateManager with event-driven updates
- ✅ ModuleLoader with dynamic imports
- ✅ Module registry system
- ✅ Welcome hub with module cards
- ✅ Module activation/deactivation lifecycle
- ✅ WorkspaceAPI client
- ✅ Sidebar (stats, file browser placeholder)

**In Progress (Phase 2+):**
- 🚧 Segmentation module (wrapping classic functionality)
- 🚧 Socket.IO integration in module context
- 🚧 Full training/inference workflow in workspace

**Planned (Phase 3+):**
- 📅 File browser (full workspace file management)
- 📅 Denoising module
- 📅 Annotation module
- 📅 Mesh generation module
- 📅 Advanced visualization module
- 📅 Module pipeline chaining

### Core Systems

#### StateManager

**Centralized state management with reactive updates**

```javascript
import mitt from 'mitt';

class StateManager {
  constructor() {
    this.state = {
      workspace: { ... },
      modules: { ... },
      ui: { ... },
      user: { ... }
    };
    this.events = mitt();
  }

  update(path, value) {
    // Update nested state
    // Emit events
  }

  subscribe(path, callback) {
    // Subscribe to state changes
  }
}
```

See [State Architecture](STATE_ARCHITECTURE.md) for details.

---

#### ModuleLoader

**Dynamic module loading and lifecycle management**

```javascript
class ModuleLoader {
  register(moduleConfig) {
    // Register module from registry
  }

  async load(moduleId) {
    // Dynamic import
    const ModuleClass = await import(modulePath);
    // Instantiate
    const module = new ModuleClass(stateManager);
    // Activate
    await module.activate();
  }

  deactivate() {
    // Clean up current module
  }
}
```

See [Module Architecture](MODULE_ARCHITECTURE.md) for details.

---

#### WorkspaceAPI

**Unified API client**

```javascript
class WorkspaceAPI {
  // Workspace
  async initializeWorkspace() { ... }
  async getWorkspaceStatus() { ... }

  // Files
  async uploadFile(formData) { ... }
  async deleteFile(filename) { ... }

  // Segmentation
  async uploadTrainingData(formData) { ... }
  async startTraining(config) { ... }
  async runInference(data) { ... }
}
```

### State Management

**Pattern:** Centralized state tree with reactive updates

```javascript
// Update state
stateManager.update('workspace.files', newFiles);

// Subscribe to changes (reactive)
stateManager.subscribe('workspace.files', (files) => {
  // UI automatically updates
  renderFileList(files);
});

// Notifications
stateManager.notify('success', 'File uploaded', 5000);
```

**State Tree:**
```javascript
{
  workspace: {
    sessionId: '...',
    initialized: true,
    files: [...],
    stats: { fileCount, totalSize }
  },
  modules: {
    segmentation: {
      active: false,
      currentTask: null,
      history: []
    }
  },
  ui: {
    sidebarCollapsed: false,
    currentView: 'welcome',
    notifications: []
  },
  user: {
    username: 'john',
    fullName: 'John Doe',
    status: 'active',
    isAdmin: false
  }
}
```

**Advantages:**
- ✅ Single source of truth
- ✅ Reactive updates
- ✅ Event-driven
- ✅ Debuggable (`workspace.state.logState()`)
- ✅ Module isolation

See [State Architecture](STATE_ARCHITECTURE.md) for patterns.

### Module System

**Pattern:** Dynamic ES6 imports with lifecycle

**Module Interface Contract:**
```javascript
class MyModule {
  constructor(stateManager) {
    this.state = stateManager;
  }

  async activate() {
    // Render UI
    // Attach listeners
    // Subscribe to state
  }

  async deactivate() {
    // Clean up listeners
    // Clear UI
    // Unsubscribe
  }

  cleanup() {
    // Optional: release resources
  }
}
```

**Lifecycle:**
```
Registered → Loaded → Active → Deactivated
   (registry) (import) (render) (cleanup)
```

**Advantages:**
- ✅ Lazy loading (only load when needed)
- ✅ Isolated modules
- ✅ Easy to add new modules
- ✅ Shared state via injection
- ✅ Clean lifecycle

See [Module Architecture](MODULE_ARCHITECTURE.md) and [ADR-004](../decisions/004_module_system_design.md).

### Strengths

- ✅ **Modular** - Easy to add new features as modules
- ✅ **Scalable** - Module system designed for growth
- ✅ **Maintainable** - Clear separation of concerns
- ✅ **State management** - Centralized, reactive
- ✅ **Future-proof** - Designed for complex workflows

### Current Limitations

- ⚠️ **In development** - Not all features complete
- ⚠️ **File upload category issue** - Missing metadata (Phase 3 fix)
- ⚠️ **Segmentation module** - Integration in progress
- ⚠️ **Limited modules** - Only segmentation so far

### Future Roadmap

**Phase 3:**
- File browser with full management
- Complete segmentation module integration
- Fix file upload category metadata

**Phase 4+:**
- Additional modules (denoising, annotation, mesh)
- Module pipeline chaining
- Advanced features (undo/redo, project saving)

See [Roadmap](../vision/ROADMAP.md) for details.

---

## Shared Components

### Backend (server.js)

**Shared by both versions:**
- Same Express server
- Same 29 API endpoints
- Same authentication system
- Same session management

**Version-Specific Routes:**
```javascript
// Classic version
app.get('/classic', requireAuth, (req, res) => {
  res.sendFile('public/classic/index.html');
});

// Workspace version
app.get('/workspace', requireAuth, (req, res) => {
  res.sendFile('public/workspace/index.html');
});

// Workspace-specific API
app.get('/api/workspace/status', requireAuth, ...);
```

**Shared API:**
- `/upload-data` - Both versions use
- `/start-training` - Both versions use
- `/run-inference` - Both versions use
- Most endpoints are version-agnostic

### Python ML Pipeline

**Completely shared:**
- `validate_tiff.py`
- `validate_imported_model.py`
- `train_model.py`
- `run_inference.py`

**Both versions:**
- Use same Python scripts
- Same stdout protocol
- Same input/output format
- Same model architecture (U-Net)

**Backward Compatibility:**
- Python scripts MUST NOT break classic version
- Any changes must work for both
- Test both versions after Python changes

### File Storage

**Shared directory structure:**
```
uploads/<sessionId>/
models/<sessionId>/<trainingId>/
results/<inferenceId>/
test_data/
```

**Session-Based Isolation:**
- Same session ID for both versions
- User can switch versions mid-session
- Files accessible from both versions
- Models trained in classic can be used in workspace (and vice versa)

### Authentication

**Shared authentication system:**
- Same user database (`users.json`)
- Same session management
- Same three-tier middleware
- Same admin approval workflow

**User experience:**
- Login once, use both versions
- Same user permissions apply
- Session persists across version switches

---

## Development Workflow

### Working on Classic Version

**When to work on Classic:**
- Bug fixes
- Security patches
- Critical maintenance
- User-reported issues

**Files to Edit:**
```
/public/classic/
├── index.html
├── /js/
│   ├── app.js
│   ├── training.js
│   ├── inference.js
│   ├── visualization.js
│   └── ...
└── /css/
    └── styles.css
```

**Backend (if needed):**
```
server.js
  - Existing endpoints (non-workspace)
  - Shared functionality
```

**Python (if needed):**
```
/python/
  - ML scripts (shared)
  - Must test both versions!
```

**Testing:**
1. Start server: `npm run dev`
2. Navigate to: `http://localhost:3000/classic`
3. Test complete workflow:
   - Upload → Configure → Train → Inference → Visualize
4. Verify Socket.IO updates work
5. Check for console errors

**Deployment:**
- Classic version is stable
- Only deploy after thorough testing
- No breaking changes allowed

---

### Working on Workspace Version

**When to work on Workspace:**
- New features
- New modules
- Architecture improvements
- Phase 3+ work

**Files to Edit:**
```
/public/workspace/
├── index.html
├── /js/
│   ├── workspace.js
│   ├── /core/
│   │   ├── StateManager.js
│   │   ├── ModuleLoader.js
│   │   └── WorkspaceAPI.js
│   └── /modules/
│       ├── registry.js
│       └── yourmodule/
└── /css/
    └── workspace.css
```

**Backend (workspace-specific):**
```javascript
// Add workspace API routes
app.get('/api/workspace/...', requireAuth, (req, res) => {
  // Workspace-specific endpoint
});
```

**Testing:**
1. Start server: `npm run dev`
2. Navigate to: `http://localhost:3000/workspace`
3. Test workspace features:
   - Workspace initialization
   - Module loading
   - State management
4. Browser console:
   ```javascript
   workspace.state.logState()
   workspace.moduleLoader.getAllModules()
   ```

**Adding a New Module:**
1. Create module directory: `/workspace/js/modules/yourmodule/`
2. Create module class: `YourModule.js`
3. Register in `registry.js`
4. Add backend endpoints if needed
5. Test module activation/deactivation

See [Module Creation Guide](../guides/MODULE_CREATION.md) (Phase 3).

---

### Shared Backend/Python Work

**When changing shared code:**
- ⚠️ MUST test both Classic AND Workspace versions
- ⚠️ Cannot break backward compatibility
- ⚠️ Must work for both UIs

**Process:**
1. Make changes to `server.js` or Python scripts
2. Test Classic version thoroughly
3. Test Workspace version thoroughly
4. Verify both versions still work
5. Only deploy if both pass

**Critical shared components:**
- Authentication middleware
- File upload handling
- Python process spawning
- Socket.IO event handling
- Session management

---

## Version Comparison Matrix

| Feature | Classic | Workspace | Notes |
|---------|---------|-----------|-------|
| **UI Pattern** | Linear, step-by-step | Modular, hub-centric | |
| **State Management** | Local variables + DOM | StateManager + mitt | |
| **Modularity** | Monolithic | Module system | |
| **Extensibility** | Hard to extend | Easy to add modules | |
| **Code Organization** | Single namespace | Core + Modules | |
| **Dynamic Loading** | All upfront | Lazy module loading | |
| **File Structure** | Flat (~5 files) | Hierarchical (~10+ files) | |
| **Learning Curve** | Easy | Medium | |
| **Maintenance** | Simple | More complex | |
| **Future Features** | Limited | Unlimited | |
| **Segmentation** | ✅ Complete | 🚧 In progress | |
| **Denoising** | ❌ Not available | 📅 Phase 4 | |
| **Annotation** | ❌ Not available | 📅 Phase 4 | |
| **Mesh Generation** | ❌ Not available | 📅 Phase 4 | |
| **Module Chaining** | ❌ Not possible | 📅 Phase 4+ | |
| **3D Visualization** | ✅ Three.js | ✅ Same (reusable) | |
| **Backend API** | Same endpoints | Same + workspace-specific | |
| **Python ML** | Shared scripts | Shared scripts | |
| **Authentication** | Shared system | Shared system | |
| **File Storage** | Shared structure | Shared structure | |
| **Session** | Shared session | Shared session | |
| **Test Data** | ✅ Available | ✅ Available | |
| **Custom Uploads** | ✅ Working | 🚧 Needs category fix | Phase 3 |
| **Status** | ✅ Stable | 🚧 In development | |
| **User Base** | Active users | Testing phase | |

---

## Migration Strategy

### Current Approach (Phase 2-3)

**Coexistence:**
- Both versions available
- Users can choose
- No forced migration
- Classic remains stable

**Development Focus:**
- Classic: Maintenance mode only
- Workspace: Active development

### Future Migration (Phase 4+)

**Once Workspace reaches feature parity:**

1. **Announcement Period** (3+ months)
   - Notify users of deprecation timeline
   - Provide migration guide
   - Offer training/support

2. **Dual Period** (6+ months)
   - Both versions available
   - Encourage workspace adoption
   - Monitor usage analytics

3. **Deprecation** (TBD)
   - Classic version marked deprecated
   - Redirect to workspace by default
   - Classic available as fallback

4. **Eventual Removal** (TBD)
   - Only if workspace fully mature
   - Full user migration complete
   - Archive classic codebase

**Migration Requirements:**
- ✅ Feature parity (all classic features in workspace)
- ✅ Performance parity (workspace as fast as classic)
- ✅ User testing (positive feedback on workspace)
- ✅ Documentation complete (guides, tutorials)
- ✅ No critical bugs in workspace

**Timeline:** Not before Phase 5+ (12+ months from now)

---

## Design Rationale

### Why Dual Version?

See [ADR-002: Dual Version Approach](../decisions/002_dual_version_approach.md) for complete decision rationale.

**Key Reasons:**

1. **Zero Risk to Classic**
   - Classic remains untouched
   - No regression risk
   - Users can continue working

2. **Incremental Innovation**
   - Develop workspace at own pace
   - No pressure to rush
   - Can experiment freely

3. **User Choice**
   - Power users prefer workspace
   - Simple users prefer classic
   - Everyone has option

4. **Code Reuse**
   - Share backend, Python, auth
   - Don't duplicate everything
   - Leverage existing investment

5. **Learning Opportunity**
   - Understand what works
   - Iterate on design
   - Gather user feedback

**Alternatives Considered:**

**Option 1: Full Migration (Deprecate Classic)**
- ❌ High risk of breaking changes
- ❌ Rushed development
- ❌ User disruption
- ❌ No fallback option

**Option 2: Feature Flags (Single Codebase)**
- ❌ Code complexity
- ❌ Hard to maintain
- ❌ Testing nightmare
- ❌ Coupled development

**Option 3: Dual Version (Chosen)**
- ✅ Zero risk
- ✅ Clear separation
- ✅ User choice
- ✅ Code reuse
- ⚠️ Dual maintenance (acceptable trade-off)

---

## Known Issues and Limitations

### Classic Version

**Issues:**
- None currently (stable)

**Limitations:**
- Cannot add new module types
- Linear workflow only
- Manual state management
- Monolithic architecture

**Status:** Maintenance mode, no new features

---

### Workspace Version

**Current Issues:**

1. **File Upload Category Mismatch** (Phase 2)
   - Uploaded files don't appear in module dropdown
   - Missing `category` property in metadata
   - Workaround: Use test data
   - Fix planned: Phase 3

2. **Segmentation Module Incomplete**
   - Integration in progress
   - Some features not yet ported
   - Socket.IO connection needs testing
   - Completion planned: Phase 2+

**Limitations:**
- Only one module available (segmentation)
- No file browser yet (Phase 3)
- No module chaining (Phase 4+)
- In-memory session storage (not production-ready)

See [Troubleshooting Guide](../guides/TROUBLESHOOTING.md).

---

## Best Practices

### For Developers

**General:**
- Always test both versions when changing shared code
- Never break classic version
- Keep backward compatibility
- Document breaking changes

**Classic Development:**
- Only bug fixes and security patches
- Keep simple, don't add complexity
- Maintain existing patterns

**Workspace Development:**
- Follow module system patterns
- Use StateManager for all state
- Subscribe to state changes (reactive)
- Clean up on deactivation
- Test module isolation

**Shared Code:**
- Maintain Python stdout protocol
- Don't change API contracts
- Version API changes if needed
- Test with both UIs

---

## Future Considerations

### Short-Term (Phase 3)

- Complete segmentation module integration
- Fix file upload category issue
- Add file browser to workspace
- Improve workspace UX

### Medium-Term (Phase 4)

- Add denoising module
- Add annotation module
- Add mesh generation module
- Module pipeline chaining

### Long-Term (Phase 5+)

- Evaluate classic deprecation
- Consider framework adoption (if needed)
- Advanced workspace features
- Collaboration features

See [Roadmap](../vision/ROADMAP.md) for details.

---

## Related Documentation

### Architecture

- [Architecture Overview](OVERVIEW.md)
- [State Architecture](STATE_ARCHITECTURE.md)
- [Module Architecture](MODULE_ARCHITECTURE.md)
- [Authentication](AUTHENTICATION.md)

### Decisions

- [ADR-001: Vanilla JS Over Framework](../decisions/001_vanilla_js_over_framework.md)
- [ADR-002: Dual Version Approach](../decisions/002_dual_version_approach.md)
- [ADR-004: Module System Design](../decisions/004_module_system_design.md)

### Reference

- [File Structure](../reference/FILE_STRUCTURE.md)
- [API Endpoints](../reference/API_ENDPOINTS.md)
- [Module System Reference](../reference/MODULE_SYSTEM.md)
- [State Management Reference](../reference/STATE_MANAGEMENT.md)

### Guides

- [Getting Started](../guides/GETTING_STARTED.md)
- [Troubleshooting](../guides/TROUBLESHOOTING.md)
- Module Creation Guide (Phase 3)

---

**Navigation:**
← [Architecture Overview](OVERVIEW.md) | [Architecture Docs](.) | [State Architecture](STATE_ARCHITECTURE.md) →

---

**Document Status:** ✅ Complete
**Last Updated:** 2025-11-27
**Maintained By:** Development Team
