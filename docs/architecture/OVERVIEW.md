# Architecture Overview

**Last Updated:** 2025-12-19
**Status:** ✅ Complete
**Target Audience:** Developers, architects, technical stakeholders

---

## Introduction

This document provides a high-level overview of the Biomedical Image Processing Workspace system architecture. It covers the frontend architecture, core components, technology stack, data flow, and component relationships.

### What This Document Covers

- System-wide architecture and design
- Technology stack and component overview
- Data flow through the ML pipeline
- Communication patterns and protocols
- Component relationships and interactions

### Who Should Read This

- **New developers** - Understand the overall system design
- **Architects** - Evaluate design decisions and patterns
- **Continuing developers** - Reference for system-wide changes
- **AI assistants** - Gather architectural context

### Related Documentation

- [State Architecture](STATE_ARCHITECTURE.md) - State management patterns
- [Module Architecture](MODULE_ARCHITECTURE.md) - Module system design
- [Authentication](AUTHENTICATION.md) - Auth system and permissions
- [API Endpoints](../reference/API_ENDPOINTS.md) - Complete endpoint catalog
- [File Structure](../reference/FILE_STRUCTURE.md) - Codebase organization

---

## System Architecture

### High-Level Architecture

The system follows a **client-server architecture** with real-time communication capabilities and a Python-based ML backend:

```
┌─────────────────────────────────────────────────────────────┐
│                         FRONTEND                            │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Workspace (/workspace)                              │   │
│  │                                                      │   │
│  │  - Modular UI      - StateManager    - ModuleLoader  │   │
│  │  - Processing modules and Three.js viewers           │   │
│  │                                                      │   │
│  │  Auth pages: welcome.html (/), register, admin       │   │
│  └─────────────────────┬────────────────────────────────┘   │
└────────────────────────┼────────────────────────────────────┘
                         │
                         │  HTTP/WebSocket
                         │
┌────────────────────────▼────────────────────────────────────┐
│                BACKEND (Node.js - Modular)                  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  server.js (entry) → src/app.js (config)              │  │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐      │  │
│  │  │ src/routes/ │ │src/services/│ │src/helpers/ │      │  │
│  │  │ - auth      │ │ - Auth      │ │- pythonRunner│     │  │
│  │  │ - ml        │ │ - Training  │ │- validation  │     │  │
│  │  │ - workspace │ │ - Inference │ │              │     │  │
│  │  └─────────────┘ └─────────────┘ └─────────────┘      │  │
│  └─────────────┬─────────────────────────────────────────┘  │
│                │                                             │
│  ┌─────────────▼─────────────┐  ┌────────────────────────┐  │
│  │    Socket.IO Server       │  │   Session Storage      │  │
│  │  - Training rooms         │  │  - User info           │  │
│  │  - Inference rooms        │  │  - Uploaded files      │  │
│  │  - Real-time progress     │  │  - Training configs    │  │
│  └─────────────┬─────────────┘  └────────────────────────┘  │
└────────────────┼────────────────────────────────────────────┘
                 │
                 │ Process spawn
                 │
┌────────────────▼────────────────────────────────────────────┐
│              ML PIPELINE (Python/PyTorch)                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Validation   │  │   Training   │  │  Inference   │      │
│  │  Scripts     │  │   Scripts    │  │   Scripts    │      │
│  │              │  │              │  │              │      │
│  │ - TIFF valid │  │ - U-Net train│  │ - Segmentat. │      │
│  │ - Format conv│  │ - Progress   │  │ - Viz. data  │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                              │
│  Communication: JSON via stdout (PROGRESS:, FINAL_RESULT:)  │
└──────────────────────────────────────────────────────────────┘
                 │
                 │
┌────────────────▼────────────────────────────────────────────┐
│                    FILE STORAGE                             │
│  - workspaces/<sessionId>/ (manifest + uploads, models,     │
│    results); sessions/, logs/, tmp/, users.json             │
│  - test_data/ (sample stacks)                               │
└──────────────────────────────────────────────────────────────┘
```

### Frontend Architecture

The application has a **single frontend**, the Workspace (`/public/workspace/`, served at `/workspace`):
- Modular, IDE-like interface
- Module system with dynamic loading
- Centralized state management
- Processing modules (segmentation, denoising, annotation, preprocessing, stitching, mesh generation, visualization, and more)

