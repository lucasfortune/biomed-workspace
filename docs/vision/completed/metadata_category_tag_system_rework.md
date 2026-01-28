# Metadata Category & Tag System Rework

## Overview
Rework file metadata system to use consistent categories and tags across the workspace application.

## Status: COMPLETED (Phases 1-5), Phase 6 DEFERRED

## Target Schema

### Three Categories with Tags

| Category | Tags | Description |
|----------|------|-------------|
| `uploads` | `raw`, `annotation` | User-created/uploaded content |
| `models` | Method: `denoising`/`segmentation`/`unspecified` + Type: `weights`/`config`/`info` | Training outputs & imports |
| `results` | Method: `denoising`/`annotation`/`segmentation`/`mesh` + Type: `data`/`info`/`wip` | Processing outputs |

Optional additional tag: `test-data` for built-in test data.

Additional mesh format tags: `json`, `obj`, `mtl`, `stl` for mesh result files.

---

## Implementation Phases

### Phase 1: Core Infrastructure ✅ COMPLETED
**Goal**: Update core metadata handling without breaking existing functionality

**Files modified:**
1. `WorkspaceManager.js` - Added helper methods:
   - `normalizeCategory(category)` - Map old categories to new
   - `normalizeTags(category, tags)` - Ensure proper tag structure
   - Updated `addFileToMetadata()` to use normalization

2. `src/helpers/lineageHelpers.js` - Updated `findOriginalDataFile()`:
   - Changed from `['raw_images', 'raw', 'inference_data']` to `['uploads']` with `raw` tag check

---

### Phase 2: Upload Endpoints ✅ COMPLETED
**Goal**: All upload points use new category/tag system

**Files modified:**

1. `src/routes/workspace.routes.js`:
   - `inference_data` → category: `uploads`, tags: `['raw']`
   - `raw_images` → category: `uploads`, tags: `['raw']`
   - Annotation uploads → category: `uploads`, tags: `['annotation']`

2. `src/routes/ml.routes.js`:
   - Training raw upload: category: `uploads`, tags: `['raw']` (add `test-data` if test)
   - Training annotation upload: category: `uploads`, tags: `['annotation']` (add `test-data` if test)
   - Inference upload: category: `uploads`, tags: `['raw']` (add `test-data` if test)

3. `src/routes/denoising.routes.js`:
   - DL denoising test data: category: `uploads`, tags: `['raw', 'test-data']`

4. `public/workspace/js/components/FileBrowser.js`:
   - Removed `inference_data` upload option (now treated as raw)

---

### Phase 3: Result File Creation ✅ COMPLETED
**Goal**: All processing outputs use new category/tag system

**Files modified:**

1. `src/routes/denoising.routes.js`:
   - Filter denoising result: category: `results`, tags: `['denoising', 'data']`

2. `src/routes/annotation.routes.js`:
   - Progress save: category: `results`, tags: `['annotation', 'wip']`
   - Final annotation: category: `uploads`, tags: `['annotation']`
   - Sidecar files: category: `results`, tags: `['annotation', 'info']`

3. `src/routes/mesh.routes.js`:
   - Mesh JSON: category: `results`, tags: `['mesh', 'data', 'json']`
   - Mesh OBJ: category: `results`, tags: `['mesh', 'data', 'obj']`
   - Mesh MTL: category: `results`, tags: `['mesh', 'data', 'mtl']`
   - Mesh STL: category: `results`, tags: `['mesh', 'data', 'stl']`
   - Mesh metadata: category: `results`, tags: `['mesh', 'info']`

4. `src/app.js` - Segmentation results tracking:
   - Segmented TIFF: category: `results`, tags: `['segmentation', 'data']`
   - Segmentation metadata: category: `results`, tags: `['segmentation', 'info']`

5. `src/services/FileService.js`:
   - Updated segmentation result tracking with proper tags

6. `src/services/DenoisingService.js`:
   - DL denoising results: category: `results`, tags: `['denoising', 'data']`

---

