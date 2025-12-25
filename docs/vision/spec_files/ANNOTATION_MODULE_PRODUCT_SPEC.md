
# 📋 Product Specification: Annotation Module

**Module Name:** Annotation Tool  
**Version:** 1.0.0  
**Author:** [Your Name]  
**Date:** 2025-12-23  
**Status:** Ready for Implementation

---

## 1. Overview

### 1.1 Purpose

The Annotation Module provides a browser-based painting tool for creating ground-truth segmentation masks from biomedical image stacks. It enables users to manually label regions of interest across 2D+Z grayscale .tif stacks, supporting the full workspace pipeline: denoising → **annotation** → segmentation → mesh creation → 3D visualization.

### 1.2 Key Value Proposition

- Eliminates the need for external annotation software (e.g., ImageJ, CVAT)
- Maintains data lineage and metadata consistency within the workspace
- Supports iterative workflows via "save and continue later" functionality
- Outputs annotation masks directly compatible with the segmentation module

### 1.3 Module Position in Pipeline

```
Raw Images ──► Denoising ──► Annotation ──► Segmentation ──► Mesh Creation ──► 3D Visualization
                              ▲
                              │
                         (This Module)
```

---

## 2. User Stories

| ID | As a... | I want to... | So that... |
|----|---------|--------------|------------|
| US-01 | Researcher | Select an existing image stack from my workspace | I can annotate data I've already uploaded or processed |
| US-02 | Researcher | Upload a new .tif stack directly in the module | I don't have to leave the annotation workflow |
| US-03 | Researcher | Paint class labels on individual slices | I can create training data for segmentation |
| US-04 | Researcher | Add/remove annotation classes dynamically | I can adapt to varying numbers of structures in my data |
| US-05 | Researcher | Save my work-in-progress | I can take breaks and resume annotation later |
| US-06 | Researcher | Resume an unfinished annotation | I don't lose partial work |
| US-07 | Researcher | Export finished annotations as a .tif stack | The output is compatible with the segmentation module |
| US-08 | Researcher | Undo/redo brush strokes | I can correct mistakes without starting over |
| US-09 | Researcher | Toggle class visibility | I can verify annotations against the source image |
| US-10 | Researcher | Zoom and pan while annotating | I can work on fine details in large images |

---

## 3. Functional Requirements

### 3.1 Step 1: Data Selection & Upload

#### 3.1.1 File Selector Dropdown

The dropdown must display files organized into **three sections**:

| Section | Description | Source Categories |
|---------|-------------|-------------------|
| **Unfinished Annotations** | Previously saved incomplete annotation sessions | `unfinished_annotations` (new category) |
| **Recent Results** | Recently created/processed files | `raw_images`, `inference_data` |
| **Workspace Files** | All compatible files in workspace | `raw_images`, `inference_data` |

**Behavior:**
- Only `.tif` files from `raw_images` and `inference_data` categories appear in Recent Results / Workspace Files sections
- Unfinished Annotations section shows files with category `unfinished_annotations`
- Selecting an unfinished annotation loads both the source image AND the saved painting state

#### 3.1.2 File Upload

| Requirement | Details |
|-------------|---------|
| Accepted format | `.tif` / `.tiff` grayscale image stacks |
| Validation | Use existing raw image validation function (same as segmentation module) |
| On valid upload | Save to `uploads/raw/` directory, add metadata entry with category `raw_images` |
| On invalid upload | Reject file, display error message, do NOT save to workspace |
| Post-validation | Enable "Next" navigation button |

#### 3.1.3 Navigation

- "Next" button remains **disabled** until a valid file is selected or uploaded
- Selecting a file OR successful upload validation enables the button

---

### 3.2 Step 2: Annotation Interface

#### 3.2.1 Image Viewer

Adapt from existing Image Viewer module with these specifications:

| Feature | Specification |
|---------|---------------|
| View modes | Single image view, Grid view |
| Painting enabled | Single image view **only** |
| Grid view | View-only (no painting) |
| Slice navigation | Arrow buttons (◄ ►) to navigate Z-stack |
| Current slice indicator | Display "Slice X of Y" |
| Zoom | Mouse wheel or +/- buttons |
| Pan | Click-and-drag (when not in paint mode) or dedicated pan tool |

**Canvas Architecture:**
```
┌─────────────────────────────────────┐
│  Source Image Layer (read-only)     │
├─────────────────────────────────────┤
│  Annotation Layer (per-slice)       │  ◄── One annotation layer per Z-slice
├─────────────────────────────────────┤
│  Active Brush Preview Layer         │
└─────────────────────────────────────┘
```