It is complemented by a small set of standalone pages for authentication and administration: `welcome.html` (login, served at `/`), `register.html`, and `admin.html`.

**Backend components used by the frontend:**
- Express backend (modular architecture in `/src/`)
- Python ML pipeline
- Session management
- File storage system
- Authentication system

See [State Architecture](STATE_ARCHITECTURE.md) and [Module Architecture](MODULE_ARCHITECTURE.md) for details.

---

## Technology Stack

### Backend

| Technology | Version | Purpose |
|------------|---------|---------|
| **Node.js** | v16+ | Runtime environment |
| **Express** | v4.x | Web server framework |
| **Socket.IO** | v4.x | Real-time bidirectional communication |
| **express-session** | v1.x | Session management |
| **bcrypt** | v5.x | Password hashing |
| **multer** | v1.x | File upload handling |
| **uuid** | v9.x | Session and ID generation |

### Frontend

| Technology | Version | Purpose |
|------------|---------|---------|
| **Vanilla JavaScript** | ES6+ | Core frontend language (no framework) |
| **Three.js** | r150+ | 3D visualization |
| **mitt** | v3.x | Event emitter for state management (workspace) |
| **Split.js** | v1.x | Resizable panels (workspace) |
| **Chart.js** | v3.x | Training progress charts |

**Design Decision:** Vanilla JS was chosen over React/Vue/Angular for simplicity and direct Three.js integration. See [ADR-001: Vanilla JS Over Framework](../decisions/001_vanilla_js_over_framework.md).

### ML Pipeline

| Technology | Version | Purpose |
|------------|---------|---------|
| **Python** | 3.8+ | ML script runtime |
| **PyTorch** | 1.x | Deep learning framework |
| **torchvision** | 0.x | Computer vision utilities |
| **NumPy** | 1.x | Numerical computing |
| **Pillow (PIL)** | 9.x | TIFF image processing |
| **tifffile** | 2023.x | Advanced TIFF support |

### Data Formats

- **Images:** TIFF (8-bit, 16-bit grayscale or RGB)
- **Models:** PyTorch .pth files
- **Config:** JSON files
- **Communication:** JSON over HTTP/WebSocket, JSON via stdout

### Authentication

- **Strategy:** Session-based with cookies
- **Password hashing:** bcrypt
- **Authorization:** Three-tier middleware (requireAuth, requireApproved, requireAdmin)
- **User management:** JSON file storage (`users.json`)

See [Authentication Architecture](AUTHENTICATION.md) for details.

---

## Core Components

### 1. Web Server (Modular Backend)

**Purpose:** Central backend server handling all HTTP requests, WebSocket connections, and Python process management.

**Architecture:** The backend has been refactored from a monolithic ~3000-line server.js into a modular architecture:

```
server.js (~160 lines)     → Entry point, service creation, startup
└── src/
    ├── app.js (~307 lines)      → Express app configuration
    ├── routes/                  → HTTP endpoint handlers
    │   ├── static.routes.js
    │   ├── auth.routes.js
    │   ├── files.routes.js
    │   ├── workspace.routes.js
    │   ├── ml.routes.js
    │   ├── denoising.routes.js
    │   ├── annotation.routes.js
    │   ├── mesh.routes.js
    │   ├── preprocess.routes.js
    │   ├── stitching.routes.js
    │   ├── segcleanup.routes.js
    │   └── admin.routes.js
    ├── services/                → Business logic
    │   ├── AuthService.js
    │   ├── WorkspaceService.js
    │   ├── FileService.js
    │   ├── TrainingService.js
    │   ├── InferenceService.js
    │   └── SessionTracker.js
    ├── middleware/              → Express middleware
    │   ├── auth.middleware.js
    │   ├── session.middleware.js
    │   ├── upload.middleware.js
    │   └── error.middleware.js
    ├── helpers/                 → Utility functions
    │   └── pythonRunner.js (~520 lines)
    └── sockets/                 → Socket.IO handlers
        └── index.js
```

