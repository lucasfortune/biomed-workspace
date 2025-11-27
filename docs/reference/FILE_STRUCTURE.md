# File Structure Reference

> **Complete codebase organization and file system layout**

This document provides a comprehensive overview of the project's file structure, explaining the purpose of each directory and key files.

**Last Updated:** 2025-11-27
**Project Root:** `/home/lucas/Documents/phd/RKI_laue/viz_app/`

---

## Overview

The project uses a **dual-version architecture** with separate directories for Classic and Workspace versions, sharing a common backend.

---

## Root Directory

```
viz_app/
├── docs/                    # Documentation (comprehensive)
├── public/                  # Frontend code (dual version)
├── python/                  # ML scripts (shared by both versions)
├── test_data/               # Test datasets
├── uploads/                 # User uploads (session-specific)
├── models/                  # Trained models (session-specific)
├── results/                 # Inference results
├── workspaces/              # Workspace sessions
├── sessions/                # Express session storage
├── logs/                    # Activity logs
├── venv/                    # Python virtual environment
├── node_modules/            # Node.js dependencies
├── server.js                # Main Express server
├── WorkspaceManager.js      # Workspace management
├── activityLogger.js        # Activity logging utility
├── manageUsers.js           # User management CLI
├── users.json               # User database
├── package.json             # Node.js dependencies
├── package-lock.json        # Dependency lock file
├── requirements.txt         # Python dependencies
├── CLAUDE.md                # Development guidelines
├── README.md                # Project overview
└── .gitignore               # Git ignore rules
```

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
├── architecture/            # System architecture docs (future)
│   └── OVERVIEW.md          # Architecture overview (future)
├── sessions/                # Development session logs
│   ├── INDEX.md             # Session history index
│   ├── 2025-11-26_bugfix.md # Phase 2 bug fixes
│   ├── 2025-11-26_cleanup.md# Phase 2 cleanup
│   └── 2025-11-26_overlay_debug.md# Overlay debugging
├── decisions/               # Architecture Decision Records (future)
├── vision/                  # Project vision & roadmap (future)
├── templates/               # Documentation templates
│   ├── GUIDE_TEMPLATE.md    # Guide template
│   ├── SESSION_TEMPLATE.md  # Session log template
│   ├── ADR_TEMPLATE.md      # ADR template
│   └── API_REFERENCE_ENTRY.md# API doc template
└── archive/                 # Archived documents (future)
```

**Key Files:**
- `INDEX.md` - Start here, master navigation
- `guides/GETTING_STARTED.md` - First-time setup
- `guides/TROUBLESHOOTING.md` - Common issues
- `reference/API_ENDPOINTS.md` - All HTTP endpoints
- `sessions/INDEX.md` - Development history

---

## Frontend (`public/`)

**Purpose:** Client-side code for both application versions

```
public/
├── welcome.html             # Landing page (version selection)
├── login.html               # Login page
├── register.html            # Registration page
├── admin.html               # Admin dashboard
│
├── classic/                 # Classic version (Phase 0, stable)
│   ├── index.html           # Classic app entry
│   ├── js/
│   │   ├── app.js           # Main controller
│   │   ├── training.js      # Training logic
│   │   ├── inference.js     # Inference logic
│   │   ├── visualization.js # 3D visualization (Three.js)
│   │   ├── socket.js        # Socket.IO connection
│   │   └── fileUpload.js    # File upload handling
│   └── css/
│       └── style.css        # Classic styles
│
└── workspace/               # Workspace version (Phase 1+, modular)
    ├── index.html           # Workspace entry
    ├── js/
    │   ├── workspace.js     # Main controller
    │   ├── core/            # Core systems
    │   │   ├── StateManager.js    # State management
    │   │   ├── ModuleLoader.js    # Module system
    │   │   └── WorkspaceAPI.js    # API client
    │   └── modules/         # Processing modules
    │       ├── registry.js        # Module definitions
    │       └── segmentation/      # Segmentation module
    │           ├── SegmentationModule.js  # Module class
    │           ├── SegmentationAPI.js     # Module API client
    │           ├── training.js            # Training UI
    │           ├── inference.js           # Inference UI
    │           ├── charts.js              # Chart rendering
    │           ├── navigation.js          # Step navigation
    │           └── visualization/         # 3D visualization
    │               ├── main.js            # Viz controller
    │               ├── meshCreation.js    # Mesh generation
    │               └── controls.js        # Viz controls
    └── css/
        ├── workspace.css              # Workspace layout
        └── modules/
            └── segmentation/
                └── segmentation-modern.css  # Module styles
