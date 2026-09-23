# API Endpoints Reference

> **Complete HTTP endpoint catalog for the BioMed Workspace**

This document provides comprehensive documentation for all HTTP endpoints in the application. Endpoints are organized by category for easy navigation.

**Last Updated:** 2026-01-01
**API Version:** 2.0
**Base URL:** `http://localhost:3000`

---

## Quick Navigation

| Category | Description |
|----------|-------------|
| [Authentication](#authentication-endpoints) | Login, registration, logout, and auth status |
| [Workspace API](#workspace-api-endpoints) | Workspace management, file browser, ZIP export/restore |
| [Denoising API](#denoising-api-endpoints) | DL & filter-based image denoising |
| [Annotation API](#annotation-api-endpoints) | Annotation save/load operations |
| [Mesh API](#mesh-api-endpoints) | 3D mesh generation from segmentation |
| [Admin API](#admin-api-endpoints) | User management, logs, session monitoring |
| [Main Routes](#main-routes) | Page serving and static file routes |
| [ML Pipeline - Training](#ml-pipeline-training-endpoints) | Upload data, configure training, start training |
| [ML Pipeline - Inference](#ml-pipeline-inference-endpoints) | Run inference, import models, download results |
| [Session Management](#session-management-endpoints) | Session reset and cleanup |

---

## Authentication Endpoints

### POST /register

Register a new user account.

**Authentication:** None
**Status:** ✅ Stable

#### Request

**Method:** `POST`
**Endpoint:** `/register`
**Content-Type:** `application/json`

**Body Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| username | string | Yes | Unique username (case-sensitive) |
| password | string | Yes | Password (will be hashed with bcrypt) |
| fullName | string | Yes | User's full name |
| email | string | Yes | User's email address |
| institution | string | Yes | User's institution or organization |

#### Request Example

```javascript
const response = await fetch('/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    username: "john_doe",
    password: "SecurePassword123",
    fullName: "John Doe",
    email: "john@lab.edu",
    institution: "Research Lab"
  })
});

const data = await response.json();
```

#### Response

**Success (200 OK):**
```javascript
{
  "success": true,
  "message": "Registration successful! Your account is pending approval.",
  "user": {
    "username": "john_doe",
    "fullName": "John Doe",
    "status": "pending"
  }
}
```

**Error Responses:**

| Status | Condition | Response |
|--------|-----------|----------|
| 400 | Missing required fields | `{ success: false, error: "All fields are required" }` |
| 400 | Username already exists | `{ success: false, error: "Username already exists" }` |
| 500 | Server error | `{ success: false, error: "Registration failed. Please try again." }` |

#### Behavior

- Password is hashed using bcrypt (10 salt rounds)
- New users have status `'pending'` by default
- Activity is logged via `activityLogger.logRegistration()`
- User data is stored in `users.json`
- Generates unique user ID using timestamp + random string

---

### POST /login

Authenticate user and create session.

**Authentication:** None
**Status:** ✅ Stable

#### Request

**Method:** `POST`
**Endpoint:** `/login`
**Content-Type:** `application/json`

**Body Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| username | string | Yes | Username (case-sensitive) |
| password | string | Yes | Password |

#### Request Example

```javascript
const response = await fetch('/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    username: "john_doe",
    password: "SecurePassword123"
  })
});

const data = await response.json();
```

#### Response

**Success (200 OK):**
```javascript
{
  "success": true,
  "message": "Login successful",
  "user": {
    "username": "john_doe",
    "fullName": "John Doe",
    "status": "active",
    "isAdmin": false
  },
  "redirect": "/"
}
```

**Error Responses:**

| Status | Condition | Response |
|--------|-----------|----------|
| 400 | Missing credentials | `{ success: false, error: "Username and password are required" }` |
| 401 | Invalid username | `{ success: false, error: "Invalid username or password" }` |
| 401 | Invalid password | `{ success: false, error: "Invalid username or password" }` |
| 403 | Rejected user | `{ success: false, error: "Your account has been rejected. Please contact the administrator." }` |
| 500 | Server error | `{ success: false, error: "Login failed. Please try again." }` |

#### Behavior

- Verifies password using bcrypt comparison
- Creates Express session with user data
- Activity is logged via `activityLogger.logLogin()`
- Session cookie lasts 7 days
- Rejected users cannot login
- Pending users can login but have limited access

---

### POST /logout

Destroy current session and log out user.

**Authentication:** None (but only useful if authenticated)
**Status:** ✅ Stable

#### Request

**Method:** `POST`
**Endpoint:** `/logout`

#### Response

**Success (200 OK):**
```javascript
{
  "success": true,
  "message": "Logged out successfully"
}
```

**Error (500):**
```javascript
{
  "success": false,
  "error": "Logout failed"
}
```

#### Behavior

- Destroys Express session
- Clears session cookie
- Does not delete uploaded files or models (use `/reset-session` for that)

---

### GET /check-auth

Check authentication status and retrieve current user information.

**Authentication:** None (returns authenticated: false if not logged in)
**Status:** ✅ Stable

#### Request

**Method:** `GET`
**Endpoint:** `/check-auth`

#### Response

**Authenticated:**
```javascript
{
  "authenticated": true,
  "user": {
    "username": "john_doe",
    "fullName": "John Doe",
    "email": "john@lab.edu",
    "institution": "Research Lab",
    "status": "active",
    "isAdmin": false
  }
}
```

**Not Authenticated:**
```javascript
{
  "authenticated": false
}
```

#### Use Cases

- Frontend checking if user is logged in on page load
- Conditional UI rendering based on user status
- Checking admin privileges

---

## Workspace API Endpoints

These endpoints are specific to the new workspace version of the application.

### POST /api/workspace/init

Initialize workspace for current session.

**Authentication:** `requireAuth`
**Status:** ✅ Stable (Phase 1)

#### Request

**Method:** `POST`
**Endpoint:** `/api/workspace/init`

#### Response

**Success (200 OK):**
```javascript
{
  "success": true,
  "workspace": {
    "sessionId": "abc123...",
    "initialized": true,
    "directories": {
      "root": "workspaces/abc123...",
      "uploads": "workspaces/abc123.../uploads",
      "models": "workspaces/abc123.../models",
      "results": "workspaces/abc123.../results"
    }
  }
}
```

**Error (500):**
```javascript
{
  "success": false,
  "error": "Error message"
}
```

#### Behavior

- Creates workspace directory structure for session
- Uses `WorkspaceManager.initializeWorkspace(sessionId)`
- Logs activity via `activityLogger.logActivity()`
- Idempotent (safe to call multiple times)

---

### GET /api/workspace/status

Get workspace status and file tree.

**Authentication:** `requireAuth`
**Status:** ✅ Stable (Phase 1)

#### Request

**Method:** `GET`
**Endpoint:** `/api/workspace/status`

#### Response

**Success (200 OK):**
```javascript
{
  "success": true,
  "workspace": {
    "sessionId": "abc123...",
    "initialized": true,
    "fileTree": [
      // File tree structure
    ]
  },
  "initialized": true  // Present if workspace was just created
}
```

**Error (500):**
```javascript
{
  "success": false,
  "error": "Error message"
}
```

#### Behavior

- Returns existing workspace info
- If workspace doesn't exist, automatically initializes it
- File tree currently returns empty array (Phase 3 will implement)

---

### GET /api/workspace/files

Get workspace file tree structure.

**Authentication:** `requireAuth`
**Status:** 🚧 Placeholder (Phase 3)

#### Request

**Method:** `GET`
**Endpoint:** `/api/workspace/files`

#### Response

**Success (200 OK):**
```javascript
{
  "success": true,
  "files": []  // Currently returns empty array
}
```

**Error (500):**
```javascript
{
  "success": false,
  "error": "Error message"
}
```

#### Behavior

- Currently returns empty file tree
- Phase 3 will implement categorized file organization
- Will return hierarchical file structure with metadata

---

### POST /api/workspace/upload

Upload file to workspace.

**Authentication:** `requireAuth`
**Status:** ✅ Stable (Phase 1)

#### Request

**Method:** `POST`
**Endpoint:** `/api/workspace/upload`
**Content-Type:** `multipart/form-data`

**Form Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| file | File | Yes | TIFF file to upload |
| category | string | No | File category (raw_images, annotations, inference_data). Default: 'uploads' |

#### Request Example

```javascript
const formData = new FormData();
formData.append('file', file);
formData.append('category', 'raw_images');

const response = await fetch('/api/workspace/upload', {
  method: 'POST',
  body: formData
});
```

#### Response

**Success (200 OK):**
```javascript
{
  "success": true,
  "file": {
    "name": "image.tif",
    "path": "uploads/abc123.../image.tif",
    "size": 1024000,
    "category": "raw_images",
    "uploadDate": "2025-11-27T12:00:00.000Z"
  },
  "message": "File uploaded successfully"
}
```

**Error Responses:**

| Status | Condition | Response |
|--------|-----------|----------|
| 400 | No file uploaded | `{ success: false, error: "No file uploaded" }` |
| 400 | Invalid file type | Multer error: "Only TIFF files are allowed!" |
| 400 | File too large | Multer error: "File too large (max 200MB)" |
| 500 | Server error | `{ success: false, error: "Error message" }` |

#### Behavior

- Uses multer for file handling
- Files stored in `workspaces/<sessionId>/uploads/`
- Only accepts TIFF files
- 200MB file size limit
- Logs activity via `activityLogger.logActivity()`

---

### GET /api/workspace/stats

Get workspace statistics.

**Authentication:** `requireAuth`
**Status:** ✅ Stable (Phase 1)

#### Request

**Method:** `GET`
**Endpoint:** `/api/workspace/stats`

#### Response

**Success (200 OK):**
```javascript
{
  "success": true,
  "stats": {
    "fileCount": 5,
    "totalSize": 10485760,
    "lastModified": "2025-11-27T12:00:00.000Z"
  }
}
```

**Error (500):**
```javascript
{
  "success": false,
  "error": "Error message"
}
```

#### Behavior

- Uses `WorkspaceManager.getWorkspaceStats(sessionId)`
- Returns aggregate statistics for workspace
- Used to update sidebar stats display

---

### GET /api/workspace/download

Download entire workspace as ZIP archive.

**Authentication:** `requireAuth`
**Status:** ✅ Stable (Phase 3)

#### Request

**Method:** `GET`
**Endpoint:** `/api/workspace/download`

#### Response

**Success (200 OK):** Streams ZIP file

**Content-Disposition:** `attachment; filename="workspace_<sessionId>.zip"`

**Error (500):**
```javascript
{
  "success": false,
  "error": "Error message"
}
```

#### Behavior

- Streams workspace directory as ZIP archive
- Excludes cache directories (.thumbnails, .slices, .mesh-previews)
- 10-minute timeout for large workspaces
- Uses archiver library for streaming

---

### POST /api/workspace/restore

Restore workspace from uploaded ZIP archive.

**Authentication:** `requireAuth`
**Status:** ✅ Stable (Phase 3)

#### Request

**Method:** `POST`
**Endpoint:** `/api/workspace/restore`
**Content-Type:** `multipart/form-data`

**Form Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| workspace | File | Yes | ZIP file containing workspace backup |

#### Response

**Success (200 OK):**
```javascript
{
  "success": true,
  "message": "Workspace restored successfully",
  "stats": {
    "fileCount": 15,
    "totalSize": 52428800
  }
}
```

**Error Responses:**

| Status | Condition | Response |
|--------|-----------|----------|
| 400 | No file uploaded | `{ success: false, error: "No file uploaded" }` |
| 400 | Invalid ZIP | `{ success: false, error: "Invalid ZIP file" }` |
| 400 | File too large | `{ success: false, error: "File too large (max 5GB)" }` |
| 500 | Extract error | `{ success: false, error: "Error message" }` |

#### Behavior

- Clears existing workspace before restore
- Extracts ZIP to workspace directory
- Updates session IDs in metadata files
- Regenerates thumbnails asynchronously
- 5GB file size limit
- 10-minute timeout

---

### GET /api/workspace/lineage/:fileId

Get data lineage/provenance for a file.

**Authentication:** `requireAuth`
**Status:** ✅ Stable (Phase 3)

#### Request

**Method:** `GET`
**Endpoint:** `/api/workspace/lineage/:fileId`

**Path Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| fileId | string | Yes | File identifier |

#### Response

**Success (200 OK):**
```javascript
{
  "success": true,
  "lineage": {
    "fileId": "abc123",
    "filename": "denoised_stack.tif",
    "createdAt": "2026-01-01T12:00:00.000Z",
    "sourceFiles": ["original_stack.tif"],
    "operation": "denoising",
    "parameters": { "method": "gaussian", "sigma": 1.5 },
    "children": ["segmented_stack.tif", "mesh.stl"]
  }
}
```

**Error (404):**
```javascript
{
  "success": false,
  "error": "Lineage record not found"
}
```

#### Behavior

- Returns processing history for file
- Shows source files and derived outputs
- Includes operation parameters

---

## Denoising API Endpoints

Endpoints for image denoising operations.

### POST /api/denoising/filter/process

Apply filter-based denoising (Gaussian or NLM).

**Authentication:** `requireAuth`
**Status:** ✅ Stable

#### Request

**Method:** `POST`
**Endpoint:** `/api/denoising/filter/process`
**Content-Type:** `application/json`

**Body Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| fileId | string | Yes | Input file ID |
| method | string | Yes | 'gaussian' or 'nlm' |
| sigma | number | No | Gaussian sigma (default: 1.0) |
| h | number | No | NLM filter strength (default: 10) |
| templateWindowSize | number | No | NLM template window (default: 7) |
| searchWindowSize | number | No | NLM search window (default: 21) |

#### Response

**Success (200 OK):**
```javascript
{
  "success": true,
  "result": {
    "fileId": "denoised_abc123",
    "path": "workspaces/.../results/denoised.tif",
    "processingTime": 5.2
  }
}
```

---

### POST /api/denoising/dl/start

Start deep learning denoising (N2V/autoStructN2V).

**Authentication:** `requireAuth`
**Status:** ✅ Stable

#### Request

**Method:** `POST`
**Endpoint:** `/api/denoising/dl/start`
**Content-Type:** `application/json`

**Body Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| fileId | string | Yes | Input file ID |
| method | string | Yes | 'n2v' or 'autostructn2v' |
| epochs | number | No | Training epochs (default: 100) |
| patchSize | number | No | Patch size (default: 64) |
| batchSize | number | No | Batch size (default: 8) |

#### Response

**Success (200 OK):**
```javascript
{
  "success": true,
  "denoisingId": "dn_abc123",
  "message": "Denoising started. Join WebSocket room for progress."
}
```

---

### GET /api/denoising/dl/status/:denoisingId

Get denoising session status.

**Authentication:** `requireAuth`
**Status:** ✅ Stable

#### Response

**Success (200 OK):**
```javascript
{
  "success": true,
  "status": "training",
  "stage": "stage1",
  "progress": 45,
  "currentEpoch": 45,
  "totalEpochs": 100
}
```

---

## Annotation API Endpoints

Endpoints for annotation operations.

### GET /api/annotation/raw-slice/:fileId/:sliceIndex

Get raw slice data for annotation canvas.

**Authentication:** `requireAuth`
**Status:** ✅ Stable

#### Request

**Path Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| fileId | string | Yes | TIFF file ID |
| sliceIndex | number | Yes | Slice index (0-based) |

#### Response

**Success (200 OK):** PNG image data

---

### POST /api/annotation/save-progress

Save annotation progress (sparse encoding).

**Authentication:** `requireAuth`
**Status:** ✅ Stable

#### Request

**Body Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| fileId | string | Yes | Source file ID |
| sliceIndex | number | Yes | Slice being annotated |
| annotations | object | Yes | Sparse annotation data |
| brushSize | number | No | Current brush size |
| classId | number | No | Current class ID |

#### Response

**Success (200 OK):**
```javascript
{
  "success": true,
  "message": "Progress saved"
}
```

---

### POST /api/annotation/create

Create final annotation TIFF from annotation data.

**Authentication:** `requireAuth`
**Status:** ✅ Stable

#### Request

**Body Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| fileId | string | Yes | Source file ID |
| outputName | string | No | Output filename |

#### Response

**Success (200 OK):**
```javascript
{
  "success": true,
  "result": {
    "fileId": "annotations_abc123",
    "path": "workspaces/.../annotations/result.tif"
  }
}
```

---

### GET /api/annotation/load/:fileId

Load existing annotation data for editing.

**Authentication:** `requireAuth`
**Status:** ✅ Stable

#### Response

**Success (200 OK):**
```javascript
{
  "success": true,
  "annotations": {
    "slices": { /* sparse annotation data per slice */ },
    "metadata": {
      "numClasses": 3,
      "shape": [100, 512, 512]
    }
  }
}
```

---

## Mesh API Endpoints

Endpoints for 3D mesh generation.

### GET /api/mesh/sources

Get available segmentation results for mesh generation.

**Authentication:** `requireAuth`
**Status:** ✅ Stable

#### Response

**Success (200 OK):**
```javascript
{
  "success": true,
  "sources": [
    {
      "fileId": "seg_abc123",
      "filename": "segmentation_result.tif",
      "createdAt": "2026-01-01T12:00:00.000Z",
      "numClasses": 3
    }
  ]
}
```

---

### GET /api/mesh/metadata/:fileId

Get TIFF metadata for mesh configuration.

**Authentication:** `requireAuth`
**Status:** ✅ Stable

#### Response

**Success (200 OK):**
```javascript
{
  "success": true,
  "metadata": {
    "shape": [100, 512, 512],
    "dtype": "uint8",
    "numClasses": 3,
    "classLabels": [0, 1, 2]
  }
}
```

---

### POST /api/mesh/generate

Start mesh generation from segmentation.

**Authentication:** `requireAuth`
**Status:** ✅ Stable

#### Request

**Body Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| fileId | string | Yes | Segmentation file ID |
| classId | number | Yes | Class to extract mesh for |
| smoothing | number | No | Smoothing iterations (default: 10) |
| simplifyRatio | number | No | Mesh simplification (default: 0.5) |

#### Response

**Success (200 OK):**
```javascript
{
  "success": true,
  "generationId": "mesh_abc123",
  "message": "Mesh generation started"
}
```

---

### GET /api/mesh/status/:generationId

Get mesh generation status.

**Authentication:** `requireAuth`
**Status:** ✅ Stable

#### Response

**Success (200 OK):**
```javascript
{
  "success": true,
  "status": "completed",
  "progress": 100,
  "result": {
    "meshPath": "workspaces/.../meshes/mesh.stl",
    "vertexCount": 50000,
    "faceCount": 100000
  }
}
```

---

### GET /api/mesh/download/:generationId

Download generated mesh file.

**Authentication:** `requireAuth`
**Status:** ✅ Stable

#### Response

**Success (200 OK):** STL file download

---

## Admin API Endpoints

Endpoints for admin dashboard and user management.

### GET /admin/users

List all users with optional status filter.

**Authentication:** `requireAdmin`
**Status:** ✅ Stable

#### Request

**Query Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| status | string | No | Filter by status: 'pending', 'active', 'rejected' |

#### Response

**Success (200 OK):**
```javascript
{
  "success": true,
  "users": [
    {
      "username": "john_doe",
      "fullName": "John Doe",
      "email": "john@lab.edu",
      "institution": "Research Lab",
      "status": "pending",
      "createdAt": "2026-01-01T10:00:00.000Z",
      "isAdmin": false
    }
  ]
}
```

---

### POST /admin/approve-user

Approve a pending user.

**Authentication:** `requireAdmin`
**Status:** ✅ Stable

#### Request

**Body Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| username | string | Yes | Username to approve |

#### Response

**Success (200 OK):**
```javascript
{
  "success": true,
  "message": "User approved successfully"
}
```

---

### POST /admin/reject-user

Reject a pending user.

**Authentication:** `requireAdmin`
**Status:** ✅ Stable

#### Request

**Body Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| username | string | Yes | Username to reject |
| reason | string | No | Rejection reason |

#### Response

**Success (200 OK):**
```javascript
{
  "success": true,
  "message": "User rejected"
}
```

---

### GET /admin/logs

Get activity logs with filtering.

**Authentication:** `requireAdmin`
**Status:** ✅ Stable

#### Request

**Query Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| username | string | No | Filter by username |
| action | string | No | Filter by action type |
| startDate | string | No | ISO date string |
| endDate | string | No | ISO date string |
| limit | number | No | Max results (default: 100) |

#### Response

**Success (200 OK):**
```javascript
{
  "success": true,
  "logs": [
    {
      "timestamp": "2026-01-01T12:00:00.000Z",
      "username": "john_doe",
      "action": "training_started",
      "details": { "trainingId": "abc123" }
    }
  ]
}
```

---

### GET /admin/active-sessions

Get all active processing sessions.

**Authentication:** `requireAdmin`
**Status:** ✅ Stable

#### Response

**Success (200 OK):**
```javascript
{
  "success": true,
  "sessions": {
    "training": [
      { "id": "tr_123", "username": "john", "status": "running", "progress": 45 }
    ],
    "inference": [],
    "denoising": [
      { "id": "dn_456", "username": "jane", "status": "running", "stage": "stage2" }
    ],
    "mesh": []
  }
}
```

---

## Main Routes

These routes serve HTML pages and static files.

### GET /

Serve welcome page (landing page for version selection).

**Authentication:** None
**Status:** ✅ Stable

#### Request

**Method:** `GET`
**Endpoint:** `/`

#### Response

Serves `public/welcome.html`

---

### GET /classic

Serve classic application interface.

**Authentication:** `requireAuth`
**Status:** ✅ Stable

#### Request

**Method:** `GET`
**Endpoint:** `/classic`

#### Response

Serves `public/classic/index.html`

**Note:** Requires authentication. Redirects to login if not authenticated.

---

### GET /workspace

Serve workspace application interface.

**Authentication:** `requireAuth`
**Status:** ✅ Stable (Phase 2)

#### Request

**Method:** `GET`
**Endpoint:** `/workspace`

#### Response

Serves `public/workspace/index.html`

**Note:** Requires authentication. Redirects to login if not authenticated.

---

### GET /login

Serve login page.

**Authentication:** None
**Status:** ✅ Stable

#### Request

**Method:** `GET`
**Endpoint:** `/login`

#### Response

Serves `public/login.html`

---

### GET /register

Serve registration page.

**Authentication:** None
**Status:** ✅ Stable

#### Request

**Method:** `GET`
**Endpoint:** `/register`

#### Response

Serves `public/register.html`

---

### GET /admin

Serve admin dashboard.

**Authentication:** `requireAdmin`
**Status:** ✅ Stable

#### Request

**Method:** `GET`
**Endpoint:** `/admin`

#### Response

Serves `public/admin.html`

**Note:** Requires admin privileges. Returns 403 if not admin.

---

### GET /test_data/:filename

Serve test data files.

**Authentication:** `requireAuth`
**Status:** ✅ Stable

#### Request

**Method:** `GET`
**Endpoint:** `/test_data/:filename`

**Path Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| filename | string | Yes | Name of test data file |

**Available Files:**
- `trypB_testData_training.tif`
- `trypB_testData_annotations.tif`
- `trypB_testData_inference.tif`

#### Response

**Success (200 OK):** Sends TIFF file

**Error (404):**
```
Test file not found
```

---

## ML Pipeline: Training Endpoints

These endpoints handle the training workflow in the classic application.

### POST /upload-data

Upload and validate training data (images + annotations).

**Authentication:** None (but checks approval status inline)
**Status:** ✅ Stable

#### Request

**Method:** `POST`
**Endpoint:** `/upload-data`
**Content-Type:** `multipart/form-data`

**Form Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| raw_images | File | Yes* | 3D TIFF stack of training images |
| annotations | File | Yes* | 3D TIFF stack of annotation masks |
| isTestData | string | No | Set to 'true' to use test data instead of uploading |

*Not required if `isTestData: 'true'`

#### Request Example

**Custom Data Upload:**
```javascript
const formData = new FormData();
formData.append('raw_images', rawImagesFile);
formData.append('annotations', annotationsFile);

const response = await fetch('/upload-data', {
  method: 'POST',
  body: formData
});
```

**Test Data:**
```javascript
const formData = new FormData();
formData.append('isTestData', 'true');

const response = await fetch('/upload-data', {
  method: 'POST',
  body: formData
});
```

#### Response

**Success (200 OK):**
```javascript
{
  "success": true,
  "message": "Files uploaded and validated successfully",
  "validation": {
    "valid": true,
    "raw_images": {
      "shape": [100, 512, 512],
      "dtype": "uint8"
    },
    "annotations": {
      "shape": [100, 512, 512],
      "dtype": "uint8"
    },
    "num_classes": 3,
    "class_counts": {
      "0": 50000,
      "1": 30000,
      "2": 20000
    }
  },
  "isTestData": false
}
```

**Error Responses:**

| Status | Condition | Response |
|--------|-----------|----------|
| 400 | Missing files | `{ error: "Both raw images and annotations are required" }` |
| 400 | Validation failed | `{ error: "TIFF validation failed", details: "..." }` |
| 403 | Not approved (custom data) | `{ error: "Custom data upload requires account approval", status: "pending", message: "You can use test data while waiting for approval" }` |
| 500 | Server error | `{ error: "Error message", isTestData: false }` |

#### Behavior

- **Custom uploads:** Requires `status: 'active'` (approved users only)
- **Test data:** Available to all authenticated users (including pending)
- Files stored in `workspaces/<sessionId>/uploads/`
- Validation via `python/validate_tiff.py`
- May auto-convert 16-bit annotations to 8-bit
- Detects number of classes from annotation masks
- Stores file paths and validation results in `req.session.uploadedFiles`
- Logs activity via `activityLogger.logFileUpload()`

---

### POST /configure-training

Configure training parameters.

**Authentication:** None
**Status:** ✅ Stable

#### Request

**Method:** `POST`
**Endpoint:** `/configure-training`
**Content-Type:** `application/json`

**Body Parameters:**

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| patch_size | number | Yes | - | Size of patches extracted from images (64-1024) |
| patches_per_image | number | Yes | - | Number of patches per image |
| batch_size | number | Yes | - | Training batch size |
| num_epochs | number | Yes | - | Number of training epochs |
| learning_rate | number | Yes | - | Learning rate (0-1) |
| features | number | Yes | - | Number of features in first layer |
| num_layers | number | Yes | - | Number of U-Net layers |

#### Request Example

```javascript
const response = await fetch('/configure-training', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    patch_size: 256,
    patches_per_image: 100,
    batch_size: 4,
    num_epochs: 10,
    learning_rate: 0.001,
    features: 32,
    num_layers: 4
  })
});
```

#### Response

**Success (200 OK):**
```javascript
{
  "success": true,
  "message": "Training configuration saved",
  "config": {
    "patch_size": 256,
    "patches_per_image": 100,
    "batch_size": 4,
    "num_epochs": 10,
    "learning_rate": 0.001,
    "features": 32,
    "num_layers": 4
  }
}
```

**Error (400):**
```javascript
{
  "error": "Invalid configuration",
  "details": [
    "patch_size must be between 64 and 1024",
    "learning_rate must be between 0 and 1"
  ]
}
```

#### Behavior

- Validates all parameters via `validateTrainingConfig()`
- Stores config in `req.session.trainingConfig`
- Does not start training (use `/start-training` for that)
- Config persists for session duration

**Validation Rules:**
- `patch_size`: 64-1024
- `learning_rate`: 0-1 (exclusive)
- All fields required

---

### POST /start-training

Start model training with configured parameters.

**Authentication:** `requireAuth`
**Status:** ✅ Stable

#### Request

**Method:** `POST`
**Endpoint:** `/start-training`

**Prerequisites:**
- Must have called `/upload-data` successfully
- Must have called `/configure-training` successfully

#### Response

**Success (200 OK):**
```javascript
{
  "success": true,
  "training_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "message": "Training started successfully"
}
```

**Error Responses:**

| Status | Condition | Response |
|--------|-----------|----------|
| 400 | Missing data/config | `{ error: "Missing uploaded files or configuration" }` |
| 403 | Not approved (custom data) | `{ error: "Training with custom data requires account approval", status: "pending", message: "You can train models with test data while waiting for approval" }` |
| 500 | Server error | `{ error: "Error message" }` |

#### Behavior

- Generates unique `training_id` (UUID v4)
- Creates output directory: `workspaces/<sessionId>/models/segmentation/<trainingId>/`
- Adds `num_classes` from validation to config
- Stores training session in `trainingSessions` Map
- Spawns `python/train_model.py` process
- Logs activity via `activityLogger.logTrainingStart()`
- **Real-time updates via Socket.IO:** Client must join `training-${trainingId}` room

**Training Process:**
1. Client receives `training_id`
2. Client joins Socket.IO room: `training-${trainingId}`
3. Server emits `training-progress` events with metrics
4. Server emits `training-complete` event when done
5. Model saved to `workspaces/<sessionId>/models/segmentation/<trainingId>/best_model.pth`

**Approval Check:**
- Test data training: Available to all users
- Custom data training: Requires `status: 'active'`

---

### GET /training-status/:trainingId

Get current status of training session.

**Authentication:** `requireAuth`
**Status:** ✅ Stable

#### Request

**Method:** `GET`
**Endpoint:** `/training-status/:trainingId`

**Path Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| trainingId | string | Yes | UUID of training session |

#### Response

**Success (200 OK):**
```javascript
{
  "sessionId": "abc123...",
  "username": "john_doe",
  "fullName": "John Doe",
  "status": "training",  // 'starting' | 'training' | 'completed' | 'failed'
  "startTime": "2025-11-27T12:00:00.000Z",
  "endTime": "2025-11-27T12:15:00.000Z",  // Only present when completed/failed
  "current_epoch": 5,
  "total_epochs": 10,
  "metrics": {
    "train_loss": 0.123,
    "val_loss": 0.145,
    "train_accuracy": 0.95,
    "val_accuracy": 0.93
  },
  "params": { /* training parameters */ },
  "isTestData": false
}
```

**Error (404):**
```javascript
{
  "error": "Training session not found"
}
```

#### Behavior

- Retrieves training session from `trainingSessions` Map
- Session persists until server restart or session reset
- Does not provide real-time updates (use Socket.IO for that)

---

## ML Pipeline: Inference Endpoints

These endpoints handle inference and model import.

### POST /upload-inference

Upload data for inference.

**Authentication:** `requireAuth`
**Status:** ✅ Stable

#### Request

**Method:** `POST`
**Endpoint:** `/upload-inference`
**Content-Type:** `multipart/form-data`

**Form Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| inference_data | File | Yes* | 3D TIFF stack for inference |
| isTestData | string | No | Set to 'true' to use test data |

*Not required if `isTestData: 'true'`

#### Request Example

**Custom Data:**
```javascript
const formData = new FormData();
formData.append('inference_data', inferenceFile);

const response = await fetch('/upload-inference', {
  method: 'POST',
  body: formData
});
```

**Test Data:**
```javascript
const formData = new FormData();
formData.append('isTestData', 'true');

const response = await fetch('/upload-inference', {
  method: 'POST',
  body: formData
});
```

#### Response

**Success (200 OK):**
```javascript
{
  "success": true,
  "message": "Inference data uploaded successfully",
  "file_path": "uploads/abc123.../inference.tif",
  "validation": {
    "valid": true,
    "shape": [50, 512, 512],
    "dtype": "uint8"
  },
  "isTestData": false
}
```

**Error Responses:**

| Status | Condition | Response |
|--------|-----------|----------|
| 400 | No file provided | `{ error: "No file provided for inference" }` |
| 400 | Validation failed | `{ error: "TIFF validation failed", details: "..." }` |
| 403 | Not approved (custom data) | `{ error: "Custom inference data upload requires account approval", status: "pending", message: "You can use test data while waiting for approval" }` |
| 500 | Server error | `{ error: "Error message", isTestData: false }` |

#### Behavior

- Custom uploads require `status: 'active'`
- Test data available to all authenticated users
- Files stored in `workspaces/<sessionId>/uploads/`
- Validation via `python/validate_inference_tiff.py`
- File path stored in response (not in session)

---

### POST /import-pretrained-model

Import pre-trained PyTorch model and configuration.

**Authentication:** `requireApproved`
**Status:** ✅ Stable

#### Request

**Method:** `POST`
**Endpoint:** `/import-pretrained-model`
**Content-Type:** `multipart/form-data`

**Form Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| model_file | File | Yes | PyTorch model file (.pth) |
| config_file | File | Yes | JSON configuration file |

#### Request Example

```javascript
const formData = new FormData();
formData.append('model_file', modelFile);
formData.append('config_file', configFile);

const response = await fetch('/import-pretrained-model', {
  method: 'POST',
  body: formData
});
```

#### Response

**Success (200 OK):**
```javascript
{
  "success": true,
  "message": "Model and config validated successfully",
  "validation": {
    "model_info": "Valid PyTorch model (50.2 MB)",
    "config_info": "Valid configuration with 32 features, 4 layers"
  }
}
```

**Error Responses:**

| Status | Condition | Response |
|--------|-----------|----------|
| 400 | Missing files | `{ success: false, error: "Both model file (.pth) and config file (.json) are required." }` |
| 400 | Wrong file extension | `{ success: false, error: "Model file must be a .pth file." }` |
| 400 | Validation failed | `{ success: false, error: "Validation error message" }` |
| 403 | Not approved | `{ error: "Account approval required" }` |
| 500 | Server error | `{ success: false, error: "Server error during model import: ..." }` |

#### Behavior

- **Requires approved status** (`status: 'active'`)
- Files stored in `workspaces/<sessionId>/uploads/`
- 2GB file size limit for models
- Validation via `python/validate_imported_model.py`
- Stores model info in `req.session.importedModel`
- Imported model takes precedence over trained models in `/run-inference`

**File Requirements:**
- Model file must be `.pth` (PyTorch state dict)
- Config file must be `.json` with required fields
- Config must match model architecture

---

### GET /verify-imported-model

Verify imported model is still valid in session.

**Authentication:** None
**Status:** ✅ Stable

#### Request

**Method:** `GET`
**Endpoint:** `/verify-imported-model`

#### Response

**Success (200 OK):**
```javascript
{
  "success": true,
  "modelInfo": {
    "model_size": "50.2 MB",
    "config": {
      "features": 32,
      "num_layers": 4,
      "num_classes": 3
    }
  }
}
```

**Error Responses:**

| Status | Condition | Response |
|--------|-----------|----------|
| 400 | No imported model | `{ success: false, error: "No valid imported model found in session" }` |
| 400 | Files deleted | `{ success: false, error: "Imported model files no longer exist" }` |
| 500 | Server error | `{ success: false, error: "Server error during model verification" }` |

#### Behavior

- Checks `req.session.importedModel`
- Verifies files still exist on disk
- Does not re-validate model structure

---

### POST /run-inference

Run inference on uploaded data using trained or imported model.

**Authentication:** None
**Status:** ✅ Stable

#### Request

**Method:** `POST`
**Endpoint:** `/run-inference`
**Content-Type:** `application/json`

**Body Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| model_path | string | No | Path to model (usually not provided) |
| data_path | string | Yes | Path to inference data |
| output_path | string | No | Path for output (auto-generated if not provided) |
| training_id | string | No* | Training session ID (for trained models) |

*Required only if no imported model in session

#### Request Example

```javascript
const response = await fetch('/run-inference', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    data_path: "uploads/abc123.../inference.tif",
    training_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
  })
});
```

#### Response

**Success (200 OK):**
```javascript
{
  "success": true,
  "inference_id": "x1y2z3...",
  "status": "starting",
  "message": "Inference request accepted. Join the WebSocket room for progress updates.",
  "model_info": "Using trained model"  // or "Using imported model"
}
```

**Error Responses:**

| Status | Condition | Response |
|--------|-----------|----------|
| 400 | No model found | `{ error: "No imported model found and training session not found or invalid training_id provided", training_id: "...", available_sessions: [...] }` |
| 404 | Model file missing | `{ error: "Model file not found. Training may not have completed successfully.", details: "Expected: ..." }` |
| 500 | Server error | `{ error: "Error message" }` |

#### Behavior

**Model Selection:**
1. Checks `req.session.importedModel` first (imported model takes precedence)
2. If no imported model, uses trained model from `training_id`
3. Verifies model file exists before starting

**Output Path Generation:**
- Imported models: `results/imported_model_<timestamp>/inference_result.tif`
- Trained models: `results/<trainingId>/inference_result.tif`

**Real-time Updates via Socket.IO:**
1. Client receives `inference_id`
2. Client joins Socket.IO room: `inference-${inferenceId}`
3. **1-second delay before starting** (allows client to join room)
4. Server emits `inference-progress` events
5. Server emits `inference-complete` event with result

**Inference Session:**
- Stored in `inferenceSessions` Map
- Contains session ID, username, progress, result
- Logs activity via `activityLogger.logInferenceStart()`

**Output Files:**
- `inference_result.tif` - Segmented TIFF stack
- `inference_result_metadata.json` - Metadata and metrics
- `inference_result_visualization_data.json` - 3D visualization data

---

### GET /inference-status/:inferenceId

Get current status of inference session.

**Authentication:** `requireAuth`
**Status:** ✅ Stable

#### Request

**Method:** `GET`
**Endpoint:** `/inference-status/:inferenceId`

**Path Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| inferenceId | string | Yes | UUID of inference session |

#### Response

**Success (200 OK):**
```javascript
{
  "sessionId": "abc123...",
  "username": "john_doe",
  "fullName": "John Doe",
  "status": "running",  // 'starting' | 'running' | 'completed' | 'failed'
  "startTime": "2025-11-27T12:00:00.000Z",
  "endTime": "2025-11-27T12:02:00.000Z",  // Only present when completed/failed
  "progress": 75,
  "currentSlice": 75,
  "totalSlices": 100,
  "usingImportedModel": false,
  "result": {  // Only present when completed
    "success": true,
    "output_path": "results/training_id/inference_result.tif",
    "metadata_path": "results/training_id/inference_result_metadata.json",
    "visualization_path": "results/training_id/inference_result_visualization_data.json",
    "metrics": { /* ... */ }
  }
}
```

**Error (404):**
```javascript
{
  "error": "Inference session not found"
}
```

#### Behavior

- Retrieves inference session from `inferenceSessions` Map
- Session persists until server restart or session reset
- Does not provide real-time updates (use Socket.IO for that)

---

### GET /download-model/:trainingId

Download trained model as zip archive.

**Authentication:** `requireAuth`
**Status:** ✅ Stable

#### Request

**Method:** `GET`
**Endpoint:** `/download-model/:trainingId`

**Path Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| trainingId | string | Yes | UUID of training session |

#### Response

**Success (200 OK):** ZIP file download

**Zip Contents:**
- `best_model.pth` - Trained PyTorch model
- `training_config.json` - Configuration used for training
- `training_results.json` - Final metrics
- `README.md` - Instructions for loading the model

**Error Responses:**

| Status | Condition | Response |
|--------|-----------|----------|
| 404 | Training not found | `{ error: "Model not found or training not completed" }` |
| 404 | Model file missing | `{ error: "Model file not found" }` |
| 500 | Archive error | `{ error: "Failed to create archive" }` |

#### Behavior

- Only available for completed trainings
- Creates zip archive on-the-fly using `archiver`
- Filename: `trained_model_<trainingId_prefix>.zip`
- Includes README with loading instructions

---

### GET /download-inference-results/:inferenceId

Download inference results as zip archive.

**Authentication:** `requireAuth`
**Status:** ✅ Stable

#### Request

**Method:** `GET`
**Endpoint:** `/download-inference-results/:inferenceId`

**Path Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| inferenceId | string | Yes | UUID of inference session |

#### Response

**Success (200 OK):** ZIP file download

**Zip Contents:**
- `inference_result.tif` - Segmented TIFF stack
- `inference_result_metadata.json` - Metadata and metrics
- `inference_result_visualization_data.json` - 3D visualization data
- `README.md` - Usage instructions and file descriptions

**Error Responses:**

| Status | Condition | Response |
|--------|-----------|----------|
| 404 | Inference not found | `{ error: "Inference results not found or inference not completed", available_sessions: [...] }` |
| 404 | Result data missing | `{ error: "Inference result data not found" }` |
| 404 | Result file missing | `{ error: "Segmentation result file not found", path: "..." }` |
| 500 | Archive error | `{ error: "Failed to create archive: ..." }` |

#### Behavior

- Only available for completed inferences
- Creates zip archive on-the-fly using `archiver`
- Filename: `segmentation_results_<timestamp>.zip`
- Includes README with ImageJ and Python usage examples
- Includes all generated files (segmentation, metadata, visualization)

---

### GET /results/:inferenceId/original-data-web

Serve downsampled original data for visualization overlay.

**Authentication:** `requireAuth`
**Status:** ✅ Stable

#### Request

**Method:** `GET`
**Endpoint:** `/results/:inferenceId/original-data-web`

**Path Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| inferenceId | string | Yes | UUID of inference session |

#### Response

**Success (200 OK):** TIFF file (downsampled)

**Error Responses:**

| Status | Condition | Response |
|--------|-----------|----------|
| 404 | Inference not found | `{ error: "Inference session not found or incomplete", inferenceId: "..." }` |
| 404 | Metadata missing | `{ error: "Metadata file not found" }` |
| 404 | Overlay not generated | `{ error: "Downsampled original data not available for this inference", message: "Original data overlay was not generated during inference" }` |
| 404 | File missing | `{ error: "Downsampled original data file not found" }` |
| 500 | Server error | `{ error: "Failed to serve original data" }` |

#### Behavior

- Reads inference metadata to get downsampled data path
- Downsampled data generated during inference by Python script
- Used for "Original Data Overlay" toggle in 3D visualization
- File is much smaller than original (downsampled for web performance)

---

## Session Management Endpoints

### POST /reset-session

> **Removed.** This endpoint no longer exists on the server; the section is
> kept for reference only. Workspace files are now cleared through the
> workspace endpoints and the 48-hour retention policy (ADR-012).

Reset session and delete all associated files.

**Authentication:** `requireAuth`
**Status:** ❌ Removed

#### Request

**Method:** `POST`
**Endpoint:** `/reset-session`

#### Response

**Success (200 OK):**
```javascript
{
  "success": true,
  "message": "Session reset successfully",
  "cleanupSummary": {
    "trainingSessions": 2,
    "inferenceSessions": 1
  }
}
```

**Error (500):**
```javascript
{
  "success": false,
  "error": "Failed to destroy session"
}
```

#### Behavior

**Cleanup Actions:**
1. Deletes `workspaces/<sessionId>/uploads/` directory
2. Deletes `workspaces/<sessionId>/models/` directory
3. Deletes `outputs/<sessionId>/` directory
4. Deletes all `results/<trainingId>/` directories for this session
5. Deletes inference results directories
6. Removes training sessions from `trainingSessions` Map
7. Removes inference sessions from `inferenceSessions` Map
8. Destroys Express session

**Cleanup is comprehensive:**
- All uploaded files deleted
- All trained models deleted
- All inference results deleted
- All in-memory session data removed
- Session cookie cleared

**Use Cases:**
- User wants to start fresh
- Clean up before logout
- Testing and development

---

## Socket.IO Events

The application uses Socket.IO for real-time updates during training and inference.

### Connection Events

**Client connects:**
```javascript
socket.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
});
```

**Client disconnects:**
```javascript
socket.on('disconnect', () => {
  console.log('Client disconnected');
});
```

### Training Events

**Join training room:**
```javascript
// Client emits:
socket.emit('join-training', trainingId);

// Server logs:
// "Client ${socket.id} joined training room: training-${trainingId}"
```

**Training progress:**
```javascript
// Server emits to room:
io.to(`training-${trainingId}`).emit('training-progress', {
  epoch: 5,
  total_epochs: 10,
  metrics: {
    train_loss: 0.123,
    val_loss: 0.145,
    train_accuracy: 0.95,
    val_accuracy: 0.93
  }
});
```

**Training complete:**
```javascript
// Server emits to room:
io.to(`training-${trainingId}`).emit('training-complete', {
  success: true  // or false if failed
});
```

### Inference Events

**Join inference room:**
```javascript
// Client emits:
socket.emit('join-inference', inferenceId);

// Server confirms:
socket.emit('inference-room-joined', {
  inferenceId: inferenceId
});
```

**Inference progress:**
```javascript
// Server emits to room:
io.to(`inference-${inferenceId}`).emit('inference-progress', {
  current_slice: 50,
  total_slices: 100,
  progress_percent: 50
});
```

**Inference complete:**
```javascript
// Server emits to room:
io.to(`inference-${inferenceId}`).emit('inference-complete', {
  success: true,
  result: {
    output_path: "...",
    metadata_path: "...",
    visualization_path: "...",
    metrics: { /* ... */ }
  }
});
```

---

## Authentication Middleware

The application uses three levels of authentication middleware:

### requireAuth

Basic authentication - allows pending & approved users.

```javascript
function requireAuth(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  res.status(401).json({ error: 'Authentication required', authenticated: false });
}
```

**Used by:**
- Most authenticated routes
- Allows pending users (limited access)

### requireApproved

Requires approved status - full access.

```javascript
function requireApproved(req, res, next) {
  if (req.session && req.session.user && req.session.user.status === 'active') {
    return next();
  }
  res.status(403).json({ error: 'Account approval required' });
}
```

**Used by:**
- `/import-pretrained-model`
- Operations requiring full permissions

### requireAdmin

Admin-only access.

```javascript
function requireAdmin(req, res, next) {
  if (req.session && req.session.user && req.session.user.isAdmin) {
    return next();
  }
  res.status(403).json({ error: 'Admin access required' });
}
```

**Used by:**
- `GET /admin` (admin dashboard)
- Admin management operations

---

## Error Handling

### Multer Errors

File upload errors are handled by error middleware:

```javascript
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large (max 200MB)' });
    }
  }
  res.status(500).json({ error: error.message });
});
```

**Common Multer Errors:**
- `LIMIT_FILE_SIZE` - File exceeds 200MB limit
- `LIMIT_FILE_COUNT` - Too many files
- `LIMIT_UNEXPECTED_FILE` - Unexpected field name

### File Type Validation

TIFF uploads are validated by multer filter:

```javascript
fileFilter: (req, file, cb) => {
  if (file.mimetype === 'image/tiff' || file.originalname.toLowerCase().endsWith('.tif')) {
    cb(null, true);
  } else {
    cb(new Error('Only TIFF files are allowed!'), false);
  }
}
```

---

## Static File Serving

The application serves static files from multiple directories:

| Path | Directory | Description |
|------|-----------|-------------|
| `/` | `public/` | HTML, CSS, JS files |
| `/uploads` | `uploads/` | User-uploaded TIFF files |
| `/results` | `results/` | Inference results |
| `/models` | `models/` | Trained model files |

**Important:** All static file routes require authentication (handled by middleware).

---

## Python Integration

The application spawns Python processes for ML operations. Communication is via structured stdout messages.

### Training Process

**Spawn:**
```javascript
spawn(PYTHON_PATH, [
  'python/train_model.py',
  '--config', JSON.stringify(params.config),
  '--raw_images', params.raw_images,
  '--annotations', params.annotations,
  '--output_dir', params.output_dir,
  '--training_id', params.training_id
]);
```

**Progress Protocol:**
```
PROGRESS:{"epoch": 1, "total_epochs": 10, "metrics": {...}}
```

### Inference Process

**Spawn:**
```javascript
spawn(PYTHON_PATH, [
  'python/run_inference.py',
  '--model', modelPath,
  '--input', dataPath,
  '--output', outputPath,
  '--inference_id', inferenceId
]);
```

**Progress Protocol:**
```
INFERENCE_PROGRESS:{"current_slice": 50, "total_slices": 100, "progress_percent": 50}
FINAL_RESULT:{"success": true, "output_path": "...", "metadata_path": "...", ...}
```

---

## Session Data Structure

### req.session Properties

| Property | Type | Description |
|----------|------|-------------|
| `user` | object | Current user information |
| `uploadedFiles` | object | Uploaded training data paths and validation |
| `trainingConfig` | object | Training configuration parameters |
| `currentTraining` | string | Current training ID |
| `importedModel` | object | Imported model paths and validation |

### uploadedFiles Structure

```javascript
req.session.uploadedFiles = {
  raw_images: "uploads/abc123.../training.tif",
  annotations: "uploads/abc123.../annotations.tif",
  validation: {
    valid: true,
    raw_images: { shape: [100, 512, 512], dtype: "uint8" },
    annotations: { shape: [100, 512, 512], dtype: "uint8" },
    num_classes: 3,
    class_counts: { "0": 50000, "1": 30000, "2": 20000 }
  },
  isTestData: false
};
```

### importedModel Structure

```javascript
req.session.importedModel = {
  modelPath: "uploads/abc123.../model.pth",
  configPath: "uploads/abc123.../config.json",
  validated: true,
  validation: {
    success: true,
    model_size: "50.2 MB",
    config: {
      features: 32,
      num_layers: 4,
      num_classes: 3
    }
  }
};
```

---

## Related Documentation

**Architecture:**
- [State Management](STATE_MANAGEMENT.md) - StateManager and event system
- [Module System](MODULE_SYSTEM.md) - ModuleLoader and module lifecycle
- [Socket.IO Protocol](SOCKET_PROTOCOL.md) - Real-time communication details
- [Python Integration](PYTHON_INTEGRATION.md) - Python script communication

**Guides:**
- [Getting Started](../guides/GETTING_STARTED.md) - Installation and setup
- [Troubleshooting](../guides/TROUBLESHOOTING.md) - Common issues and solutions

**Implementation:**
- Implementation: `server.js:1-2135`
- Authentication: `server.js:142-170`
- Workspace API: `server.js:418-561`
- Training: `server.js:756-853`
- Inference: `server.js:1060-2109`

---

**Navigation:**
← Back to [Documentation Index](../INDEX.md) | Next: [State Management](STATE_MANAGEMENT.md) →

---

**Status:** ✅ Complete
**Coverage:** All 60+ HTTP endpoints documented
**Last Updated:** 2026-01-01
