# 3D Visualization Module Implementation Plan

**Module:** VisualizationModule
**Purpose:** Interactive 3D viewer for mesh files with per-class controls and original data overlay
**Status:** New module implementation
**Created:** 2025-12-23

---

## Overview

Create a new 3D Visualization Module that:
1. Accepts JSON mesh files (from Mesh Module or uploads)
2. Renders them in an interactive Three.js viewer
3. Provides per-class controls (visibility, opacity, clipping)
4. Supports original data overlay via lineage tracking

---

## Directory Structure

```
/public/workspace/js/modules/visualization/
├── VisualizationModule.js      # Main module class
├── VisualizationAPI.js         # API client
├── css/
│   └── visualization.css       # Module styles
└── visualization/              # Three.js visualization code
    ├── index.js                # Module exports
    ├── scene.js                # Scene setup (copy from old)
    ├── meshLoader.js           # Load Three.js JSON format
    ├── originalDataOverlay.js  # TIFF overlay via lineage
    ├── uiControls.js           # Control panels (adapted)
    ├── interactions.js         # Mouse/keyboard (copy from old)
    ├── clipping.js             # Range filtering (copy from old)
    └── utils.js                # Helpers (copy from old)
```

---

## JSON Mesh Format (from generate_mesh.py)

```json
{
  "metadata": {
    "version": "1.0",
    "type": "BufferGeometry",
    "mesh_id": "mesh_xxx",
    "timestamp": "..."
  },
  "meshes": {
    "1": {
      "class_id": 1,
      "attributes": {
        "position": { "itemSize": 3, "type": "Float32Array", "array": [...] },
        "normal": { "itemSize": 3, "type": "Float32Array", "array": [...] }
      },
      "index": { "type": "Uint32Array", "array": [...] },
      "statistics": { "vertices": 1234, "faces": 5678 }
    }
  }
}
```

---

## Phase 1: Module Skeleton and File Selection

**Goal:** Module framework with Step 1 (file selection) fully functional

### Tasks

- [ ] **1.1 Create directory structure**
  - Create `/public/workspace/js/modules/visualization/`
  - Create subdirectories: `css/`, `visualization/`

- [ ] **1.2 Create VisualizationModule.js**
  - Extend BaseModule with 2 steps: `['select', 'visualize']`
  - Pattern: Follow MeshModule.js structure
  - Key file: `/public/workspace/js/modules/mesh/MeshModule.js`

- [ ] **1.3 Create VisualizationAPI.js**
  - Methods: `validateMeshJSON()`, `getOriginalDataFile()`, `getMeshFile()`
  - Use `/api/workspace/lineage/:fileId` for original data lookup

- [ ] **1.4 Create visualization.css**
  - Import `module-base.css`
  - Define `.viz-module` container styles
  - Copy control panel styles from segmentation module

- [ ] **1.5 Implement FileSelector configuration**
  - Filter "Recent Results" to show only `category === 'meshes'`
  - Filter "Workspace Files" to show `.json` files
  - Accept: `.json` only

- [ ] **1.6 Implement JSON validation**
  - Check for `metadata.type === 'BufferGeometry'`
  - Check for `meshes` object with class entries
  - Enable Step 2 button when valid

- [ ] **1.7 Implement lineage lookup**
  - Call `GET /api/workspace/lineage/:fileId`
  - Store `originalDataFile` from response (may be null)

- [ ] **1.8 Update registry.js**
  - Change visualization module status to `'available'`
  - Update inputs to `['mesh_file']`

### Files to Create/Modify
- `NEW: /public/workspace/js/modules/visualization/VisualizationModule.js`
- `NEW: /public/workspace/js/modules/visualization/VisualizationAPI.js`
- `NEW: /public/workspace/js/modules/visualization/css/visualization.css`
- `MODIFY: /public/workspace/js/modules/registry.js`

### Testing Checkpoint 1
- [ ] Module loads from hub without errors
- [ ] FileSelector shows mesh files in "Recent Results"
- [ ] FileSelector shows JSON files in "Workspace Files"
- [ ] Valid mesh JSON enables "Next" button
- [ ] Invalid JSON shows error
- [ ] Console shows lineage lookup result

---

## Phase 2: Three.js Scene Setup

**Goal:** Step 2 UI with Three.js viewer container and initialized scene

### Tasks

- [ ] **2.1 Copy scene setup files**
  - Copy from `/public/workspace/js/modules/segmentation/visualization/`
  - Files: `scene.js`, `interactions.js`, `utils.js`
  - Destination: `/public/workspace/js/modules/visualization/visualization/`

- [ ] **2.2 Create index.js exports**
  - Export all visualization modules for clean imports

- [ ] **2.3 Create Step 2 HTML structure**
  - Split layout: viewer (left 70%) + controls (right 30%)
  - Container: `#threejsContainer`
  - Controls: `#classControlPanels`
  - Toolbar: Reset View button

