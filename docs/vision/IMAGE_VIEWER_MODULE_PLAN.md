# Module Workflow Refactoring Plan

**Created:** 2025-12-19
**Status:** Planned
**Related Modules:** Segmentation, Image Viewer

## Overview

Refactor the segmentation module and create a new Image Viewer module to separate concerns:
- **Segmentation Module**: Reduce from 5 steps to 4 (remove 3D visualization)
- **Image Viewer Module**: New 2-step module with Gallery and Icon modes

---

## Phase 1: Segmentation Module - Remove Step 5

### 1.1 Remove Step 5 UI from SegmentationModule.js

**File:** `/public/workspace/js/modules/segmentation/SegmentationModule.js`

- Remove Step 5 from `render()` method:
  - Delete step navigation element `<div class="step" data-step="5">`
  - Delete Step 5 content section `<div class="step-content" id="step5">`
  - Update progress bar calculation: `(this.currentStep / 5)` → `(this.currentStep / 4)`

- Update `goToStep()` method:
  - Remove `case 5` and `initialize3DVisualization()` call

- Remove Step 5 event listeners from `setupEventListeners()`:
  - Remove: resetViewBtn, downloadResultsBtn, resetWorkflowBtn for Step 5

- Remove visualization methods:
  - `initialize3DVisualization()` (~lines 1156-1220)
  - `showVisualizationError()` (~lines 1222-1238)
  - `resetView()` (~lines 1528-1532)

- Remove visualization state variables:
  - `this.visualizationInitialized`
  - `this.cachedVisualizationData`
  - `this.cachedInferenceResult`

- Remove Three.js/UTIF.js loading from `loadDependencies()` if present

### 1.2 Remove Download Model Button from Step 3

**File:** `/public/workspace/js/modules/segmentation/SegmentationModule.js`

- Remove "Download Model and Config" button from Step 3 (Training) completion UI
- Remove `downloadModel()` method
- This functionality is now handled through the file browser

### 1.3 Modify Step 4 Completion UI

**File:** `/public/workspace/js/modules/segmentation/SegmentationModule.js`

Update Step 4 content in `render()` to add completion section:

```html
<div id="inferenceCompletionSection" class="completion-section" style="display: none;">
  <div class="completion-icon">✓</div>
  <h4>Segmentation Complete</h4>
  <p>Your segmentation results are ready.</p>
  <div class="completion-actions">
    <button class="btn primary" id="openInViewerBtn">Open in Image Viewer</button>
    <button class="btn secondary" id="resetWorkflowBtn">Start New Analysis</button>
  </div>
</div>
```

### 1.4 Add Module Communication Handler

**File:** `/public/workspace/js/modules/segmentation/SegmentationModule.js`

Add new method:

```javascript
openInImageViewer() {
  const inferenceData = {
    type: 'segmentation_result',
    inferenceId: this.currentInferenceId,
    outputPath: window.inferenceResult?.output_path,
    metadataPath: window.inferenceResult?.metadata_path,
    timestamp: Date.now()
  };

  this.state.update('modules.segmentation.inferenceResults', inferenceData);
  window.workspace.loadModule('imageviewer');
}
```

### 1.5 Update Inference Completion Handler

**File:** `/public/workspace/js/modules/segmentation/inference.js`

Modify `onInferenceComplete()`:
- Show `#inferenceCompletionSection`
- Remove any Step 5 navigation code
- Store results in StateManager

### 1.6 Preserve Visualization Code

**Action:** Keep `/public/workspace/js/modules/segmentation/visualization/` folder as-is
- Do NOT delete the 9 visualization files
- Only remove the import/usage from SegmentationModule.js
- This code will be used by a future 3D Visualization module

**Testing Checkpoint Phase 1:**
- [ ] Segmentation shows 4 steps in navigation
- [ ] Training and inference work unchanged
- [ ] Completion section appears after inference
- [ ] "Open in Image Viewer" button visible (will error until Phase 3)
- [ ] Start New Analysis works
- [ ] Download Model button removed from Step 3

---

## Phase 2: Backend - Slice Extraction Endpoints

### 2.1 Create Python Slice Extraction Script

**New File:** `/python/extract_slice.py`

```python
#!/usr/bin/env python3
"""
Extract slice from TIFF as JPEG.

Usage:
    python extract_slice.py <input_tiff> <slice_index> <output_jpeg> [--size SIZE]
    python extract_slice.py <input_tiff> --info

Outputs:
    SUCCESS:<output_path>
    INFO:{"sliceCount": N, "width": W, "height": H}
    ERROR:<message>
"""
```

Features:
- Extract single slice at specified index
- `--size` parameter: 128 (icon), 512 (gallery), or custom
- `--info` flag: Return TIFF metadata without extracting
- Normalize to 0-255 range
- Output as JPEG