```

**Classic vs Workspace:**

| Aspect | Classic | Workspace |
|--------|---------|-----------|
| **Status** | Stable, complete | Phase 2 complete |
| **UI Pattern** | Single-page linear workflow | Multi-module IDE-like |
| **State** | Local variables | Centralized StateManager |
| **Modules** | Monolithic | Dynamic loading |
| **Entry Point** | `/classic` | `/workspace` |
| **File Structure** | Flat `/classic/js/` | Nested `/workspace/js/modules/` |

---

## Backend (`server.js` + utilities)

**Purpose:** Express server with session management and ML pipeline

```
viz_app/
├── server.js                # Main Express server (2,135 lines)
│   ├── Authentication (lines 142-392)
│   ├── Workspace API (lines 418-561)
│   ├── Training endpoints (lines 582-853)
│   ├── Inference endpoints (lines 856-1196)
│   ├── Download endpoints (lines 1199-1426)
│   ├── Session management (lines 1482-1646)
│   └── Socket.IO handlers (lines 1648-1668)
│
├── WorkspaceManager.js      # Workspace directory management
├── activityLogger.js        # Activity logging utility
└── manageUsers.js           # User management CLI tool
```

**Key Sections:**

### server.js Structure

**Imports & Setup (1-136):**
- Dependencies
- Multer configuration
- Session setup
- Directory creation

**Authentication Middleware (142-170):**
- `requireAuth()` - Basic auth
- `requireApproved()` - Approved users only
- `requireAdmin()` - Admin only

**User Management (176-392):**
- Helper functions
- Authentication routes
- User CRUD operations

**Workspace API (418-561):**
- `/api/workspace/init`
- `/api/workspace/status`
- `/api/workspace/files`
- `/api/workspace/upload`
- `/api/workspace/stats`

**Main Routes (564-580):**
- `/` - Welcome page
- `/classic` - Classic app
- `/workspace` - Workspace app

**ML Pipeline (582-1196):**
- Upload & validation
- Training configuration
- Training execution
- Inference execution
- Model import

**Download Routes (1199-1426):**
- Model download
- Results download
- Original data serving

**Session Management (1482-1646):**
- Session reset
- File cleanup

**Socket.IO (1648-1668):**
- Connection handling
- Room join handlers

**Helper Functions (1671-2109):**
- TIFF validation
- Training process spawning
- Inference process spawning

---

## Python Scripts (`python/`)

**Purpose:** ML operations and validation

```
python/
├── train_model.py           # U-Net training
├── run_inference.py         # Inference with progress
├── validate_tiff.py         # Training data validation
├── validate_inference_tiff.py  # Inference data validation
└── validate_imported_model.py  # Model import validation
```

**Script Purposes:**

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

**Purpose:** Built-in test datasets for users awaiting approval

```
test_data/
├── trypB_testData_training.tif      # Training images
├── trypB_testData_annotations.tif   # Annotation masks
└── trypB_testData_inference.tif     # Inference images
```

**Usage:**
- Available to all authenticated users
- No approval required
- Accessed via `isTestData: 'true'` flag in upload requests

---

## Runtime Directories

### Uploads (`uploads/`)

**Purpose:** User-uploaded files (session-isolated)

```
uploads/
├── <sessionId1>/
│   ├── timestamp-training.tif
│   ├── timestamp-annotations.tif
│   └── timestamp-inference.tif
├── <sessionId2>/
│   └── ...
└── ...
```

**Lifecycle:**
- Created on first upload
- Persists for session duration
- Deleted on session reset
- Automatic cleanup on server restart (orphaned files)

---

### Models (`models/`)

**Purpose:** Trained model storage (session + training ID)

```
models/
├── <sessionId1>/
│   ├── <trainingId1>/
│   │   ├── best_model.pth      # PyTorch checkpoint
│   │   ├── config.json         # Training config
│   │   └── results.json        # Final metrics
│   ├── <trainingId2>/
│   │   └── ...
│   └── ...
├── <sessionId2>/
│   └── ...
└── ...
```

**File Descriptions:**
- `best_model.pth` - Best model from training (lowest val loss)
- `config.json` - Configuration used for training
- `results.json` - Final epoch metrics

---

### Results (`results/`)

**Purpose:** Inference output files

```
results/
├── <trainingId>/           # Results using trained model
│   ├── inference_result.tif
│   ├── inference_result_metadata.json
│   ├── inference_result_visualization_data.json
│   └── original_data_downsampled.tif
├── imported_model_<timestamp>/  # Results using imported model
│   ├── inference_result.tif
│   ├── inference_result_metadata.json
│   ├── inference_result_visualization_data.json
│   └── original_data_downsampled.tif
└── ...
```

**File Descriptions:**
- `inference_result.tif` - Segmented TIFF stack
- `inference_result_metadata.json` - Metadata and metrics
- `inference_result_visualization_data.json` - Sparse 3D data for web viz
- `original_data_downsampled.tif` - Downsampled original for overlay

---

### Workspaces (`workspaces/`)

**Purpose:** Workspace version file organization (Phase 1+)

```
workspaces/
├── <sessionId>/
│   ├── uploads/
│   ├── models/
│   ├── results/
│   └── metadata.json
└── ...
```

**Status:** Phase 1 implemented, Phase 3 will expand

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
- TTL: 7 days
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
  "name": "biomedical-segmentation-interface",
  "version": "1.0.0",
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

**Pattern:** `<sessionId>/<resource>`

**Example:**
```
uploads/9OGmrzPIrG2IIrkC6TndCsLMh6JKEdh6/1638123456789-training.tif
models/9OGmrzPIrG2IIrkC6TndCsLMh6JKEdh6/a1b2c3d4.../best_model.pth
```

---

### Training-Based Files

**Pattern:** `<sessionId>/<trainingId>/<resource>`

**Example:**
```
models/9OGmrzPIrG2.../a1b2c3d4-e5f6-7890.../best_model.pth
results/a1b2c3d4-e5f6-7890.../inference_result.tif
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
// Always use path.join with __dirname
const uploadDir = path.join(__dirname, 'uploads', sessionId);
const modelPath = path.join(__dirname, 'models', sessionId, trainingId, 'best_model.pth');
```

---

### Relative Paths

**Client-side (HTML/JavaScript):**
```javascript
// Relative to public/ directory
'/workspace/js/core/StateManager.js'
'/classic/js/app.js'
'/css/workspace.css'

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
- `uploads/` - User data
- `models/` - Trained models
- `.env` - Configuration

**Optional:**
- `results/` - Can be regenerated
- `logs/` - Historical data
- `sessions/` - Ephemeral data

---

### Cleanup Strategy

**Automated:**
- Session files expire after 7 days
- Orphaned uploads (no session) can be cleaned manually

**Manual:**
```bash
# Remove old results (older than 30 days)
find results/ -type f -mtime +30 -delete

# Remove orphaned uploads (no active session)
# Check sessions/ directory first

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
**Last Updated:** 2025-11-27
