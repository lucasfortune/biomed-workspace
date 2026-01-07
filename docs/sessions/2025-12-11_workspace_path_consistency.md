# Workspace Directory Structure Consistency & Visualization Path Fixes

**Date:** 2025-12-11
**Phase:** Phase 3 - File Browser & Workspace Management
**Duration:** ~3 hours
**Status:** ✅ Complete
**Complexity:** Architectural

---

## 🎯 Goals

Fix directory structure inconsistencies and visualization data loading issues introduced during Phase 3.1 workspace migration.

**Primary Objectives:**
- [x] Make training model output paths use consistent module-first structure
- [x] Make inference results paths use consistent module-first structure
- [x] Fix inference data_path to use workspace directory structure
- [x] Fix visualization file loading to use workspace-scoped routes
- [x] Enable proper 3D visualization rendering with new paths

**Secondary Objectives:**
- [x] Maintain backward compatibility with legacy paths
- [x] Test complete inference workflow end-to-end

---

## 📝 Summary

**Accomplished:**
- ✅ Fixed training output directory structure to use `/models/segmentation/{trainingId}/`
- ✅ Fixed inference results directory structure to use `/results/segmentation/{trainingId}/`
- ✅ Fixed inference endpoint to convert relative data paths to absolute workspace paths
- ✅ Added workspace-scoped static file serving routes with session verification
- ✅ Implemented automatic path conversion from filesystem paths to web-accessible URLs
- ✅ Updated visualization overlay loading to use new workspace paths
- ✅ Complete segmentation workflow now functional with workspace structure

**Key Findings:**
- Directory structure was inconsistent: models used `/models/{module}/{trainingId}/` but results used `/results/{trainingId}/{subdirs}/`
- Python scripts return absolute filesystem paths that need conversion to web URLs
- Visualization files weren't accessible because static file serving still pointed to old `/results/` directory
- Inference data path was passed as relative but Python expected absolute

**Blockers Encountered:**
- None - all issues resolved

---

## 📋 Detailed Log

### Task 1: Training Model Output Path Consistency ✅

**Problem:**
Training models were being saved to `workspaces/{ID}/models{trainingId}` (missing `/` and `/segmentation/` subdirectory) when they should be in `workspaces/{ID}/models/segmentation/{trainingId}/`.

**Investigation:**
- User reported path issue in server.js training endpoint
- Checked line 1473 where output_dir was being constructed
- Found missing `'segmentation'` subdirectory in path

**Solution:**
```javascript
// server.js:1473
output_dir: path.join(workspacePath, 'models', 'segmentation', trainingId)
```

**Result:**
Training models now save to correct workspace location with module organization.

**Files Changed:**
- `server.js:1473` - Added `/segmentation/` to training output path

---

### Task 2: Inference Results Output Path Consistency ✅

**Problem:**
Inference results were being saved to `workspaces/{ID}/results/{trainingId}/` but should be in `workspaces/{ID}/results/segmentation/{trainingId}/` to match the module-first pattern used by models.

**User's Design Decision:**
User identified inconsistency between:
- Models: `workspaces/{ID}/models/segmentation/{trainingId}/` (module-first)
- Results: `workspaces/{ID}/results/{trainingId}/segmented/` (trainingId-first)

User chose **Option A**: Add module level to results to match models pattern.

**Target Structure:**
```
workspaces/{ID}/
├── models/segmentation/{trainingId}/
└── results/segmentation/{trainingId}/
    ├── segmented/
    └── visualizations/
```

**Solution:**
Updated all path generation to include `/segmentation/` subdirectory:

**Server-side (server.js):**
```javascript
// Lines 1888, 1891, 1894
if (req.session.importedModel && req.session.importedModel.validated) {
  actualOutputPath = path.join(workspacePath, 'results', 'segmentation', `imported_model_${timestamp}`, 'inference_result.tif');
} else if (training_id) {
  actualOutputPath = path.join(workspacePath, 'results', 'segmentation', training_id, 'inference_result.tif');
} else {
  actualOutputPath = path.join(workspacePath, 'results', 'segmentation', `inference_${inferenceId}`, 'inference_result.tif');
}
```

