# Annotation Module Implementation Plan

## Overview

Implement a browser-based painting tool for creating ground-truth segmentation masks on TIFF image stacks. The module integrates with the existing workspace file system and follows established module patterns.

## Key Design Decisions (from user)

| Decision | Choice |
|----------|--------|
| Canvas architecture | Canvas overlay on `<img>` element with full-resolution images |
| Save format | TIFF stack + sidecar JSON (not JSON with encoded data) |
| File category | New `unfinished_annotations` category |
| Paint resolution | Source resolution (pixel-perfect) |
| Class metadata | Sidecar JSON file alongside TIFF |
| Image display | Fit-to-container with zoom/pan |
| Edit existing | Allow loading final annotations for editing (creates new version) |

---

## Files to Create

### Frontend Module
```
/public/workspace/js/modules/annotation/
├── AnnotationModule.js       # Main module (extends BaseModule)
├── AnnotationAPI.js          # Backend API client
├── css/
│   └── annotation.css        # Module styles
└── utils/
    ├── AnnotationCanvas.js   # Canvas management + zoom/pan
    ├── BrushEngine.js        # Brush/eraser painting logic
    └── HistoryManager.js     # Per-slice undo/redo
```

### Backend
```
/src/routes/annotation.routes.js     # Annotation endpoints
/python/extract_raw_slice.py         # Full-resolution slice extraction
/python/create_annotation_tiff.py    # Canvas data to TIFF conversion
```

## Files to Modify

| File | Change |
|------|--------|
| `/public/workspace/js/modules/registry.js` | Change annotation status from `coming_soon` to `available` |
| `/src/app.js` | Register annotation routes |
| `/src/config/constants.js` | Add `UNFINISHED_ANNOTATIONS_DIR` path |

---

## Implementation Phases

---

### Phase 1: Foundation

**Goal:** Set up the module skeleton and backend infrastructure so the module appears in the workspace and can be launched.

#### Todos

- [ ] **1.1** Create directory structure:
  - [ ] Create `/public/workspace/js/modules/annotation/`
  - [ ] Create `/public/workspace/js/modules/annotation/css/`
  - [ ] Create `/public/workspace/js/modules/annotation/utils/`

- [ ] **1.2** Create `AnnotationModule.js` skeleton:
  - [ ] Import BaseModule
  - [ ] Define 2-step configuration: `select` and `annotate`
  - [ ] Implement `render()` with placeholder content for both steps
  - [ ] Implement `loadDependencies()` (empty for now)
  - [ ] Implement `initialize()` with step navigation setup

- [ ] **1.3** Create `AnnotationAPI.js`:
  - [ ] Define class with constructor taking base URL
  - [ ] Add placeholder methods: `getRawSlice()`, `saveProgress()`, `createAnnotation()`, `loadAnnotation()`

