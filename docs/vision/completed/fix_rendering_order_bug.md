# Implementation Plan: Fix Visualization Module Rendering Order Bug

**Issue**: Visualization module rendering order problem - when a class volume is enclosed by another volume, the edges inhabit the same space causing rendering conflicts.

**Bug ID**: #3 from BUGS_ISSUES.md
**Priority**: 5 (Highest)
**Estimated Complexity**: 3
**Date**: 2026-01-22

---

## Problem Analysis

### Current Behavior
- When two volumes share the same edge/surface position (e.g., inner volume enclosed by outer):
  1. Both classes generate faces at the shared boundary
  2. Both faces occupy the **exact same 3D position**
  3. Z-fighting occurs (flickering/artifacts)
  4. Only outer volume typically visible at shared positions
  5. Exception: When inner volume has opacity=100%, it suddenly becomes visible

### Root Cause
In the face generation logic (`meshCreation.js` and `meshWorker.js`):
```javascript
if (neighborValue !== currentValue) {
    addQuadFace(...);  // Both classes add faces at boundary!
}
```

At a boundary between class 1 and class 2:
- Class 1 voxel sees class 2 neighbor → adds face
- Class 2 voxel sees class 1 neighbor → adds face
- **Both faces at exact same position** → z-fighting

### Desired Behavior
- Inner volumes should always be visible at shared edges
- No z-fighting/flickering at class boundaries

---

## Solution: "Smaller Volume Wins" at Class Boundaries

### Approach
At class-to-class boundaries, only ONE class should render a face. The **smaller** (inner) volume wins because:
- Smaller volumes are typically enclosed by larger volumes
- Inner structures should be visible through outer structures

### Implementation
1. **Pre-compute voxel count per class** before mesh generation
2. **Modify boundary logic**:
   - Background boundary (neighbor = 0): Always render face (exterior surface)
   - Class-class boundary: Only render if current class has **fewer or equal voxels** than neighbor

```javascript
if (neighborValue !== currentValue) {
    // Background boundary - always render exterior surface
    if (neighborValue === 0) {
        addQuadFace(...);
    }
    // Class-class boundary - smaller (inner) class wins
    else {
        const currentVolume = classVolumes[currentValue] || 0;
        const neighborVolume = classVolumes[neighborValue] || 0;
        // Smaller volume wins. Equal volumes: both render (fallback)
        if (currentVolume <= neighborVolume) {
            addQuadFace(...);
        }
    }
}
```

### Why This Works
- At each shared boundary position, only ONE face is generated (from the smaller class)
- No duplicate faces → no z-fighting
- Smaller (inner) volumes always visible at boundaries
- Larger (outer) volumes don't render faces that would overlap with inner volumes
- **Does NOT modify `depthWrite`** - avoids conflicts with original data overlay

---

## Files Modified

### 1. meshCreation.js

**Changes:**

1. **Compute class volumes** in `createSliceBasedClassMeshes()` (synchronous path):
   ```javascript
   const classVolumes = {};
   voxelData.forEach(voxel => {
       // ... existing dense array conversion ...
       classVolumes[voxel.value] = (classVolumes[voxel.value] || 0) + 1;
   });
   ```

2. **Compute class volumes** in `createSliceBasedClassMeshesAsync()` (worker path):
   - Pre-compute before sending to worker
   - Pass `classVolumes` in worker message

3. **Update `createSliceForAllClasses()`**:
   - Accept new `classVolumes` parameter
   - Modify face generation logic to use smaller-volume-wins rule

### 2. meshWorker.js

**Changes:**

1. **Accept `classVolumes`** from main thread message

2. **Fallback computation**: If `classVolumes` not provided, compute from voxelData

3. **Update `processSlice()`**:
   - Accept new `classVolumes` parameter
   - Same smaller-volume-wins logic as main thread

---

## Testing Plan

### Manual Testing Steps

1. **Basic Inner Volume Visibility Test**
   - Load a mesh with multiple enclosed classes (e.g., class 1 surrounding class 2)
   - **Expected**: Inner class (class 2) visible at shared edges without z-fighting
   - Adjust opacity of outer class from 100% to 10%
   - **Expected**: Inner class consistently visible, no flickering

2. **Multiple Class Test**
   - Load mesh with 3+ overlapping classes
   - **Expected**: All classes visible at boundaries, smallest "wins" at each edge

3. **Opacity Slider Test**
   - Adjust opacity of various classes
   - **Expected**: No z-fighting artifacts at any opacity level

4. **Range Slider Test**
   - Use range sliders to clip volumes
   - **Expected**: Endcaps render correctly

5. **Original Data Overlay Test**
   - Enable original data overlay
   - **Expected**: Overlay renders correctly (not affected by this fix)

6. **Rotation Test**
   - Rotate view from all angles
   - **Expected**: Inner volumes consistently visible, no view-dependent artifacts

---

## Advantages of This Approach

1. **No `depthWrite` changes** - Avoids conflicts with original data overlay
2. **Geometry-level fix** - Eliminates duplicate faces entirely
3. **Deterministic** - Same result regardless of viewing angle
4. **Performance neutral** - Same number of voxels processed, slightly fewer faces generated
5. **Simple logic** - Easy to understand and maintain

---

## Rollback Plan

If issues arise:
1. Remove `classVolumes` computation in `createSliceBasedClassMeshes()`
2. Remove `classVolumes` computation in `createSliceBasedClassMeshesAsync()`
3. Revert face generation logic to original `if (neighborValue !== currentValue)`
4. Remove `classVolumes` parameter from `createSliceForAllClasses()`
5. Revert `meshWorker.js` changes

All changes are isolated to face generation logic and can be cleanly reverted.