Each slice in the stack has its own independent annotation layer.

#### 3.2.2 Toolbar

Position: **Below the image viewer**

**Tool Buttons:**

| Tool | Icon | Behavior |
|------|------|----------|
| **Brush** | 🖌️ | Paint with currently selected class color |
| **Eraser** | 🧹 | Remove annotations (set pixels to transparent/unpainted) |
| **Brush Size** | Slider or +/- | Adjust brush radius (e.g., 1–50 px) |
| **Undo** | ↶ | Revert last brush stroke |
| **Redo** | ↷ | Restore undone stroke |
| **Zoom In** | 🔍+ | Increase canvas zoom |
| **Zoom Out** | 🔍- | Decrease canvas zoom |
| **Pan** | ✋ | Enable pan mode (drag to move view) |

**Class Management Section:**

| Element | Behavior |
|---------|----------|
| **"+ Add Class" button** | Creates new class with auto-assigned color |
| **Class list** | Vertical list of all classes |
| **Class item** | Contains: color swatch, class name (editable?), visibility toggle (👁️), delete button (🗑️) |
| **Class selection** | Click class to select as active painting class |
| **Visibility toggle** | Show/hide painted regions for that class |
| **Delete class** | Remove class AND delete all painted regions of that class across all slices |

**Color Auto-Assignment:**
Use a predefined palette of visually distinct colors, cycling through:
```javascript
const CLASS_COLORS = [
  '#FF6B6B', // Red
  '#4ECDC4', // Teal
  '#45B7D1', // Blue
  '#96CEB4', // Green
  '#FFEAA7', // Yellow
  '#DDA0DD', // Plum
  '#98D8C8', // Mint
  '#F7DC6F', // Gold
  '#BB8FCE', // Purple
  '#85C1E9', // Sky Blue
  // ... extend as needed
];
```

#### 3.2.3 Main Control Buttons

Always visible in Step 2, positioned prominently (e.g., top-right or bottom of interface):

| Button | Label | Behavior |
|--------|-------|----------|
| **Save** | "Save Progress" | Save current annotation state as unfinished (see §3.3) |
| **Create** | "Create Annotation Data" | Convert paintings to final .tif mask stack (see §3.4) |

---

### 3.3 Save Progress (Unfinished Annotations)

#### 3.3.1 Storage Location

```
workspace/
└── uploads/
    └── unfinished_annotations/
        └── {timestamp}-{original_filename}_annotation.json
```

#### 3.3.2 Unfinished Annotation File Format

```json
{
  "version": "1.0.0",
  "sourceFileId": "file_1766449799604_sm4sytivm",
  "sourceFileName": "tryp_stck1_crop2_norm_train.tif",
  "createdAt": "2025-12-23T12:00:00.000Z",
  "lastModifiedAt": "2025-12-23T14:30:00.000Z",
  "dimensions": {
    "width": 512,
    "height": 512,
    "slices": 64
  },
  "classes": [
    { "id": 1, "name": "Class 1", "color": "#FF6B6B" },
    { "id": 2, "name": "Class 2", "color": "#4ECDC4" }
  ],
  "annotations": {
    "0": "<base64 encoded PNG or RLE data for slice 0>",
    "1": "<base64 encoded PNG or RLE data for slice 1>",
    // ... only slices with annotations
  }
}
```

**Note:** Consider using Run-Length Encoding (RLE) or PNG compression for annotation data to minimize file size.

#### 3.3.3 Metadata Entry

```json
{
  "id": "file_1766500000000_xxxxxxxxx",
  "name": "tryp_stck1_crop2_norm_train_annotation.json",
  "path": "uploads/unfinished_annotations/1766500000000-tryp_stck1_crop2_norm_train_annotation.json",
  "category": "unfinished_annotations",
  "size": 125000,
  "uploadedAt": "2025-12-23T14:30:00.000Z",
  "folderId": null,
  "thumbnailPath": null,
  "lineage": {
    "processType": "annotation",
    "processedAt": "2025-12-23T14:30:00.000Z",
    "inputs": ["file_1766449799604_sm4sytivm"],
    "processId": "annotation_1766500000000_xxxxxxxx",
    "status": "in_progress"
  }
}
```

#### 3.3.4 Loading Unfinished Annotations

When user selects an unfinished annotation from the dropdown:
1. Parse the JSON file
2. Load the source image using `sourceFileId`
3. Restore all classes with their colors
4. Restore annotation layers for each slice
5. User continues editing from saved state

