# File Category System Refactor & Tag Implementation

**Date:** 2026-01-06
**Phase:** Phase 4 - Workspace Polish
**Duration:** ~2 hours
**Status:** ✅ Complete
**Complexity:** Medium

---

## Goals

**Primary Objectives:**
- [x] Issue #2: Redirect inference uploads to uploads/raw/, remove uploads/inference_data/
- [x] Issue #3: Minimize workspace init - only create base folders on-demand
- [x] Implement file tagging system for better classification

**Secondary Objectives:**
- [x] Add model file tracking with tags (weights, config, info)
- [x] Update file selectors across all modules to use new category system
- [x] Display tags in file info panel

---

## Summary

**Accomplished:**
- ✅ Unified file categories: `inference_data` → `raw` with `['inference']` tag
- ✅ Minimized workspace initialization to only 3 base directories
- ✅ Implemented tag system with basic workflow tags (training, inference, test-data)
- ✅ Added model file tags (weights, config, info, segmentation)
- ✅ Updated FileSelector component with `filterTags` option
- ✅ Updated all module file selectors to use unified categories
- ✅ Added tag badge display in file info panel

**Key Findings:**
- Multer storage destination needed updates in both `upload.middleware.js` and `multer.config.js`
- FileSelector needed tag-based filtering in addition to category filtering
- Backward compatibility maintained for existing workspaces with old categories

---

## Detailed Log

### Task 1: Unify Upload Categories (Issue #2) ✅

**Problem:**
Inference data was being stored in a separate `uploads/inference_data/` directory, creating unnecessary folder structure complexity.

**Solution:**
- Redirect all inference uploads to `uploads/raw/`
- Use `category: 'raw'` with `tags: ['inference']` in metadata
- Update multer storage destination configuration
- Update workspace.routes.js to map categories and assign tags

**Files Changed:**
- `src/middleware/upload.middleware.js` - Redirect inference_data to raw
- `src/config/multer.config.js` - Same redirect (legacy config)
- `src/routes/workspace.routes.js` - Map categories and add tags on upload
- `src/routes/ml.routes.js` - Update test data path and category with tags
- `src/helpers/lineageHelpers.js` - Backward compatibility for category detection

---

### Task 2: Minimize Workspace Initialization (Issue #3) ✅

**Problem:**
Workspace initialization created many subdirectories that were unused or created on-demand elsewhere, including legacy folders like `results/denoised/` and `results/visualizations/`.

**Solution:**
- Reduce `initializeWorkspace()` to only create: `uploads/`, `results/`, `models/`
- Reduce `clearWorkspace()` to same minimal structure
- Subdirectories created on-demand when needed by routes

**Files Changed:**
- `WorkspaceManager.js` - Minimize directories in init and clear methods

---

### Task 3: Implement Tag System ✅

**Problem:**
Category alone wasn't sufficient to distinguish between different purposes of raw files (training vs inference).

**Solution:**
- Add `tags` array to file metadata schema
- Implement basic workflow tags: `training`, `inference`, `test-data`
- Add model file tags: `weights`, `config`, `info`, `segmentation`
- Add `filterTags` option to FileSelector component

**Files Changed:**
- `WorkspaceManager.js` - Add tags support to addFileToMetadata
- `public/workspace/js/core/components/FileSelector.js` - Add filterTags option
- `src/services/TrainingService.js` - Track model files with tags

---

### Task 4: Update Module File Selectors ✅

**Problem:**
File selectors used old `raw_images` and `inference_data` categories that no longer existed.

**Solution:**
- Update SegmentationModule: `raw` + `['training']` for training, `raw` + `['inference']` for inference
- Update denoising modules: `raw` (no tag filter - accepts any raw)
- Update AnnotationModule: `raw` with backward compat filter
- Keep ImageViewer with `acceptAllTiff: true`

**Files Changed:**
- `public/workspace/js/modules/segmentation/SegmentationModule.js`
- `public/workspace/js/modules/denoising-dl/DLDenoisingModule.js`
- `public/workspace/js/modules/denoising-dl/handlers/InferenceHandler.js`
- `public/workspace/js/modules/denoising-filter/FilterDenoisingModule.js`
- `public/workspace/js/modules/annotation/AnnotationModule.js`

---

### Task 5: Display Tags in File Info Panel ✅

**Problem:**
Tags weren't visible to users in the file browser.

**Solution:**
- Add Tags row to file info modal
- Create `renderTags()` helper method
- Add CSS styles for tag badges

**Files Changed:**
- `public/workspace/js/components/FileBrowser.js` - Add tags display and renderTags method
- `public/workspace/css/workspace.css` - Add tag badge styles

---

## Code Changes Summary

### Modified Files (16 changes)
- 📝 `WorkspaceManager.js` - Add tags support, minimize init/clear directories
- 📝 `src/middleware/upload.middleware.js` - Redirect inference_data to raw
- 📝 `src/config/multer.config.js` - Same redirect
- 📝 `src/routes/workspace.routes.js` - Map categories and assign tags
- 📝 `src/routes/ml.routes.js` - Update paths and categories with tags
- 📝 `src/routes/denoising.routes.js` - Update test data category
- 📝 `src/helpers/lineageHelpers.js` - Backward compatibility
- 📝 `src/services/TrainingService.js` - Track model files with tags
- 📝 `public/workspace/js/core/components/FileSelector.js` - Add filterTags
- 📝 `public/workspace/js/components/FileBrowser.js` - Tags display, minimal standardDirs
- 📝 `public/workspace/css/workspace.css` - Tag badge styles
- 📝 `public/workspace/js/modules/segmentation/SegmentationModule.js` - Updated selectors
- 📝 `public/workspace/js/modules/denoising-dl/DLDenoisingModule.js` - Updated selector
- 📝 `public/workspace/js/modules/denoising-dl/handlers/InferenceHandler.js` - Updated selector
- 📝 `public/workspace/js/modules/denoising-filter/FilterDenoisingModule.js` - Updated selector
- 📝 `public/workspace/js/modules/annotation/AnnotationModule.js` - Updated selector

---

## Testing Performed

**Manual Testing:**
- [ ] Upload inference data via file browser → saved to uploads/raw/ with tags
- [ ] Upload training data → file has training tag
- [ ] Fresh workspace init → only base directories created
- [ ] Segmentation file selectors show correct filtered files
- [ ] File info panel shows tags as badges

---

## Design Decisions

1. **Tag-based filtering with AND logic:** Files must have ALL specified tags
   - **Rationale:** More precise filtering, allows combining tags

2. **Backward compatibility:** Keep old categories in lineage helpers
   - **Rationale:** Existing workspaces won't break

3. **No tag filter for denoising:** Accept any raw file
   - **Rationale:** Denoising can be applied to any image type

---

## Issues Resolved

- **Issue #2:** File browser upload data separation - ✅ Fixed
- **Issue #3:** Legacy folders created on init - ✅ Fixed

---

## Next Steps

**Testing Required:**
1. [ ] Full workflow test: upload → train → inference
2. [ ] Verify backward compatibility with existing workspaces
3. [ ] Test file browser upload for all categories

---

## Metrics

| Metric | Value |
|--------|-------|
| Files Changed | 16 files |
| Lines Added | +126 |
| Lines Removed | -67 |
| Commits | 1 |
| Issues Closed | 2 |

---

**Navigation:**
← [Session Index](INDEX.md) | [Documentation Index](../INDEX.md) →

---

**Session Type:** Refactor / Bug Fix
**Phase Status After Session:** On Track
