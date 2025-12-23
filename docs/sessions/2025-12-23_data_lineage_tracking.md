# Session Log: Data Lineage/Provenance Tracking System

**Date:** 2025-12-23
**Duration:** ~3 hours
**Status:** Complete

---

## Summary

Implemented a comprehensive data lineage/provenance tracking system for workspace files. When files are processed through modules (upload → denoising → segmentation → mesh generation), each file's metadata now stores its processing history. This enables:

- Tracking the full processing pipeline back to the original file
- Displaying processing history in the File Browser's "See Info" panel
- Future: Using lineage to auto-find original data for 3D visualization overlays

---

## Design Decisions (from user clarification)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Multi-input handling | Track ALL inputs | Multi-input processes store all input file IDs |
| Model in lineage | No, separate concern | Trained models not in lineage, stored in result metadata |
| Retroactive tracking | New files only | Only apply to newly processed files |
| Lineage traversal | Auto-traverse | System automatically finds root file for visualization overlay |
| Display format | Simple list | "Denoising → Segmentation → Mesh Generation" |

---

## Lineage Data Structure

Files with processing history get a `lineage` property in their metadata:

```json
{
  "id": "file_xxx",
  "name": "inference_result.tif",
  "category": "segmentations",
  "lineage": {
    "processType": "segmentation",
    "processedAt": "2025-12-22T23:12:44.747Z",
    "inputs": ["file_yyy"],
    "processId": "inference-uuid-here"
  }
}
```

- **Uploaded files**: No `lineage` property (they are root files)
- **Processed files**: Have `lineage` with inputs pointing to source file IDs

---

## Files Created

| File | Purpose |
|------|---------|
| `src/helpers/lineageHelpers.js` | Core lineage utility functions |
| `docs/vision/DATA_LINEAGE_PLAN.md` | Implementation plan document |

## Files Modified

| File | Changes |
|------|---------|
| `WorkspaceManager.js` | Spread lineage in `addFileToMetadata()` |
| `src/app.js` | Import lineage helper, build lineage in onSuccess callback |
| `src/routes/ml.routes.js` | Accept `inputFileIds`, track custom uploads, return `file_id` |
| `src/routes/mesh.routes.js` | Accept `sourceFileId`, build lineage for mesh outputs |
| `src/routes/workspace.routes.js` | Add `/api/workspace/lineage/:fileId` endpoint |
| `src/services/FileService.js` | Pass lineage through tracking functions |
| `src/services/InferenceService.js` | Build lineage for segmentation results |
| `public/workspace/js/core/WorkspaceAPI.js` | Add lineage client methods |
| `public/workspace/js/modules/segmentation/SegmentationModule.js` | Capture file ID, send `inputFileIds` |
| `public/workspace/js/modules/mesh/MeshModule.js` | Send `sourceFileId` with generation |
| `public/workspace/js/modules/mesh/MeshAPI.js` | Accept and send `sourceFileId` |
| `public/workspace/js/components/FileBrowser.js` | Display lineage in "See Info" panel |
| `docs/guides/MODULE_CREATION.md` | Add comprehensive lineage tracking section |

---

## Lineage Helper Functions

Created `src/helpers/lineageHelpers.js` with:

| Function | Purpose |
|----------|---------|
| `createLineage(processType, inputFileIds, processId)` | Build lineage object |
| `findRootFiles(fileId, allFiles)` | Traverse back to find original files |
| `getLineageChain(fileId, allFiles)` | Get full processing chain |
| `getProcessingHistoryString(fileId, allFiles)` | Format as "Denoising → Segmentation" |
| `findOriginalDataFile(fileId, allFiles)` | Find overlay-suitable root file |

---