**Responsibilities:**
- Serve static files (Workspace and auth pages)
- Handle authentication and sessions
- Provide REST API (29 endpoints across route modules)
- Manage Socket.IO rooms for real-time updates
- Spawn and monitor Python processes (via pythonRunner.js)
- File upload/download handling

See [API Endpoints](../reference/API_ENDPOINTS.md) for complete endpoint documentation.

---

### 2. Workspace Frontend (`/public/workspace/`)

**Purpose:** Modular interface with an IDE-like module system; the application's only frontend.

**File Structure:**
```
/public/workspace/
├── index.html                      # Main workspace page
├── /js/
│   ├── workspace.js                # Main controller
│   ├── /core/
│   │   ├── StateManager.js         # State with mitt events
│   │   ├── ModuleLoader.js         # Dynamic module loading
│   │   └── WorkspaceAPI.js         # Backend API client
│   └── /modules/
│       ├── registry.js             # Module definitions
│       ├── segmentation/           # One directory per module
│       │   └── SegmentationModule.js
│       └── ...                     # denoising, annotation, mesh, etc.
└── /css/
    └── workspace.css               # Workspace styling
```

**Core Systems:**

**StateManager:**
- Centralized state tree
- Event-based subscriptions (mitt)
- Reactive UI updates
- See [State Architecture](STATE_ARCHITECTURE.md)

**ModuleLoader:**
- Dynamic ES6 imports
- Module lifecycle management
- Registry-based module definitions
- See [Module Architecture](MODULE_ARCHITECTURE.md)

**WorkspaceAPI:**
- Unified API client
- Category-based organization
- Consistent error handling

**Auth and admin pages:** `welcome.html`, `register.html`, and `admin.html` live directly under `/public/`, with their scripts in `/public/js/` and styles in `/public/css/`.

---

### 3. Python ML Scripts (`/python/`)

**Purpose:** Machine learning pipeline for TIFF validation, U-Net training, and inference.

**Scripts:**

| Script | Purpose | Input | Output | Protocol |
|--------|---------|-------|--------|----------|
| `validate_tiff.py` | Validate TIFF format | TIFF paths | JSON (validation result) | JSON stdout |
| `validate_imported_model.py` | Validate .pth model | .pth, .json paths | JSON (validation result) | JSON stdout |
| `train_model.py` | Train U-Net | Images, annotations, config | best_model.pth, results.json | `PROGRESS:` JSON |
| `run_inference.py` | Run inference | Model, images | Segmented TIFF, metadata | `INFERENCE_PROGRESS:`, `FINAL_RESULT:` JSON |

**Communication Protocol:**
- Structured stdout messages
- `PROGRESS:` prefix for training updates
- `INFERENCE_PROGRESS:` prefix for inference updates
- `FINAL_RESULT:` prefix for completion
- JSON payload after prefix

See [Python Integration](../reference/PYTHON_INTEGRATION.md) for complete documentation.

---

### 4. File Storage System

**Purpose:** Session-isolated file storage. There is no database: each
session owns one workspace directory, described by a single manifest.

**Directory Structure** (user data lives under `DATA_DIR`, which defaults to
the repository root):
```
DATA_DIR/
├── workspaces/<sessionId>/         # One workspace per session
│   ├── metadata.json               # Manifest: every file, its tags, lineage, voxel size
│   ├── uploads/                    # Raw stacks and annotations
│   ├── models/                     # Trained models (weights + config)
│   ├── results/                    # Module outputs (denoised, segmented, meshes, reports)
│   └── .thumbnails/, .slices/, ... # Regenerable caches (excluded from ZIP export)
├── sessions/                       # Login sessions (session-file-store)
├── logs/                           # Server and activity logs
├── tmp/                            # Scratch space for streamed uploads
└── users.json                      # User accounts (bcrypt hashes)

test_data/                          # Sample stacks, seeded into every new workspace
```

Workspaces are retained for 48 hours after last activity (the same limit as
the login session). See
[ADR-012: Workspace Data Model Consolidation](../decisions/012_workspace_data_model_consolidation.md)
for the manifest schema, provenance model and lifecycle.

**Isolation Strategy:** Session-based (not user-based)
- Each session gets unique directory
- Enables concurrent workflows for same user
- Easy cleanup on session reset
- Security: Session ID harder to guess than username

