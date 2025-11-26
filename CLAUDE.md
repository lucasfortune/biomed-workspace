# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **biomedical image segmentation web application** that provides a complete ML pipeline for training U-Net models and running inference on TIFF image stacks, with real-time 3D visualization using Three.js.

**The application now exists in TWO versions:**
1. **Classic Version** (`/public/classic/`) - Original linear workflow (stable, fully functional)
2. **Workspace Version** (`/public/workspace/`) - New modular IDE-like interface (in development, Phase 1 complete)

**Tech Stack:**
- Backend: Node.js/Express with Socket.IO for real-time updates
- Frontend: Vanilla JavaScript with Three.js for 3D visualization
- ML Pipeline: Python with PyTorch for U-Net training and inference
- Authentication: Session-based with bcrypt, supports admin approval workflow
- State Management: mitt (event emitter) for workspace version
- UI Libraries: Split.js for resizable panels

## Development Commands

### Starting the Application

```bash
# Development mode with auto-reload
npm run dev

# Production mode
npm start

# Custom port
PORT=3001 npm start
```

### Python Environment Setup

```bash
# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

### User Management (CLI)

```bash
# Create first admin user
node manageUsers.js add-admin <username> <password> <fullName> <email> <institution>

# List all users
node manageUsers.js list

# List pending users
node manageUsers.js list-pending

# Approve a user
node manageUsers.js approve <username>

# Reject a user
node manageUsers.js reject <username>