- [ ] **2.4 Implement loadDependencies()**
  - Load Three.js from CDN if not present
  - Load UTIF.js for TIFF parsing

- [ ] **2.5 Initialize scene on Step 2 entry**
  - Call `initializeScene()` from scene.js
  - Store `scene`, `camera`, `renderer` references
  - Start render loop

- [ ] **2.6 Add window resize handling**
  - Update camera aspect ratio
  - Update renderer size

### Files to Create/Modify
- `COPY: scene.js, interactions.js, utils.js` to visualization folder
- `NEW: /public/workspace/js/modules/visualization/visualization/index.js`
- `MODIFY: VisualizationModule.js` - Add Step 2 render and initialization

### Testing Checkpoint 2
- [ ] Step 2 shows Three.js container
- [ ] Scene has 6 directional lights + fog
- [ ] Dark background visible
- [ ] Window resize adjusts viewer correctly
- [ ] No console errors

---

## Phase 3: Mesh Loading and Display

**Goal:** Load and render JSON mesh data in the viewer

### Tasks

- [ ] **3.1 Create meshLoader.js**
  - Function: `loadMeshFromJSON(jsonData, scene)`
  - Parse BufferGeometry format from generate_mesh.py
  - Create THREE.BufferGeometry from position/normal arrays
  - Create THREE.Mesh with MeshPhongMaterial per class
  - Return: `{ meshGroup, classMeshes, availableClasses }`

- [ ] **3.2 Implement mesh loading in module**
  - Call `loadMeshFromJSON()` when entering Step 2
  - Store references to meshGroup, classMeshes
  - Position camera for mesh (use `positionCameraForMesh()` from scene.js)

- [ ] **3.3 Apply class colors**
  - Use `getClassColor()` from utils.js
  - Match colors to control panel labels

- [ ] **3.4 Set up mouse/keyboard controls**
  - Call `setupEnhancedControls()` from interactions.js
  - Enable rotation, zoom, reset

### Files to Create/Modify
- `NEW: /public/workspace/js/modules/visualization/visualization/meshLoader.js`
- `MODIFY: VisualizationModule.js` - Integrate mesh loading

### Testing Checkpoint 3
- [ ] Mesh loads and displays correctly
- [ ] Multiple classes render with different colors
- [ ] Mouse drag rotates mesh
- [ ] Mouse wheel zooms
- [ ] 'R' key resets rotation
- [ ] Arrow keys rotate

---

## Phase 4: Control Panel (Per-Class Controls)

**Goal:** Control panels for visibility, opacity, and range sliders

### Tasks

- [ ] **4.1 Create uiControls.js**
  - Adapt from old `/segmentation/visualization/uiControls.js`
  - Function: `generateClassControlPanels(classes, meshes, container)`
  - Per-class panel: checkbox, opacity slider, dual-range slider
  - Remove global state dependency

- [ ] **4.2 Copy and adapt clipping.js**
  - Copy from old visualization folder
  - Adapt to work with passed-in mesh references
  - Functions: `applyRangeToClass()`, `handleClassRangeChange()`

- [ ] **4.3 Implement visibility toggle**
  - Checkbox controls `mesh.visible`
  - Update immediately on change

- [ ] **4.4 Implement opacity slider**
  - Range: 10-100%, default 80%
  - Update `material.opacity` and `material.transparent`

- [ ] **4.5 Implement dual-range slider**
  - Create `createDualRangeSlider()` function
  - Visual fill bar between handles
  - Min/max validation

- [ ] **4.6 Connect range to clipping**
  - Convert percentage to slice indices
  - Apply clipping planes or slice visibility

- [ ] **4.7 Add control panel CSS**
  - Style class panels, sliders, checkboxes
  - Match old segmentation visualization appearance

### Files to Create/Modify
- `NEW: /public/workspace/js/modules/visualization/visualization/uiControls.js`
- `COPY+ADAPT: clipping.js` from old visualization
- `MODIFY: visualization.css` - Add control panel styles

### Testing Checkpoint 4
- [ ] Control panel shows all detected classes
- [ ] Visibility checkbox toggles class on/off
- [ ] Opacity slider changes transparency smoothly
- [ ] Dual-range slider clips mesh front/back
- [ ] Per-class controls are independent
- [ ] Colors match between panel and mesh

---

## Phase 5: Original Data Overlay

**Goal:** Load TIFF data via lineage and display as textured planes

### Tasks

- [ ] **5.1 Create originalDataOverlay.js**
  - Function: `loadOriginalDataOverlay(originalDataFile, meshGroup)`
  - Fetch TIFF from `/api/workspace/file/:id/download`
  - Parse using UTIF.js
  - Create DataTexture planes matching mesh dimensions

