# Slice-Based Mesh Visualization Enhancement Plan

**Purpose:** Enhance mesh generation module to support slice-based 3D visualization with dynamic endcaps and original TIFF data overlay
**Approach:** Hybrid (Python generates voxel data + metadata, JavaScript creates slice geometries)
**Reference:** Proven code from `/public/workspace/js/modules/segmentation/visualization/`

---

## Architecture Overview

```
[Python: generate_mesh.py]
    Output: Sparse voxel JSON + slice metadata
              ↓
[JavaScript: meshLoader.js]
    Detects format, routes to voxel loader
              ↓
[JavaScript: meshCreation.js]
    Creates sliceMeshes[class][0-19] using voxel face extraction
              ↓
[JavaScript: clipping.js]
    Dynamic endcaps when range slider cuts volume
              ↓
[JavaScript: uiControls.js]
    Dual-range sliders per class + original data controls
```

---

## Phase 1: Python Backend - Voxel Data Output
**Complexity:** Medium | **Files:** `python/generate_mesh.py`

### Tasks
- [ ] Create `export_voxel_json()` function for sparse voxel output
- [ ] Add shape metadata `[depth, height, width]` to output
- [ ] Compute slice boundaries for 20 slices per class
- [ ] Add `--format` option: `marching_cubes` (OBJ/STL) vs `voxel_slices` (JSON)
- [ ] Keep marching cubes for OBJ/STL exports unchanged

### JSON Output Structure
```json
{
  "metadata": { "version": "2.0", "type": "VoxelSlices", "mesh_id": "..." },
  "shape": [100, 512, 512],
  "classes": [1, 2],
  "sliceCount": 20,
  "sliceDirection": "z",
  "data": [{"x": 10, "y": 20, "z": 5, "value": 1}, ...],
  "statistics": { "totalVoxels": 50000, "perClass": {...} }
}
```

### Testing Checkpoint
1. Generate mesh with `--format voxel_slices`
2. Verify JSON contains sparse voxel array and shape metadata
3. Verify OBJ/STL still use marching cubes (unchanged)

---

## Phase 2: JavaScript - Slice-Based Mesh Creation
**Complexity:** High | **Files:** `meshLoader.js`, `meshCreation.js` (new), `utils.js`

### Tasks
- [ ] Create `visualization/meshCreation.js` (adapt from segmentation)
- [ ] Implement `createSliceBasedClassMeshes(data, scene, sliceCount=20, sliceDirection='z')`
- [ ] Implement voxel helpers: `getVoxelValue()`, `addQuadFace()`, `centerAndScaleGeometry()`
- [ ] Update `meshLoader.js` to detect format and route appropriately
- [ ] Return `{ meshGroup, sliceMeshes, availableClasses, sliceMetadata }`

### Key Data Structure
```javascript
sliceMeshes = {
  1: [mesh0, mesh1, ..., mesh19],  // Class 1: 20 slice meshes
  2: [mesh0, mesh1, ..., mesh19]   // Class 2: 20 slice meshes
}
```

### Testing Checkpoint
1. Load voxel JSON in 3D viewer
2. Verify 20 slice meshes created per class
3. Verify mesh centered and scaled (max ~8 units)
4. Verify voxel surfaces look correct (blocky but closed)

---

## Phase 3: JavaScript - Dynamic Endcap Generation
**Complexity:** High | **Files:** `clipping.js` (new), `index.js`

### Tasks
- [ ] Create `visualization/clipping.js` (adapt from segmentation)
- [ ] Implement `applySliceRangeToSingleClass(classValue, minPercent, maxPercent)`
- [ ] Implement `updateAccurateCapping(classRanges)` for dynamic endcaps
- [ ] Implement `extractBoundaryFacesAtSlice()` for cross-sectional geometry
- [ ] Track `classSliceRanges` and `classCappingMeshes` state
- [ ] Endcaps: class color at 60% opacity, double-sided material

### Endcap Logic
- Front cap at `minSlice` boundary when `minSlice > 0`
- Back cap at `maxSlice` boundary when `maxSlice < sliceCount - 1`
- Remove old caps before creating new ones