**Client-side workspace (inference.js):**
```javascript
// Lines 68, 78
inferenceRequestBody = {
  data_path: uploadResult.file_path,
  output_path: `results/segmentation/imported_model_${Date.now()}/segmented/inference_result.tif`,
};

inferenceRequestBody = {
  model_path: `models/${trainingId}/best_model.pth`,
  data_path: uploadResult.file_path,
  output_path: `results/segmentation/${trainingId}/segmented/inference_result.tif`,
  training_id: trainingId
};

// Fallback paths (lines 254-256)
const baseResultPath = usingImportedModel
  ? `/results/segmentation/imported_model_${Date.now()}`
  : `/results/segmentation/${trainingId}`;
```

**Client-side classic (inference.js):**
```javascript
// Lines 62, 72, 197-199 - Same updates as workspace version
```

**Result:**
Consistent directory organization across models and results, both using `/segmentation/` module subdirectory.

**Files Changed:**
- `server.js:1888, 1891, 1894` - Added `/segmentation/` to results path generation
- `public/workspace/js/modules/segmentation/inference.js:68, 78, 254-256` - Updated request and fallback paths
- `public/classic/js/inference.js:62, 72, 197-199` - Updated request and fallback paths

---

### Task 3: Inference Data Path Workspace Resolution ✅

**Problem:**
User reported error when running inference:
```
Inference failed: Error: Input file not found: uploads/inference_data/1765472692872-tryp_stck1_crop2_norm_full_inference2.tif
```

The code was looking for the uploaded file in the old `/uploads` directory instead of the new workspace structure `workspaces/{sessionId}/uploads/`.

**Investigation:**
- Error indicated Python script couldn't find input file
- Checked `/run-inference` endpoint (server.js:1804)
- Found `data_path` from request body was being passed directly to Python without workspace path prefix
- Python expected absolute path but received relative path

**Solution:**
Added path resolution logic at the start of `/run-inference` endpoint:

```javascript
// server.js:1810-1829
// Convert data_path to absolute workspace path if it's not already absolute
const sessionId = req.session.id;
const workspacePath = workspaceManager.getWorkspacePath(sessionId);
let actualDataPath = data_path;

// Check if data_path is relative or absolute
if (!path.isAbsolute(data_path)) {
  // If relative, join with workspace path
  actualDataPath = path.join(workspacePath, data_path);
  console.log('Converted relative data path to absolute:', actualDataPath);
}

// Verify the data file exists
if (!fs.existsSync(actualDataPath)) {
  return res.status(400).json({
    error: 'Input file not found',
    details: `File not found at: ${actualDataPath}`,
    original_path: data_path
  });
}
```

Also updated the Python spawn call to use `actualDataPath` instead of `data_path`:
```javascript
// server.js:1954
startInferenceProcess(actualModelPath, actualDataPath, actualOutputPath, inferenceId, io);
```

And removed duplicate sessionId/workspacePath declarations (line 1901-1902).

**Result:**
Inference now correctly locates uploaded files in workspace directory structure.

**Files Changed:**
- `server.js:1810-1829` - Added data path resolution and validation
- `server.js:1954` - Updated to use actualDataPath
- `server.js:1900` - Removed duplicate declarations

---

### Task 4: Visualization Data Loading with Workspace Routes ✅

**Problem:**
User reported empty black visualization window with 404 errors in console:
```
3D visualization failed: Error: Failed to load data: 404 Not Found
```

Visualization files were saved to `workspaces/{sessionId}/results/segmentation/{trainingId}/visualizations/` but the browser was trying to fetch from `/results/{trainingId}/visualizations/` which didn't exist.

**Root Causes:**
1. Static file serving still pointed to old `/results/` directory
2. Python script returned absolute filesystem paths, not web-accessible URLs
3. No route existed to serve files from workspace directories

**Investigation:**
- Checked visualization loading in `meshCreation.js:50`
- Found it was trying to fetch from `/results/${inferenceId}/original-data-web`
- Checked server.js and found `app.use('/results', express.static('results'))` (line 2197)
- This served from old `results/` directory, not new `workspaces/{sessionId}/results/`

