# Data Lineage/Provenance Tracking System

**Status:** Planned
**Created:** 2025-12-23

## Overview

Add processing lineage tracking to workspace metadata so each file knows its origin and processing history. This enables:
- Tracking the full processing pipeline for any output file
- Displaying processing history in the file browser's "See Info" panel
- Future: Auto-detecting original data for visualization overlays

## Design Decisions

- **Track all inputs** - Multi-input processes store all input file IDs
- **Model is separate** - Trained models not in lineage, stored in result metadata
- **New files only** - Only apply to newly processed files
- **Simple display** - Show processing chain as: "Denoising → Segmentation → Mesh Generation"

## Lineage Data Structure

Files with processing history get a `lineage` property:

```json
{
  "id": "file_xxx",
  "name": "inference_result.tif",
  "category": "segmentations",
  "lineage": {
    "processType": "segmentation",
    "processedAt": "2025-12-22T23:12:44.747Z",
    "inputs": ["file_yyy", "file_zzz"],
    "processId": "inference-uuid-here"
  }
}
```

- **Uploaded files** - No `lineage` property (they are root files)
- **Processed files** - Have `lineage` with inputs pointing to source file IDs

---

## Implementation Phases

### Phase 1: Core Infrastructure

**Goal:** Create lineage utility functions and update core metadata handling

**Files to modify/create:**

1. **Create** `/src/helpers/lineageHelpers.js`
   - `createLineage(processType, inputFileIds, processId)` - Build lineage object
   - `findRootFiles(fileId, allFiles)` - Traverse back to find original files
   - `getLineageChain(fileId, allFiles)` - Get full processing chain
   - `findOriginalDataFile(fileId, allFiles)` - Find overlay-suitable root file

2. **Modify** `/WorkspaceManager.js` (lines 228-237)
   - Update `addFileToMetadata()` to include lineage when provided:
   ```javascript
   const fileEntry = {
     // ...existing fields...
     ...(fileInfo.lineage && { lineage: fileInfo.lineage })
   };
   ```

**Checklist:**
- [ ] Create lineageHelpers.js with all utility functions
- [ ] Update WorkspaceManager.addFileToMetadata() to spread lineage
- [ ] Add JSDoc documentation to new functions

---

### Phase 2: Backend - Segmentation/Inference Lineage

**Goal:** Track lineage through the segmentation pipeline

**Files to modify:**

1. **Modify** `/src/routes/ml.routes.js`
   - POST `/run-inference` (around line 768): Accept `inputFileIds` in request body
   - Store in inference session: `inputFileIds: req.body.inputFileIds || []`

2. **Modify** `/src/services/InferenceService.js`
   - Add method `buildInferenceLineage(inference, inferenceId)`
   - Call `createLineage('segmentation', inference.inputFileIds, inferenceId)`
   - Pass lineage to `trackInferenceResults()`

3. **Modify** `/src/services/FileService.js` (lines 80-110)
   - Update `trackInferenceResults()` signature: add `lineage = null` parameter
   - Pass lineage to each `trackModuleOutput()` call

**Checklist:**
- [ ] Update ml.routes.js to accept and store inputFileIds
- [ ] Add buildInferenceLineage() to InferenceService
- [ ] Update trackInferenceResults() to accept and pass lineage
- [ ] Test segmentation pipeline end-to-end

---

### Phase 3: Backend - Mesh Generation Lineage

**Goal:** Track lineage for mesh outputs

**Files to modify:**

1. **Modify** `/src/routes/mesh.routes.js`
   - POST `/api/mesh/generate` (around line 431): Accept `sourceFileId` in request
   - Store in mesh session: `sourceFileId: req.body.sourceFileId || null`
   - Update `trackMeshOutputs()` function (lines 592-617):
     - Accept `sourceFileId` parameter
     - Build lineage: `createLineage('meshGeneration', [sourceFileId], result.mesh_id)`
     - Pass to `addFileToMetadata()`

**Checklist:**
- [ ] Update mesh generate endpoint to accept sourceFileId
- [ ] Store sourceFileId in mesh session
- [ ] Update trackMeshOutputs() to build and include lineage
- [ ] Test mesh generation pipeline