---

### 3.4 Create Annotation Data (Final Export)

#### 3.4.1 Conversion Process

```
┌─────────────────────────────────────────────────────────────┐
│  For each slice in Z-stack:                                 │
│                                                             │
│  1. Create output array matching source dimensions          │
│  2. Initialize all pixels to 0 (background)                 │
│  3. For each class (in order of creation):                  │
│     - Set pixels painted with class N to value N            │
│     - Class 1 → value 1                                     │
│     - Class 2 → value 2                                     │
│     - Class N → value N                                     │
│  4. Stack all slices into 3D array                          │
│  5. Save as .tif with matching bit depth                    │
└─────────────────────────────────────────────────────────────┘
```

**Output Value Mapping:**

| Region | Output Value |
|--------|--------------|
| Unpainted (background) | 0 |
| Class 1 | 1 |
| Class 2 | 2 |
| Class N | N |

#### 3.4.2 Output File

| Property | Specification |
|----------|---------------|
| Format | `.tif` stack |
| Dimensions | Identical to source image (X, Y, Z) |
| Bit depth | Match source image bit depth |
| Location | `uploads/annotations/` |
| Naming | `{timestamp}-{source_filename}_annotations.tif` |

#### 3.4.3 Metadata Entry for Final Annotation

```json
{
  "id": "file_1766510000000_yyyyyyyyy",
  "name": "tryp_stck1_crop2_norm_train_annotations.tif",
  "path": "uploads/annotations/1766510000000-tryp_stck1_crop2_norm_train_annotations.tif",
  "category": "annotations",
  "size": 1515954,
  "uploadedAt": "2025-12-23T15:00:00.000Z",
  "folderId": null,
  "thumbnailPath": ".thumbnails/file_1766510000000_yyyyyyyyy.jpg",
  "lineage": {
    "processType": "annotation",
    "processedAt": "2025-12-23T15:00:00.000Z",
    "inputs": ["file_1766449799604_sm4sytivm"],
    "processId": "annotation_1766510000000_yyyyyyyy",
    "status": "complete"
  },
  "annotationMetadata": {
    "classCount": 3,
    "classes": [
      { "value": 1, "name": "Class 1", "color": "#FF6B6B" },
      { "value": 2, "name": "Class 2", "color": "#4ECDC4" },
      { "value": 3, "name": "Class 3", "color": "#45B7D1" }
    ]
  }
}
```

---

## 4. Technical Architecture

### 4.1 Module Structure

```
annotation-module/
├── AnnotationModule.js          # Main module class (extends BaseModule)
├── components/
│   ├── DataSelector.js          # Step 1: File selection/upload
│   ├── AnnotationCanvas.js      # Canvas with image + annotation layers
│   ├── SliceNavigator.js        # Z-stack navigation controls
│   ├── Toolbar.js               # Paint tools and controls
│   ├── ClassManager.js          # Class list, add/remove/toggle
│   └── ViewModeToggle.js        # Single view / Grid view switch
├── utils/
│   ├── brushEngine.js           # Brush stroke rendering
│   ├── historyManager.js        # Undo/redo stack
│   ├── annotationSerializer.js  # Save/load annotation state
│   └── maskConverter.js         # Convert paintings to .tif mask
└── styles/
    └── annotation.css
```

### 4.2 Key Frontend Components

#### 4.2.1 AnnotationCanvas

- Use HTML5 `<canvas>` with multiple layers
- Source image layer: renders current slice (read-only)
- Annotation layer: transparent overlay for painting
- Maintain separate annotation data array for each slice: `Map<sliceIndex, ImageData>`

#### 4.2.2 BrushEngine

```javascript
class BrushEngine {
  constructor(canvas, options) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.brushSize = options.brushSize || 10;
    this.currentClass = null;
    this.isEraser = false;
  }
  
  startStroke(x, y) { /* ... */ }
  continueStroke(x, y) { /* ... */ }
  endStroke() { /* ... */ }
  
  setBrushSize(size) { /* ... */ }
  setClass(classObj) { /* ... */ }
  setEraser(enabled) { /* ... */ }
}
```

#### 4.2.3 HistoryManager

```javascript
class HistoryManager {
  constructor(maxStates = 50) {
    this.undoStack = [];
    this.redoStack = [];
    this.maxStates = maxStates;
  }
  
  saveState(sliceIndex, imageData) { /* ... */ }
  undo() { /* returns previous state */ }
  redo() { /* returns next state */ }
  clear() { /* reset history */ }
}
```

