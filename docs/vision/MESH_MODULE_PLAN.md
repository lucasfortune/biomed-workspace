# Surface Mesh Generation Module - Implementation Plan

**Created:** 2025-12-22
**Status:** Ready for Implementation
**Estimated Phases:** 5

---

## Overview

Create a Surface Mesh Generation Module that converts segmented TIFF image stacks into 3D surface meshes. Uses a hybrid approach: Python backend for TIFF parsing and mesh generation, frontend for Three.js visualization integration.

### Key Decisions
- **Processing:** Hybrid (Python generates mesh data, frontend creates Three.js geometry)
- **Output:** Both Three.js JSON and OBJ/STL formats
- **Input:** TIFF image stacks (segmentation results)
- **Progress:** Real-time Socket.IO updates

---

## Phase 1: Module Foundation

### 1.1 Create Module Directory Structure

```
public/workspace/js/modules/mesh/
├── MeshModule.js           # Main module class
├── MeshAPI.js              # API client
├── css/
│   └── mesh.css            # Module styling
└── README.md               # Quick start guide
```

### 1.2 Create MeshModule.js

**File:** `public/workspace/js/modules/mesh/MeshModule.js`

- Extend `BaseModule` from `/workspace/js/core/BaseModule.js`
- Configure 2 steps: "Data Selection", "Mesh Generation"
- State flags: `dataValidated`, `generationComplete`
- Socket.IO integration for progress

### 1.3 Create MeshAPI.js

**File:** `public/workspace/js/modules/mesh/MeshAPI.js`

Methods:
- `getSources()` - List segmentation results and annotation files
- `getInfo(fileId)` - Get TIFF stack metadata
- `getPreview(fileId, sliceIndex)` - Get slice preview URL
- `generateMesh(sourceFile, options)` - Start mesh generation
- `getStatus(meshId)` - Check generation status
- `getDownloadUrl(meshId, format)` - Get download URL

### 1.4 Create mesh.css

**File:** `public/workspace/js/modules/mesh/css/mesh.css`

- Import `module-base.css`
- Custom styles for data info card, thumbnail preview, progress display

### 1.5 Register Module

**File:** `public/workspace/js/modules/registry.js`

```javascript
{
  id: 'mesh',
  name: 'Surface Mesh Generation',
  description: 'Convert segmented volumes to 3D surface meshes for visualization and export',
  icon: '🎯',
  path: '/workspace/js/modules/mesh/MeshModule.js',
  inputs: ['segmented_stack'],
  outputs: ['mesh_file'],
  color: '#9B59B6',
  status: 'available'
}
```

---

## Phase 2: Backend API Endpoints

### 2.1 Create Mesh Routes

**File:** `src/routes/mesh.routes.js`