**Solution:**

**Part 1: Add Workspace-Scoped Static File Serving**

Created new routes with session verification:

```javascript
// server.js:2196-2224
// Serve static files from workspace directories (session-scoped)
app.use('/workspaces/:sessionId/results', requireAuth, (req, res, next) => {
  const sessionId = req.params.sessionId;

  // Verify the session ID matches the current user's session
  if (sessionId !== req.session.id) {
    return res.status(403).json({ error: 'Access denied to this workspace' });
  }

  const workspacePath = workspaceManager.getWorkspacePath(sessionId);
  const resultsPath = path.join(workspacePath, 'results');

  // Serve files from the workspace results directory
  express.static(resultsPath)(req, res, next);
});

app.use('/workspaces/:sessionId/uploads', requireAuth, (req, res, next) => {
  const sessionId = req.params.sessionId;

  // Verify the session ID matches the current user's session
  if (sessionId !== req.session.id) {
    return res.status(403).json({ error: 'Access denied to this workspace' });
  }

  const workspacePath = workspaceManager.getWorkspacePath(sessionId);
  const uploadsPath = path.join(workspacePath, 'uploads');

  // Serve files from the workspace uploads directory
  express.static(uploadsPath)(req, res, next);
});

// Legacy static file serving (for backward compatibility)
app.use('/uploads', express.static('uploads'));
app.use('/results', express.static('results'));
```

**Part 2: Convert Python Filesystem Paths to Web URLs**

When Python returns results, convert absolute paths to web-accessible URLs:

```javascript
// server.js:2809-2852 (Main FINAL_RESULT handling)
// Store original paths for file tracking
const originalPaths = {
  output_path: finalResult.output_path,
  metadata_path: finalResult.metadata_path,
  visualization_path: finalResult.visualization_path,
  original_data_overlay_path: finalResult.original_data_overlay_path
};

// Track inference outputs in file browser (using original absolute paths)
if (finalResult.success && inference) {
  if (originalPaths.output_path && fs.existsSync(originalPaths.output_path)) {
    await trackModuleOutput(inference.sessionId, originalPaths.output_path, 'segmentations');
  }
  // ... etc for other paths
}

// Convert absolute file paths to web-accessible paths
const workspacePath = workspaceManager.getWorkspacePath(inference.sessionId);
const sessionId = inference.sessionId;

if (finalResult.output_path) {
  finalResult.output_path = `/workspaces/${sessionId}/results/` +
    path.relative(path.join(workspacePath, 'results'), finalResult.output_path);
}
// ... etc for all paths

io.to(`inference-${inferenceId}`).emit('inference-complete', {
  success: true,
  result: finalResult  // Now contains web-accessible paths
});
```

Applied same logic to backup JSON parsing section (lines 2876-2921).

**Part 3: Update Overlay Loading**

Updated meshCreation.js to use new path from inference result:

```javascript
// meshCreation.js:49-58
// Use the original_data_overlay_path from inferenceResult if available
let fetchUrl;
if (window.inferenceResult && window.inferenceResult.original_data_overlay_path) {
  fetchUrl = window.inferenceResult.original_data_overlay_path;
  console.log('Using overlay path from inference result:', fetchUrl);
} else {
  // Fallback to legacy endpoint
  fetchUrl = `/results/${inferenceId}/original-data-web`;
  console.log('Using legacy overlay endpoint:', fetchUrl);
}
```

**Result:**
- Visualization data now loads successfully from workspace directories
- 3D meshes render correctly
- Original data overlay loads and displays
- Complete visualization workflow functional

**Files Changed:**
- `server.js:2196-2228` - Added workspace-scoped static file routes
- `server.js:2809-2852` - Added path conversion for main result
- `server.js:2876-2921` - Added path conversion for backup result
- `public/workspace/js/modules/segmentation/visualization/meshCreation.js:49-58` - Updated overlay loading

---

## 💻 Code Changes Summary

### Modified Files (5 changes)

