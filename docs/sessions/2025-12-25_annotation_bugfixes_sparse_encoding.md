# Annotation Bug Fixes and Sparse Encoding

**Date:** 2025-12-25
**Phase:** Phase 9+ - Annotation Module Refinement
**Status:** ✅ Complete
**Complexity:** Medium

---

## Goals

**Primary Objectives:**
- [x] Fix brush preview not matching actual painting
- [x] Fix 1px brush not painting
- [x] Fix eraser behavior with invisible classes
- [x] Fix "Invalid width or height" error when resuming annotations
- [x] Fix save progress creating duplicate files
- [x] Fix "request entity too large" error for larger annotations
- [x] Implement sparse encoding for annotation data

---

## Summary

**Accomplished:**
- ✅ Fixed brush preview/painting mismatch by creating shared `getBrushPixels()` method
- ✅ Fixed 1px brush by correcting off-by-one error in radius calculation
- ✅ Made eraser only affect visible classes
- ✅ Added dimension guards to prevent createImageData errors
- ✅ Added `existingAnnotationId` tracking to update existing files instead of creating duplicates
- ✅ Increased Express JSON body limit from 100KB to 100MB
- ✅ Implemented sparse encoding with 90%+ size reduction for typical annotations

**Key Findings:**
- Default Express JSON limit (100KB) is far too small for annotation data
- Sparse encoding (5 bytes per pixel) is more efficient when <20% of pixels are annotated
- Brush preview was using different rendering logic than actual painting

---

## Detailed Log

### Task 1: Brush Preview Mismatch ✅

**Problem:**
Brush preview circle didn't match the actual pixels painted when clicking.

**Solution:**
Created shared `getBrushPixels(centerX, centerY, radius)` method used by both preview rendering and actual painting. Preview now uses ImageData for pixel-perfect rendering instead of canvas arc drawing.

**Files Changed:**
- `public/workspace/js/modules/annotation/utils/BrushEngine.js` - Added shared getBrushPixels, refactored updatePreview

---

### Task 2: 1px Brush Not Painting ✅

**Problem:**
Brush size 1 didn't paint anything.

**Solution:**
Fixed off-by-one error in radius calculation. When brush size is 1, radius should be 0 (single pixel), not negative.

**Files Changed:**
- `public/workspace/js/modules/annotation/utils/BrushEngine.js` - Fixed radius calculation

---

### Task 3: Eraser Erasing Invisible Classes ✅

**Problem:**
Eraser was erasing all annotations, including classes that weren't visible on the canvas.

**Solution:**
Modified eraser logic to only erase pixels whose class is currently visible (checked against `this.visibleClasses` set).

**Files Changed:**
- `public/workspace/js/modules/annotation/utils/BrushEngine.js` - Added visibility check in eraser mode

---

### Task 4: Resume Annotation Error ✅

**Problem:**
"Invalid width or height" error from `createImageData()` when resuming annotations.

**Solution:**
Added dimension guards in `renderAnnotations()` and `updatePreview()` to check that width and height are positive before calling createImageData.

**Files Changed:**
- `public/workspace/js/modules/annotation/utils/BrushEngine.js` - Added dimension validation

---

### Task 5: Save Progress Duplicates ✅

**Problem:**
Saving an unfinished annotation twice created two separate files instead of updating the existing one.

**Solution:**
- Added `currentAnnotationId` tracking in AnnotationModule
- Added `existingAnnotationId` parameter to save-progress endpoint
- Backend now detects and updates existing files when ID is provided

**Files Changed:**
- `public/workspace/js/modules/annotation/AnnotationModule.js` - Track currentAnnotationId
- `src/routes/annotation.routes.js` - Handle existingAnnotationId parameter

---

### Task 6: Request Entity Too Large ✅

**Problem:**
HTTP 500 error when saving annotations with data on more than 1 slice due to default JSON body limit.

**Solution:**
Increased Express JSON body limit from default (100KB) to 100MB in app.js configuration.

**Files Changed:**
- `src/app.js` - Changed `express.json({ limit: '100mb' })`

---

### Task 7: Sparse Encoding ✅

**Problem:**
Dense encoding sends full width×height arrays even when only a few pixels are annotated. For 512×512 with 100 slices, this could be ~34MB even with minimal annotations.

**Solution:**
Implemented sparse encoding that only transmits non-zero pixels:
- Each pixel encoded as 5 bytes: x (2), y (2), classId (1)
- Auto-selects sparse vs dense based on fill ratio
- Backward compatible with legacy dense format

**Size Reduction Examples:**
| Scenario | Dense Size | Sparse Size | Reduction |
|----------|-----------|-------------|-----------|
| 1000 pixels on 512×512 | 341 KB | 6.5 KB | 98% |
| 10000 pixels | 341 KB | 65 KB | 81% |

**Files Changed:**
- `public/workspace/js/modules/annotation/AnnotationModule.js` - Added encode/decode methods
- `python/create_annotation_tiff.py` - Added decode_sparse function
- `python/read_annotation_tiff.py` - Added sparse encoding output

---

## Code Changes Summary

### Modified Files (8 changes)
- `public/workspace/js/modules/annotation/AnnotationModule.js` - Sparse encoding, ID tracking
- `public/workspace/js/modules/annotation/utils/BrushEngine.js` - Brush fixes, dimension guards
- `python/create_annotation_tiff.py` - Sparse decoding support
- `python/read_annotation_tiff.py` - Sparse encoding output
- `src/app.js` - Increased JSON body limit
- `src/routes/annotation.routes.js` - Update existing files support
- `WorkspaceManager.js` - Minor fix
- `docs/vision/BUGS_ISSUES.md` - Updated bug tracking

---

## Testing Performed

**Manual Testing:**
- [x] Brush preview matches painting - ✅ Passed
- [x] 1px brush paints single pixels - ✅ Passed
- [x] Eraser only erases visible classes - ✅ Passed
- [x] Resume annotation loads correctly - ✅ Passed
- [x] Save progress updates existing file - ✅ Passed
- [x] Large annotations save without error - ✅ Passed
- [x] Sparse encoding reduces payload size - ✅ Passed

---

## Next Steps

**Future Work:**
1. [ ] Test with very large image stacks (2048×2048, 500+ slices)
2. [ ] Consider compression for dense-encoded slices
3. [ ] Add annotation data validation on load

---

## Related Documentation

**Related Sessions:**
- Previous annotation implementation sessions (Phases 1-9)

---

## Metrics

| Metric | Value |
|--------|-------|
| Files Changed | 8 files |
| Lines Added | +517 |
| Lines Removed | -107 |
| Commits | 1 |
| Issues Closed | 6 |

---

**Navigation:**
← [Session Index](INDEX.md) | [Documentation Index](../INDEX.md) →

---

**Session Type:** Bug Fix + Feature
**Phase Status After Session:** Complete
