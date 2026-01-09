# Implementation Plan: TIFF Stack Duplicate and Split Functionality

## Issue Reference
File browser image stack file manipulation - Priority 1, Complexity 2-3

## Summary
Add two new context menu operations for TIFF files in the workspace file browser:
1. **Duplicate Stack** - Creates a copy named `<original>_copy.tif`
2. **Split Stack** - Splits at user-specified slice into two files

## Requirements (from user clarification)
- **Split UI**: Single split point input (stack splits into 2 parts)
- **Visibility**: Context menu items only shown for multi-slice TIFF files
- **Original file**: User chooses via checkbox whether to delete original after split

---

## Phase 1: Python Script

**Create:** `python/tiff_stack_ops.py`

Operations:
- `duplicate <input> <output>` - Copy TIFF file
- `split <input> <output1> <output2> <split_at>` - Split stack at slice N
- `info <input>` - Get slice count (for context menu visibility check)

Output protocol (matching existing scripts): `SUCCESS:<json>`, `ERROR:<message>`, `INFO:<json>`

### Manual Testing
```bash
cd /home/lucas/Documents/phd/RKI_laue/viz_app
source venv/bin/activate
python python/tiff_stack_ops.py info test_data/trypB_testData_training.tif
python python/tiff_stack_ops.py duplicate test_data/trypB_testData_training.tif /tmp/test_copy.tif
python python/tiff_stack_ops.py split test_data/trypB_testData_training.tif /tmp/part1.tif /tmp/part2.tif 5
```

---

## Phase 2: Backend Routes

**Modify:** `src/routes/files.routes.js`

Add two new endpoints:

### POST `/api/workspace/file/:fileId/duplicate`
- Validate file is TIFF
- Generate unique output name (`_copy.tif`, `_copy_1.tif`, etc.)
- Run Python script
- Add to metadata with lineage: `{ processType: 'duplicate', inputs: [sourceFileId] }`
- Log activity

### POST `/api/workspace/file/:fileId/split`
Body: `{ splitAt: number, deleteOriginal: boolean }`
- Validate TIFF and split point
- Run Python script to create `_part1.tif` and `_part2.tif`
- Add both to metadata with lineage: `{ processType: 'split', inputs: [sourceFileId], splitInfo: { part: N, sliceRange: '...' } }`
- Optionally delete original file and its metadata
- Log activity

### Manual Testing
```bash
# Start server
npm run dev

# Test via curl (replace fileId with actual value)
curl -X POST http://localhost:3000/api/workspace/file/FILE_ID/duplicate --cookie "connect.sid=SESSION"
curl -X POST http://localhost:3000/api/workspace/file/FILE_ID/split -H "Content-Type: application/json" -d '{"splitAt":5,"deleteOriginal":false}' --cookie "connect.sid=SESSION"
```

---

## Phase 3: Frontend - Context Menu

**Modify:** `public/workspace/js/components/FileBrowser.js`

### Update `showFileContextMenu()` (line 1080)
1. Check if file is TIFF (`.tif`/`.tiff` extension)
2. If TIFF, fetch slice count via `/api/workspace/tiff-info/:fileId`
3. Add "Duplicate Stack" menu item (for all TIFFs)
4. Add "Split Stack..." menu item (only if sliceCount > 1)

### Add new methods:
- `duplicateStack(fileId)` - Call API, refresh, notify
- `showSplitDialog(fileId, fileName, sliceCount)` - Modal with slice input, preview, delete checkbox
- `splitStack(fileId, splitAt, deleteOriginal)` - Call API, refresh, notify

---

## Phase 4: Frontend - CSS

**Modify:** `public/workspace/css/workspace.css`

Add styles for split dialog:
- `.split-form` container
- `.split-input-row` for input layout
- `.split-preview` for showing part 1/part 2 ranges
- `.split-option` for delete checkbox

---

## Phase 5: Lineage Display

**Modify:** `src/helpers/lineageHelpers.js` (line ~155)

Add to `displayNames` map:
```javascript
'duplicate': 'Duplicated',
'split': 'Split'
```

---

## Phase 6: Help Documentation

**Update:** `public/workspace/content/modules/workspace/` (file browser help)

Add section covering:
- How to duplicate TIFF stacks
- How to split TIFF stacks
- What happens to metadata/lineage

---

## Files to Modify

| File | Action | Lines |
|------|--------|-------|
| `python/tiff_stack_ops.py` | CREATE | ~80 |
| `src/routes/files.routes.js` | MODIFY | +120 |
| `public/workspace/js/components/FileBrowser.js` | MODIFY | +120 |
| `public/workspace/css/workspace.css` | MODIFY | +50 |
| `src/helpers/lineageHelpers.js` | MODIFY | +2 |
| Help article | UPDATE | ~30 |

---

## Verification Steps

### 1. Python Script
- [ ] `info` command returns correct slice count
- [ ] `duplicate` creates exact copy
- [ ] `split` creates two valid TIFFs with correct slice counts

### 2. API Endpoints
- [ ] `/duplicate` creates file and metadata entry
- [ ] `/split` creates two files with correct lineage
- [ ] deleteOriginal flag removes original when true
- [ ] Non-TIFF files return error

### 3. UI
- [ ] Context menu shows "Duplicate Stack" for any TIFF
- [ ] Context menu shows "Split Stack..." only for multi-slice TIFFs
- [ ] Neither option appears for non-TIFF files
- [ ] Split dialog shows correct defaults and preview
- [ ] Checkbox defaults to checked (delete original)
- [ ] Both operations show loading overlay
- [ ] Success notifications appear
- [ ] File browser refreshes with new files

### 4. Integration
- [ ] File info modal shows "Duplicated" or "Split" in lineage
- [ ] Duplicated/split files work in modules (imageviewer, annotation, etc.)