### 4.3 Backend Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/annotation/validate` | POST | Validate uploaded .tif file |
| `/api/annotation/save-progress` | POST | Save unfinished annotation JSON |
| `/api/annotation/load-progress` | GET | Load unfinished annotation by ID |
| `/api/annotation/create-mask` | POST | Convert annotation data to .tif stack |
| `/api/files/upload` | POST | Existing endpoint for file upload |

### 4.4 Data Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           STEP 1: Data Selection                        │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
         ┌──────────────────────────┼──────────────────────────┐
         ▼                          ▼                          ▼
   Select from              Upload new file            Select unfinished
   workspace files                                      annotation
         │                          │                          │
         │                    ┌─────▼─────┐                    │
         │                    │ Validate  │                    │
         │                    └─────┬─────┘                    │
         │                          │                          │
         │                    ┌─────▼─────┐                    │
         │                    │ Save to   │                    │
         │                    │ raw/      │                    │
         │                    └─────┬─────┘                    │
         │                          │                          │
         └──────────────────────────┼──────────────────────────┘
                                    │
                                    ▼
                          Enable "Next" button
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           STEP 2: Annotation                            │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
             "Save Progress"               "Create Annotation Data"
                    │                               │
                    ▼                               ▼
         ┌──────────────────┐            ┌──────────────────┐
         │ Serialize to JSON │            │ Convert to mask  │
         │ Save to           │            │ array (0,1,2..N) │
         │ unfinished_       │            │                  │
         │ annotations/      │            │ Save as .tif to  │
         └──────────────────┘            │ annotations/     │
                    │                     └──────────────────┘
                    ▼                               │
         Update metadata.json                      ▼
         (status: in_progress)           Update metadata.json
                                         (status: complete)
