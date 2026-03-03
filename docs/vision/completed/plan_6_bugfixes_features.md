# Implementation Plan: 6 Bug Fixes & Features

## Context

Six open bugs/issues selected for resolution in this session, ordered by implementation (simplest first):

1. Inference progress bar color (Prio 1, Compl. 1)
2. Remove "start new analysis" warning (Prio 2, Compl. 1)
3. False error log for test annotations (Prio 2, Compl. 1)
4. File selector time indicators (Prio 3, Compl. 1)
5. File browser "select all" in search (Prio 2, Compl. 1)
6. Filament parent class visualizer (Prio 4, Compl. 2)

---

## Fix 1: Inference Progress Bar Color

**Problem:** Segmentation inference progress bar uses purple/blue gradient instead of primary red.

**Files to modify:**
- `public/workspace/js/modules/segmentation/templates/Templates.js` (line ~388)
- `public/workspace/js/modules/segmentation/handlers/InferenceHandler.js` (line ~321)

**Change:** Replace hardcoded gradients with `var(--accent-primary)` (red) to match design system. Both locations define the progress bar background - ensure consistency.

**Test:** Launch segmentation module, run inference, verify progress bar is red.

---

## Fix 2: Remove "Start New Analysis" Warning

**Problem:** `confirm()` dialog on "Start New Analysis" is legacy; workspace files are always preserved so the warning is misleading.

**File to modify:**
- `public/workspace/js/modules/segmentation/SegmentationModule.js` (line ~1487)

**Change:** Remove the `confirm()` call and just execute the reset directly. The user's files are safe in the workspace file browser.

**Test:** In segmentation module after training, click "Start New Analysis" - should reset immediately without a browser dialog.

---

## Fix 3: False Error Log for Test Annotations

**Problem:** Python script `validate_tiff.py` outputs an informational message to stderr: `[Annotation Conversion] Values are already in expected format (0,1,2)`. The Node.js `pythonRunner.js` logs ALL stderr as `[Python Error]`.

**File to modify:**
- `python/validate_tiff.py` (line ~128)

**Change:** Change `print(..., file=sys.stderr)` to `print(...)` (stdout) for this informational message. This is the least invasive fix - the message is not an error and should go to stdout. The pythonRunner already handles stdout output without logging it as an error.

**Test:** Select built-in test annotation data in segmentation module, check server terminal - should not show `[ERROR]` for this message.

---

## Fix 4: File Selector Time Indicators

**Problem:** File selector dropdowns only show filename and size. Users need relative time ("just now", "5m ago") to identify recent results.

**Files to modify:**
- `public/workspace/js/core/components/FileSelector.js`

**Change:** Add a `formatTimeAgo()` method (reusing the logic from FileBrowser.formatDate). Modify the dropdown option text from `"filename.tif (1.2 MB)"` to `"filename.tif (1.2 MB - just now)"`. This applies to all sections: recent results, custom sections, and workspace files.

The file metadata already includes `uploadedAt` timestamps (ISO strings) set by WorkspaceManager.

**Key code locations in FileSelector.js:**
- Line ~337-343: Workspace files rendering
- Line ~300-310: Recent results rendering
- Line ~315-330: Custom sections rendering

**Test:** Upload a file, then open any module's file selector - recent files should show "(1.2 MB - just now)".

---

## Fix 5: File Browser "Select All" in Search

**Problem:** When searching files, selecting all results requires clicking each checkbox individually. The header "Select All" checkbox exists but is not prominent enough during search.

**File to modify:**
- `public/workspace/js/components/FileBrowser.js`

**Change:** Add a "Select all N results" link/button that appears below the search input when there are search results. This makes it explicitly clear that all results can be selected at once. The underlying `selectAll()` already works on filtered results (`this.allFiles = filteredFiles`).

Add after the search bar (line ~314), only visible when search is active:
```html
<div class="fb-search-select-all" style="display: ${this.searchQuery ? 'flex' : 'none'};">
  <button class="fb-search-select-all-btn">Select all ${filteredFiles.length} results</button>
</div>
```

Wire it to call `this.selectAll()`.

**Test:** Type a search query, verify "Select all N results" button appears, click it, verify all matching files are selected.

---

## Fix 6: Filament Parent Class Visualizer

**Problem:** No visual feedback for which annotation class a filament belongs to. Need a small class-color dot next to each filament entry.

**Files to modify:**
- `public/workspace/js/modules/annotation/AnnotationModule.js` (~line 1287-1298 in renderFilamentList)
- `public/workspace/js/modules/annotation/css/annotation.css`

**Change in renderFilamentList():**
- Look up each filament's parent class via `this.brushEngine.getClasses().find(c => c.id === fil.classId)`
- Add a small colored dot element showing the class color, positioned after the filament's own color dot
- Layout becomes: `[●filament-color] [●class-color] [Name] [count] [×]`

**CSS additions:**
- `.filament-class-color`: smaller dot (10px), square or circle, with tooltip showing class name

**Test:** In annotation module, create classes with different colors, add filaments while different classes are selected, verify each filament shows both its own color dot and a smaller dot in the parent class color.

---

## Manual Testing Checklist

After all 6 fixes:
1. Segmentation module: inference progress bar is red
2. Segmentation module: "Start New Analysis" resets without browser dialog
3. Server terminal: no false ERROR when using test annotation data
4. Any module file selector: files show relative time
5. File browser: search results show "Select all N results" button
6. Annotation module: filaments show parent class color indicator
