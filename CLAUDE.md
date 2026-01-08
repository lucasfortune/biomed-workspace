# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **biomedical image segmentation web application** that provides a complete ML pipeline for training U-Net models and running inference on TIFF image stacks, with real-time 3D visualization using Three.js.

**The application now exists in TWO versions:**
1. **Classic Version** (`/public/classic/`) - Original linear workflow (stable, fully functional)
2. **Workspace Version** (`/public/workspace/`) - New modular IDE-like interface (Phase 4 complete, 8 modules implemented)

**Tech Stack:**
- Backend: Node.js/Express with Socket.IO for real-time updates
- Frontend: Vanilla JavaScript with Three.js for 3D visualization
- ML Pipeline: Python with PyTorch for U-Net training and inference
- Authentication: Session-based with bcrypt, supports admin approval workflow
- State Management: mitt (event emitter) for workspace version
- UI Libraries: Split.js for resizable panels

---

## 📚 Documentation System

**Complete documentation is now organized in `/docs/`**

### Quick Links for AI Assistants

| Need | Documentation |
|------|---------------|
| 🗺️ **Navigation** | [Documentation Index](docs/INDEX.md) - Start here |
| 🏗️ **Architecture** | [Architecture Overview](docs/architecture/OVERVIEW.md) |
| 📋 **API Reference** | [API Endpoints](docs/reference/API_ENDPOINTS.md) |
| 📝 **Recent Changes** | [Session Logs](docs/sessions/INDEX.md) |
| 🚀 **Roadmap** | [Vision & Roadmap](docs/vision/ROADMAP.md) |
| 🐛 **Troubleshooting** | [Common Issues](docs/guides/TROUBLESHOOTING.md) |
| 🔧 **Module Creation** | [Module Guide](docs/guides/MODULE_CREATION.md) |

### For New Claude Code Instances