```

---

## 5. UI/UX Specifications

### 5.1 Step 1 Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  Annotation Module                                        [X]   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Select Image Stack                              [▼]    │   │
│  ├─────────────────────────────────────────────────────────┤   │
│  │  ── Unfinished Annotations ──                           │   │
│  │    📝 image1_annotation.json (last edited 2h ago)       │   │
│  │  ── Recent Results ──                                   │   │
│  │    🖼️ denoised_stack.tif                                │   │
│  │  ── Workspace Files ──                                  │   │
│  │    🖼️ raw_image_001.tif                                 │   │
│  │    🖼️ inference_result.tif                              │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│                         ─── OR ───                              │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                                                         │   │
│  │     📁 Drag & drop .tif file here or click to browse    │   │
│  │                                                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│                                              [ Next → ] (disabled)│
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 Step 2 Layout

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Annotation Module                          [Save Progress] [Create Data]   │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                     │    │
│  │                                                                     │    │
│  │                                                                     │    │
│  │                        IMAGE CANVAS                                 │    │
│  │                   (with annotation overlay)                         │    │
│  │                                                                     │    │
│  │                                                                     │    │
│  │                                                                     │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  [◄] Slice 12 of 64 [►]                    [Single View] [Grid View]│    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  TOOLBAR                                                            │    │
│  │  ┌──────────────────────────────┐   ┌──────────────────────────────┐│    │
│  │  │ [🖌️] [🧹] Size: [====●===]   │   │ Classes          [+ Add]     ││    │
│  │  │ [↶] [↷] [🔍+] [🔍-] [✋]     │   │ ┌────────────────────────┐   ││    │
│  │  └──────────────────────────────┘   │ │ ● Class 1  [👁️] [🗑️]   │   ││    │
│  │                                     │ │ ○ Class 2  [👁️] [🗑️]   │   ││    │
│  │                                     │ │ ○ Class 3  [👁️] [🗑️]   │   ││    │
│  │                                     │ └────────────────────────┘   ││    │
│  │                                     └──────────────────────────────┘│    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  [← Back]                                                                   │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.3 Interaction States

| State | Visual Feedback |
|-------|-----------------|
| Brush tool active | Cursor shows brush size circle |
| Eraser tool active | Cursor shows eraser icon with size |
| Pan tool active | Cursor shows grab hand |
| Class selected | Highlighted in class list with border |
| Class hidden | Visibility icon dimmed, painted regions transparent |
| Unsaved changes | "Save Progress" button shows indicator dot |
| Saving in progress | Button shows spinner |
| Create in progress | Show progress modal with status |

---

## 6. Edge Cases & Error Handling

| Scenario | Handling |
|----------|----------|
| User tries to create annotation with no classes | Show warning: "Please add at least one class before creating annotation data" |
| User tries to create annotation with no painted regions | Allow it (outputs all-zero background mask) with confirmation dialog |
| User deletes all classes | Clear all annotations, return to empty state |
| Source file no longer exists when loading unfinished annotation | Show error, remove unfinished annotation entry from dropdown |
| Browser tab closed with unsaved changes | Show browser's native "unsaved changes" warning (beforeunload) |
| Very large image stack (memory concerns) | Load slices on-demand, only keep current slice + neighbors in memory |
| Overlapping brush strokes of same class | No issue (idempotent) |
| User paints same pixel with different classes | Last class wins (overwrite) |

---

## 7. File Categories Reference

| Category | Directory | Description |
|----------|-----------|-------------|
| `raw_images` | `uploads/raw/` | Original uploaded image stacks |
| `inference_data` | `uploads/inference_data/` | Processed images for inference |
| `annotations` | `uploads/annotations/` | **Final** annotation mask stacks |
| `unfinished_annotations` | `uploads/unfinished_annotations/` | **NEW** - Work-in-progress annotation JSON files |
| `segmentations` | `results/segmentation/` | Segmentation outputs |
| `meshes` | `results/meshes/` | Generated mesh data |
| `models` | `models/` | Trained model files |

---

## 8. Implementation Checklist

### Phase 1: Foundation
- [ ] Create module directory structure
- [ ] Implement `AnnotationModule.js` extending `BaseModule`
- [ ] Set up step navigation (Step 1 ↔ Step 2)
- [ ] Create new directory: `uploads/unfinished_annotations/`
- [ ] Add `unfinished_annotations` category support to file system

### Phase 2: Step 1 - Data Selection
- [ ] Implement file selector dropdown with three sections
- [ ] Filter files by `raw_images` and `inference_data` categories
- [ ] Add unfinished annotations section
- [ ] Implement file upload with validation (reuse existing validator)
- [ ] Enable/disable Next button based on selection state

### Phase 3: Step 2 - Core Viewer
- [ ] Implement image canvas (adapt from Image Viewer module)
- [ ] Add slice navigation (arrow buttons, slice counter)
- [ ] Implement zoom functionality
- [ ] Implement pan functionality
- [ ] Add view mode toggle (single/grid)
- [ ] Disable painting in grid view

### Phase 4: Step 2 - Annotation Tools
- [ ] Implement annotation layer (per-slice)
- [ ] Create brush engine with variable size
- [ ] Implement eraser tool
- [ ] Add undo/redo functionality
- [ ] Implement brush size slider

### Phase 5: Step 2 - Class Management
- [ ] Implement "Add Class" with auto-color assignment
- [ ] Create class list UI
- [ ] Implement class selection (active class for painting)
- [ ] Add visibility toggle per class
- [ ] Implement class deletion (with painted region cleanup)

### Phase 6: Save & Export
- [ ] Implement "Save Progress" serialization
- [ ] Create backend endpoint for saving unfinished annotations
- [ ] Implement "Load Progress" deserialization
- [ ] Implement "Create Annotation Data" conversion
- [ ] Create backend endpoint for .tif mask generation
- [ ] Add proper metadata entries for both save types
- [ ] Include lineage information

### Phase 7: Polish
- [ ] Add unsaved changes warning
- [ ] Implement loading states and progress indicators
- [ ] Add error handling and user feedback
- [ ] Performance optimization for large stacks
- [ ] Testing across different image sizes

---

## 9. Dependencies

### Frontend
- Existing module base class framework
- Image Viewer module (reference implementation)
- Canvas API (native browser)
- File upload components (existing)

### Backend
- Existing file validation utilities
- Existing metadata management system
- Python image processing (for .tif generation)
- `tifffile` or similar library for .tif I/O

---

## 10. Success Criteria

| Metric | Target |
|--------|--------|
| User can complete full annotation workflow | ✓ Select → Annotate → Save/Export |
| Annotations compatible with segmentation module | ✓ Valid .tif mask format |
| Work-in-progress can be resumed | ✓ Save and load unfinished annotations |
| Data lineage maintained | ✓ All outputs traceable to source |
| Performance acceptable | < 100ms brush stroke latency |
| Memory usage reasonable | Handle 512×512×100 stacks without crash |

---

## 11. Future Considerations (Out of Scope for v1.0)

- Polygon/lasso selection tools
- Interpolation between annotated slices
- AI-assisted annotation (SAM integration)
- Multi-user annotation collaboration
- Annotation import from external tools
- 3D brush (paint across multiple slices)
- Class name editing
- Custom color selection
