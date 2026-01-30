# Bug Fix Plan: 2 Open Issues

## Issue 1: Leftover .slices and .thumbnails folders after deleting all files (P4, C2)

### Root Cause
`cleanupSliceCache()` in `WorkspaceManager.js:610` only removes files with `${fileId}_` prefix. But several cache entry types use different naming:
- Annotation slices: `{fileHash}_{slice}_raw.png` (base64 of filePath)
- DL denoising slices: `dl_{pathHash}_{slice}_{size}.jpg` (md5 of path)

These aren't matched by the fileId prefix and remain orphaned. Additionally, `cleanupSliceCache()` never removes the `.slices` directory itself when empty (unlike `cleanupMeshPreviewCache()` which does).

### Fix
**File:** `WorkspaceManager.js`

1. In `cleanupSliceCache()` (~line 610): Also clean up annotation/denoising cache entries using the file's path to compute the same hashes used at creation time. After cleanup, remove `.slices` dir if empty.

2. In `deleteFile()` (~line 558): Pass `file.path` to `cleanupSliceCache()` so it can compute path-based hashes. Also remove `.thumbnails` directory if empty after thumbnail deletion.

### Testing
- Upload a TIFF file, view it in image viewer (generates slices/thumbnails), delete it, verify `.slices` and `.thumbnails` dirs are gone (or empty if other files remain)

---

## Issue 2: Mesh generation total vertices/faces show "N/A" (P4, C1)

### Root Cause
In `python/generate_mesh.py:604-618`, when `meshes` dict is empty (voxel-only JSON export), the stats object contains `totalVoxels` but not `totalVertices`/`totalFaces`.

### Fix
- `python/generate_mesh.py`: Always include `totalVertices` and `totalFaces` in stats (0 when no meshes)
- `public/workspace/js/modules/mesh/MeshModule.js`: Also display `totalVoxels` when available

### Testing
- Generate mesh with default settings (JSON + OBJ) -> verify vertices/faces counts display
- Generate mesh with only JSON selected -> verify stats display

---

## Files to Modify
1. `WorkspaceManager.js` - `cleanupSliceCache()` and `deleteFile()`
2. `python/generate_mesh.py` - stats calculation block
3. `public/workspace/js/modules/mesh/MeshModule.js` - results display
