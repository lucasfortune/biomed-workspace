# Implementation Plan: File Browser Drag&Drop Upload Fix

**Issue:** File browser drag&drop upload triggers ~20 error notifications and uploads file twice
**Priority:** 3 | **Complexity:** 1
**Date:** 2026-01-15

---

## Root Cause Analysis

The `attachDragAndDropListeners()` method in `FileBrowser.js` is called on every render cycle. It adds event listeners to the sidebar element but **never removes old ones**. After several user interactions (folder toggles, searches, file selections), approximately 20 duplicate listeners accumulate on the sidebar.

When a file is dropped:
1. All ~20 `drop` event handlers fire
2. Each calls `handleFileSelection()` which triggers validation
3. Each validation failure calls `state.notify('error', ...)` → ~20 error notifications
4. Each successful upload path executes → file uploaded multiple times
5. Multiple success handlers fire → 2 success notifications

**Key code locations:**
- `FileBrowser.js:664-668` - `attachEventListeners()` calls drag&drop setup on every render
- `FileBrowser.js:1457-1523` - `attachDragAndDropListeners()` adds listeners without cleanup
- `FileBrowser.js:1469-1474` - Generic prevent-default handlers accumulate
- `FileBrowser.js:1477, 1498, 1511` - dragenter/dragleave/drop listeners accumulate

---

## Implementation Plan

### Phase 1: Add Initialization Flag

**Objective:** Ensure drag&drop listeners are only attached once per FileBrowser instance.

**Changes:**

1. **Add flag to FileBrowser class** (`FileBrowser.js`)
   - Add `this.dragDropInitialized = false` in constructor

2. **Guard `attachDragAndDropListeners()`** (`FileBrowser.js:1457`)
   - Add early return if `this.dragDropInitialized === true`
   - Set flag to `true` after successful listener attachment

**Code changes:**

```javascript
// In constructor (around line 30-40)
constructor(stateManager, workspaceAPI) {
  // ... existing code ...
  this.dragDropInitialized = false;  // ADD THIS LINE
}

// In attachDragAndDropListeners() (line 1457)
attachDragAndDropListeners() {
  // ADD THIS GUARD
  if (this.dragDropInitialized) {
    return;
  }

  const sidebar = document.querySelector('.fb-sidebar');
  if (!sidebar) return;

  // ... existing listener code ...

  // ADD AT END OF METHOD
  this.dragDropInitialized = true;
}
```

---

## Testing Steps

After implementing the fix, perform these manual tests:

### Test 1: Basic Drag&Drop Upload
1. Start fresh workspace
2. Navigate to any folder in file browser
3. Drag a valid TIFF file onto the sidebar
4. **Expected:** 1 success notification, file appears once in file list

### Test 2: Drag&Drop After Multiple Interactions
1. Perform several actions: search, toggle folders, select files (5-6 actions)
2. Drag and drop a valid TIFF file
3. **Expected:** Still only 1 success notification, file uploaded once

### Test 3: Invalid File Drop
1. Drag an invalid file (e.g., .txt file) onto sidebar
2. **Expected:** 1 error notification about invalid file type

### Test 4: Multiple File Drop
1. Drag multiple TIFF files at once
2. **Expected:** 1 notification per file (or 1 batch success), each file uploaded once

---

## Rollback Plan

If issues arise, revert the two changes:
1. Remove `this.dragDropInitialized = false` from constructor
2. Remove the guard check and flag setting from `attachDragAndDropListeners()`

---

## Files to Modify

| File | Change Type |
|------|-------------|
| `public/workspace/js/components/FileBrowser.js` | Add flag + guard |

**Estimated changes:** ~5 lines of code