**Endpoints:**

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/mesh/sources` | List segmentation results + annotation files |
| GET | `/api/mesh/info/:fileId` | Get TIFF metadata (dimensions, classes) |
| GET | `/api/mesh/preview/:fileId/:sliceIndex` | Get slice preview image |
| POST | `/api/mesh/generate` | Start mesh generation |
| GET | `/api/mesh/status/:meshId` | Check generation status |
| GET | `/api/mesh/download/:meshId/:format` | Download mesh file |

### 2.2 Update App Configuration

**File:** `src/app.js`

- Import and register mesh routes
- Add mesh session tracking

### 2.3 Add Session Tracking

**File:** `src/services/SessionTracker.js`

- Add `meshSessions` Map for tracking mesh generation jobs

### 2.4 Socket.IO Events

**Room:** `mesh-{meshId}`

**Events:**
- `mesh-progress` - Real-time progress updates
- `mesh-complete` - Generation finished
- `mesh-error` - Generation failed

---

## Phase 3: Python Mesh Generation Script

### 3.1 Create generate_mesh.py

**File:** `python/generate_mesh.py`

**Algorithm (adapted from meshCreation.js):**
1. Load segmented TIFF stack
2. For each class (excluding background):
   - Create dense 3D volume
   - Extract surface faces using 6-connectivity
   - For each voxel: check neighbors, add face if different
3. Center and scale geometry (target max dimension = 8)
4. Export to requested formats

**Progress Protocol:**
```
MESH_PROGRESS:{"class":1,"total_classes":3,"vertices_processed":1000,"progress_percent":33.3}
MESH_RESULT:{"success":true,"output_dir":"/results/meshes/abc123","formats":["json","obj","stl"]}
```

### 3.2 Output Formats

**Three.js JSON:**
```json
{
  "format": "threejs_mesh",
  "version": "1.0",
  "shape": [depth, height, width],
  "classes": {
    "1": { "vertices": [...], "normals": [...], "color": [0.2, 0.9, 0.2] }
  },
  "metadata": { "totalVertices": 125432, "totalFaces": 41810 }
}
```

**OBJ:** Standard Wavefront with materials file
**STL:** Binary STL for 3D printing

### 3.3 Output Directory

```
results/meshes/{meshId}/
├── mesh_data.json       # Three.js format
├── mesh.obj             # Wavefront OBJ
├── mesh.mtl             # OBJ materials
├── mesh.stl             # Binary STL
└── metadata.json        # Generation metadata
```

---

## Phase 4: Frontend UI Implementation

### 4.1 Step 1: Data Selection

**Features:**
- FileSelector dropdown with two sections:
  - "Recent Results" - Segmentation outputs
  - "Workspace Files" - Annotation TIFFs only
- File upload button (saves to `/uploads/annotations`)
- On selection: fetch and display data info
- ValidationDisplay for feedback

**Data Info Card:**
- Dimensions (width x height x depth)
- Classes detected (count and labels)
- Total voxels / file size
- Preview thumbnail of middle slice

### 4.2 Step 2: Mesh Generation

**Before Generation:**
- Summary of selected data
- Output format checkboxes (JSON, OBJ, STL)
- Class selection (all or specific)
- "Generate Mesh" button

**During Generation:**
- Progress bar with percentage
- Current class being processed
- Vertices processed counter
- Status text

**After Completion:**
- Success message with statistics
- Download buttons for each format
- "Open in 3D Visualization" button (placeholder)
- "Generate Another" button

### 4.3 Module-to-Module Navigation

Store result in StateManager:
```javascript
this.state.update('modules.mesh.result', {
  meshId: this.currentMeshId,
  outputDir: result.output_dir,
  formats: result.formats
});
window.workspace.loadModule('visualization'); // placeholder
```

---

## Phase 5: Integration & Documentation

### 5.1 FileSelector Enhancement

**File:** `public/workspace/js/core/components/FileSelector.js`

May need to add:
- `showRecentResults` option
- `filterCategories` option to filter by file category

### 5.2 State Management

Module state path: `modules.mesh.*`
- `currentStep`
- `selectedFile`
- `dataInfo`
- `generationComplete`
- `currentMeshId`
- `result`

### 5.3 Testing Checklist

- [ ] File dropdown shows segmentation results
- [ ] File dropdown shows annotation files only (not raw images)
- [ ] Upload new annotation file works
- [ ] Data info displays correctly (classes, dimensions)
- [ ] Preview thumbnail loads
- [ ] Generation starts and Socket.IO progress works
- [ ] All download formats work
- [ ] Error handling for invalid files
- [ ] State persistence (resume on return)
- [ ] Navigation to visualization (placeholder)

### 5.4 Documentation

- Update `docs/guides/MODULE_CREATION.md` with mesh module example
- Create `public/workspace/js/modules/mesh/README.md`

---

## Critical Files

| File | Purpose |
|------|---------|
| `public/workspace/js/core/BaseModule.js` | Base class to extend |
| `public/workspace/js/modules/segmentation/visualization/meshCreation.js` | Reference mesh algorithm |
| `public/workspace/js/core/components/FileSelector.js` | File selection component |
| `src/routes/ml.routes.js` | Pattern for backend routes |
| `src/helpers/pythonRunner.js` | Python process spawning |

---

## Task Summary by Phase

### Phase 1: Foundation (5 tasks)
- [ ] Create module directory structure
- [ ] Create MeshModule.js skeleton
- [ ] Create MeshAPI.js
- [ ] Create mesh.css with base imports
- [ ] Register module in registry.js

### Phase 2: Backend (4 tasks)
- [ ] Create mesh.routes.js with all endpoints
- [ ] Register routes in app.js
- [ ] Add mesh session tracking
- [ ] Add Socket.IO mesh events

### Phase 3: Python Script (3 tasks)
- [ ] Create generate_mesh.py with surface extraction
- [ ] Implement Three.js JSON export
- [ ] Implement OBJ and STL export

### Phase 4: Frontend UI (4 tasks)
- [ ] Implement Step 1 (file selection + data info)
- [ ] Implement Step 2 (generation UI + progress)
- [ ] Add Socket.IO progress handling
- [ ] Implement completion UI with downloads

### Phase 5: Integration (3 tasks)
- [ ] Enhance FileSelector if needed
- [ ] Test full workflow
- [ ] Create documentation