**First-time context gathering (recommended reading order):**
1. [Documentation Index](docs/INDEX.md) - 5 min overview
2. [Session Logs Index](docs/sessions/INDEX.md) - Recent work (check latest 2-3 sessions)
3. [Architecture Overview](docs/architecture/OVERVIEW.md) - System design
4. [Known Issues](docs/vision/ROADMAP.md#phase-3-file-browser--workspace-management) - Current limitations

**This file (CLAUDE.md) provides:**
- Quick reference for common patterns
- Development commands
- Critical architectural details
- Links to detailed documentation

**For comprehensive information:** See `/docs/` directory structure

---

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

The application has been restructured to support **two parallel interfaces** with a **modular backend architecture**:

```
/viz_app/
├── /public/
│   ├── /classic/              # ORIGINAL APP (stable, complete)
│   │   ├── index.html         # Classic segmentation pipeline
│   │   ├── /js/               # app.js, training.js, inference.js, etc.
│   │   └── /css/              # Classic styling
│   │
│   ├── /workspace/            # MODULAR APP (Phase 4 complete)
│   │   ├── index.html         # Workspace interface
│   │   ├── /js/
│   │   │   ├── /core/         # Core functionality
│   │   │   │   ├── StateManager.js      # Centralized state with events
│   │   │   │   ├── ModuleLoader.js      # Dynamic module loading
│   │   │   │   ├── WorkspaceAPI.js      # Backend API client
│   │   │   │   ├── BaseModule.js        # Abstract base class for modules
│   │   │   │   └── /components/         # Reusable UI components
│   │   │   │       ├── FileSelector.js  # File selection with validation
│   │   │   │       ├── InfoPanel.js     # Help panel container
│   │   │   │       ├── StepNavigator.js # Step-based navigation
│   │   │   │       └── ...              # 8 more UI components
│   │   │   ├── /modules/      # Processing modules (8 total)
│   │   │   │   ├── registry.js          # Module definitions
│   │   │   │   ├── /segmentation/       # U-Net training & inference
│   │   │   │   ├── /denoising-dl/       # Deep learning denoising (N2V)
│   │   │   │   ├── /denoising-filter/   # Filter-based denoising
│   │   │   │   ├── /annotation/         # Quick annotation tool
│   │   │   │   ├── /mesh/               # 3D mesh generation
│   │   │   │   ├── /visualization/      # Interactive 3D viewer
│   │   │   │   ├── /imageviewer/        # TIFF stack gallery
│   │   │   │   └── /template/           # Module starter template
│   │   │   ├── /services/     # Frontend services
│   │   │   │   └── InfoContentService.js# Help content delivery
│   │   │   └── workspace.js   # Main app controller
│   │   ├── /css/
│   │   │   └── workspace.css  # Workspace styling (light/dark mode)
│   │   └── /content/          # Help system content
│   │       └── /modules/      # Module-specific help articles
│   │
│   ├── welcome.html           # Landing page (embedded auth forms)
│   ├── login.html
│   ├── register.html
│   └── admin.html             # Admin dashboard (PoP design system)
│
├── server.js                  # Entry point (~160 lines) - creates server & starts
├── WorkspaceManager.js        # Workspace directory management (~1000 lines)
├── /src/                      # MODULAR BACKEND
│   ├── app.js                 # Express app configuration factory
│   ├── /config/
│   │   └── constants.js       # Python path, directories, validation
│   ├── /middleware/
│   │   ├── auth.middleware.js # requireAuth, requireApproved, requireAdmin
│   │   ├── session.middleware.js
│   │   ├── upload.middleware.js
│   │   └── error.middleware.js
│   ├── /routes/               # 11 route files
│   │   ├── index.js           # Route aggregator
│   │   ├── static.routes.js   # HTML pages, static files
│   │   ├── auth.routes.js     # Login, register, logout
│   │   ├── folders.routes.js  # Folder CRUD
│   │   ├── files.routes.js    # File operations
│   │   ├── workspace.routes.js# Workspace management + ZIP export/restore
│   │   ├── ml.routes.js       # Training, inference, model import
│   │   ├── denoising.routes.js# DL & filter denoising (~1400 lines)
│   │   ├── annotation.routes.js# Annotation save/load (~600 lines)
│   │   ├── mesh.routes.js     # Mesh generation (~500 lines)
│   │   └── admin.routes.js    # Admin API endpoints (~300 lines)
│   ├── /services/             # 7 service files
│   │   ├── AuthService.js     # User authentication logic
│   │   ├── WorkspaceService.js# Workspace/session management
│   │   ├── FileService.js     # File validation, thumbnails
│   │   ├── TrainingService.js # ML training orchestration
│   │   ├── InferenceService.js# ML inference orchestration
│   │   ├── DenoisingService.js# Denoising orchestration (~1000 lines)
│   │   └── SessionTracker.js  # Training/inference/denoising session maps
│   ├── /sockets/
│   │   └── index.js           # Socket.IO event handlers
│   └── /helpers/
│       ├── pythonRunner.js    # Python process spawning
│       ├── validation.js      # Input validation helpers
│       ├── pathHelpers.js     # Path utilities
│       ├── fileHelpers.js     # File system utilities
│       └── lineageHelpers.js  # Data lineage tracking
│
├── /python/                   # ML scripts (16 scripts, shared by both versions)
├── /utils/                    # Shared utilities (logger, env loader)
└── package.json               # Dependencies include mitt, split.js
```

**Important Routes:**
- `/` → `welcome.html` (version selection with embedded auth)
- `/classic` → Classic segmentation app (requireAuth)
- `/workspace` → Workspace interface (requireAuth)
- `/admin` → Admin dashboard (requireAdmin)
- `/api/workspace/*` → Workspace management, file browser, ZIP export/restore
- `/api/denoising/*` → DL & filter-based denoising endpoints
- `/api/annotation/*` → Annotation save/load endpoints
- `/api/mesh/*` → Mesh generation endpoints
- `/admin/*` → Admin API (user management, logs, sessions)

### Workspace Architecture (Phase 4 Complete)

The workspace version uses a **modular architecture** with 8 implemented modules:

#### Implemented Modules

| Module | Directory | Description |
|--------|-----------|-------------|
| **Segmentation** | `modules/segmentation/` | U-Net training & inference pipeline |
| **DL Denoising** | `modules/denoising-dl/` | Deep learning denoising (N2V/autoStructN2V) |
| **Filter Denoising** | `modules/denoising-filter/` | Gaussian/NLM filter-based denoising |
| **Annotation** | `modules/annotation/` | Quick annotation tool with brush engine |
| **Mesh Generation** | `modules/mesh/` | 3D surface mesh creation from segmentation |
| **3D Visualization** | `modules/visualization/` | Interactive Three.js mesh viewer |
| **Image Viewer** | `modules/imageviewer/` | TIFF stack gallery browser |
| **Template** | `modules/template/` | Module starter template for development |

#### Core Framework

##### BaseModule (`core/BaseModule.js`)

Abstract base class that all workspace modules extend, providing:
- Step-based navigation framework
- CSS/script loading utilities
- Lifecycle management (activate, deactivate, cleanup)
- Progress tracking and loading overlays

##### Core UI Components (`core/components/`)

Reusable components shared across modules:
- **FileSelector.js** - File selection with validation and help integration
- **InfoPanel.js** - Help panel container with tabs
- **InfoArticle.js** - Article rendering with markdown support
- **InfoGlossary.js** - Terminology definitions
- **InfoSearch.js** - Full-text search across articles
- **LoadingOverlay.js** - Loading state display
- **MetricCard.js** - Statistics display cards
- **NavigationButtons.js** - Step navigation controls
- **ProgressIndicator.js** - Progress bar component
- **StepNavigator.js** - Step-based workflow navigation
- **ValidationDisplay.js** - Validation feedback display

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

**In-memory Maps (src/services/SessionTracker.js):**
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

**Backend Core (Modular Architecture):**
- `server.js` - Entry point (~160 lines): env setup, service creation, server start
- `WorkspaceManager.js` - Workspace directory management, ZIP export/restore (~1000 lines)
- `src/app.js` - Express app configuration: middleware, routes, error handling
- `src/routes/index.js` - Route aggregator
- `src/routes/ml.routes.js` - Training & inference endpoints
- `src/routes/workspace.routes.js` - Workspace management, file browser, ZIP endpoints
- `src/routes/denoising.routes.js` - DL & filter denoising endpoints (~1400 lines)
- `src/routes/annotation.routes.js` - Annotation save/load endpoints (~600 lines)
- `src/routes/mesh.routes.js` - Mesh generation endpoints (~500 lines)
- `src/routes/admin.routes.js` - Admin API endpoints (~300 lines)
- `src/routes/auth.routes.js` - Login, register, logout endpoints
- `src/services/SessionTracker.js` - Training/inference/denoising session maps
- `src/helpers/pythonRunner.js` - Centralized Python process spawning
- `src/helpers/lineageHelpers.js` - Data lineage/provenance tracking

**Backend Services:**
- `src/services/AuthService.js` - User authentication and authorization
- `src/services/WorkspaceService.js` - Workspace initialization and management
- `src/services/FileService.js` - File validation, thumbnails, operations
- `src/services/TrainingService.js` - ML training orchestration
- `src/services/InferenceService.js` - ML inference orchestration
- `src/services/DenoisingService.js` - Denoising orchestration (~1000 lines)

**Frontend (Classic):**
- `public/classic/js/app.js` - Main application controller
- `public/classic/js/socket.js` - Socket.IO connection manager
- `public/classic/js/visualization.js` - Three.js 3D visualization
- `public/classic/js/training.js` - Training UI and progress charts
- `public/classic/js/inference.js` - Inference UI and result handling

**Frontend (Workspace):**
- `public/workspace/js/workspace.js` - Main workspace controller
- `public/workspace/js/core/StateManager.js` - Centralized state management
- `public/workspace/js/core/WorkspaceAPI.js` - Backend API client
- `public/workspace/js/core/ModuleLoader.js` - Dynamic module loading
- `public/workspace/js/core/BaseModule.js` - Abstract base class for modules
- `public/workspace/js/core/components/FileSelector.js` - File selection component
- `public/workspace/js/core/components/InfoPanel.js` - Help panel system
- `public/workspace/js/services/InfoContentService.js` - Help content delivery

**Workspace Modules (8 total):**
- `modules/segmentation/SegmentationModule.js` - U-Net training & inference
- `modules/denoising-dl/DLDenoisingModule.js` - Deep learning denoising
- `modules/denoising-filter/FilterDenoisingModule.js` - Filter-based denoising
- `modules/annotation/AnnotationModule.js` - Quick annotation tool
- `modules/mesh/MeshModule.js` - 3D mesh generation
- `modules/visualization/VisualizationModule.js` - Interactive 3D viewer
- `modules/imageviewer/ImageViewerModule.js` - TIFF stack gallery
- `modules/template/TemplateModule.js` - Module starter template

**Python ML & Processing Scripts (16 total):**
- `python/train_model.py` - U-Net training with real-time progress
- `python/run_inference.py` - Inference with progress and metadata generation
- `python/validate_tiff.py` - TIFF validation and auto-conversion
- `python/validate_imported_model.py` - Model import validation
- `python/validate_inference_tiff.py` - Inference TIFF validation
- `python/validate_dl_tiff.py` - Deep learning denoising TIFF validation
- `python/filter_denoising.py` - Gaussian/NLM filter-based denoising
- `python/autostructn2v_wrapper.py` - Deep learning denoising (N2V/autoStructN2V)
- `python/generate_mesh.py` - 3D mesh generation from segmentation
- `python/generate_thumbnail.py` - TIFF thumbnail generation
- `python/downsample_for_web.py` - Visualization downsampling
- `python/extract_slice.py` - Extract single slice from TIFF stack
- `python/extract_raw_slice.py` - Extract raw slice for annotation
- `python/read_annotation_tiff.py` - Read annotation TIFF data
- `python/create_annotation_tiff.py` - Create annotation TIFF from mask data
- `python/convert_annotations.py` - Convert annotation formats

**User Management:**
- `manageUsers.js` - CLI tool for user administration
- `activityLogger.js` - Activity logging to `logs/activity.log`
- `users.json` - User database (created on first user registration)

**Help System Scripts:**
- `scripts/convert-help-to-markdown.js` - Convert JSON help articles to markdown + generate manifest
- `scripts/validate-help-migration.js` - Validate manifest, markdown files, and article references

## Configuration & Environment

**Environment Variables (.env):**
- `PORT` - Server port (default: 3000)
- `SESSION_SECRET` - Express session secret
- `MAX_FILE_SIZE` - File upload limit (default: 200MB for TIFF)
- `DEBUG` - Enable debug logging (default: false)

**Configuration Files:**
- `src/config/constants.js` - Python path, directory paths, validation rules
- `utils/envLoader.js` - Environment variable loading and validation

**Session Configuration:**
- Session middleware configured in `src/middleware/session.middleware.js`
- For production, use environment variable for secret and enable `secure: true` for HTTPS

## New Features (Phase 3-4)

### Admin API (`/admin/*`)

Backend API for admin dashboard functionality:
- `GET /admin/users` - List all users with optional status filter
- `POST /admin/approve-user` - Approve pending user
- `POST /admin/reject-user` - Reject pending user
- `GET /admin/logs` - Activity log retrieval with filtering
- `GET /admin/active-sessions` - Monitor active training/inference/denoising sessions

### Info Panel / Help System

Educational help system integrated into the workspace using **markdown-based content** with manifest loading:

**Architecture:**
- `manifest.json` loaded eagerly at startup - provides complete glossary immediately
- Individual markdown files (`.md`) loaded lazily on demand
- YAML frontmatter in each article stores metadata (id, title, tags, seeAlso)
- `marked.js` library parses markdown to HTML for rendering

**Content Structure:**
```
/public/workspace/content/
├── manifest.json              # Complete article index + glossary (loaded first)
└── modules/
    ├── segmentation/*.md      # 22 articles
    ├── denoising-dl/*.md      # 22 articles
    ├── denoising-filter/*.md  # 7 articles
    └── ... (8 module directories, 84 total articles)
```

**Key Components:**
- **InfoPanel.js** - Container orchestrating search, glossary, and article display
- **InfoContentService.js** - Manifest-based loading, caching, search, glossary
- **InfoArticle.js** - Renders markdown HTML with styled formatting
- **InfoGlossary.js** - Alphabetical term navigation from manifest glossary
- **InfoSearch.js** - Full-text search across article titles and tags

**Duplicate Title Handling:**
14 article titles exist in multiple modules. These are disambiguated with `displayTitle`:
- "Batch Size" → "Batch Size (Segmentation)" / "Batch Size (DL Denoising)"
- "Learning Rate" → "Learning Rate (Segmentation)" / "Learning Rate (DL Denoising)"
- etc.

**Related Scripts:**
- `scripts/convert-help-to-markdown.js` - Convert JSON articles to markdown
- `scripts/validate-help-migration.js` - Validate manifest and markdown files

**Context-sensitive help:** Components use `data-info-id` attribute to link to articles

### Design System (Physics of Parasitism Branding)

- **Light/Dark Mode** - Toggle with localStorage persistence
- **Brand Colors** - Red (#EB1F17), Green (#1DA924)
- **CSS Custom Properties** - Semantic color tokens for theming
- **SVG Module Icons** - Consistent icon set replacing emojis

### Workspace ZIP Export/Restore

- `GET /api/workspace/download` - Stream workspace as ZIP archive
- `POST /api/workspace/restore` - Restore workspace from ZIP upload
- Excludes cache directories (.thumbnails, .slices, .mesh-previews)
- Automatic session ID updates on restore
- 5GB file size limit, 10-minute timeout

### Data Lineage Tracking

Track file processing history:
- `src/helpers/lineageHelpers.js` - Create and query lineage records
- `GET /api/workspace/lineage/:fileId` - Get processing history
- Links inputs to outputs through transformations
- Shows provenance chain (e.g., "Original → Denoised → Segmented → Mesh")

## Common Patterns

### Adding New Python Processing Scripts

1. Create script in `python/` directory
2. Output structured JSON to stdout for parsing
3. Spawn in Node.js: `spawn('python', ['python/your_script.py', ...args])`
4. Parse stdout line-by-line for progress/results
5. Update in-memory session maps
6. Emit Socket.IO events for real-time updates

### Adding New Routes

**For new route groups:**
1. Create a new route file in `src/routes/` (e.g., `myfeature.routes.js`)
2. Export a factory function that takes dependencies and returns a router
3. Register the router in `src/app.js` with appropriate path prefix

**For routes within existing groups:**
1. Find the appropriate route file in `src/routes/`
2. Add route handler using the injected dependencies
3. Choose appropriate auth middleware: `requireAuth`, `requireApproved`, or `requireAdmin`
4. For file operations, use session-scoped paths: `path.join('uploads', req.session.id)`
5. Log activity via `activityLogger.logActivity(req.session.user.username, action, details)`
6. Return consistent JSON: `{ success: true/false, ... }`

**Route file pattern:**
```javascript
// src/routes/myfeature.routes.js
const express = require('express');
const { requireAuth } = require('../middleware/auth.middleware');

function createMyFeatureRoutes({ myService, logger }) {
  const router = express.Router();

  router.get('/my-endpoint', requireAuth, async (req, res) => {
    // Route implementation
  });

  return router;
}

module.exports = createMyFeatureRoutes;
```

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
- `/src/routes/*` - Route handlers (shared by both versions)
- `/python/*` - ML scripts (shared by both)

**Testing:**
- Navigate to `http://localhost:3000/classic`
- All existing functionality should work unchanged

### When Working on Workspace Version

**Files to Edit:**
- `/public/workspace/*` - Workspace-specific files
- `/public/workspace/js/core/*` - Core systems (StateManager, ModuleLoader, etc.)
- `/public/workspace/js/modules/*` - Module implementations
- `/src/routes/workspace.routes.js` - Workspace API routes

**Testing:**
- Navigate to `http://localhost:3000/workspace`
- Use browser console to inspect state: `workspace.state.logState()`
- Check module loading: `workspace.moduleLoader.getAllModules()`

### When Working on Backend

**Modular Structure:**
- `/server.js` - Only modify for startup changes, new services, or graceful shutdown
- `/src/app.js` - Modify for new middleware or route registration
- `/src/routes/*` - Add or modify HTTP endpoints
- `/src/services/*` - Add or modify business logic
- `/src/middleware/*` - Add or modify middleware
- `/src/helpers/*` - Add or modify utility functions
- `/src/sockets/*` - Modify Socket.IO handlers

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

**✅ Phase 2 Complete (Module System):**
- Segmentation module fully integrated
- Module switching and navigation working
- Socket.IO connections in module context

**✅ Phase 3 Complete (File Browser & Workspace):**
- Complete file browser with tree structure
- Batch operations (download ZIP, delete)
- File metadata and thumbnails
- Workspace ZIP export/restore

**✅ Phase 4 Complete (Info Panel & Polish):**
- Help system with 200+ articles
- Design system (light/dark mode, PoP branding)
- All 8 modules implemented
- Admin API endpoints
- Data lineage tracking

**📋 Phase 5 Planned (Future):**
- Batch processing workflows
- Model zoo / pretrained models
- Enhanced visualization features

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
- Verify endpoint exists in `src/routes/` directory