### 2.2 Add Slice Endpoint

**File:** `/src/routes/workspace.routes.js`

```javascript
// GET /api/workspace/slice/:fileId/:sliceIndex
// Query params: ?size=icon|gallery|{number}
// Returns: JPEG image
```

### 2.3 Add TIFF Info Endpoint

**File:** `/src/routes/workspace.routes.js`

```javascript
// GET /api/workspace/tiff-info/:fileId
// Returns: { sliceCount, width, height, dtype }
```

### 2.4 Add FileService Helper

**File:** `/src/services/FileService.js`

Add methods:
- `extractSlice(filePath, sliceIndex, size)` - Spawns extract_slice.py
- `getTiffInfo(filePath)` - Gets TIFF metadata

**Testing Checkpoint Phase 2:**
- [ ] `GET /api/workspace/tiff-info/:fileId` returns slice count
- [ ] `GET /api/workspace/slice/:fileId/0?size=icon` returns 128px JPEG
- [ ] `GET /api/workspace/slice/:fileId/0?size=gallery` returns 512px JPEG
- [ ] Invalid fileId returns 404
- [ ] Invalid sliceIndex returns 400

---

## Phase 3: Image Viewer Module - Core Structure

### 3.1 Create Module Directory

```
/public/workspace/js/modules/imageviewer/
├── ImageViewerModule.js
├── components/
│   ├── GalleryView.js
│   └── IconGridView.js
└── css/
    └── imageviewer.css
```

### 3.2 Create ImageViewerModule.js

**File:** `/public/workspace/js/modules/imageviewer/ImageViewerModule.js`

Core structure:
```javascript
class ImageViewerModule {
  constructor(stateManager) {
    this.state = stateManager;
    this.container = null;

    // State
    this.currentStep = 1;
    this.selectedFile = null;
    this.tiffInfo = null;
    this.currentSlice = 0;
    this.viewMode = 'gallery';  // Default: gallery
    this.zoomLevel = 1;
    this.panOffset = { x: 0, y: 0 };

    // Components
    this.galleryView = null;
    this.iconGridView = null;
  }

  async activate() { ... }
  async deactivate() { ... }
  render() { ... }

  // Step navigation
  goToStep(step) { ... }

  // File handling
  async loadTiffInfo() { ... }
  checkForIncomingData() { ... }

  // View mode
  switchToGalleryMode(sliceIndex = null) { ... }
  switchToIconMode() { ... }

  // Slice navigation
  goToSlice(index) { ... }
  nextSlice() { ... }
  previousSlice() { ... }
}

export default ImageViewerModule;
```

### 3.3 Register Module

**File:** `/public/workspace/js/modules/registry.js`

Add entry:
```javascript
{
  id: 'imageviewer',
  name: 'Image Viewer',
  description: 'View TIFF image stacks with gallery and thumbnail modes',
  icon: '🖼️',
  path: '/workspace/js/modules/imageviewer/ImageViewerModule.js',
  inputs: ['image_stack', 'segmented_stack'],
  outputs: [],
  color: '#17A2B8',
  status: 'available'
}
```

### 3.4 Update StateManager Schema

**File:** `/public/workspace/js/core/StateManager.js`

Add to initial state:
```javascript
modules: {
  // existing...
  imageviewer: {
    active: false,
    currentFile: null,
    viewMode: 'gallery',
    currentSlice: 0
  }
}
```

**Testing Checkpoint Phase 3:**
- [ ] Image Viewer appears in module hub
- [ ] Module loads without errors
- [ ] Basic 2-step structure renders

---

## Phase 4: Step 1 - File Selection

### 4.1 Implement File Selection UI

**File:** `/public/workspace/js/modules/imageviewer/ImageViewerModule.js`

Step 1 UI structure:
```html
<div class="step-content" id="step1">
  <h3>Select Image Stack</h3>

  <!-- Recent Results Section -->
  <div class="file-section" id="resultsSection">
    <h4>Recent Segmentation Results</h4>
    <div class="file-list" id="resultsList"></div>
  </div>

  <!-- Workspace Files Section -->
  <div class="file-section">
    <h4>Workspace Files</h4>
    <div class="file-list" id="workspaceFilesList"></div>
  </div>

  <div class="step-actions">
    <button class="btn primary" id="selectFileBtn" disabled>
      Next: View Images
    </button>
  </div>
</div>
```

### 4.2 Implement File List Population

Methods to add:
- `loadWorkspaceFiles()` - Fetch TIFF files from workspace
- `loadRecentResults()` - Fetch segmentation output files
- `renderFileList(files, containerId)` - Render file cards
- `selectFile(fileInfo)` - Handle file selection

