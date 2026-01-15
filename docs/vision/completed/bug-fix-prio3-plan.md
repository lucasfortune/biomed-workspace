# Bug Fix Plan: Priority 3 Issues

**Date:** 2026-01-11
**Status:** Pending Approval
**Scope:** 6 Priority 3 UI/UX Issues

---

## Overview

This plan addresses 6 priority 3 issues focused on UI/UX improvements across the workspace modules.

---

## Issues to Fix

### Issue 1: Image Viewer Upload Validation
**File:** `public/workspace/js/modules/imageviewer/ImageViewerModule.js`
**Problem:** FileSelector `onUpload` callback not set, uploaded files don't trigger validation
**Solution:** Add `onUpload` callback to FileSelector config that triggers validation

### Issue 2: Filter Denoising Help Icon Placement
**File:** `public/workspace/js/modules/denoising-filter/css/filter-denoising.css`
**Problem:** `.section-header h4` has `flex: 1` pushing help icon to right
**Solution:** Remove `flex: 1` from h4 so help icon sits directly next to header text

### Issue 3: Modules Navigation Scroll to Top
**File:** `public/workspace/js/core/BaseModule.js`
**Problem:** `goToStep()` doesn't scroll `.step-contents` to top when navigating
**Solution:** Add scroll-to-top behavior in `BaseModule.goToStep()` for all modules

### Issue 4: Image Viewer Reset Between Uses
**File:** `public/workspace/js/modules/imageviewer/ImageViewerModule.js`
**Problem:** `deactivate()` doesn't reset module state variables
**Solution:** Reset all state variables (selectedFile, tiffInfo, viewMode, zoomLevel, etc.) in deactivate()

### Issue 5: Module Cards Cursor Behavior
**File:** `public/workspace/css/workspace.css`
**Problem:** `.module-card` has `cursor: pointer` applied to entire card
**Solution:** Remove `cursor: pointer` from `.module-card`, keep only on `.btn-launch`

### Issue 6: Help Panel Scroll on New Article
**File:** `public/workspace/js/core/components/InfoPanel.js`
**Problem:** `showArticle()` doesn't scroll article container to top
**Solution:** Add scroll-to-top in `showArticle()` after displaying article

---

## Implementation Plan

### Phase 1: Simple CSS Fixes (Issues 2, 5)
Complexity: Very Low - CSS only changes

**Issue 2 - Filter Denoising Help Icons:**
```css
/* Change from: */
.filter-denoising-module .section-header h4 {
  margin: 0;
  flex: 1;  /* Remove this */
}

/* To: */
.filter-denoising-module .section-header h4 {
  margin: 0;
}
```

**Issue 5 - Module Cards Cursor:**
```css
/* Change from: */
.module-card {
  ...
  cursor: pointer;  /* Remove this */
  ...
}

/* Keep existing: */
.btn-launch {
  ...
  cursor: pointer;  /* Already exists */
  ...
}
```

**Manual Test:**
- Filter denoising: Navigate to step 2, verify help icons are next to headers (not right-aligned)
- Module cards: Hover over card, cursor should be default; hover over Launch button, cursor should be pointer

---

### Phase 2: Scroll Behavior Fixes (Issues 3, 6)
Complexity: Low - JavaScript additions

**Issue 3 - BaseModule Navigation Scroll:**
In `BaseModule.goToStep()`, after `updateStepContent()`:
```javascript
// Scroll step-contents to top when changing steps
const stepContents = this.container?.querySelector('.step-contents');
if (stepContents) {
  stepContents.scrollTop = 0;
}
```

**Issue 6 - Help Panel Article Scroll:**
In `InfoPanel.showArticle()`, after displaying article:
```javascript
// Scroll article container to top
const articleContainer = this.container?.querySelector('.ip-article');
if (articleContainer) {
  articleContainer.scrollTop = 0;
}
```

**Manual Test:**
- Open any module, scroll down in step 1, navigate to step 2, verify content scrolls to top
- Open info panel, view long article, scroll down, click different article in "See Also", verify scrolls to top

---

### Phase 3: Image Viewer Fixes (Issues 1, 4)
Complexity: Low - JavaScript additions

**Issue 1 - Upload Validation:**
Add `onUpload` callback to FileSelector config in `initializeComponents()`:
```javascript
this.imageSelector = new FileSelector({
  ...existing config...
  onSelect: this.onFileSelect,
  onUpload: this.onFileUpload  // Add this
});
```

Add new method:
```javascript
async onFileUpload(file, uploadedFile) {
  console.log('[ImageViewerModule] File uploaded:', uploadedFile);
  this.selectedFile = {
    id: uploadedFile.id,
    name: uploadedFile.name || file.name,
    path: uploadedFile.path,
    source: 'upload'
  };
  // Trigger validation
  await this.validateTiffFile(uploadedFile.id);
}
```

**Issue 4 - Reset Between Uses:**
Add state reset in `deactivate()`:
```javascript
async deactivate() {
  // Reset module state to defaults
  this.selectedFile = null;
  this.tiffInfo = null;
  this.currentSlice = 0;
  this.viewMode = 'gallery';
  this.zoomLevel = 1;
  this.panOffset = { x: 0, y: 0 };
  this.isDragging = false;
  this.dragStart = { x: 0, y: 0 };

  // Reset components
  this.stepNavigator = null;
  this.navigationButtons = null;
  this.validationDisplay = null;
  this.imageSelector = null;

  // ... existing cleanup code ...
}
```

**Manual Test:**
- Issue 1: Upload a TIFF file in image viewer, verify validation runs and Next button enables
- Issue 4: Open image viewer, select file, go to step 2, zoom/pan, return to hub, re-open image viewer, verify default state (gallery mode, slice 1, 100% zoom)

---

## Testing Checklist

After all fixes, verify:

- [ ] Filter denoising step 2: Help icons appear directly after "Select Method" and "Parameters" headers
- [ ] Module cards: Cursor only changes to pointer when hovering Launch button, not entire card
- [ ] All modules: When navigating steps, content scrolls to top automatically
- [ ] Help panel: When clicking article links, panel scrolls to top of new article
- [ ] Image viewer: Uploading TIFF triggers validation and enables Next button
- [ ] Image viewer: Module fully resets between uses (view mode, zoom, slice position)

---

## Files Modified

1. `public/workspace/js/modules/denoising-filter/css/filter-denoising.css`
2. `public/workspace/css/workspace.css`
3. `public/workspace/js/core/BaseModule.js`
4. `public/workspace/js/core/components/InfoPanel.js`
5. `public/workspace/js/modules/imageviewer/ImageViewerModule.js`

---

## Rollback Plan

All changes are isolated to specific files. If issues arise:
1. Revert individual file changes via git
2. No database or API changes required
3. No dependencies between fixes - each can be reverted independently