See [ADR-003: Session-Based Isolation](../decisions/003_session_based_isolation.md) for rationale.

---

## Data Flow

### Complete ML Pipeline

```
┌─────────────────────────────────────────────────────────────┐
│  STAGE 1: Upload & Validation                               │
├─────────────────────────────────────────────────────────────┤
│  1. User uploads TIFF files (training + annotations)        │
│  2. Backend saves to workspaces/<sessionId>/uploads/        │
│  3. Spawn validate_tiff.py                                  │
│  4. Validate: dimensions, dtype, class counts               │
│  5. Auto-convert 16-bit → 8-bit if needed                   │
│  6. Store paths in req.session.uploadedFiles                │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│  STAGE 2: Training Configuration                            │
├─────────────────────────────────────────────────────────────┤
│  1. User sets: patch size, learning rate, epochs, etc.      │
│  2. Backend validates configuration                         │
│  3. Store in req.session.trainingConfig                     │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│  STAGE 3: Model Training                                    │
├─────────────────────────────────────────────────────────────┤
│  1. Backend generates training_id (UUID)                    │
│  2. Client joins Socket.IO room: training-${trainingId}     │
│  3. Spawn train_model.py with config                        │
│  4. Python emits: PROGRESS:{...} every epoch                │
│  5. Server parses and broadcasts to room                    │
│  6. Client updates UI (progress bar, charts)                │
│  7. On completion: best_model.pth saved                     │
│  8. Emit: training-complete event                           │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│  STAGE 4: Inference                                         │
├─────────────────────────────────────────────────────────────┤
│  1. User uploads inference TIFF                             │
│  2. OR user imports pretrained model (.pth + .json)         │
│  3. Backend generates inference_id (UUID)                   │
│  4. Client joins Socket.IO room: inference-${inferenceId}   │
│  5. Spawn run_inference.py (1-sec delay for room join)      │
│  6. Python emits: INFERENCE_PROGRESS:{...} per slice        │
│  7. Server broadcasts to room                               │
│  8. Client updates progress bar                             │
│  9. On completion: FINAL_RESULT:{...}                       │
│  10. Save: segmented.tif, metadata.json, visualization.json │
│  11. Emit: inference-complete event                         │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│  STAGE 5: 3D Visualization                                  │
├─────────────────────────────────────────────────────────────┤
│  1. Client requests visualization.json                      │
│  2. Parse downsampled 3D point cloud                        │
│  3. Three.js renders sparse points                          │
│  4. User can load original data overlay (full resolution)   │
│  5. Interactive: rotate, zoom, class filtering              │
└─────────────────────────────────────────────────────────────┘
```

---

## Component Relationships

### Frontend ↔ Backend Communication

**HTTP REST API:**
```
Frontend              Backend
   │                    │
   │  POST /upload-data │
   ├───────────────────►│ Validate files
   │                    │ Save to session
   │  {success: true}   │
   │◄───────────────────┤
   │                    │
   │  POST /start-training
   ├───────────────────►│ Spawn Python
   │                    │ Return training_id
   │  {training_id}     │
   │◄───────────────────┤
```

**Socket.IO Real-Time:**
```
Frontend              Backend              Python
   │                    │                    │
   │ emit: join-training│                    │
   ├───────────────────►│                    │
   │                    │  spawn train_model │
   │                    ├───────────────────►│
   │                    │                    │ PROGRESS:
   │                    │◄───────────────────┤
   │ training-progress  │                    │
   │◄───────────────────┤                    │
   │ (update UI)        │                    │
```

See [Socket Protocol](../reference/SOCKET_PROTOCOL.md) for complete event documentation.

---

### Backend ↔ Python Communication

**Process Spawning:**
```javascript
const pythonProcess = spawn('python', [
  'python/train_model.py',
  trainingPath,
  annotationPath,
  outputDir,
  '--config', configJson
]);
```

**Stdout Protocol:**
```
Python stdout:
PROGRESS:{"epoch": 1, "total_epochs": 10, "metrics": {...}}
PROGRESS:{"epoch": 2, "total_epochs": 10, "metrics": {...}}
...

Node.js parsing:
const line = data.toString();
if (line.startsWith('PROGRESS:')) {
  const progress = JSON.parse(line.substring(9));
  io.to(`training-${trainingId}`).emit('training-progress', progress);
}
```