### 4.3 Implement Auto-Selection from Segmentation

```javascript
checkForIncomingData() {
  const results = this.state.get('modules.segmentation.inferenceResults');
  if (results?.outputPath) {
    this.selectedFile = {
      path: results.outputPath,
      name: 'Segmentation Result',
      source: 'segmentation',
      inferenceId: results.inferenceId
    };
    return true;
  }
  return false;
}

async handleIncomingData() {
  await this.loadTiffInfo();
  this.goToStep(2);
  // Clear the incoming data
  this.state.update('modules.segmentation.inferenceResults', null);
}
```

**Testing Checkpoint Phase 4:**
- [ ] Step 1 shows "Recent Results" section
- [ ] Step 1 shows "Workspace Files" section
- [ ] Can select a file and proceed to Step 2
- [ ] Coming from segmentation auto-selects and advances to Step 2

---

## Phase 5: Step 2 - Gallery Mode

### 5.1 Create GalleryView Component

**File:** `/public/workspace/js/modules/imageviewer/components/GalleryView.js`

Structure:
```javascript
class GalleryView {
  constructor(module) {
    this.module = module;
    this.imageElement = null;
    this.zoomLevel = 1;
    this.panOffset = { x: 0, y: 0 };
    this.isDragging = false;
  }

  render() { ... }
  attachEventListeners() { ... }

  async loadSlice(sliceIndex) { ... }

  // Navigation
  nextSlice() { ... }
  previousSlice() { ... }
  updateSliceIndicator() { ... }

  // Zoom/Pan
  zoomIn() { ... }
  zoomOut() { ... }
  resetZoom() { ... }
  setupPanHandlers() { ... }
}

export default GalleryView;
```

### 5.2 Gallery UI Structure

```html
<div class="gallery-view">
  <div class="gallery-toolbar">
    <button id="backToIconsBtn">← Thumbnails</button>
    <div class="slice-indicator">
      <span id="currentSlice">1</span> / <span id="totalSlices">100</span>
    </div>
    <div class="zoom-controls">
      <button id="zoomOutBtn">−</button>
      <span id="zoomLevel">100%</span>
      <button id="zoomInBtn">+</button>
      <button id="zoomResetBtn">Reset</button>
    </div>
  </div>

  <div class="gallery-image-container" id="imageContainer">
    <img id="galleryImage" src="" alt="Slice" />
  </div>

  <div class="gallery-nav">
    <button id="prevSliceBtn">◀ Previous</button>
    <button id="nextSliceBtn">Next ▶</button>
  </div>
</div>
```

### 5.3 Implement Zoom/Pan

- Zoom range: 0.25x to 4x
- Mouse wheel zoom (centered on cursor)
- Click-drag pan when zoomed > 1x
- Double-click to reset

**Testing Checkpoint Phase 5:**
- [ ] Gallery shows current slice image
- [ ] Slice indicator shows "X / Y" format
- [ ] Previous/Next buttons work correctly
- [ ] Zoom in/out works
- [ ] Pan works when zoomed in
- [ ] Reset zoom works
- [ ] "Back to Thumbnails" button visible

---

## Phase 6: Step 2 - Icon Mode

### 6.1 Create IconGridView Component

**File:** `/public/workspace/js/modules/imageviewer/components/IconGridView.js`

Structure:
```javascript
class IconGridView {
  constructor(module) {
    this.module = module;
    this.thumbnails = new Map();
    this.observer = null;  // IntersectionObserver for lazy loading
  }

  render() { ... }
  attachEventListeners() { ... }

  async loadThumbnails() { ... }
  createThumbnailCard(sliceIndex) { ... }
  lazyLoadThumbnail(sliceIndex) { ... }

  onThumbnailClick(sliceIndex) {
    this.module.switchToGalleryMode(sliceIndex);
  }
}

export default IconGridView;
```

### 6.2 Icon Grid UI Structure

```html
<div class="icon-grid-view">
  <div class="icon-grid-toolbar">
    <span class="file-info">{filename} - {sliceCount} slices</span>
  </div>
  <div class="icon-grid" id="iconGrid">
    <!-- Thumbnail cards generated dynamically -->
  </div>
</div>
```

### 6.3 Implement Lazy Loading

- Use IntersectionObserver for viewport detection
- Load visible thumbnails first
- Show placeholder while loading
- Cache loaded thumbnails

**Testing Checkpoint Phase 6:**
- [ ] Icon grid shows responsive thumbnail grid
- [ ] Thumbnails load progressively (lazy loading)
- [ ] Clicking thumbnail opens gallery at that slice
- [ ] Grid scrolls for large stacks
- [ ] Grid responds to window resize