**server.js** - Workspace path consistency and static file serving
- Lines 1473: Added `/segmentation/` to training output path
- Lines 1810-1829: Added data path resolution and validation for inference
- Lines 1888, 1891, 1894: Added `/segmentation/` to inference results paths
- Lines 1900: Removed duplicate sessionId/workspacePath declarations
- Lines 1954: Updated to use actualDataPath for Python script
- Lines 2196-2228: Added workspace-scoped static file serving routes with session verification
- Lines 2809-2852: Added filesystem-to-web path conversion for main results
- Lines 2876-2921: Added filesystem-to-web path conversion for backup results

**public/workspace/js/modules/segmentation/inference.js** - Request and fallback paths
- Lines 68, 78: Added `/segmentation/` to inference request paths
- Lines 254-256: Added `/segmentation/` to fallback result paths

**public/classic/js/inference.js** - Request and fallback paths
- Lines 62, 72: Added `/segmentation/` to inference request paths
- Lines 197-199: Added `/segmentation/` to fallback result paths

**public/workspace/js/modules/segmentation/visualization/meshCreation.js** - Overlay loading
- Lines 49-58: Updated to use `original_data_overlay_path` from inference result with legacy fallback

---

## 🧪 Testing Performed

**Manual Testing:**
- [x] Training workflow - ✅ Models save to `/models/segmentation/{trainingId}/`
- [x] Inference workflow - ✅ Results save to `/results/segmentation/{trainingId}/`
- [x] File structure verification - ✅ Consistent module-first organization
- [x] Inference data upload - ✅ Files located in workspace structure
- [x] Visualization data loading - ✅ 3D meshes render correctly
- [x] Original data overlay - ✅ Overlay planes load and display
- [x] Complete segmentation pipeline - ✅ All 5 steps functional

**Integration Testing:**
- [x] Upload training data → train model → check output directory structure
- [x] Upload inference data → run inference → check results directory structure
- [x] Run inference → navigate to step 5 → verify visualization loads
- [x] Toggle original data overlay → verify planes render correctly
- [x] Session verification → workspace routes deny access to other sessions

---

## 💡 Lessons Learned

### Technical Insights

1. **Path Consistency is Critical**: When designing file storage architecture, ensure consistent patterns across all data types. Mixed patterns (module-first vs ID-first) create confusion and increase maintenance burden.

2. **Absolute vs Relative Path Handling**: Always validate and normalize paths at system boundaries. Python expects absolute paths, browsers need relative web URLs - conversion must happen at the server boundary.

3. **Static File Serving with Multi-tenancy**: When serving files from session-isolated directories, static file serving must:
   - Validate session ownership before serving
   - Use dynamic path resolution based on session ID
   - Maintain backward compatibility with legacy paths

4. **Web Path Generation**: Never send filesystem paths to the browser. Always convert to web-accessible URLs that:
   - Start with `/` for absolute URL paths
   - Include session identifiers for multi-tenancy
   - Map to server routes that verify access permissions

### Design Decisions

1. **Decision: Use Module-First Directory Pattern**
   - **Alternatives considered:**
     - Option A: `/results/{module}/{trainingId}/` (module-first) ← **CHOSEN**
     - Option B: `/results/{trainingId}/` with module metadata only
   - **Why chosen:**
     - Matches existing models structure
     - Better organization for future modules
     - Easier to browse workspace by module type
     - More intuitive for users
   - **Trade-offs:**
     - Required updating 5 files
     - Need to maintain backward compatibility
     - More complex path construction