### Testing Checkpoint
1. Set class range to 20-80%
2. Verify endcaps appear at slice boundaries
3. Verify endcaps match class color (60% opacity)
4. Test multiple classes with different ranges

---

## Phase 4: JavaScript - UI Controls with Dual-Range Sliders
**Complexity:** Medium | **Files:** `uiControls.js` (new), `VisualizationModule.js`, `visualization.css`

### Tasks
- [ ] Create `visualization/uiControls.js` (adapt from segmentation)
- [ ] Implement `generateClassControlPanels(availableClasses)`
- [ ] Per-class panel: checkbox + opacity slider + dual-range slider
- [ ] Implement `createDualRangeSlider()` with visual fill between handles
- [ ] Wire up handlers: visibility, opacity, range changes
- [ ] Update `VisualizationModule.js` to use new control generation
- [ ] Verify/update CSS for dual-range slider styling

### Control Panel Structure
```
[Class 1 Panel]
  ☑ Class 1 (colored label)
  Opacity: [====●====] 80%
  Range:   [●========●] 0% - 100%

[Class 2 Panel]
  ...
```

### Testing Checkpoint
1. Verify control panels render for each class
2. Test visibility toggle hides/shows all slices
3. Test opacity slider updates material transparency (real-time)
4. Test dual-range slider updates slice visibility + endcaps

---

## Phase 5: TIFF Overlay Feature
**Complexity:** Medium-High | **Files:** `meshCreation.js`, `uiControls.js`, `VisualizationModule.js`

### Tasks
- [ ] Add UTIF.js loading (already available in project)
- [ ] Implement `loadAndCreateOriginalDataPlanes(tiffUrl, segmentationShape)`
- [ ] Create textured planes for each TIFF slice, positioned to match mesh
- [ ] Add Original Data control panel (first in list):
  - Checkbox (default: unchecked/hidden)
  - Opacity slider (5-100%, default: 30%)
  - Dual-range slider for plane visibility
- [ ] Integrate with lineage system (`VisualizationAPI.getOriginalDataFile()`)
- [ ] Handle missing original data gracefully

### Plane Positioning
```javascript
// Scale to match mesh
const scaleFactor = 8 / Math.max(depth, height, width);
const zSpacing = (depth * scaleFactor) / (slices.length - 1);
plane.position.z = (index * zSpacing) - (depth * scaleFactor / 2);
```

### Testing Checkpoint
1. Load mesh with linked original TIFF data
2. Verify "Original Data" panel appears first
3. Toggle visibility - planes show/hide
4. Test opacity and range controls
5. Verify planes align with mesh slices

---

## Phase 6: Integration and Polish
**Complexity:** Low-Medium | **Files:** `index.js`, `VisualizationModule.js`, `VisualizationAPI.js`

### Tasks
- [ ] Update `index.js` exports for new modules
- [ ] Update `VisualizationAPI.validateMeshStructure()` for VoxelSlices format
- [ ] Integrate all components in `VisualizationModule.js`
- [ ] Add reset view to reset all sliders to defaults
- [ ] Add state persistence (save/restore slice ranges)
- [ ] Handle edge cases: empty slices, very large datasets
- [ ] Add loading indicators during mesh generation

### Testing Checkpoint
1. Full workflow: select file → load viewer → manipulate all controls
2. Test resume after navigating away
3. Test with various mesh sizes (small, medium, large)
4. Performance test with large datasets (>500K voxels)

---

## Critical Files Reference

| File | Purpose |
|------|---------|
| `python/generate_mesh.py` | Add voxel JSON export mode |
| `visualization/meshLoader.js` | Format detection + routing |
| `visualization/meshCreation.js` | NEW: Slice-based mesh creation |
| `visualization/clipping.js` | NEW: Dynamic endcap generation |
| `visualization/uiControls.js` | NEW: Control panel generation |
| `visualization/utils.js` | Add voxel helpers |
| `VisualizationModule.js` | Integration point |
| `segmentation/visualization/*` | Reference implementation |

---

## Notes

- OBJ and STL exports remain unchanged (marching cubes)
- Only Three.js JSON uses new voxel-based slice system
- 20 slices is default, could be made configurable later
- Endcaps generated dynamically = smaller JSON files
- TIFF overlay uses lineage system to find source data