---

### Phase 4: Frontend Integration

**Goal:** Update frontend modules to send file IDs, add lineage API, and display lineage in file info

**Files to modify:**

1. **Add endpoint** `/src/routes/workspace.routes.js`
   - GET `/api/workspace/lineage/:fileId` - Return lineage chain and root files

2. **Modify** `/public/workspace/js/core/WorkspaceAPI.js`
   - Add `getFileLineage(fileId)` method
   - Add `findOriginalDataFile(fileId)` method

3. **Modify** `/public/workspace/js/modules/segmentation/SegmentationModule.js`
   - When calling inference, include selected file ID in request body

4. **Modify** `/public/workspace/js/modules/mesh/MeshModule.js`
   - When calling mesh generation, include source file ID in request body

5. **Modify** File Browser "See Info" panel
   - Find the file info modal/panel component
   - Add "Processing History" section when file has lineage
   - Display as simple list: "Denoising → Segmentation → Mesh Generation"
   - For uploaded files (no lineage): show "Original upload" or omit section

**Checklist:**
- [ ] Add lineage API endpoint
- [ ] Add WorkspaceAPI lineage methods
- [ ] Update SegmentationModule to send inputFileIds
- [ ] Update MeshModule to send sourceFileId
- [ ] Add lineage display to file info panel
- [ ] Test frontend-to-backend lineage flow

---

### Phase 5: Documentation Updates

**Goal:** Update module creation guide to ensure future modules implement lineage consistently

**Files to modify:**

1. **Modify** `/docs/guides/MODULE_CREATION.md`
   - Add section on lineage tracking requirements
   - Document how to pass input file IDs from frontend
   - Document how to build and store lineage in backend
   - Provide code examples for both frontend and backend

**Checklist:**
- [ ] Add "Lineage Tracking" section to MODULE_CREATION.md
- [ ] Include frontend example (sending inputFileIds in request)
- [ ] Include backend example (using createLineage helper)
- [ ] Document the lineage data structure

---

## Critical Files Summary

| File | Changes |
|------|---------|
| `/src/helpers/lineageHelpers.js` | **NEW** - Lineage utility functions |
| `/WorkspaceManager.js` | Add lineage to addFileToMetadata() |
| `/src/services/FileService.js` | Pass lineage through tracking functions |
| `/src/services/InferenceService.js` | Build lineage for segmentation results |
| `/src/routes/ml.routes.js` | Accept inputFileIds for inference |
| `/src/routes/mesh.routes.js` | Accept sourceFileId, update trackMeshOutputs() |
| `/src/routes/workspace.routes.js` | Add lineage API endpoint |
| `/public/workspace/js/core/WorkspaceAPI.js` | Add lineage client methods |
| `/public/workspace/js/modules/segmentation/SegmentationModule.js` | Send file IDs |
| `/public/workspace/js/modules/mesh/MeshModule.js` | Send source file ID |
| File browser info panel | Display lineage as processing history |
| `/docs/guides/MODULE_CREATION.md` | Add lineage tracking documentation |

## Example Lineage Chain

```
Upload: trypB_inference.tif (no lineage)
    |
    v
Denoising: denoised_result.tif
    lineage: {processType: "denoising", inputs: ["upload_id"]}
    |
    v
Segmentation: segmented_result.tif
    lineage: {processType: "segmentation", inputs: ["denoised_id"]}
    |
    v
Mesh: mesh_data.json
    lineage: {processType: "meshGeneration", inputs: ["segmented_id"]}
```

**Display in File Info Panel:**
```
Processing History:
  Denoising → Segmentation → Mesh Generation
```

## Lineage Utility Functions

### createLineage(processType, inputFileIds, processId)
Creates a lineage object for a newly processed file.

### findRootFiles(fileId, allFiles)
Traverses lineage backwards to find original uploaded files. Returns `{rootIds, path, errors}`.

### getLineageChain(fileId, allFiles)
Returns full chain from root to current file.

### findOriginalDataFile(fileId, allFiles)
Specifically finds files with category `raw_images` or `inference_data` for overlay purposes.