# Reset password
node manageUsers.js reset-password <username> <newPassword>
```

## Architecture

### Application Structure (Dual Version)

The application has been restructured to support **two parallel interfaces**:

```
/viz_app/
├── /public/
│   ├── /classic/              # ORIGINAL APP (stable, complete)
│   │   ├── index.html         # Classic segmentation pipeline
│   │   ├── /js/               # app.js, training.js, inference.js, etc.
│   │   └── /css/              # Classic styling
│   │
│   ├── /workspace/            # NEW MODULAR APP (Phase 1 complete)
│   │   ├── index.html         # Workspace interface
│   │   ├── /js/
│   │   │   ├── /core/         # Core functionality
│   │   │   │   ├── StateManager.js      # Centralized state with events
│   │   │   │   ├── ModuleLoader.js      # Dynamic module loading
│   │   │   │   └── WorkspaceAPI.js      # Backend API client
│   │   │   ├── /modules/      # Processing modules
│   │   │   │   ├── registry.js          # Module definitions
│   │   │   │   └── segmentation/        # Segmentation module
│   │   │   │       └── SegmentationModule.js
│   │   │   └── workspace.js   # Main app controller
│   │   └── /css/
│   │       └── workspace.css  # Workspace styling
│   │
│   ├── welcome.html           # Landing page (links to both versions)
│   ├── login.html
│   ├── register.html
│   └── admin.html
│
├── server.js                  # Express server (serves both versions)
├── /python/                   # ML scripts (shared by both versions)
└── package.json               # Dependencies include mitt, split.js
```

**Important Routes:**
- `/` → `welcome.html` (version selection)
- `/classic` → Classic segmentation app (requireAuth)
- `/workspace` → New workspace interface (requireAuth)
- `/api/workspace/*` → Workspace-specific API endpoints

### Workspace Architecture (Phase 1)

The new workspace version uses a **modular architecture** with the following core components:

#### 1. State Management (`StateManager.js`)

Centralized state management with event-based subscriptions using mitt.

**Key Methods:**
- `update(path, value)` - Update nested state properties (e.g., `'workspace.files'`)
- `get(path)` - Retrieve state values
- `subscribe(path, callback)` - Watch for changes to state paths
- `notify(type, message, duration)` - Add notifications to UI

**State Structure:**
```javascript
{
  workspace: {
    sessionId: null,
    initialized: false,
    files: [],
    stats: null,
    activeModule: null
  },
  modules: {
    segmentation: { active: false, currentTask: null, history: [] },
    denoising: { active: false, currentTask: null, history: [] },
    // ... other modules
  },
  ui: {
    sidebarCollapsed: true,
    currentView: 'welcome',
    loading: false,
    notifications: []
  },
  user: {
    username: null,
    fullName: null,
    status: null,
    isAdmin: false
  }
}
```

**Usage Pattern:**
```javascript
// Update state
stateManager.update('workspace.files', newFiles);

// Subscribe to changes
stateManager.subscribe('workspace.files', (files) => {
  console.log('Files changed:', files);
});

// Show notification
stateManager.notify('success', 'Operation completed', 5000);
```

#### 2. Module System (`ModuleLoader.js`)

Dynamic module registration and lifecycle management.

**Key Methods:**
- `register(moduleConfig)` - Register a module
- `load(moduleId)` - Load and activate a module
- `deactivate()` - Deactivate current module
- `returnToHub()` - Return to welcome view

**Module Lifecycle:**
1. Register module with `moduleRegistry` (in `modules/registry.js`)
2. User clicks "Launch Module" in welcome view
3. `ModuleLoader.load(moduleId)` dynamically imports module class
4. Module's `activate()` method renders UI in `#module-view`
5. User clicks "Back to Hub"
6. Module's `deactivate()` method cleans up

**Creating a New Module:**
```javascript
// In /workspace/js/modules/yourmodule/YourModule.js
class YourModule {
  constructor(stateManager) {
    this.state = stateManager;
    this.container = null;
  }

  async activate() {
    this.container = document.getElementById('module-view');
    this.render();
  }

  render() {
    this.container.innerHTML = `
      <div class="module-header">
        <button class="btn-back" onclick="workspace.returnToHub()">← Back</button>
        <h2>Your Module</h2>
      </div>
      <div class="module-content">
        <!-- Your UI here -->
      </div>
    `;
  }

  async deactivate() {
    if (this.container) {
      this.container.innerHTML = '';
    }
  }

  cleanup() {
    // Optional: release resources
  }
}

export default YourModule;
```

**Register Module** (in `modules/registry.js`):
```javascript
{
  id: 'yourmodule',
  name: 'Your Module Name',
  description: 'What it does',
  icon: '🎯',
  path: '/workspace/js/modules/yourmodule/YourModule.js',
  inputs: ['input_type'],
  outputs: ['output_type'],
  color: '#4A90E2',
  status: 'available' // or 'coming_soon'
}
```

#### 3. API Client (`WorkspaceAPI.js`)

Unified API client for all backend endpoints.

**Categories:**
- Workspace Management: `initializeWorkspace()`, `getWorkspaceStatus()`, `getWorkspaceFiles()`, `getWorkspaceStats()`
- File Management: `uploadFile()`, `downloadFile()`, `deleteFile()`
- Authentication: `checkAuth()`, `logout()`
- Segmentation: `uploadTrainingData()`, `startTraining()`, `runInference()`
- Session: `resetSession()`

**Usage:**
```javascript
const api = new WorkspaceAPI();
const response = await api.getWorkspaceStatus();
```

#### 4. Main Controller (`workspace.js`)

Main application controller that initializes all systems.

**Initialization Flow:**
1. Create `StateManager`, `ModuleLoader`, `WorkspaceAPI` instances
2. Check authentication → redirect to `/login` if not authenticated
3. Initialize workspace (create/load session workspace)
4. Set up UI event listeners
5. Register all modules from `moduleRegistry`
6. Render module cards in welcome view

**Global Access:**
```javascript
// workspace instance is globally available
window.workspace.loadModule('segmentation');
window.workspace.returnToHub();
window.workspace.refreshWorkspace();
```

### Workspace Backend API

Four new endpoints were added to `server.js` for workspace functionality:

**POST `/api/workspace/init`** (requireAuth)
- Creates workspace directories for current session
- Returns success status

**GET `/api/workspace/status`** (requireAuth)
- Returns workspace information for current session
- Includes sessionId, file tree, initialization status

**GET `/api/workspace/files`** (requireAuth)
- Returns file tree structure for workspace file browser
- Currently returns empty structure (Phase 3 will implement)

**GET `/api/workspace/stats`** (requireAuth)
- Returns workspace statistics (file count, total size)
- Used to update sidebar stats display

### Session-Based Workflow

The application uses **per-session isolation** for file uploads and model training:

1. Each user session gets a unique session ID (via Express session)
2. Uploaded files stored in `uploads/<sessionId>/`
3. Trained models stored in `models/<sessionId>/<trainingId>/`
4. Inference results stored in `results/<trainingId>/` or `results/imported_model_<timestamp>/`

**Important:** All file paths are session-scoped. When debugging file issues, always check the session ID.

### Authentication Levels

The app has **three authentication middleware functions** in server.js:

1. **`requireAuth`** - Basic auth (allows pending & approved users)
2. **`requireApproved`** - Full access (requires approved status)
3. **`requireAdmin`** - Admin-only access

**Key distinction:** Pending users can use test data but cannot upload custom files or import models. This is enforced via `requireApproved` middleware and inline checks (look for `req.session.user.status !== 'active'` checks in routes).

### Real-Time Communication Architecture

The application uses **Socket.IO rooms** for real-time progress updates:

**Training Flow:**
1. Client calls `/start-training` → receives `training_id`
2. Client joins Socket.IO room `training-${trainingId}`
3. Python process spawned, emits progress via stdout with `PROGRESS:` prefix
4. Server parses progress JSON and emits to room via `training-progress` event
5. On completion, emits `training-complete` event

**Inference Flow:**
1. Client calls `/run-inference` → receives `inference_id`
2. Client joins Socket.IO room `inference-${inferenceId}`
3. Python process spawned with 1-second delay (allows client to join room)
4. Progress emitted via `INFERENCE_PROGRESS:` prefix
5. Final result via `FINAL_RESULT:` prefix
6. Server emits `inference-complete` event with result

**Important:** The 1-second delay in inference is critical. Don't remove it or clients may miss early progress updates.

### Python Process Communication Protocol

Python scripts communicate with Node.js via **structured stdout messages**:

**Training (train_model.py):**
```
PROGRESS:{"epoch": 1, "total_epochs": 10, "metrics": {...}}
```

**Inference (run_inference.py):**
```
INFERENCE_PROGRESS:{"current_slice": 50, "total_slices": 100, "progress_percent": 50}
FINAL_RESULT:{"success": true, "output_path": "...", "metadata_path": "...", ...}
```

**Validation scripts:**
All validation scripts output JSON to stdout for parsing.

**Important:** When modifying Python scripts, maintain this protocol. The Node.js server parses these prefixed lines to update session state and emit Socket.IO events.

### State Management

**In-memory Maps (server.js):**
- `trainingSessions` - Map of `trainingId` → training session data
- `inferenceSessions` - Map of `inferenceId` → inference session data

**Session Storage (req.session):**
- `uploadedFiles` - Paths to uploaded training/annotation files
- `trainingConfig` - Training configuration parameters
- `currentTraining` - Current training ID
- `importedModel` - Imported model paths and validation info
- `user` - Current user information

**Note:** Server restart clears in-memory maps. Sessions persist via express-session (currently in-memory, consider redis for production).

### ML Pipeline Stages

**Stage 1: Upload & Validation**
- Endpoint: `/upload-data` (supports test data or custom upload)
- Validates TIFF dimensions, dtype, class counts via `python/validate_tiff.py`
- May auto-convert 16-bit to 8-bit for annotations
- Stores paths in `req.session.uploadedFiles`

**Stage 2: Training Configuration**
- Endpoint: `/configure-training`
- Validates config (patch size, learning rate, epochs, etc.)
- Stores in `req.session.trainingConfig`

**Stage 3: Model Training**
- Endpoint: `/start-training`
- Spawns `python/train_model.py` with config
- Outputs best_model.pth, config.json, results.json to `models/<sessionId>/<trainingId>/`
- Real-time progress via Socket.IO

**Stage 4: Inference**
- Upload inference data: `/upload-inference` (supports test data)
- Import model (optional): `/import-pretrained-model` (requires .pth + .json)
- Run inference: `/run-inference`
- Spawns `python/run_inference.py`
- Outputs segmented TIFF, metadata JSON, visualization JSON

**Stage 5: 3D Visualization**
- Client-side Three.js renders sparse 3D point cloud
- Visualization data is downsampled for web performance
- Original data overlay available via `/results/:inferenceId/original-data-web`

### Test Data Flow

The application provides **built-in test data** for users awaiting approval:

**Test Files (in `test_data/`):**
- `trypB_testData_training.tif` - Training images
- `trypB_testData_annotations.tif` - Annotation masks
- `trypB_testData_inference.tif` - Inference images

**How it works:**
1. Client sets `isTestData: 'true'` in form data
2. Server copies test files from `test_data/` to session directory
3. Creates mock file objects that match uploaded file structure
4. Proceeds with normal validation/training/inference flow

**Important:** Test data bypasses approval requirements. Custom uploads require `status: 'active'`.

## Key Files Reference

**Backend Core:**
- `server.js:867-952` - Training endpoint with approval checks
- `server.js:1171-1289` - Inference endpoint (handles imported vs trained models)
- `server.js:694-835` - Upload data endpoint with test data support
- `server.js:1575-1739` - Session reset (cleans all directories and maps)

**Frontend:**
- `public/js/app.js` - Main application controller
- `public/js/socket.js` - Socket.IO connection manager
- `public/js/visualization.js` - Three.js 3D visualization
- `public/js/training.js` - Training UI and progress charts
- `public/js/inference.js` - Inference UI and result handling

**Python ML:**
- `python/train_model.py` - U-Net training with real-time progress
- `python/run_inference.py` - Inference with progress and metadata generation
- `python/validate_tiff.py` - TIFF validation and auto-conversion
- `python/validate_imported_model.py` - Model import validation

**User Management:**
- `manageUsers.js` - CLI tool for user administration
- `activityLogger.js` - Activity logging to `logs/activity.log`
- `users.json` - User database (created on first user registration)

## Configuration & Environment

**Environment Variables (.env):**
- `PORT` - Server port (default: 3000)
- `SESSION_SECRET` - Express session secret
- `MAX_FILE_SIZE` - File upload limit (default: 200MB for TIFF)

**Session Configuration:**
- Session secret currently hardcoded in server.js:22
- For production, use environment variable and enable `secure: true` for HTTPS

## Common Patterns

### Adding New Python Processing Scripts

1. Create script in `python/` directory
2. Output structured JSON to stdout for parsing
3. Spawn in Node.js: `spawn('python', ['python/your_script.py', ...args])`
4. Parse stdout line-by-line for progress/results
5. Update in-memory session maps
6. Emit Socket.IO events for real-time updates

### Adding New Routes

1. Choose appropriate auth middleware: `requireAuth`, `requireApproved`, or `requireAdmin`
2. For file operations, use session-scoped paths: `path.join('uploads', req.session.id)`
3. Log activity via `activityLogger.logActivity(req.session.user.username, action, details)`
4. Return consistent JSON: `{ success: true/false, ... }`

### File Cleanup

Session reset (`/reset-session`) handles cleanup of:
- Session-specific directories (`uploads/<sessionId>`, `models/<sessionId>`)
- Training/inference results directories
- In-memory session maps
- Express session destruction

**Note:** Orphaned files may accumulate. Consider implementing periodic cleanup job.

## Known Patterns & Considerations

### WebSocket Room Management
Always ensure clients join Socket.IO rooms BEFORE starting long-running processes. The inference endpoint has a 1-second delay for this reason.

### Session ID Consistency
The session ID is the source of truth for file isolation. When debugging "file not found" errors, verify:
1. Session hasn't expired/changed
2. Files are in correct session subdirectory
3. Training/inference session maps reference correct paths

### Imported Model Handling
Imported models don't have a `training_id` but still need validation. The inference endpoint checks `req.session.importedModel` first before looking up training sessions.

### TIFF Auto-Conversion
The validation script may auto-convert 16-bit annotations to 8-bit. This is transparent to the user but important for debugging image format issues.

### Admin Dashboard Real-Time Data
The admin dashboard (`/admin/active-sessions`) returns ALL sessions, not just active ones. Filter by status in the frontend if needed.

## Development Workflow (Dual Version App)

### When Working on Classic Version

**Files to Edit:**
- `/public/classic/*` - All classic app files
- `/server.js` - Existing routes (non-workspace)
- `/python/*` - ML scripts (shared by both)

**Testing:**
- Navigate to `http://localhost:3000/classic`
- All existing functionality should work unchanged

### When Working on Workspace Version

**Files to Edit:**
- `/public/workspace/*` - Workspace-specific files
- `/public/workspace/js/core/*` - Core systems (StateManager, ModuleLoader, etc.)
- `/public/workspace/js/modules/*` - Module implementations
- `/server.js` - Add new workspace API routes under `/api/workspace/*`

**Testing:**
- Navigate to `http://localhost:3000/workspace`
- Use browser console to inspect state: `workspace.state.logState()`
- Check module loading: `workspace.moduleLoader.getAllModules()`

### Adding a New Module (Phase 2+)

1. **Create Module Directory:**
   ```bash
   mkdir -p public/workspace/js/modules/yourmodule
   ```

2. **Create Module Class:**
   ```javascript
   // public/workspace/js/modules/yourmodule/YourModule.js
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

3. **Register in Registry:**
   Edit `/public/workspace/js/modules/registry.js` to add module configuration

4. **Add Backend Endpoints (if needed):**
   Add routes in `server.js` under appropriate namespace

5. **Test Module:**
   - Restart server
   - Navigate to `/workspace`
   - Click "Launch Module" on your module card

### Module Integration Patterns

**Pattern 1: Wrap Existing Code**
- Best for Phase 2 segmentation module
- Keep existing code in separate functions
- Module's `activate()` calls existing initialization
- Example: Load classic app.js functionality into module view

**Pattern 2: Fresh Implementation**
- Best for new modules (denoising, annotation, mesh)
- Build UI from scratch in module's `render()`
- Use `WorkspaceAPI` for backend communication
- Store module state in centralized `StateManager`

**Pattern 3: Hybrid Approach**
- Reuse existing Python scripts
- Build new UI in workspace module
- Maintain backward compatibility with classic version

### Current Status & Next Steps

**✅ Phase 1 Complete (Foundation):**
- Dual version structure working
- State management system functional
- Module system operational
- Welcome hub rendering modules
- Backend API endpoints created

**🚧 Phase 2 Next (Module System & Welcome Hub):**
- Convert existing segmentation workflow into module
- Fully integrate classic segmentation pipeline into workspace
- Module switching and navigation
- File browser placeholder functional

**📋 Key Phase 2 Tasks:**
1. Wrap classic segmentation code in `SegmentationModule.js`
2. Enable Socket.IO connections in module context
3. Maintain session state when switching modules
4. Test full segmentation workflow in workspace

### Important Considerations

**Session Management:**
- Classic version: Uses existing session pattern (works as before)
- Workspace version: Shares same session, adds workspace initialization
- Session ID is consistent across both versions

**File Paths:**
- Classic uploads: `uploads/<sessionId>/`
- Workspace uploads: Same path structure (shared)
- Models and results: Same path structure (shared)

**State Sharing:**
- No state is shared between classic and workspace versions
- Each maintains its own UI state
- Backend session data is shared (user, uploaded files, training configs)

**Backward Compatibility:**
- Classic version MUST remain fully functional
- Don't break existing endpoints
- New workspace endpoints use `/api/workspace/*` namespace
- Python scripts shared by both (don't break existing interfaces)

### Debugging Tips

**Workspace State:**
```javascript
// In browser console
workspace.state.logState()  // View entire state
workspace.moduleLoader.getAllModules()  // List registered modules
workspace.state.get('workspace')  // View workspace state
```

**Module Loading Issues:**
- Check browser console for import errors
- Verify module path in registry matches file location
- Ensure module exports `default` class
- Check module has `activate()` and `deactivate()` methods

**API Errors:**
- Check Network tab in DevTools
- Verify authentication (should redirect to /login if not authenticated)
- Check server logs for backend errors
- Verify endpoint exists in server.js