2. **Decision: Convert Paths at Server Boundary**
   - **Alternatives considered:**
     - Option A: Python returns web paths
     - Option B: Server converts filesystem to web paths ← **CHOSEN**
     - Option C: Client constructs paths from inference ID
   - **Why chosen:**
     - Separation of concerns (Python doesn't know about web structure)
     - Single source of truth for path conversion logic
     - Easier to update web path format later
   - **Trade-offs:**
     - Need to track original paths for file operations
     - Path conversion logic in two places (main + backup result)

3. **Decision: Session-Scoped Static Routes**
   - **Alternatives considered:**
     - Option A: Session parameter in URL with validation ← **CHOSEN**
     - Option B: Proxy all file requests through API endpoints
     - Option C: Pre-signed URLs with expiration
   - **Why chosen:**
     - Simple to implement with Express middleware
     - Built-in session verification
     - Compatible with browser file caching
     - Supports streaming large files
   - **Trade-offs:**
     - Session ID exposed in URL (not sensitive data)
     - Need separate routes for uploads and results

### Best Practices Identified

- **Always normalize paths at system boundaries** (client→server, server→Python)
- **Use workspace-relative paths in metadata** to support workspace portability
- **Store both filesystem and web paths** when both are needed for different operations
- **Validate file existence before spawning processes** to provide better error messages
- **Keep legacy routes for backward compatibility** during migration periods

---

## 🚧 Known Issues

### Issues Resolved
- **Training output path missing /segmentation/** - ✅ Fixed
- **Inference results path inconsistent with models** - ✅ Fixed
- **Inference data_path not found in workspace** - ✅ Fixed
- **Visualization files not loading (404 errors)** - ✅ Fixed
- **Original data overlay not accessible** - ✅ Fixed

### Issues Created
- None

---

## 🔄 Next Steps

**Immediate Follow-up:**
- [x] Complete end-to-end testing of segmentation workflow
- [x] Update documentation to reflect new directory structure

**Future Work:**
1. [ ] Proceed with Phase 3.2: File Browser UI Core
2. [ ] Update old workspace migrations to use new structure
3. [ ] Consider path helper utilities to reduce duplication

**Deferred:**
- None

---

## 🔗 Related Documentation

**Created/Updated:**
- This session log - Created

**Related Sessions:**
- [Phase 3.1 Backend Infrastructure](2025-12-04_phase3_1_backend_infrastructure.md) - Initial workspace structure implementation

**Architecture Decisions:**
- Module-first directory organization pattern established
- Server-side path conversion pattern established
- Session-scoped static file serving pattern established

---

## 📊 Metrics

| Metric | Value |
|--------|-------|
| Time Spent | ~3 hours |
| Files Changed | 5 files |
| Lines Added | ~150 |
| Lines Removed | ~10 |
| Bugs Fixed | 5 |
| Design Decisions | 3 |
| API Endpoints Modified | 1 |
| Routes Added | 2 |

---

## 🗒️ Notes

**Key Patterns Established:**

1. **Directory Structure Pattern:**
   ```
   workspaces/{sessionId}/
   ├── uploads/
   │   ├── raw/
   │   ├── annotations/
   │   └── inference_data/
   ├── models/
   │   └── {module}/
   │       └── {trainingId}/
   └── results/
       └── {module}/
           └── {trainingId}/
               ├── segmented/
               └── visualizations/
   ```

2. **Path Conversion Pattern:**
   ```javascript
   // Filesystem path (Python returns this)
   /absolute/path/workspaces/{sessionId}/results/segmentation/{id}/visualizations/viz.json

   // Web path (Server converts to this)
   /workspaces/{sessionId}/results/segmentation/{id}/visualizations/viz.json

   // Conversion logic
   const webPath = `/workspaces/${sessionId}/results/` +
     path.relative(path.join(workspacePath, 'results'), filesystemPath);
   ```

3. **Session-Scoped Route Pattern:**
   ```javascript
   app.use('/workspaces/:sessionId/results', requireAuth, (req, res, next) => {
     // Verify session ownership
     if (req.params.sessionId !== req.session.id) {
       return res.status(403).json({ error: 'Access denied' });
     }
     // Serve from workspace directory
     express.static(workspacePath + '/results')(req, res, next);
   });
   ```

**Migration Considerations:**

Old structure (legacy, still supported for backward compatibility):
- `uploads/` - global directory
- `results/` - global directory
- `models/` - global directory

New structure (Phase 3+):
- `workspaces/{sessionId}/uploads/` - session-isolated
- `workspaces/{sessionId}/results/segmentation/` - module-organized
- `workspaces/{sessionId}/models/segmentation/` - module-organized

---

**Navigation:**
← [Session Index](INDEX.md) | [Documentation Index](../INDEX.md) →

---

**Session Type:** Bug Fix / Architectural
**Phase Status After Session:** Phase 3.1 Backend Complete, Path Consistency Established