## API Endpoints Added

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/workspace/lineage/:fileId` | Get lineage chain and processing history |

Response includes:
- `processingHistory`: Human-readable string (e.g., "Segmentation → Mesh Generation")
- `chain`: Array of files from root to current
- `rootIds`: Array of root file IDs
- `originalDataFile`: Suitable file for visualization overlay
- `hasLineage`: Boolean indicating if file has lineage

---

## Challenges & Solutions

### Challenge 1: Lineage not being stored in metadata

**Problem:** Segmentation results had no lineage despite code being in place.

**Root Cause:** Two separate code paths for inference completion:
1. `InferenceService.handleInferenceComplete` - had lineage code (never called)
2. `app.js` `onSuccess` callback - actually used, but had no lineage code

**Solution:** Updated `app.js` to:
1. Import `createLineage` helper
2. Build lineage from `inf.inputFileIds` in `onSuccess` callback
3. Pass lineage to `trackInferenceResults` → `trackModuleOutput`

### Challenge 2: Missing file ID in upload response

**Problem:** `/upload-inference` didn't track custom uploads in metadata and didn't return `file_id`.

**Solution:**
1. Track ALL uploads in workspace metadata (not just test data)
2. Return `file_id` in response for all cases

### Challenge 3: "See Info" showing "Loading..." forever

**Problem:** `fetchAndDisplayLineage()` was called before modal was added to DOM.

**Solution:** Swap order - append modal to DOM first, then fetch lineage.

### Challenge 4: SegmentationModule not storing file ID

**Problem:** Only `path` and `name` were stored when capturing inference data.

**Solution:** Add `id: result.file_id` to both test data and custom upload handlers.

---

## Data Flow

### Segmentation Pipeline with Lineage

```
1. Upload inference file
   → POST /upload-inference
   → Response includes file_id
   → SegmentationModule stores { path, name, id }

2. Run inference
   → POST /run-inference with { inputFileIds: [file_id] }
   → Session stores inputFileIds

3. Inference completes
   → app.js onSuccess callback
   → createLineage('segmentation', inf.inputFileIds, inferenceId)
   → trackInferenceResults(result, ..., lineage)
   → trackModuleOutput(sessionId, file, category, { lineage })
   → workspaceManager.addFileToMetadata({ ..., lineage })

4. View in File Browser
   → Right-click → See Info
   → GET /api/workspace/lineage/:fileId
   → Display "Segmentation" in Processing History
```

### Mesh Generation with Lineage

```
1. Select segmentation result
   → MeshModule gets file with id

2. Generate mesh
   → POST /api/mesh/generate with { sourceFileId: file.id }
   → Session stores sourceFileId

3. Mesh generation completes
   → createLineage('meshGeneration', [sourceFileId], meshId)
   → workspaceManager.addFileToMetadata({ ..., lineage })

4. View in File Browser
   → "Segmentation → Mesh Generation"
```

---

## Testing Notes

### Manual Testing Performed
- [x] Upload custom inference file → file_id returned and stored
- [x] Run segmentation → inputFileIds sent in request
- [x] Segmentation result has lineage in metadata.json
- [x] "See Info" shows "Segmentation" for processed file
- [x] "See Info" shows "Original Upload" for uploaded file
- [x] Mesh generation includes sourceFileId
- [x] Mesh result has lineage in metadata.json

---

## Commit

```
feat: Add data lineage/provenance tracking system

Implement processing lineage tracking for workspace files so each
processed file knows its origin and processing history.

Core infrastructure:
- Create lineageHelpers.js with utility functions
- Update WorkspaceManager.addFileToMetadata() to include lineage

Backend integration:
- Track input file IDs through segmentation pipeline
- Build and store lineage in app.js onSuccess callback
- Add lineage support to mesh generation
- Add /api/workspace/lineage/:fileId endpoint

Frontend integration:
- Update modules to send file IDs with requests
- Add lineage display to FileBrowser "See Info" panel
- Add WorkspaceAPI methods for lineage queries

Bug fixes:
- Fix /upload-inference to track custom uploads and return file_id
- Fix FileBrowser DOM timing for lineage display

Documentation:
- Add lineage tracking section to MODULE_CREATION.md
- Create DATA_LINEAGE_PLAN.md

15 files changed, 933 insertions(+), 36 deletions(-)
```

---

## Future Enhancements

1. **Visualization Overlay Integration**: Use `findOriginalDataFile()` to auto-load original data for 3D visualization overlay

2. **Denoising Module**: When implemented, integrate lineage tracking following the same pattern

3. **Lineage Visualization**: Could add a visual tree/graph showing processing history

4. **Batch Lineage**: Track lineage for batch operations

---

## Related Documentation

- [Data Lineage Plan](../vision/DATA_LINEAGE_PLAN.md)
- [Module Creation Guide](../guides/MODULE_CREATION.md) - Lineage Tracking section
