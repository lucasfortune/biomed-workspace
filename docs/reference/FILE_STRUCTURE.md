# File Structure Reference

> **Complete codebase organization and file system layout**

This document provides a comprehensive overview of the project's file structure, explaining the purpose of each directory and key files.

**Last Updated:** 2026-09-07 (v1.5.0 data-model consolidation)
**Project Root:** repository root (`image_processing_workspace/`). User data lives under `DATA_DIR` (defaults to the project root; see `src/config/constants.js` DATA_PATHS).

---

## Overview

The project consists of a single frontend, the modular **Workspace** (`public/workspace/`), plus a few standalone authentication and admin pages, all served by a modular Express backend (`src/`) that drives a Python ML pipeline (`python/`).

---

## Root Directory

```
biomed-workspace/
├── docs/                    # Documentation (comprehensive)
├── public/                  # Frontend code (Workspace + auth pages)
├── src/                     # MODULAR BACKEND (routes, services, middleware)
├── python/                  # ML scripts (spawned by the backend)
├── utils/                   # Shared utilities (logger, env loader)
├── test_data/               # Built-in sample datasets (seeded into new workspaces)
├── workspaces/              # Per-session workspaces (ALL user data; under DATA_DIR)
├── sessions/                # Express session storage (under DATA_DIR)
├── logs/                    # Activity logs (under DATA_DIR)
├── tmp/                     # Scratch space for streamed uploads, e.g. restore ZIPs (under DATA_DIR)
├── venv/                    # Python virtual environment
├── node_modules/            # Node.js dependencies
├── server.js                # Entry point (~160 lines)
├── WorkspaceManager.js      # Workspace management
├── activityLogger.js        # Activity logging utility
├── manageUsers.js           # User management CLI
├── users.json               # User database
├── package.json             # Node.js dependencies
├── package-lock.json        # Dependency lock file
├── requirements.txt         # Python dependencies
├── LICENSE                  # BSD 3-Clause
├── README.md                # Project overview
└── .gitignore               # Git ignore rules
```

