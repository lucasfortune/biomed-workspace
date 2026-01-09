# TIFF Stack Duplicate and Split Operations

**Date:** 2026-01-09
**Phase:** Maintenance - Bug Fix
**Duration:** ~1 hour
**Status:** ✅ Complete
**Complexity:** Medium

---

## Goals

**Primary Objectives:**
- [x] Add TIFF stack duplicate functionality to file browser
- [x] Add TIFF stack split functionality to file browser
- [x] Track new files correctly in workspace metadata with lineage
- [x] Update help documentation

---

## Summary

**Accomplished:**
- ✅ Created Python script for TIFF stack operations (duplicate, split, info)
- ✅ Added backend API endpoints for duplicate and split operations
- ✅ Added context menu items to file browser (conditional based on file type)
- ✅ Implemented split dialog with slice preview and delete-original option
- ✅ Added lineage tracking for duplicated and split files
- ✅ Updated help documentation and manifest

**Key Decisions:**
- Split UI uses single split point (stack divides into 2 parts)
- Context menu items only shown for TIFF files (split only for multi-slice)
- User chooses via checkbox whether to delete original after split (default: checked)

---

## Detailed Log

### Task 1: Python Script ✅

**Problem:**
Need backend logic to duplicate and split TIFF stacks.

**Solution:**
Created `python/tiff_stack_ops.py` with three commands:
- `info <input>` - Get slice count and dimensions
- `duplicate <input> <output>` - Copy TIFF file
- `split <input> <out1> <out2> <split_at>` - Split at specified slice

Uses standard output protocol: `SUCCESS:<json>`, `ERROR:<message>`, `INFO:<json>`

**Files Changed:**
- `python/tiff_stack_ops.py` - New file (~170 lines)

---

### Task 2: Backend API Endpoints ✅

**Problem:**
Need REST endpoints to trigger duplicate/split operations.

**Solution:**
Added two new endpoints to `files.routes.js`:
- `POST /api/workspace/file/:fileId/duplicate` - Creates copy with `_copy.tif` suffix
- `POST /api/workspace/file/:fileId/split` - Splits at specified slice, optionally deletes original

Both endpoints:
- Validate file is TIFF
- Spawn Python script
- Add new files to metadata with lineage
- Log activity

**Files Changed:**
- `src/routes/files.routes.js` - Added ~240 lines

---

### Task 3: Frontend Context Menu ✅

**Problem:**
Need UI to access duplicate/split operations.

**Solution:**
Modified `showFileContextMenu()` to:
1. Check if file is TIFF
2. Fetch slice count via `/api/workspace/tiff-info/:fileId`
3. Add "Duplicate Stack" for all TIFFs
4. Add "Split Stack..." only for multi-slice TIFFs

Added three new methods:
- `duplicateStack(fileId)` - Calls API, refreshes, notifies
- `showSplitDialog(fileId, fileName, sliceCount)` - Modal with slice input
- `splitStack(fileId, splitAt, deleteOriginal)` - Calls API

**Files Changed:**
- `public/workspace/js/components/FileBrowser.js` - Added ~170 lines

---

### Task 4: CSS and Polish ✅

**Problem:**
Split dialog needs styling consistent with existing modals.

**Solution:**
Added CSS classes for split dialog components:
- `.split-form`, `.split-input-row`, `.split-input`
- `.split-preview`, `.split-part`
- `.split-option` (checkbox styling)

**Files Changed:**
- `public/workspace/css/workspace.css` - Added ~75 lines

---

### Task 5: Lineage and Documentation ✅

**Problem:**
New operations need to show in file processing history and be documented.

**Solution:**
- Added 'duplicate' and 'split' to `displayNames` in `lineageHelpers.js`
- Updated `file-operations.md` help article with new section
- Updated `manifest.json` with new tags

**Files Changed:**
- `src/helpers/lineageHelpers.js` - Added 2 entries
- `public/workspace/content/modules/file-browser/file-operations.md` - Added section
- `public/workspace/content/manifest.json` - Added tags

---

## Code Changes Summary

### New Files (+2)
- ✨ `python/tiff_stack_ops.py` (~170 lines) - TIFF duplicate/split/info operations
- ✨ `docs/vision/completed/tiff_stack_operations_plan.md` - Implementation plan

### Modified Files (6 changes)
- 📝 `src/routes/files.routes.js` - Added duplicate and split endpoints
- 📝 `public/workspace/js/components/FileBrowser.js` - Context menu and dialog methods
- 📝 `public/workspace/css/workspace.css` - Split dialog styling
- 📝 `src/helpers/lineageHelpers.js` - Added display names
- 📝 `public/workspace/content/modules/file-browser/file-operations.md` - Documentation
- 📝 `public/workspace/content/manifest.json` - Added tags

---

## Testing Performed

**Manual Testing:**
- [x] Upload multi-slice TIFF file - ✅ Passed
- [x] Duplicate stack creates `_copy.tif` file - ✅ Passed
- [x] Split stack creates `_part1.tif` and `_part2.tif` - ✅ Passed
- [x] Split with delete original removes source file - ✅ Passed
- [x] Split without delete keeps original - ✅ Passed
- [x] File info shows correct lineage - ✅ Passed
- [x] Context menu only shows for TIFF files - ✅ Passed
- [x] Split option only shows for multi-slice TIFFs - ✅ Passed

---

## Issues Resolved

- **Issue:** workspace file browser: image stack file manipulation functionality is necessary
  - **Impact:** Priority 1
  - **Status:** ✅ Fixed
  - **Solution:** Implemented duplicate and split functionality with full metadata tracking

---

## Next Steps

**No immediate follow-up required.**

All open bugs/issues in BUGS_ISSUES.md are now resolved.

---

## Metrics

| Metric | Value |
|--------|-------|
| Files Changed | 8 files |
| Lines Added | +914 |
| Lines Removed | -13 |
| Commits | 1 |
| Issues Closed | 1 |
| Issues Created | 0 |

---

**Navigation:**
← [Session Index](INDEX.md) | [Documentation Index](../INDEX.md) →

---

**Session Type:** Bug Fix / Feature
**Phase Status After Session:** Complete - No open issues