See [Python Integration](../reference/PYTHON_INTEGRATION.md) for protocol details.

---

### State Management Flow (Workspace Version)

```
User Action
   │
   ▼
UI Event Handler
   │
   ▼
StateManager.update('path.to.value', newValue)
   │
   ├─► Update internal state tree
   ├─► Emit: 'state:change' (global)
   └─► Emit: 'state:change:path.to.value' (specific)
         │
         ▼
   Subscribed Components
         │
         ▼
   Update UI (re-render)
```

**Example:**
```javascript
// User uploads file
stateManager.update('workspace.files', newFiles);

// Subscribers react
stateManager.subscribe('workspace.files', (files) => {
  updateFileBrowserUI(files);
});
```

See [State Architecture](STATE_ARCHITECTURE.md) for detailed patterns.

---

### Module System Flow (Workspace Version)

```
User clicks "Launch Module"
   │
   ▼
ModuleLoader.load(moduleId)
   │
   ├─► Look up module in registry
   ├─► Get module path
   ├─► Dynamic import: await import(modulePath)
   ├─► Instantiate: new Module(stateManager)
   ├─► Call: module.activate()
   │      │
   │      └─► Render UI in #module-view container
   │           Attach event listeners
   │           Subscribe to state changes
   │
   └─► Store as activeModule

User clicks "Back to Hub"
   │
   ▼
ModuleLoader.deactivate()
   │
   ├─► Call: module.deactivate()
   │      │
   │      └─► Clean up event listeners
   │           Clear UI container
   │           Unsubscribe from state
   │
   └─► Return to welcome view
```

See [Module Architecture](MODULE_ARCHITECTURE.md) for module system design.

---

## Security Considerations

### Authentication & Authorization

**Three-Tier System:**
1. **requireAuth** - Logged in (pending or approved)
2. **requireApproved** - Status === 'active'
3. **requireAdmin** - isAdmin === true

**User Lifecycle:**
```
Registration → Pending → Admin Review → Approved/Rejected
```

**Pending user restrictions:**
- Can use test data
- Cannot upload custom files
- Cannot import models

See [Authentication Architecture](AUTHENTICATION.md) for details.

---

### Session Security

**Measures:**
- Session-based authentication (not JWT)
- Secure cookies (HTTPS in production)
- Session secret from environment variable
- Session timeout/expiry
- bcrypt password hashing

**Session Isolation:**
- Files isolated by session ID
- No cross-session access
- Path validation on all file operations

See [ADR-003: Session-Based Isolation](../decisions/003_session_based_isolation.md).

---

### File Security

**Upload Validation:**
- File type checking (TIFF only)
- Size limits (default 200MB)
- Path traversal prevention
- Session-scoped directories

**Model Import Validation:**
- Validate .pth file structure
- Require matching .json config
- Check model architecture compatibility

---

## Deployment Considerations

### Development Setup