> **Note (v1.5.0):** The legacy project-root `uploads/`, `models/` and `results/` data directories are **gone**. They are no longer created (`ensureDirectories` in `src/config/constants.js` only ensures `public/`), and their unauthenticated static mounts were removed. All user data lives in per-session workspace directories (`workspaces/<sessionId>/`, see [Workspaces](#workspaces-workspaces)) and is served only via authenticated, session-scoped routes.

---

## Documentation (`docs/`)

**Purpose:** Comprehensive project documentation

```
docs/
├── INDEX.md                 # Master documentation index
├── guides/                  # How-to guides
│   ├── GETTING_STARTED.md   # Installation & setup
│   ├── TROUBLESHOOTING.md   # Common issues & solutions
│   └── MODULE_CREATION.md   # Creating new modules (future)
├── reference/               # API & technical reference
│   ├── API_ENDPOINTS.md     # HTTP endpoint catalog
│   ├── STATE_MANAGEMENT.md  # StateManager API
│   ├── MODULE_SYSTEM.md     # ModuleLoader API
│   ├── SOCKET_PROTOCOL.md   # Socket.IO events
│   ├── PYTHON_INTEGRATION.md# Python communication
│   └── FILE_STRUCTURE.md    # This document
├── architecture/            # System architecture docs
│   ├── OVERVIEW.md          # Architecture overview
│   ├── AUTHENTICATION.md    # Auth & session design
│   ├── STATE_ARCHITECTURE.md# Server/client state design
│   └── MODULE_ARCHITECTURE.md# Module system design
└── decisions/               # Architecture decision records (ADR-001 to ADR-012)
```

**Key Files:**
- `INDEX.md` - Start here, master navigation
- `guides/GETTING_STARTED.md` - First-time setup
- `guides/TROUBLESHOOTING.md` - Common issues
- `reference/API_ENDPOINTS.md` - All HTTP endpoints
- `decisions/` - Architecture decision records

---

## Frontend (`public/`)

**Purpose:** Client-side code: the Workspace application and the standalone auth/admin pages

```
public/
├── welcome.html             # Landing page with login form (served at /)
├── register.html            # Registration page
├── admin.html               # Admin dashboard
├── favicon.svg              # Site icon
│
├── js/                      # Scripts for the standalone pages
│   ├── welcome.js           # Login, theme toggle, launch link
│   ├── register.js          # Registration form
│   ├── admin.js             # Admin dashboard logic
│   ├── privacy-policy.js    # Privacy policy modal
│   └── utils.js             # Shared helpers (e.g. HTML escaping)
│
├── css/                     # Styles for the standalone pages
│   ├── base.css             # Reset and base styles (register, admin)
│   ├── components.css       # Shared UI components (register, admin)
│   ├── auth.css             # Registration form
│   ├── welcome.css          # Welcome page
│   ├── admin.css            # Admin dashboard
│   └── privacy-policy.css   # Privacy policy modal
│
├── imgs/                    # Logos (pop_logo.svg, pop_transpBG.svg, dfg_transpBG.svg)
│
└── workspace/               # Workspace application (10 modules)
    ├── index.html           # Workspace entry
    ├── js/
    │   ├── workspace.js     # Main controller
    │   ├── core/            # Core systems
    │   │   ├── StateManager.js    # State management
    │   │   ├── ModuleLoader.js    # Module system
    │   │   ├── WorkspaceAPI.js    # API client
    │   │   ├── BaseModule.js      # Abstract base class for modules
    │   │   ├── icons.js           # icon(name) → inline SVG (ADR-005)
    │   │   ├── css/
    │   │   │   ├── module-base.css     # Shared module styles + tokens
    │   │   │   └── slice-viewer.css    # .sv-* viewer chrome (ADR-011)
    │   │   └── components/        # Reusable UI components (10 + index.js)
    │   │       ├── FileSelector.js       # File selection with validation
    │   │       ├── SliceViewerChrome.js  # Shared slice viewer (ADR-011)
    │   │       ├── StepNavigator.js      # Step navigation
    │   │       ├── NavigationButtons.js  # Prev/Next nav-row state
    │   │       ├── ValidationDisplay.js  # Validation feedback slot
    │   │       ├── ResumeDialog.js       # Resume-or-start-fresh prompt
    │   │       ├── InfoPanel.js          # Help panel container
    │   │       ├── InfoArticle.js        # Article rendering
    │   │       ├── InfoGlossary.js       # Terminology definitions
    │   │       ├── InfoSearch.js         # Full-text search
    │   │       └── index.js              # Component exports
    │   ├── services/
    │   │   └── InfoContentService.js   # Help content delivery
    │   └── modules/         # Processing modules (10 + template)
    │       ├── registry.js        # Module definitions
    │       ├── segmentation/      # U-Net training & inference
    │       ├── denoising-dl/      # DL denoising (20+ files)
    │       ├── denoising-filter/  # Filter-based denoising
    │       ├── preprocess/        # Crop / rescale / Z (2 steps)
    │       ├── stitching/         # Stack stitching (2 steps)
    │       ├── segcleanup/        # Segmentation cleanup & quantification
    │       ├── annotation/        # Annotation tool (brush engine)
    │       ├── mesh/              # 3D mesh generation
    │       ├── visualization/     # Interactive 3D viewer
    │       ├── imageviewer/       # TIFF stack gallery
    │       └── template/          # Module starter template
    ├── css/
    │   ├── workspace.css          # Workspace styling (light/dark mode)
    │   └── info-panel.css         # Help panel styling
    └── content/                   # Help system content
        └── modules/               # Module-specific help articles
```

**Workspace at a glance:**

| Aspect | Workspace |
|--------|-----------|
| **Status** | Active (v1.5.0) |
| **UI Pattern** | Multi-module, IDE-like |
| **State** | Centralized StateManager |
| **Modules** | 10 modules (+ template), dynamic loading |
| **Entry Point** | `/workspace` |
| **File Structure** | Nested `/workspace/js/modules/` |
| **Features** | Image viewer, preprocessing, denoising, annotation, segmentation, segmentation cleanup, stitching, mesh, 3D visualization |

---

## Backend (Modular Architecture)

**Purpose:** Express server with session management and ML pipeline

The backend has been refactored from a monolithic ~3000-line `server.js` into a modular architecture in the `src/` directory.

```
biomed-workspace/
├── server.js                # Entry point (~160 lines)
│   └── Startup, services, server creation, graceful shutdown
│
├── src/                     # Modular backend
│   ├── app.js               # Express app configuration (~307 lines)
│   │
│   ├── config/
│   │   ├── index.js         # Config exports
│   │   ├── constants.js     # DATA_PATHS, CACHE_DIRS, RETENTION_HOURS, SESSION_CONFIG, validation
│   │   └── multer.config.js # Multer storage configuration
│   │
│   ├── middleware/
│   │   ├── auth.middleware.js     # requireAuth, requireApproved, requireAdmin
│   │   ├── session.middleware.js  # Express session configuration (uses SESSION_CONFIG)
│   │   ├── upload.middleware.js   # Multer file upload configuration
│   │   └── error.middleware.js    # Global error handler
│   │
│   ├── routes/                        # 13 route files
│   │   ├── index.js               # Route aggregator
│   │   ├── static.routes.js       # HTML pages, static files, authenticated workspace file serving
│   │   ├── auth.routes.js         # Login, register, logout (optional workspace deletion), check-auth
│   │   ├── files.routes.js        # File operations (rename/displayName, delete, etc.)
│   │   ├── workspace.routes.js    # Workspace init, status, upload, ZIP export/restore
│   │   ├── ml.routes.js           # Training, inference, model import
│   │   ├── denoising.routes.js    # DL & filter denoising (~1400 lines)
│   │   ├── preprocess.routes.js   # Crop / rescale / Z preprocessing jobs
│   │   ├── stitching.routes.js    # Stack stitching jobs
│   │   ├── segcleanup.routes.js   # Segmentation cleanup & quantification jobs
│   │   ├── annotation.routes.js   # Annotation save/load (~600 lines)
│   │   ├── mesh.routes.js         # Mesh generation (~500 lines)
│   │   └── admin.routes.js        # Admin API endpoints (~300 lines)
│   │
│   ├── services/                      # 9 service files
│   │   ├── index.js               # Service exports
│   │   ├── AuthService.js         # User authentication logic
│   │   ├── WorkspaceService.js    # Workspace/session management
│   │   ├── FileService.js         # File validation, thumbnails
│   │   ├── TrainingService.js     # ML training orchestration
│   │   ├── InferenceService.js    # ML inference orchestration
│   │   ├── DenoisingService.js    # Denoising orchestration (~1000 lines)
│   │   ├── CleanupService.js      # Retention cleanup (RETENTION_HOURS after last activity)
│   │   ├── TelegramService.js     # Admin notifications
│   │   └── SessionTracker.js      # Training/inference/mesh/denoising maps + generic job registry
│   │
│   ├── sockets/
│   │   ├── index.js               # Socket.IO setup, ownership-checked room joins
│   │   ├── training.socket.js     # Per-domain event handlers
│   │   ├── inference.socket.js
│   │   ├── denoising.socket.js
│   │   ├── mesh.socket.js
│   │   ├── preprocess.socket.js
│   │   ├── stitching.socket.js
│   │   ├── segcleanup.socket.js
│   │   └── restore.socket.js
│   │
│   └── helpers/
│       ├── index.js               # Helper exports
│       ├── pythonRunner.js        # Python process spawning (~520 lines)
│       ├── validation.js          # Input validation helpers
│       ├── pathHelpers.js         # Path utilities
│       ├── fileHelpers.js         # File system utilities
│       ├── namingHelpers.js       # displayName provenance-chain naming
│       └── lineageHelpers.js      # Data lineage/provenance tracking
│
├── utils/
│   ├── logger.js            # Logging utility
│   ├── envLoader.js         # Environment configuration
│   └── processErrorHandler.js # Python process error handling
│
├── WorkspaceManager.js      # Workspace directory management
├── activityLogger.js        # Activity logging utility
└── manageUsers.js           # User management CLI tool
```

### Module Descriptions

**server.js (Entry Point):**
- Environment initialization via `utils/envLoader`
- Service instantiation (Auth, Workspace, File, Training, Inference)
- HTTP server and Socket.IO setup
- Graceful shutdown handlers (SIGTERM, SIGINT)

**src/app.js (App Configuration):**
- Express middleware registration (session, CORS, JSON)
- Route mounting with dependency injection
- Python runner wrapper functions
- Helper functions for tracking and path conversion

**src/routes/ (HTTP Endpoints):**
- Each route module exports a factory function
- Dependencies injected at registration time
- Auth middleware applied per-route
- Consistent JSON response format

**src/services/ (Business Logic):**
- Encapsulated service classes
- Injected dependencies via constructor
- Stateless operations (except SessionTracker)

**src/helpers/pythonRunner.js (Python Integration):**
- Centralized Python process spawning
- Functions: validateTiffStacks, validateImportedModel, validateInferenceTiff
- Functions: generateThumbnail, startTrainingProcess, startInferenceProcess
- Real-time progress parsing and Socket.IO emission

---

## Python Scripts (`python/`)

**Purpose:** ML operations and validation

```
python/
├── train_model.py           # U-Net training
├── run_inference.py         # Inference with progress
├── validate_tiff.py         # Training data validation
├── validate_inference_tiff.py  # Inference data validation
├── validate_imported_model.py  # Model import validation
├── validate_dl_tiff.py      # DL denoising data validation
├── autostructn2v_wrapper.py # DL denoising (N2V/autoStructN2V)
├── filter_denoising.py      # Gaussian/NLM filter denoising
├── preprocess_stack.py      # Crop / rescale / Z preprocessing
├── stitch_align.py          # Stitching alignment
├── stitch_apply.py          # Stitching application
├── segcleanup.py            # Segmentation cleanup & quantification
├── generate_mesh.py         # 3D mesh generation
├── generate_thumbnail.py    # Thumbnail generation
├── extract_slice.py / extract_raw_slice.py  # Slice extraction
├── create_annotation_tiff.py / read_annotation_tiff.py / convert_annotations.py
├── downsample_for_web.py    # Visualization downsampling
├── tiff_stack_ops.py / tiff_validation_utils.py / convert_file.py
├── denoising/ utils/ vendor/  # Support packages (incl. vendored autoStructN2V)
```

**Core ML Script Purposes:**

| Script | Lines | Purpose | Protocol |
|--------|-------|---------|----------|
| `train_model.py` | ~400 | Train U-Net model | `PROGRESS:` |
| `run_inference.py` | ~500 | Run inference | `INFERENCE_PROGRESS:` + `FINAL_RESULT:` |
| `validate_tiff.py` | ~150 | Validate training data | JSON output |
| `validate_inference_tiff.py` | ~100 | Validate inference data | JSON output |
| `validate_imported_model.py` | ~120 | Validate imported model | JSON output |

See [Python Integration Reference](PYTHON_INTEGRATION.md) for detailed protocol documentation.

---

## Test Data (`test_data/`)

**Purpose:** Built-in sample datasets, seeded into every new workspace

```
test_data/
├── trypB_testData_training.tif      # Raw images (seeded as sample_raw.tif)
└── trypB_testData_annotations.tif   # Annotation masks (seeded as sample_annotation.tif)
```

**Usage:**
- There is no test-data checkbox flow anymore. On workspace creation, `WorkspaceManager.seedSampleData()` copies a matched raw + annotation pair into `workspaces/<sessionId>/uploads/` and registers them in `metadata.json` exactly like ordinary uploads
- Seeded samples appear in file selectors and the file browser as normal workspace files
- Pending (unapproved) users can work with the seeded samples; custom uploads require approved status

---

## Runtime Directories

### Workspaces (`workspaces/`)

**Purpose:** Per-session workspace directories - ALL user data lives here (under `DATA_DIR`)

```
workspaces/
├── <sessionId>/
│   ├── metadata.json                  # Single persistent manifest (schema 1.2.0)
│   ├── uploads/                       # User uploads + seeded samples
│   │   ├── raw/sample_raw.tif
│   │   └── annotations/sample_annotation.tif
│   ├── results/                       # Per-module result subdirectories
│   │   ├── preprocess/<id>/
│   │   ├── stitching/<id>/
│   │   ├── segcleanup/<id>/
│   │   ├── denoising/<id>/
│   │   └── segmentation/<trainingId>/
│   │       ├── inference_result.tif
│   │       ├── inference_result_metadata.json
│   │       ├── inference_result_visualization_data.json
│   │       └── original_data_downsampled.tif
│   ├── models/                        # Trained/imported models
│   │   └── segmentation/<trainingId>/
│   │       ├── best_model.pth         # Best model from training (lowest val loss)
│   │       ├── config.json            # Training config
│   │       └── results.json           # Final metrics
│   ├── annotations/                   # Saved annotations
│   ├── unfinished_annotations/        # In-progress annotation state
│   ├── .thumbnails/                   # Cache (CACHE_DIRS)
│   ├── .slices/                       # Cache
│   ├── .mesh-previews/                # Cache
│   ├── .preprocess/                   # Cache
│   └── .segcleanup/                   # Cache
└── ...
```

**Key points:**
- `metadata.json` is the **sole persistent store** for file registry, lineage and provenance (schema version 1.2.0). `loadMetadata()` runs `normalizeManifest()` on read, which upgrades legacy manifests (categories to uploads/models/results, legacy lineage shapes to canonical `{processType, processedAt, inputs[], processId}`)
- Cache directories (the shared `CACHE_DIRS` constant in `src/config/constants.js`) are excluded from ZIP export and preserved on restore
- Workspace files are served **only** via authenticated, session-scoped routes (`/workspaces/:sessionId/...` with session ownership checks in `static.routes.js`); there are no unauthenticated static mounts

**Lifecycle:**
- Created on first workspace initialization (with seeded sample data)
- Deleted by the cleanup service `RETENTION_HOURS` (48 h) after last activity, or on logout if the user confirms workspace deletion

---

### Sessions (`sessions/`)

**Purpose:** Express session file storage

```
sessions/
├── <sessionId1>.json
├── <sessionId2>.json
└── ...
```

**Format:**
```json
{
  "cookie": { ... },
  "user": { ... },
  "uploadedFiles": { ... },
  "trainingConfig": { ... },
  "currentTraining": "...",
  "importedModel": { ... }
}
```

**Lifecycle:**
- Created on login
- Updated on each request
- TTL: `RETENTION_HOURS` = 48 h (`src/config/constants.js`) - the session cookie and the workspace cleanup grace period both derive from it, so login lifetime and data lifetime match
- Deleted on logout or expiration

---

### Logs (`logs/`)

**Purpose:** Activity logging

```
logs/
└── activity.log
```

**Format:**
```
[2025-11-27 12:00:00] USER: john_doe | ACTION: login | SUCCESS: true
[2025-11-27 12:05:00] USER: john_doe | ACTION: file_upload | FILE: training.tif | SIZE: 10485760
[2025-11-27 12:10:00] USER: john_doe | ACTION: training_start | TRAINING_ID: abc123...
```

---

## Configuration Files

### package.json

**Purpose:** Node.js dependencies and scripts

```json
{
  "name": "biomed-workspace",
  "version": "1.3.0",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "socket.io": "^4.5.4",
    "multer": "^1.4.5-lts.1",
    "bcrypt": "^5.1.1",
    "archiver": "^5.3.1",
    "express-session": "^1.17.3",
    "session-file-store": "^1.5.0",
    "uuid": "^9.0.0",
    "mitt": "^3.0.0",
    "cors": "^2.8.5"
  }
}
```

**Key Dependencies:**
- `express` - Web server
- `socket.io` - Real-time communication
- `multer` - File uploads
- `bcrypt` - Password hashing
- `mitt` - Event emitter for StateManager

---

### requirements.txt

**Purpose:** Python dependencies

```
torch>=2.0.0
tifffile>=2023.7.0
numpy>=1.24.0
scikit-image>=0.21.0
tqdm>=4.65.0
```

**Key Dependencies:**
- `torch` - PyTorch ML framework
- `tifffile` - TIFF file I/O
- `numpy` - Numerical operations
- `scikit-image` - Image processing
- `tqdm` - Progress bars

---

### users.json

**Purpose:** User database

```json
{
  "users": [
    {
      "id": "1234567890abc",
      "username": "john_doe",
      "passwordHash": "$2b$10$...",
      "fullName": "John Doe",
      "email": "john@lab.edu",
      "institution": "Research Lab",
      "status": "active",
      "isAdmin": false,
      "createdAt": "2025-11-27T12:00:00.000Z"
    }
  ]
}
```

**Status Values:**
- `pending` - Awaiting approval
- `active` - Approved, full access
- `rejected` - Access denied

---

### .gitignore

**Purpose:** Exclude files from version control

```
# Dependencies
node_modules/
venv/

# Runtime directories
uploads/
models/
results/
workspaces/
sessions/

# Logs
logs/

# User data
users.json

# Environment
.env
```

---

## File Naming Conventions

### Session-Based Files

**Pattern:** `workspaces/<sessionId>/<category>/<resource>`

**Example:**
```
workspaces/9OGmrzPIrG2IIrkC6TndCsLMh6JKEdh6/uploads/1638123456789-training.tif
workspaces/9OGmrzPIrG2IIrkC6TndCsLMh6JKEdh6/models/segmentation/a1b2c3d4.../best_model.pth
```

---

### Training-Based Files

**Pattern:** `workspaces/<sessionId>/{models,results}/segmentation/<trainingId>/<resource>`

**Example:**
```
workspaces/9OGmrzPIrG2.../models/segmentation/a1b2c3d4-e5f6-7890.../best_model.pth
workspaces/9OGmrzPIrG2.../results/segmentation/a1b2c3d4-e5f6-7890.../inference_result.tif
```

---

### Timestamp-Based Files

**Pattern:** `<timestamp>-<originalname>`

**Example:**
```
1638123456789-training.tif
1638123456789-annotations.tif
```

---

### Physical Name vs Display Name

Manifest entries carry two names:
- `name` - physical filename, always `=== basename(path)` (invariant, never changes)
- `displayName` - cosmetic name shown in the UI, built as a chained provenance name (e.g. `trypB_prep_stitch.tif`); renaming a file only changes `displayName`

---

## Module Organization

### Workspace Modules

**Pattern:**
```
public/workspace/js/modules/
└── <module-name>/
    ├── <ModuleName>Module.js    # Main module class
    ├── <ModuleName>API.js       # API client (optional)
    ├── <feature1>.js            # Feature implementation
    ├── <feature2>.js            # Feature implementation
    └── css/
        └── <module-name>.css    # Module-specific styles
```

**Example (Segmentation):**
```
public/workspace/js/modules/segmentation/
├── SegmentationModule.js       # Main class
├── SegmentationAPI.js          # API client
├── training.js                 # Training UI
├── inference.js                # Inference UI
├── charts.js                   # Chart rendering
├── navigation.js               # Step navigation
├── visualization/
│   ├── main.js                 # Viz controller
│   ├── meshCreation.js         # Mesh generation
│   └── controls.js             # Viz controls
└── css/
    └── segmentation-modern.css # Module styles
```

---

## File Size Guidelines

### Development Files

| File Type | Max Size | Typical Size |
|-----------|----------|--------------|
| JavaScript | 1,000 lines | 200-500 lines |
| CSS | 500 lines | 100-300 lines |
| Python | 500 lines | 200-400 lines |
| Markdown | No limit | 500-2,000 lines |

**When to split:**
- File exceeds max size
- Multiple concerns in one file
- Hard to navigate or understand

---

### Runtime Files

| File Type | Typical Size | Max Recommended |
|-----------|--------------|-----------------|
| TIFF upload | 50-200 MB | 500 MB |
| Model (.pth) | 10-100 MB | 2 GB |
| Results TIFF | 50-200 MB | 500 MB |
| Visualization JSON | 1-10 MB | 50 MB |

---

## Path Resolution

### Absolute Paths

**Server-side (Node.js):**
```javascript
// Always build from DATA_PATHS (src/config/constants.js), never from bare __dirname
const { DATA_PATHS } = require('./src/config/constants');
const uploadDir = path.join(DATA_PATHS.workspaces, sessionId, 'uploads');
const modelPath = path.join(DATA_PATHS.workspaces, sessionId, 'models', 'segmentation', trainingId, 'best_model.pth');
```

---

### Relative Paths

**Client-side (HTML/JavaScript):**
```javascript
// Relative to public/ directory
'/workspace/js/core/StateManager.js'
'/workspace/css/workspace.css'
'/js/welcome.js'

// API calls
fetch('/api/workspace/init', ...)
```

---

### Module Imports

**ES6 modules:**
```javascript
// Relative import
import StateManager from './core/StateManager.js';

// Absolute import (from public/)
import moduleRegistry from '/workspace/js/modules/registry.js';
```

---

## Backup & Recovery

### What to Backup

**Critical:**
- `users.json` - User database
- `workspaces/` - ALL user data (uploads, models, results, annotations, manifests)
- `.env` - Configuration

**Optional:**
- `logs/` - Historical data
- `sessions/` - Ephemeral data (expires after 48 h anyway)

Users can also back up their own data via workspace ZIP export (`GET /api/workspace/download`).

---

### Cleanup Strategy

**Automated (one retention policy):**
- `CleanupService` runs every 15 minutes and deletes workspaces `RETENTION_HOURS` (48 h) after last activity
- The session cookie expires on the same 48 h schedule, so login lifetime and data lifetime match
- Logout offers workspace deletion (after a confirmation dialog); logout + login is the "session reset" (there is no `/reset-session` endpoint anymore)

**Manual:**
```bash
# Clear logs
echo "" > logs/activity.log
```

---

## Related Documentation

**Architecture:**
- [API Endpoints](API_ENDPOINTS.md) - HTTP routes and file operations
- [Python Integration](PYTHON_INTEGRATION.md) - Python script locations

**Guides:**
- [Getting Started](../guides/GETTING_STARTED.md) - Setup and installation

---

**Navigation:**
← [Python Integration](PYTHON_INTEGRATION.md) | [Documentation Index](../INDEX.md) →

---

**Status:** ✅ Complete
**Last Updated:** 2026-09-07 (v1.5.0)