- [ ] **1.4** Create `annotation.css`:
  - [ ] Import module-base.css
  - [ ] Define CSS variables matching module color (#FF6B6B)
  - [ ] Add basic step container styles

- [ ] **1.5** Update `registry.js`:
  - [ ] Change annotation module status from `coming_soon` to `available`

- [ ] **1.6** Backend infrastructure:
  - [ ] Add `UNFINISHED_ANNOTATIONS_DIR: 'uploads/unfinished_annotations'` to `/src/config/constants.js`
  - [ ] Create empty `/src/routes/annotation.routes.js` with route factory pattern
  - [ ] Register routes in `/src/app.js` at `/api/annotation`
  - [ ] Ensure workspace initialization creates `uploads/unfinished_annotations/` directory

#### Manual Testing Steps

1. **Start the server:** `npm run dev`
2. **Navigate to workspace:** Go to `http://localhost:3000/workspace`
3. **Verify module card:** The "Quick Annotation Tool" card should appear with status "available" (not "coming soon")
4. **Launch module:** Click "Launch Module" on the annotation card
5. **Verify module loads:** Should see Step 1 with placeholder content and step navigation bar
6. **Check step navigation:** Steps should be visible (Step 1 active, Step 2 disabled)
7. **Check back button:** "Back to Hub" should return to the welcome view
8. **Check console:** No JavaScript errors in browser console
9. **Check server logs:** No errors related to annotation routes

**Phase 1 complete when:** Module appears in workspace, can be launched, shows placeholder UI, and returns to hub without errors.

---

### Phase 2: Step 1 - Data Selection

**Goal:** Implement file selection UI allowing users to select source images, resume unfinished annotations, or edit existing annotations.

#### Todos

- [ ] **2.1** Implement Step 1 UI in `render()`:
  - [ ] Add container for FileSelector
  - [ ] Add container for ValidationDisplay
  - [ ] Add "Next" navigation button (initially disabled)

- [ ] **2.2** Configure FileSelector component:
  - [ ] Create FileSelector instance with multi-category support
  - [ ] Configure categories: `raw_images`, `inference_data`, `annotations`, `unfinished_annotations`
  - [ ] Set up category labels and grouping
  - [ ] Implement `onSelect` callback
  - [ ] Implement `onUpload` callback (for new file uploads)

- [ ] **2.3** Handle file selection scenarios:
  - [ ] **Scenario A (New):** When selecting from `raw_images` or `inference_data`:
    - [ ] Fetch TIFF info via existing `/api/workspace/tiff-info/:fileId`
    - [ ] Store source file info and dimensions
    - [ ] Initialize empty annotation state
  - [ ] **Scenario B (Resume):** When selecting from `unfinished_annotations`:
    - [ ] Store selected file as annotation file (not source)
    - [ ] Mark for sidecar loading in Step 2
  - [ ] **Scenario C (Edit):** When selecting from `annotations`:
    - [ ] Store selected file as annotation file
    - [ ] Mark for sidecar loading in Step 2

- [ ] **2.4** Implement validation display:
  - [ ] Show file name and dimensions on successful selection
  - [ ] Show error messages for invalid selections
  - [ ] Enable "Next" button when valid file selected

- [ ] **2.5** Add state variables to module:
  - [ ] `sourceFile` - info about the source image
  - [ ] `annotationFile` - info about existing annotation (if resuming/editing)
  - [ ] `tiffInfo` - dimensions, sliceCount, dtype
  - [ ] `isResuming` - flag for resume/edit scenarios
  - [ ] `sourceFileLoaded` - flag for step navigation

#### Manual Testing Steps

1. **Test file dropdown:**
   - [ ] Dropdown should show categorized sections
   - [ ] "Raw Images" section should list `.tif` files from `uploads/raw/`
   - [ ] "Inference Data" section should list files from `uploads/inference_data/`
   - [ ] (Later phases will populate unfinished/annotations sections)

2. **Test file selection (new annotation):**
   - [ ] Select a raw image file
   - [ ] Validation display should show: filename, dimensions, slice count
   - [ ] "Next" button should become enabled

3. **Test file upload:**
   - [ ] Use upload button to add a new TIFF file
   - [ ] File should appear in dropdown after upload
   - [ ] Should be auto-selected after upload

4. **Test navigation:**
   - [ ] Click "Next" to go to Step 2
   - [ ] Step 2 should show placeholder content
   - [ ] "Back" button should return to Step 1 with selection preserved

5. **Test invalid selection:**
   - [ ] If no files available, dropdown should show appropriate message
   - [ ] "Next" button should stay disabled until valid selection

**Phase 2 complete when:** Can select source files from workspace, see validation info, and navigate to Step 2.

---

### Phase 3: Backend - Full Resolution Slices

**Goal:** Create backend endpoints for full-resolution slice extraction and annotation saving.

#### Todos

- [ ] **3.1** Create `/python/extract_raw_slice.py`:
  - [ ] Accept arguments: `<input_tiff>`, `<slice_index>`, `<output_png>`
  - [ ] Use tifffile to read specific slice
  - [ ] Normalize to 8-bit (0-255) for display
  - [ ] Save as lossless PNG (no scaling, full resolution)
  - [ ] Output `SUCCESS:<path>` or `ERROR:<message>` to stdout
  - [ ] Handle edge cases: invalid slice index, corrupted file

- [ ] **3.2** Implement `/api/annotation/raw-slice/:fileId/:sliceIndex`:
  - [ ] Resolve file path from fileId using workspaceManager
  - [ ] Check if cached PNG exists in `.slices/` (with `_raw` suffix)
  - [ ] If not cached, call Python script to extract
  - [ ] Return PNG image with appropriate headers
  - [ ] Handle errors gracefully

- [ ] **3.3** Implement `/api/annotation/tiff-info/:fileId` (or reuse existing):
  - [ ] Verify existing endpoint returns full dimensions without scaling
  - [ ] If needed, add endpoint that guarantees raw dimensions

- [ ] **3.4** Implement placeholder endpoints (full implementation in Phase 8-9):
  - [ ] `POST /api/annotation/save-progress` - return success placeholder
  - [ ] `POST /api/annotation/create` - return success placeholder
  - [ ] `GET /api/annotation/load/:fileId` - return empty data placeholder

- [ ] **3.5** Add route registration:
  - [ ] Import annotation routes in `app.js`
  - [ ] Mount at `/api/annotation`

#### Manual Testing Steps

1. **Test raw slice endpoint:**
   ```bash
   # Get a file ID from workspace (check metadata.json or file browser)
   curl http://localhost:3000/api/annotation/raw-slice/<fileId>/0 --output test_slice.png
   ```
   - [ ] Should download a PNG file
   - [ ] Open PNG - should be full resolution (e.g., 512x512, not scaled)
   - [ ] Compare dimensions to original TIFF slice

2. **Test different slices:**
   - [ ] Request slice 0, middle slice, last slice
   - [ ] All should return valid PNGs
   - [ ] Invalid slice index should return error

3. **Test caching:**
   - [ ] Request same slice twice
   - [ ] Second request should be faster (cached)
   - [ ] Check `.slices/` directory for cached PNG

4. **Test Python script directly:**
   ```bash
   python python/extract_raw_slice.py <path_to_tiff> 0 /tmp/test_slice.png
   ```
   - [ ] Should output `SUCCESS:/tmp/test_slice.png`
   - [ ] File should exist and be valid PNG

5. **Test placeholder endpoints:**
   - [ ] POST to `/api/annotation/save-progress` with empty body
   - [ ] Should return success (placeholder)

**Phase 3 complete when:** Raw slice endpoint returns full-resolution PNGs, caching works, Python script extracts correctly.

---

### Phase 4: Step 2 - Canvas Architecture

**Goal:** Implement the layered canvas system with full-resolution image display, zoom, and pan.

#### Todos

- [ ] **4.1** Create `utils/AnnotationCanvas.js`:
  - [ ] Define class with constructor taking container element
  - [ ] Create DOM structure:
    ```
    container
    └── viewport (overflow: hidden, position: relative)
        └── transformContainer (will be scaled/translated)
            ├── sourceImage (<img>)
            ├── annotationCanvas (<canvas>)
            └── previewCanvas (<canvas>)
    ```
  - [ ] Store references to all elements
  - [ ] Initialize zoom=1, pan={x:0, y:0}

- [ ] **4.2** Implement image loading:
  - [ ] `async loadSlice(fileId, sliceIndex)` method
  - [ ] Fetch from `/api/annotation/raw-slice/:fileId/:sliceIndex`
  - [ ] Set image source and wait for load
  - [ ] Update canvas dimensions to match image
  - [ ] Calculate and apply fit-to-container zoom
  - [ ] Emit 'sliceLoaded' event

- [ ] **4.3** Implement zoom functionality:
  - [ ] `setZoom(level)` method with min/max limits (0.1 to 5.0)
  - [ ] `zoomIn()` / `zoomOut()` with 1.25x increments
  - [ ] `resetZoom()` to fit-to-container
  - [ ] `zoomToFit()` calculate optimal zoom for container
  - [ ] Apply via CSS transform on transformContainer

- [ ] **4.4** Implement pan functionality:
  - [ ] `setPan(x, y)` method
  - [ ] Mouse drag handling (right-click or middle-click)
  - [ ] Space+drag alternative
  - [ ] Boundary constraints (optional, can allow overscroll)

- [ ] **4.5** Implement coordinate transformation:
  - [ ] `screenToSource(screenX, screenY)` - convert screen coords to image pixels
  - [ ] `sourceToScreen(sourceX, sourceY)` - convert image pixels to screen coords
  - [ ] Account for: container offset, pan offset, zoom level, image position

- [ ] **4.6** Update Step 2 render in AnnotationModule:
  - [ ] Create canvas container div
  - [ ] Instantiate AnnotationCanvas
  - [ ] Add slice navigation controls (prev/next buttons, slice indicator)
  - [ ] Add zoom controls (+, -, reset buttons)
  - [ ] Load first slice on step activation

- [ ] **4.7** Implement slice navigation:
  - [ ] `goToSlice(index)` method
  - [ ] Previous/Next slice buttons
  - [ ] Slice indicator showing "X / Y"
  - [ ] Save current slice annotations before changing (placeholder for now)

#### Manual Testing Steps

1. **Test canvas initialization:**
   - [ ] Go to Step 1, select a TIFF file, click Next
   - [ ] Step 2 should show the first slice of the image
   - [ ] Image should be visible and fit within the container

2. **Test image resolution:**
   - [ ] Zoom in to 100% (or check pixel dimensions)
   - [ ] Image should be full resolution, not scaled/blurry
   - [ ] Canvas should match image dimensions exactly

3. **Test zoom controls:**
   - [ ] Click zoom in (+) - image should get larger
   - [ ] Click zoom out (-) - image should get smaller
   - [ ] Click reset - image should fit container
   - [ ] Mouse wheel over image should zoom in/out

4. **Test pan:**
   - [ ] Zoom in past container size
   - [ ] Right-click and drag - image should pan
   - [ ] Or hold Space and drag
   - [ ] Image should move smoothly

5. **Test slice navigation:**
   - [ ] Click "Next slice" (►) - should show next slice
   - [ ] Click "Previous slice" (◄) - should go back
   - [ ] Slice indicator should update (e.g., "5 / 64")
   - [ ] At first slice, prev should be disabled
   - [ ] At last slice, next should be disabled

6. **Test coordinate display (add debug):**
   - [ ] Move mouse over canvas
   - [ ] Console log should show source coordinates
   - [ ] At zoom=1, screen coords ≈ source coords
   - [ ] At zoom=2, source coords should be half of screen movement

**Phase 4 complete when:** Full-resolution images display, zoom/pan work smoothly, slice navigation works, coordinate transformation is accurate.

---

### Phase 5: Brush Engine

**Goal:** Implement brush and eraser tools for painting on the annotation canvas.

#### Todos

- [ ] **5.1** Create `utils/BrushEngine.js`:
  - [ ] Constructor takes AnnotationCanvas instance
  - [ ] State: `brushSize`, `tool` ('brush'|'eraser'), `activeClass`, `isDrawing`
  - [ ] Get annotation canvas context for drawing

- [ ] **5.2** Implement brush mechanics:
  - [ ] `startStroke(screenX, screenY)` - begin drawing, record start point
  - [ ] `continueStroke(screenX, screenY)` - draw from last point to current
  - [ ] `endStroke()` - finish drawing, trigger history save
  - [ ] Convert screen coords to source coords using AnnotationCanvas

- [ ] **5.3** Implement drawing algorithms:
  - [ ] `drawCircle(x, y, radius)` - fill circle at source coordinates
  - [ ] `drawLine(from, to)` - interpolate points between for smooth strokes
  - [ ] Use Bresenham's line algorithm or simple interpolation
  - [ ] Paint class ID value (1-N) for brush, 0 for eraser

- [ ] **5.4** Implement annotation data storage:
  - [ ] `sliceAnnotations: Map<number, Uint8Array>` in AnnotationModule
  - [ ] Each Uint8Array is `width * height` bytes
  - [ ] Values: 0=background, 1=class1, 2=class2, etc.
  - [ ] `getAnnotationData(sliceIndex)` - return or create Uint8Array
  - [ ] `setAnnotationData(sliceIndex, data)` - store Uint8Array

- [ ] **5.5** Implement canvas rendering:
  - [ ] `renderAnnotations()` - draw Uint8Array to annotation canvas
  - [ ] Map class IDs to colors (from class definitions)
  - [ ] Use ImageData for efficient pixel manipulation
  - [ ] Handle visibility toggle (skip hidden classes)

- [ ] **5.6** Implement brush preview:
  - [ ] Show circle cursor on preview canvas
  - [ ] Update on mouse move
  - [ ] Show brush size and active class color
  - [ ] Different cursor for eraser (X or different color)

- [ ] **5.7** Add toolbar controls to Step 2:
  - [ ] Brush button (selected by default)
  - [ ] Eraser button
  - [ ] Brush size slider (1-50 pixels)
  - [ ] Current brush size display

- [ ] **5.8** Wire up mouse events:
  - [ ] mousedown on annotation canvas → startStroke
  - [ ] mousemove → continueStroke (if drawing) or updatePreview
  - [ ] mouseup/mouseleave → endStroke
  - [ ] Prevent default to avoid selection/drag issues

#### Manual Testing Steps

1. **Test brush tool:**
   - [ ] Select brush tool (should be default)
   - [ ] Click and drag on canvas
   - [ ] Should see colored brush strokes appear
   - [ ] Release mouse - stroke should remain

2. **Test eraser tool:**
   - [ ] Paint some strokes first
   - [ ] Select eraser tool
   - [ ] Paint over existing strokes
   - [ ] Strokes should be erased (transparent)

3. **Test brush size:**
   - [ ] Adjust brush size slider
   - [ ] Paint strokes at different sizes
   - [ ] Larger size = thicker strokes
   - [ ] Preview cursor should show size

4. **Test smooth strokes:**
   - [ ] Draw quickly in curves
   - [ ] Lines should be smooth, not dotted
   - [ ] No gaps in strokes

5. **Test zoom + painting:**
   - [ ] Zoom in to 200%
   - [ ] Paint strokes
   - [ ] Strokes should appear at correct position (not offset)
   - [ ] Brush size should be in source pixels (appears larger on screen)

6. **Test pan + painting:**
   - [ ] Zoom in and pan to different area
   - [ ] Paint strokes
   - [ ] Strokes should be at correct position

7. **Test slice persistence:**
   - [ ] Paint on slice 0
   - [ ] Navigate to slice 5
   - [ ] Navigate back to slice 0
   - [ ] Strokes should still be there

**Phase 5 complete when:** Can paint with brush, erase, adjust size, strokes persist across slice navigation, coordinates are accurate at all zoom levels.

---

### Phase 6: History Manager

**Goal:** Implement undo/redo functionality for annotation editing.

#### Todos

- [ ] **6.1** Create `utils/HistoryManager.js`:
  - [ ] Constructor with `maxStatesPerSlice` parameter (default: 20)
  - [ ] Internal storage: `Map<sliceIndex, { undoStack: [], redoStack: [] }>`

- [ ] **6.2** Implement history operations:
  - [ ] `saveState(sliceIndex, annotationData)`:
    - [ ] Clone the Uint8Array
    - [ ] Push to undo stack
    - [ ] Clear redo stack (new edit invalidates redo)
    - [ ] Trim undo stack if exceeds maxStates
  - [ ] `undo(sliceIndex)`:
    - [ ] Pop from undo stack
    - [ ] Push current state to redo stack
    - [ ] Return previous state
  - [ ] `redo(sliceIndex)`:
    - [ ] Pop from redo stack
    - [ ] Push current state to undo stack
    - [ ] Return next state
  - [ ] `canUndo(sliceIndex)` / `canRedo(sliceIndex)` - check stack lengths

- [ ] **6.3** Implement memory management:
  - [ ] `clearSliceHistory(sliceIndex)` - clear history for specific slice
  - [ ] `clearAllHistory()` - clear all history
  - [ ] Option: Clear history on slice change to save memory
  - [ ] Show warning toast when history cleared

- [ ] **6.4** Integrate with BrushEngine:
  - [ ] Save state before each stroke (in `startStroke`)
  - [ ] Or save state after each stroke (in `endStroke`)
  - [ ] Decision: Save after stroke is simpler

- [ ] **6.5** Add UI controls:
  - [ ] Undo button (↶) in toolbar
  - [ ] Redo button (↷) in toolbar
  - [ ] Disable buttons when stack empty
  - [ ] Keyboard shortcuts: Ctrl+Z (undo), Ctrl+Y or Ctrl+Shift+Z (redo)

- [ ] **6.6** Update annotation canvas on undo/redo:
  - [ ] Replace current slice data with restored data
  - [ ] Re-render annotation canvas

#### Manual Testing Steps

1. **Test undo:**
   - [ ] Paint several strokes
   - [ ] Click Undo
   - [ ] Last stroke should disappear
   - [ ] Click Undo again - previous stroke disappears
   - [ ] Continue until all strokes removed

2. **Test redo:**
   - [ ] After undoing, click Redo
   - [ ] Stroke should reappear
   - [ ] Can redo multiple times

3. **Test undo/redo limits:**
   - [ ] Paint more than 20 strokes
   - [ ] Undo should stop after 20 undos (or configured limit)
   - [ ] Undo button should become disabled

4. **Test redo invalidation:**
   - [ ] Paint strokes, undo some
   - [ ] Paint a new stroke
   - [ ] Redo should be disabled (new edit clears redo stack)

5. **Test keyboard shortcuts:**
   - [ ] Ctrl+Z should undo
   - [ ] Ctrl+Y should redo
   - [ ] Ctrl+Shift+Z should also redo

6. **Test button states:**
   - [ ] On fresh canvas, Undo should be disabled
   - [ ] After painting, Undo should be enabled
   - [ ] After undoing all, Undo disabled, Redo enabled

7. **Test slice change behavior:**
   - [ ] Paint on slice 0, undo available
   - [ ] Navigate to slice 1
   - [ ] Navigate back to slice 0
   - [ ] Check if undo still works (depends on memory strategy)

**Phase 6 complete when:** Undo/redo work correctly, keyboard shortcuts work, button states update properly.

---

### Phase 7: Class Management

**Goal:** Implement multi-class annotation with add/remove/toggle functionality.

#### Todos

- [ ] **7.1** Add class state to AnnotationModule:
  - [ ] `classes: Array<{id, name, color, visible}>` - list of classes
  - [ ] `activeClassId: number` - currently selected class for painting
  - [ ] `nextClassId: number` - counter for generating unique IDs

- [ ] **7.2** Implement class palette:
  ```javascript
  const CLASS_COLORS = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
    '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'
  ];
  ```
  - [ ] `getNextColor()` - return first unused color from palette

- [ ] **7.3** Implement class operations:
  - [ ] `addClass()`:
    - [ ] Generate new ID (increment nextClassId)
    - [ ] Assign name "Class N"
    - [ ] Assign next available color
    - [ ] Add to classes array
    - [ ] Set as active class
    - [ ] Re-render class list
  - [ ] `deleteClass(classId)`:
    - [ ] Show confirmation dialog
    - [ ] Remove from classes array
    - [ ] Clear pixels with that class ID from ALL slices
    - [ ] If deleted class was active, select first remaining class
    - [ ] Re-render annotation canvas
  - [ ] `selectClass(classId)`:
    - [ ] Set activeClassId
    - [ ] Update UI to show selection
    - [ ] Update brush preview color
  - [ ] `toggleClassVisibility(classId)`:
    - [ ] Toggle visible flag
    - [ ] Re-render annotation canvas

- [ ] **7.4** Build class manager UI:
  - [ ] Container div in toolbar area
  - [ ] Header with "Classes" label and "+ Add" button
  - [ ] List of class items, each with:
    - [ ] Color swatch (square with class color)
    - [ ] Class name (e.g., "Class 1")
    - [ ] Visibility toggle button (👁️)
    - [ ] Delete button (🗑️)
  - [ ] Selected class has highlight/border

- [ ] **7.5** Update brush engine for multi-class:
  - [ ] Get active class ID when painting
  - [ ] Paint with class ID value (not just 1)
  - [ ] Update preview color based on active class

- [ ] **7.6** Update annotation rendering for multi-class:
  - [ ] Map each class ID to its color
  - [ ] Skip rendering pixels for hidden classes (visible=false)
  - [ ] Background (0) remains transparent

- [ ] **7.7** Initialize with default class:
  - [ ] On new annotation, create "Class 1" automatically
  - [ ] Select it as active

#### Manual Testing Steps

1. **Test default class:**
   - [ ] Start new annotation
   - [ ] "Class 1" should exist and be selected
   - [ ] Should have first color from palette (#FF6B6B)

2. **Test add class:**
   - [ ] Click "+ Add" button
   - [ ] "Class 2" should appear with different color
   - [ ] New class should become selected

3. **Test class selection:**
   - [ ] Click on "Class 1" in list
   - [ ] Should become selected (highlighted)
   - [ ] Paint strokes - should use Class 1 color
   - [ ] Click on "Class 2"
   - [ ] Paint strokes - should use Class 2 color

4. **Test visibility toggle:**
   - [ ] Paint with Class 1 and Class 2
   - [ ] Click visibility toggle on Class 1
   - [ ] Class 1 strokes should disappear
   - [ ] Click again - strokes reappear

5. **Test delete class:**
   - [ ] Paint with Class 1
   - [ ] Click delete on Class 1
   - [ ] Confirmation should appear
   - [ ] Confirm - Class 1 removed from list
   - [ ] All Class 1 pixels should be cleared

6. **Test color assignment:**
   - [ ] Add multiple classes
   - [ ] Each should get unique color
   - [ ] After 10+ classes, colors may repeat

7. **Test painting persistence:**
   - [ ] Paint with Class 1 on slice 0
   - [ ] Paint with Class 2 on slice 0
   - [ ] Navigate to slice 5 and back
   - [ ] Both class strokes should be preserved with correct colors

**Phase 7 complete when:** Can add/remove classes, select active class, toggle visibility, paint with different classes, class colors render correctly.

---

### Phase 8: Save Progress (Unfinished Annotations)

**Goal:** Implement saving annotations as TIFF with sidecar JSON for resuming later.

#### Todos

- [ ] **8.1** Create `/python/create_annotation_tiff.py`:
  - [ ] Accept arguments: `--config <config.json>` `--output <output.tif>`
  - [ ] Config JSON structure:
    ```json
    {
      "width": 512,
      "height": 512,
      "slices": 64,
      "sliceData": {
        "0": "<base64 Uint8Array>",
        "5": "<base64 Uint8Array>"
      }
    }
    ```
  - [ ] Create numpy array `(slices, height, width)` initialized to 0
  - [ ] For each slice in sliceData, decode base64 and fill array
  - [ ] Save as TIFF using tifffile
  - [ ] Output `SUCCESS:<path>` or `ERROR:<message>`

- [ ] **8.2** Implement `POST /api/annotation/save-progress`:
  - [ ] Accept JSON body with annotation data
  - [ ] Generate filename: `{timestamp}-{sourceFileName}_annotation.tif`
  - [ ] Write config JSON to temp file
  - [ ] Call Python script to create TIFF
  - [ ] Save sidecar JSON alongside TIFF
  - [ ] Add file to workspace metadata with category `unfinished_annotations`
  - [ ] Include lineage (processType: 'annotation', inputs: [sourceFileId], status: 'in_progress')
  - [ ] Return file ID and paths

- [ ] **8.3** Implement sidecar JSON creation:
  - [ ] Filename: `{annotation_tiff_name}_classes.json`
  - [ ] Contents:
    ```json
    {
      "version": "1.0.0",
      "sourceFileId": "file_xxx",
      "sourceFileName": "original.tif",
      "classes": [{"id": 1, "name": "Class 1", "color": "#FF6B6B"}],
      "createdAt": "ISO date",
      "lastModifiedAt": "ISO date",
      "status": "in_progress"
    }
    ```

- [ ] **8.4** Update AnnotationAPI.js:
  - [ ] Implement `saveProgress(data)` method
  - [ ] Convert sliceAnnotations Map to base64-encoded object
  - [ ] Include sourceFileId, dimensions, classes

- [ ] **8.5** Add "Save Progress" button to UI:
  - [ ] Button in Step 2 header area
  - [ ] On click, collect data and call API
  - [ ] Show loading state during save
  - [ ] Show success/error notification
  - [ ] Update `isDirty` flag to false on success

- [ ] **8.6** Implement `GET /api/annotation/load/:fileId`:
  - [ ] Load the annotation TIFF
  - [ ] Load the sidecar JSON
  - [ ] Extract slice data from TIFF (only non-empty slices)
  - [ ] Return combined data for frontend

- [ ] **8.7** Update data selection (Step 1) for resume:
  - [ ] When selecting from `unfinished_annotations`:
    - [ ] Load annotation TIFF data
    - [ ] Load sidecar JSON for source file and classes
    - [ ] Load source image based on sourceFileId
    - [ ] Restore classes and slice annotations in Step 2

#### Manual Testing Steps

1. **Test save progress:**
   - [ ] Start new annotation, paint on several slices
   - [ ] Click "Save Progress"
   - [ ] Should see loading indicator
   - [ ] Should see success notification

2. **Test saved files:**
   - [ ] Check workspace files (file browser or API)
   - [ ] Should see new `.tif` file in `unfinished_annotations` category
   - [ ] Should see corresponding `_classes.json` sidecar file
   - [ ] TIFF should have correct dimensions

3. **Test TIFF content:**
   - [ ] Download saved TIFF
   - [ ] Open in ImageJ or Python
   - [ ] Pixels should have values 0, 1, 2 etc. matching class IDs
   - [ ] Correct slices should have annotation data

4. **Test sidecar JSON:**
   - [ ] Download/read sidecar JSON
   - [ ] Should contain sourceFileId, classes with colors, status "in_progress"

5. **Test resume (basic - full test after Phase 9):**
   - [ ] File should appear in "Unfinished Annotations" dropdown section
   - [ ] Selecting it should allow proceeding to Step 2

6. **Test metadata entry:**
   - [ ] Check workspace metadata.json
   - [ ] Entry should have category "unfinished_annotations"
   - [ ] Lineage should show processType "annotation" and status "in_progress"

**Phase 8 complete when:** Can save annotation progress as TIFF + sidecar, files appear in workspace, saved data is correct.

---

### Phase 9: Create Final Annotation & Resume/Edit

**Goal:** Implement final annotation export and complete the resume/edit workflows.

#### Todos

- [ ] **9.1** Implement `POST /api/annotation/create`:
  - [ ] Similar to save-progress but:
    - [ ] Save to `uploads/annotations/` directory
    - [ ] Set sidecar status to `complete`
    - [ ] Category in metadata: `annotations`
    - [ ] Lineage status: `complete`
  - [ ] Optionally delete unfinished version if exists

- [ ] **9.2** Add "Create Annotation" button:
  - [ ] Button in Step 2 header (primary/prominent)
  - [ ] Validation before create:
    - [ ] At least one class must exist
    - [ ] If no pixels painted, show confirmation dialog
  - [ ] On click, call API
  - [ ] Show success notification with option to view in file browser

- [ ] **9.3** Complete resume workflow:
  - [ ] In Step 2 `initialize()`, check if `isResuming` is true
  - [ ] If resuming, call `/api/annotation/load/:fileId`
  - [ ] Restore classes from sidecar
  - [ ] Restore sliceAnnotations from TIFF data
  - [ ] Load source image using sourceFileId from sidecar
  - [ ] Render restored state

- [ ] **9.4** Complete edit existing workflow:
  - [ ] Same as resume but source is `annotations` category
  - [ ] On save/create, generate NEW file (don't overwrite)
  - [ ] Increment version or add timestamp to filename

- [ ] **9.5** Handle missing source file:
  - [ ] When loading, verify sourceFileId still exists
  - [ ] If not found, show error and prevent loading
  - [ ] Suggest deleting orphaned annotation

- [ ] **9.6** Add dirty state tracking:
  - [ ] Set `isDirty = true` on any paint operation
  - [ ] Set `isDirty = false` after successful save
  - [ ] Warn on navigation away if dirty

- [ ] **9.7** Implement beforeunload warning:
  - [ ] Add event listener for `beforeunload`
  - [ ] Show browser warning if `isDirty`

#### Manual Testing Steps

1. **Test create final annotation:**
   - [ ] Paint annotation with multiple classes
   - [ ] Click "Create Annotation"
   - [ ] Should see success notification
   - [ ] File should appear in `annotations` category (not unfinished)

2. **Test final annotation file:**
   - [ ] Download created TIFF
   - [ ] Verify dimensions and class data
   - [ ] Check sidecar has status "complete"

3. **Test resume unfinished:**
   - [ ] Save progress on an annotation
   - [ ] Return to hub, launch annotation module again
   - [ ] Select the unfinished annotation from dropdown
   - [ ] Click Next
   - [ ] Should see previously painted strokes
   - [ ] Should see previously created classes

4. **Test edit existing:**
   - [ ] Create a final annotation
   - [ ] Launch annotation module again
   - [ ] Select from "Existing Annotations" section
   - [ ] Should load the annotation for editing
   - [ ] Make changes and save
   - [ ] Should create NEW file (not overwrite original)

5. **Test dirty state warning:**
   - [ ] Paint some strokes (don't save)
   - [ ] Try to click "Back to Hub"
   - [ ] Should see warning about unsaved changes
   - [ ] Try to close browser tab
   - [ ] Should see browser's unsaved changes warning

6. **Test missing source file:**
   - [ ] Save unfinished annotation
   - [ ] Delete the source file from workspace
   - [ ] Try to resume the annotation
   - [ ] Should show error about missing source

7. **Test validation:**
   - [ ] Try to create annotation with no classes
   - [ ] Should show error
   - [ ] Delete all classes and try to create
   - [ ] Should show error
   - [ ] Create annotation with no painted pixels
   - [ ] Should show confirmation dialog

**Phase 9 complete when:** Can create final annotations, resume unfinished work, edit existing annotations, dirty state warnings work.

---

### Phase 10: Polish

**Goal:** Final polish, error handling, loading states, and UI improvements.

#### Todos

- [ ] **10.1** Loading states:
  - [ ] Show spinner while loading slices
  - [ ] Show progress during TIFF save/create
  - [ ] Disable buttons during async operations
  - [ ] Show skeleton/placeholder while canvas initializes

- [ ] **10.2** Error handling:
  - [ ] Graceful handling of network errors
  - [ ] Retry logic for failed slice loads
  - [ ] User-friendly error messages
  - [ ] Log errors to console for debugging

- [ ] **10.3** Toolbar polish:
  - [ ] Clean layout with logical groupings
  - [ ] Tooltips on all buttons
  - [ ] Keyboard shortcuts displayed in tooltips
  - [ ] Responsive layout for smaller screens

- [ ] **10.4** Class management polish:
  - [ ] Allow renaming classes (click on name to edit)
  - [ ] Drag to reorder classes (optional)
  - [ ] Color picker for custom colors (optional)

- [ ] **10.5** Performance optimization:
  - [ ] Lazy load slices (don't preload all)
  - [ ] Efficient canvas rendering (requestAnimationFrame)
  - [ ] Debounce brush preview updates
  - [ ] Limit history state size for large images

- [ ] **10.6** Accessibility:
  - [ ] Keyboard navigation for tools
  - [ ] ARIA labels on buttons
  - [ ] Focus management

- [ ] **10.7** Documentation:
  - [ ] Update module description in registry
  - [ ] Add usage hints in UI
  - [ ] Document keyboard shortcuts

- [ ] **10.8** Edge cases:
  - [ ] Handle very large images (show warning?)
  - [ ] Handle single-slice images (hide navigation)
  - [ ] Handle empty workspace (no files to select)

#### Manual Testing Steps

1. **Test loading states:**
   - [ ] All async operations show loading indicators
   - [ ] Buttons disabled during loading
   - [ ] No UI freezing during operations

2. **Test error scenarios:**
   - [ ] Disconnect network, try to save
   - [ ] Should show error message, allow retry
   - [ ] Bad file ID in URL
   - [ ] Should show error, allow navigation back

3. **Test keyboard shortcuts:**
   - [ ] B = select brush
   - [ ] E = select eraser
   - [ ] [ = decrease brush size
   - [ ] ] = increase brush size
   - [ ] Ctrl+Z = undo
   - [ ] Ctrl+Y = redo
   - [ ] Space+drag = pan

4. **Test tooltips:**
   - [ ] Hover over each button
   - [ ] Tooltip should appear with description and shortcut

5. **Test edge cases:**
   - [ ] Single-slice image: navigation should be hidden
   - [ ] Large image (2048x2048): should work without crashes
   - [ ] No workspace files: should show helpful message

6. **Final integration test:**
   - [ ] Complete full workflow: select → paint → add classes → save progress → resume → create final
   - [ ] All features working together
   - [ ] No console errors
   - [ ] Smooth user experience

**Phase 10 complete when:** All polish items addressed, no rough edges, smooth user experience, handles errors gracefully.

---

## New Backend Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/annotation/raw-slice/:fileId/:sliceIndex` | GET | Full-resolution slice as PNG |
| `/api/annotation/save-progress` | POST | Save unfinished annotation TIFF + sidecar |
| `/api/annotation/create` | POST | Create final annotation TIFF |
| `/api/annotation/load/:fileId` | GET | Load unfinished annotation + sidecar |

---

## Data Structures

### Annotation Layer Storage
```javascript
// Per-slice annotation data (source resolution)
this.sliceAnnotations = new Map();  // Map<sliceIndex, Uint8Array>
// Each Uint8Array is width*height bytes, values: 0=background, 1-N=class IDs
```

### Class Definition
```javascript
this.classes = [
  { id: 1, name: 'Class 1', color: '#FF6B6B', visible: true },
  { id: 2, name: 'Class 2', color: '#4ECDC4', visible: true }
];
```

### Sidecar JSON (saved alongside annotation TIFF)
```json
{
  "version": "1.0.0",
  "sourceFileId": "file_xxx",
  "sourceFileName": "original.tif",
  "classes": [{ "id": 1, "name": "Class 1", "color": "#FF6B6B" }],
  "createdAt": "ISO date",
  "lastModifiedAt": "ISO date",
  "status": "in_progress" | "complete"
}
```

---

## Critical Implementation Details

1. **Full-resolution images**: Existing `/api/workspace/slice/` scales images. New endpoint required.

2. **Canvas coordinate transformation**: Must convert screen coordinates to source pixels accounting for zoom, pan, and container offset. Formula:
   ```javascript
   sourceX = (screenX - containerOffset.x - pan.x) / zoom
   sourceY = (screenY - containerOffset.y - pan.y) / zoom
   ```

3. **Memory management**: For 512x512x100 stack with 20 history states per slice:
   - Per slice: 512*512 = 262KB
   - History: 262KB * 20 = 5.2MB per slice
   - Solution: Only keep history for current slice, warn on slice change

4. **Loading unfinished annotations**: Sidecar JSON contains `sourceFileId` to find original image

5. **Edit existing workflow**: When loading from `annotations` category:
   - Read annotation TIFF as the annotation layer (not source)
   - Find original source via `sourceFileId` in sidecar
   - On save, create NEW annotation (don't overwrite original)

---

## Reference Files (patterns to follow)

| File | Pattern |
|------|---------|
| `/public/workspace/js/modules/mesh/MeshModule.js` | Module structure, step navigation, API client |
| `/public/workspace/js/core/BaseModule.js` | Lifecycle, CSS loading, step conditions |
| `/src/routes/mesh.routes.js` | Backend route pattern |
| `/python/extract_slice.py` | TIFF slice extraction (reference, but we need unscaled) |