### Phase 4: Model File Tracking ✅ COMPLETED
**Goal**: All model files properly tracked with method/type tags

**Files modified:**

1. `src/routes/ml.routes.js` - Model import endpoint:
   - .pth file: category: `models`, tags: `['unspecified', 'weights']`
   - .json config: category: `models`, tags: `['unspecified', 'config']`

2. Model training already had proper tags from previous work

---

### Phase 5: FileSelector Updates ✅ COMPLETED
**Goal**: All FileSelectors filter correctly with new system

**Core change to `FileSelector.js`:**
- Added `excludeTags` option
- Updated filtering logic to handle new tag structure

**Module updates:**

1. **Segmentation** (`handlers/FileHandler.js`, `handlers/ImportHandler.js`):
   - Raw images: fileType: `uploads`, filterTags: `['raw']`
   - Annotations: fileType: `uploads`, filterTags: `['annotation']`

2. **DL Denoising** (`handlers/FileHandler.js`, `DLDenoisingModule.js`, `InferenceHandler.js`):
   - Input data: fileType: `uploads`, filterTags: `['raw']`
   - Model import config: fileType: `models`, filterTags: `['config']`
   - Model import weights: fileType: `models`, filterTags: `['weights']`

3. **Filter Denoising** (`FilterDenoisingModule.js`):
   - Input: fileType: `uploads`, filterTags: `['raw']`

4. **Annotation** (`AnnotationModule.js`):
   - Source: fileType: `uploads`, filterTags: `['raw']`
   - Recent Results: category `results` with denoising/segmentation data tags

5. **Mesh** (`MeshModule.js`):
   - Input: Annotations from `uploads` + segmentation results from `results`

6. **Visualization** (`VisualizationModule.js`):
   - Input: fileType: `results`, filterTags: `['mesh', 'data', 'json']` (only JSON mesh files)

7. **ImageViewer** (`ImageViewerModule.js`):
   - Kept `acceptAllTiff: true` - shows all TIFF files regardless of category

---

### Phase 6: Model Validation ⏸️ DEFERRED
**Goal**: Validate uploaded models when selected in modules

**Reason for deferral**:
- Only affects imported models (tagged `unspecified`)
- Models trained within the app already have proper method tags
- Wrong model selection will fail at inference time anyway
- Can be implemented later if users report confusion
- Alternative: Prompt users during import to specify model type

**Original plan (for future implementation):**
1. Create validation helper in `src/helpers/modelValidation.js`
2. Add API endpoint `POST /api/workspace/validate-model`
3. Update FileSelector.js with `onModelValidate` callback

---

## File Change Summary

| File | Phase | Changes |
|------|-------|---------|
| `WorkspaceManager.js` | 1 | Add normalization helpers |
| `lineageHelpers.js` | 1 | Update category detection |
| `workspace.routes.js` | 2 | Update upload metadata |
| `ml.routes.js` | 2,4 | Upload metadata, model import tracking |
| `denoising.routes.js` | 2,3 | Test data & result metadata |
| `annotation.routes.js` | 3 | Result metadata |
| `mesh.routes.js` | 3 | Result metadata with format tags |
| `app.js` | 3 | Segmentation result tracking |
| `FileService.js` | 3 | Segmentation result tracking |
| `DenoisingService.js` | 3 | DL denoising result tracking |
| `FileBrowser.js` | 2 | Remove inference upload option |
| `FileSelector.js` | 5 | Add excludeTags support |
| Segmentation handlers | 5 | Update filter configs |
| DL Denoising handlers | 5 | Update filter configs |
| FilterDenoisingModule.js | 5 | Update filter config |
| AnnotationModule.js | 5 | Update filter config |
| MeshModule.js | 5 | Update filter config |
| VisualizationModule.js | 5 | Update filter config for JSON only |

---

## Verification Completed

1. Fresh workspace tested with full pipeline
2. All files have correct category/tags in metadata
3. All module FileSelectors show only relevant files
4. Mesh format tags properly filter JSON-only for visualization