```bash
# Backend
npm install
npm run dev

# Python
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### Production Recommendations

**Environment:**
- Set `NODE_ENV=production`
- Use environment variable for `SESSION_SECRET`
- Enable secure cookies (`secure: true`)
- Use HTTPS (nginx reverse proxy)
- Consider Redis for session storage (instead of in-memory)

**Scaling:**
- File storage: Consider S3 or shared storage
- Session storage: Use Redis
- ML processing: Queue system for long-running jobs
- WebSocket: Consider Socket.IO Redis adapter for multi-server

**Monitoring:**
- Activity logs (`logs/activity.log`)
- Python process exit codes
- Socket.IO connection health
- File storage usage

---

## Performance Considerations

### File Upload/Download

**Current:**
- Synchronous upload handling
- Files stored on disk
- No chunking

**Optimizations:**
- Stream large files
- Implement chunked upload
- Compress TIFF files (lossless)

### ML Pipeline

**Current:**
- Synchronous Python process spawn
- One training at a time per session
- Results stored on disk

**Optimizations:**
- Background job queue
- GPU utilization monitoring
- Model caching
- Batch inference

### Real-Time Updates

**Current:**
- Socket.IO rooms per training/inference
- JSON parsing on every stdout line
- Immediate broadcast to clients

**Optimizations:**
- Throttle progress updates (e.g., max 10/sec)
- Binary protocol for large data
- Compression for visualization data

### 3D Visualization

**Current:**
- Downsampled point cloud (max 100,000 points)
- Original data available as overlay
- Client-side Three.js rendering

**Optimizations:**
- WebGL optimization
- Level-of-detail (LOD) rendering
- Progressive loading
- Worker threads for processing

---

## Future Enhancements

### Possible future directions

- Batch processing and module pipeline chaining
- Model exchange (e.g. BioImage Model Zoo)
- Chunked formats such as OME-Zarr for very large volumes

---

## Known Limitations

### Current Issues

1. **File upload category mismatch** (Phase 2)
   - Uploaded files don't appear in module dropdown
   - Missing `category` property in file metadata
   - Workaround: Use test data
   - Fix planned: Phase 3

2. **In-memory session storage**
   - Sessions lost on server restart
   - Not suitable for production
   - Fix planned: Redis integration

3. **No cleanup job**
   - Orphaned files accumulate
   - Manual cleanup required
   - Fix planned: Periodic cleanup cron

See [Troubleshooting Guide](../guides/TROUBLESHOOTING.md) for solutions.

---

## Documentation Cross-Reference

### Architecture Documentation

- [State Architecture](STATE_ARCHITECTURE.md) - State management patterns
- [Module Architecture](MODULE_ARCHITECTURE.md) - Module system design
- [Authentication](AUTHENTICATION.md) - Auth and permissions

### Reference Documentation

- [API Endpoints](../reference/API_ENDPOINTS.md) - All 29 HTTP endpoints
- [State Management](../reference/STATE_MANAGEMENT.md) - StateManager API
- [Module System](../reference/MODULE_SYSTEM.md) - ModuleLoader API
- [Socket Protocol](../reference/SOCKET_PROTOCOL.md) - Real-time events
- [Python Integration](../reference/PYTHON_INTEGRATION.md) - ML scripts
- [File Structure](../reference/FILE_STRUCTURE.md) - Codebase organization

### Architecture Decisions

- [ADR-001](../decisions/001_vanilla_js_over_framework.md) - Vanilla JS choice
- [ADR-003](../decisions/003_session_based_isolation.md) - Session isolation
- [ADR-004](../decisions/004_module_system_design.md) - Module system design

### Guides

- [Getting Started](../guides/GETTING_STARTED.md) - Installation and setup
- [Troubleshooting](../guides/TROUBLESHOOTING.md) - Common issues
- Module Creation Guide - Coming in Phase 3

---

## Quick Reference

### Key Technologies

| Component | Technology |
|-----------|-----------|
| Backend | Node.js + Express |
| Real-time | Socket.IO |
| Frontend | Vanilla JS + Three.js |
| State (Workspace) | mitt event emitter |
| ML | Python + PyTorch |
| Auth | Session-based + bcrypt |
| Storage | File system (session-isolated) |

### Key Files

| File | Purpose | Size |
|------|---------|------|
| `server.js` | Entry point, startup | ~160 lines |
| `src/app.js` | Express app config | ~307 lines |
| `src/helpers/pythonRunner.js` | Python spawning | ~520 lines |
| `public/workspace/js/workspace.js` | Workspace controller | ~400 lines |
| `public/workspace/js/core/StateManager.js` | State management | ~200 lines |
| `python/train_model.py` | U-Net training | ~300 lines |
| `python/run_inference.py` | Inference | ~250 lines |

### Key Directories

| Directory | Purpose |
|-----------|---------|
| `/src/` | Modular backend (routes, services, middleware) |
| `/public/workspace/` | Workspace frontend |
| `/python/` | ML scripts |
| `/docs/` | Documentation |
| `/workspaces/<sessionId>/` | Per-session workspace (runtime) |

---

**Navigation:**
← [Documentation Index](../INDEX.md) | [Architecture Docs](.) | [State Architecture](STATE_ARCHITECTURE.md) →

---

**Document Status:** ✅ Complete
**Last Updated:** 2025-12-19
**Maintained By:** Development Team
