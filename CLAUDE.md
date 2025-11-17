# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **biomedical image segmentation web application** that provides a complete ML pipeline for training U-Net models and running inference on TIFF image stacks, with real-time 3D visualization using Three.js.

**Tech Stack:**
- Backend: Node.js/Express with Socket.IO for real-time updates
- Frontend: Vanilla JavaScript with Three.js for 3D visualization
- ML Pipeline: Python with PyTorch for U-Net training and inference
- Authentication: Session-based with bcrypt, supports admin approval workflow

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