---

## Phase 7: View Mode Switching

### 7.1 Implement Mode Toggle

**File:** `/public/workspace/js/modules/imageviewer/ImageViewerModule.js`

```javascript
switchToGalleryMode(sliceIndex = null) {
  if (sliceIndex !== null) {
    this.currentSlice = sliceIndex;
  }
  this.viewMode = 'gallery';
  this.renderStep2();
}

switchToIconMode() {
  this.viewMode = 'icon';
  this.renderStep2();
}

renderStep2() {
  const container = document.getElementById('step2Content');
  if (this.viewMode === 'gallery') {
    this.galleryView.render(container);
    this.galleryView.loadSlice(this.currentSlice);
  } else {
    this.iconGridView.render(container);
    this.iconGridView.loadThumbnails();
  }
}
```

**Testing Checkpoint Phase 7:**
- [ ] Gallery → Icon mode (back button)
- [ ] Icon → Gallery mode (click thumbnail)
- [ ] Current slice preserved when switching
- [ ] Smooth transitions

---

## Phase 8: CSS and Polish

### 8.1 Create Module Stylesheet

**File:** `/public/workspace/js/modules/imageviewer/css/imageviewer.css`

Key sections:
- Module header and navigation
- File selection cards
- Gallery view (toolbar, image container, navigation)
- Icon grid (responsive grid, thumbnail cards)
- Zoom/pan controls
- Loading states and animations
- Dark theme consistency

### 8.2 Responsive Grid

```css
.icon-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(128px, 1fr));
  gap: 12px;
  padding: 16px;
  overflow-y: auto;
}

.thumbnail-card {
  aspect-ratio: 1;
  border-radius: 8px;
  cursor: pointer;
  transition: transform 0.2s;
}

.thumbnail-card:hover {
  transform: scale(1.05);
}
```

### 8.3 Loading States

- Skeleton loaders for thumbnails
- Spinner for slice loading
- Progress indicator for large files

**Testing Checkpoint Phase 8:**
- [ ] Consistent dark theme styling
- [ ] Responsive on different screen sizes
- [ ] Loading states display correctly
- [ ] Smooth animations and transitions

---

## Phase 9: Integration Testing

### 9.1 Segmentation → Image Viewer Flow

1. Complete segmentation workflow (upload, configure, train, inference)
2. Click "Open in Image Viewer"
3. Verify auto-selection and gallery mode opens
4. Navigate slices
5. Switch to icon mode
6. Return to segmentation module
7. Verify segmentation state preserved

### 9.2 Direct Access Flow

1. Open Image Viewer from hub
2. Select file from "Workspace Files" section
3. View in gallery mode
4. Navigate and zoom
5. Switch to icon mode
6. Return to file selection

### 9.3 State Persistence

1. Open viewer with file
2. Navigate to specific slice, zoom in
3. Return to hub
4. Re-open Image Viewer
5. Verify state restored

---

## Files Summary

### New Files
| Path | Purpose |
|------|---------|
| `/public/workspace/js/modules/imageviewer/ImageViewerModule.js` | Main module class |
| `/public/workspace/js/modules/imageviewer/components/GalleryView.js` | Gallery mode |
| `/public/workspace/js/modules/imageviewer/components/IconGridView.js` | Icon grid mode |
| `/public/workspace/js/modules/imageviewer/css/imageviewer.css` | Styles |
| `/python/extract_slice.py` | Slice extraction script |

### Modified Files
| Path | Changes |
|------|---------|
| `/public/workspace/js/modules/segmentation/SegmentationModule.js` | Remove Step 5, add viewer button |
| `/public/workspace/js/modules/segmentation/inference.js` | Update completion handler |
| `/public/workspace/js/modules/registry.js` | Add imageviewer entry |
| `/public/workspace/js/core/StateManager.js` | Add imageviewer state |
| `/src/routes/workspace.routes.js` | Add slice endpoints |
| `/src/services/FileService.js` | Add slice extraction helpers |

### Preserved Files (No Changes)
| Path | Reason |
|------|--------|
| `/public/workspace/js/modules/segmentation/visualization/*` | Future 3D module |

---

## Implementation Order

1. **Phase 1** - Segmentation cleanup (foundation for integration)
2. **Phase 2** - Backend endpoints (required for viewer functionality)
3. **Phase 3** - Module structure (core setup)
4. **Phase 4** - File selection (Step 1 complete)
5. **Phase 5** - Gallery mode (primary viewing mode)
6. **Phase 6** - Icon mode (secondary mode)
7. **Phase 7** - Mode switching (connect modes)
8. **Phase 8** - CSS polish (visual refinement)
9. **Phase 9** - Integration testing (validation)