- [ ] **5.2 Calculate spatial alignment**
  - Get mesh bounding box
  - Scale planes to match mesh dimensions
  - Position planes at correct Z intervals

- [ ] **5.3 Create original data control panel**
  - Checkbox (default: unchecked/hidden)
  - Opacity slider: 5-100%, default 30%
  - Dual-range slider for Z-range

- [ ] **5.4 Integrate in module**
  - Check if `originalDataFile` exists from lineage
  - Load overlay after mesh loads
  - Add control panel if overlay available
  - Handle missing original data gracefully

- [ ] **5.5 Connect controls to overlay**
  - Visibility: toggle `planeGroup.visible`
  - Opacity: update all plane materials
  - Range: show/hide individual planes

### Files to Create/Modify
- `NEW: /public/workspace/js/modules/visualization/visualization/originalDataOverlay.js`
- `MODIFY: uiControls.js` - Add original data panel
- `MODIFY: VisualizationModule.js` - Integrate overlay loading

### Testing Checkpoint 5
- [ ] Original data found via lineage (check console)
- [ ] TIFF loads and parses correctly
- [ ] Planes created at correct positions
- [ ] Toggle shows/hides overlay
- [ ] Opacity slider works (30% default)
- [ ] Range slider clips planes
- [ ] Overlay rotates with mesh

---

## Phase 6: Polish and Integration

**Goal:** Final cleanup, error handling, MeshModule integration

### Tasks

- [ ] **6.1 Implement Reset View**
  - Reset camera position
  - Reset mesh rotation
  - Reset all class controls to defaults
  - Reset original data to hidden

- [ ] **6.2 Add loading states**
  - Show loading during mesh parsing
  - Show loading during TIFF loading

- [ ] **6.3 Error handling**
  - Handle invalid JSON gracefully
  - Handle missing files
  - Handle lineage lookup failures
  - Show user-friendly error messages

- [ ] **6.4 Resource cleanup on deactivate**
  - Dispose geometries and materials
  - Remove resize listener
  - Clear all references
  - Stop render loop

- [ ] **6.5 MeshModule "Open in Visualization"**
  - In MeshModule: store result file in state
  - In VisualizationModule: check for preselected file
  - Auto-select and advance to Step 2

- [ ] **6.6 State persistence**
  - Save selected file, step to state
  - Restore on module re-entry

### Files to Create/Modify
- `MODIFY: VisualizationModule.js` - Add reset, cleanup, integration
- `MODIFY: /public/workspace/js/modules/mesh/MeshModule.js` - Add "Open in Visualization" button

### Testing Checkpoint 6
- [ ] Reset View button works completely
- [ ] Loading indicators show during operations
- [ ] Errors display user-friendly messages
- [ ] Module deactivate cleans up resources
- [ ] MeshModule "Open in Visualization" works
- [ ] Auto-advances when coming from MeshModule
- [ ] Re-entering module restores state

---

## Key Reference Files

| Purpose | File Path |
|---------|-----------|
| Module pattern | `/public/workspace/js/modules/mesh/MeshModule.js` |
| BaseModule | `/public/workspace/js/core/BaseModule.js` |
| Components | `/public/workspace/js/core/components/index.js` |
| Old scene setup | `/public/workspace/js/modules/segmentation/visualization/scene.js` |
| Old UI controls | `/public/workspace/js/modules/segmentation/visualization/uiControls.js` |
| Old interactions | `/public/workspace/js/modules/segmentation/visualization/interactions.js` |
| Old clipping | `/public/workspace/js/modules/segmentation/visualization/clipping.js` |
| Lineage helpers | `/src/helpers/lineageHelpers.js` |
| WorkspaceAPI | `/public/workspace/js/core/WorkspaceAPI.js` |
| Mesh generation | `/python/generate_mesh.py` (JSON format reference) |

---

## API Endpoints Used

| Endpoint | Purpose |
|----------|---------|
| `GET /api/workspace/files` | List workspace files for FileSelector |
| `GET /api/workspace/file/:id/download` | Download mesh JSON / TIFF |
| `GET /api/workspace/lineage/:fileId` | Find original data file |

---

## Code Reuse Summary

| Old File | Action | Notes |
|----------|--------|-------|
| `scene.js` | Copy unchanged | 6 lights, fog, camera setup |
| `interactions.js` | Copy unchanged | Mouse/keyboard/touch |
| `utils.js` | Copy unchanged | Colors, geometry helpers |
| `clipping.js` | Copy + adapt | Remove global state refs |
| `uiControls.js` | Adapt significantly | New structure, modular |
| `meshCreation.js` | Extract TIFF loading | For originalDataOverlay.js |

---

## Notes

- **JSON only** - No OBJ support needed
- **Lineage for original data** - Auto-detect via API
- **Recent results** - Filter by `category === 'meshes'`
- **Scene setup** - Keep identical (6 lights, fog, soft shadows)
