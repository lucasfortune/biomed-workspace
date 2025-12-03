# Module Specifications

**Document Type:** Technical Specifications
**Audience:** Developers, Contributors
**Status:** Planning Document
**Last Updated:** 2025-11-27

---

## Overview

This document provides detailed specifications for all planned processing modules in the Biomedical Image Processing Workspace. Each module specification includes:

- Purpose and use cases
- Input/output requirements
- Configuration parameters
- UI mockups and workflows
- Backend implementation details
- Python script requirements
- Testing requirements
- Success criteria

---

## Table of Contents

1. [Segmentation Module](#1-segmentation-module)
2. [Denoising Module](#2-denoising-module)
3. [Annotation Module](#3-annotation-module)
4. [Mesh Generation Module](#4-mesh-generation-module)
5. [Visualization Module](#5-visualization-module)
6. [Future Modules](#future-modules)

---

## 1. Segmentation Module

**Status:** Phase 2 Complete (Custom Upload Working)
**Priority:** HIGH
**Target Phase:** Phase 2-3 ✅ Core Functionality Complete (Dec 2024)

### Purpose

Train custom U-Net models for semantic segmentation of biomedical image stacks and perform inference on new data.

### Use Cases

- Cell segmentation in microscopy images
- Nuclei segmentation (DAPI, Hoechst staining)
- Organelle detection (mitochondria, ER, Golgi)
- Tissue segmentation in histology
- Custom segmentation tasks with user-provided annotations

### Inputs

#### Training

| Input | Format | Constraints | Description |
|-------|--------|-------------|-------------|
| **Training Images** | Multi-page TIFF | 8-bit or 16-bit grayscale, 2D slices | Raw microscopy images for training |
| **Annotation Masks** | Multi-page TIFF | 8-bit, 2-10 unique class values | Pixel-wise class labels (0=background, 1-9=classes) |
| **Training Config** | JSON/Form | See config table | Hyperparameters for training |

**Dimension Matching:** Training images and annotations must have identical dimensions (width, height, slices).

**Class Validation:** Annotations must contain 2-10 unique class values (including background). More than 10 classes may cause performance issues.

**Auto-Conversion:** 16-bit annotations automatically converted to 8-bit with warning.

#### Inference

| Input | Format | Constraints | Description |
|-------|--------|-------------|-------------|
| **Inference Images** | Multi-page TIFF | Same dimensions/dtype as training | New images to segment |
| **Trained Model** | .pth + .json | PyTorch state dict + config | Model from training or imported |

### Outputs

#### Training Outputs

| Output | Format | Location | Description |
|--------|--------|----------|-------------|
| **Trained Model** | best_model.pth | `models/<sessionId>/<trainingId>/` | PyTorch state dictionary |
| **Configuration** | config.json | `models/<sessionId>/<trainingId>/` | Training hyperparameters and metadata |
| **Training Results** | results.json | `models/<sessionId>/<trainingId>/` | Loss curves, accuracy, metrics |

#### Inference Outputs

| Output | Format | Location | Description |
|--------|--------|----------|-------------|
| **Segmented Images** | Multi-page TIFF | `results/<inferenceId>/` | Predicted class labels per pixel |
| **Metadata** | metadata.json | `results/<inferenceId>/` | Inference parameters, timing, model info |
| **Visualization Data** | visualization.json | `results/<inferenceId>/` | Downsampled 3D point cloud for Three.js |
| **Original Data (Web)** | original-data-web.json | `results/<inferenceId>/` | Downsampled original images for overlay |

### Configuration

#### Training Configuration

| Parameter | Type | Range | Default | Description |
|-----------|------|-------|---------|-------------|
| **Patch Size** | Integer | 32, 64, 128, 256, 512 | 128 | Input patch size for training |
| **Learning Rate** | Float | 0.00001 - 0.01 | 0.001 | Initial learning rate (Adam optimizer) |
| **Epochs** | Integer | 1 - 200 | 10 | Number of training epochs |
| **Batch Size** | Integer | 1 - 16 | 4 | Number of patches per batch (limited by GPU memory) |
| **Validation Split** | Float | 0.0 - 0.5 | 0.2 | Fraction of data for validation |
| **Early Stopping** | Boolean | - | True | Stop if validation loss doesn't improve |
| **Patience** | Integer | 1 - 50 | 5 | Epochs to wait before early stopping |

**Recommendations:**
- Small datasets (<50 slices): Patch size 64, epochs 50+
- Medium datasets (50-200 slices): Patch size 128, epochs 20-50
- Large datasets (200+ slices): Patch size 256, epochs 10-20
- Adjust batch size based on available GPU memory

#### Inference Configuration

| Parameter | Type | Range | Default | Description |
|-----------|------|-------|---------|-------------|
| **Model Source** | Enum | trained, imported | trained | Use trained model or imported model |
| **Batch Size** | Integer | 1 - 64 | 8 | Number of patches to process in parallel |
| **Overlap** | Integer | 0 - 128 | 32 | Overlap between patches (reduces edge artifacts) |

### UI Workflow

**Actual Implementation (5-Step Integrated Workflow):**

```
Step 1: Upload Training Data
   ├─ FileSelector Component - Raw Images
   │  ├─ Dropdown: Select from workspace files OR test data
   │  └─ Upload button: Add new TIFF file to workspace
   │
   ├─ FileSelector Component - Annotations
   │  ├─ Dropdown: Select from workspace files OR test data
   │  └─ Upload button: Add new TIFF file to workspace
   │
   ├─ Auto-validation on upload:
   │  ├─ Dimensions match check (width × height × slices)
   │  ├─ Class count detection (2-10 classes)
   │  ├─ Auto-conversion (16-bit → 8-bit with warning)
   │  └─ Validation results shown in preview area
   │
   └─ Navigation: [Next: Configure Training] enabled after validation

Step 2: Configure Training
   ├─ Training Parameters
   │  ├─ Patch Size: Dropdown (64, 128, 256, 512)
   │  ├─ Learning Rate: Number input (0.00001 - 0.01)
   │  ├─ Epochs: Number input (1-200)
   │  ├─ Batch Size: Number input (1-16)
   │  └─ Validation Split: Number input (0.0-0.5)
   │
   ├─ Advanced Options (collapsible)
   │  ├─ Early Stopping: Checkbox
   │  └─ Patience: Number input (1-50)
   │
   └─ Navigation: [Next: Start Training] enabled

Step 3: Training
   ├─ [Start Training] button → Spawns Python process
   │
   ├─ Real-time Progress (Socket.IO)
   │  ├─ Progress bar (epoch-based, 0-100%)
   │  ├─ Epoch counter: "Epoch 5/10"
   │  ├─ Live loss curve (Chart.js - Training & Validation)
   │  ├─ Live Dice score curve (Chart.js)
   │  └─ Current metrics display (loss, dice, time elapsed)
   │
   ├─ Training Complete
   │  ├─ Success notification (persistent)
   │  ├─ Final metrics summary
   │  ├─ Model saved: models/<sessionId>/<trainingId>/best_model.pth
   │  └─ Training ID displayed for reference
   │
   └─ Navigation: [Next: Upload Inference Data] enabled

Step 4: Inference
   ├─ Upload Inference Data
   │  ├─ FileSelector Component - Inference Images
   │  │  ├─ Dropdown: Workspace files OR test data
   │  │  └─ Upload button: Add new TIFF
   │  │
   │  └─ Auto-validation (dimensions, format)
   │
   ├─ Model Selection (Automatic)
   │  ├─ Uses trained model from Step 3 by default
   │  └─ OR uses imported model (if no training session)
   │
   ├─ [Run Inference] button → Spawns Python process
   │
   ├─ Real-time Progress (Socket.IO)
   │  ├─ Slice counter: "Slice 50/100"
   │  ├─ Progress bar: 0-100%
   │  ├─ At 100%: Shows "Generating Visualization Data" overlay
   │  └─ Sparse data generation (3D point cloud for Three.js)
   │
   ├─ Inference Complete
   │  ├─ Persistent success message (green banner)
   │  ├─ Results saved: results/<inferenceId>/inference_result.tif
   │  ├─ Visualization data: results/<inferenceId>/visualization_data.json
   │  └─ [Download Results] button available
   │
   └─ Navigation: [Next: 3D Visualization] enabled

Step 5: 3D Visualization
   ├─ Automatic initialization (first visit only)
   │  ├─ Loads visualization_data.json
   │  ├─ Creates Three.js scene, camera, renderer
   │  ├─ Renders 3D point cloud (color-coded by class)
   │  └─ Sets up controls and UI
   │
   ├─ Interactive Controls
   │  ├─ Orbit controls: Rotate, zoom, pan
   │  ├─ Class visibility toggles (show/hide classes)
   │  ├─ Slice range selector (min/max)
   │  ├─ Slice direction (X/Y/Z axis)
   │  ├─ Point size slider (1-20 pixels)
   │  ├─ Original data overlay toggle
   │  │  ├─ Opacity slider (0-100%)
   │  │  └─ Range sliders (planned) - Control visible slice range like class controls
   │  ├─ Background color picker
   │  └─ Reset view button
   │
   ├─ Visualization Features
   │  ├─ Color-coded classes (distinct colors per class)
   │  ├─ Smooth 60 FPS rendering
   │  ├─ Responsive canvas (auto-resize)
   │  └─ Persistent scene (no reload on navigation)
   │
   └─ Navigation: Can return to previous steps without data loss

Navigation Features:
   ├─ Step indicators (1-5) show progress
   ├─ Previous/Next buttons at each step
   ├─ Can navigate freely after completion
   ├─ UI state restoration (buttons, selections, previews)
   ├─ No data reload on re-visit (cached data)
   └─ Visualization initializes once, persists across navigation
```

### Backend Implementation

#### API Endpoints

**Workspace API (Active):**
- `POST /api/workspace/upload` - Upload files to workspace (with category)
- `GET /api/workspace/files` - List workspace files
- `POST /api/workspace/init` - Initialize workspace for session
- `GET /api/workspace/status` - Get workspace status
- `GET /api/workspace/stats` - Get workspace statistics

**Classic Endpoints (Used by Module):**
- `POST /upload-data` - Upload training/annotation files
- `POST /upload-inference` - Upload inference files
- `POST /import-pretrained-model` - Import .pth + .json (requires approval)
- `POST /configure-training` - Set training configuration
- `POST /start-training` - Start training job (Socket.IO for progress)
- `POST /run-inference` - Start inference job (Socket.IO for progress)
- `GET /results/:inferenceId/visualization-data` - Get visualization JSON
- `GET /results/:inferenceId/original-data-web` - Get original data for overlay
- `GET /download-inference-results/:inferenceId` - Download inference results

**Future (Phase 3):**
- `GET /api/workspace/segmentation/models` - List trained models for session
- `POST /api/workspace/segmentation/delete-model` - Delete trained model

#### Python Scripts

**Existing:**
- `python/validate_tiff.py` - Validate training/annotation files
- `python/validate_imported_model.py` - Validate imported models
- `python/train_model.py` - U-Net training
- `python/run_inference.py` - Inference with trained model

**Modifications (Phase 3):**
- Add workspace-specific paths
- Support model selection (trained vs imported)

### Testing Requirements

**Unit Tests:**
- [ ] StateManager integration (module state updates)
- [ ] Module activation/deactivation
- [ ] File upload validation
- [ ] Configuration validation

**Integration Tests:**
- [ ] Upload test data → Validate → Success
- [ ] Upload custom data → Validate → Success
- [ ] Start training → Receive progress → Complete
- [ ] Run inference → Receive progress → Complete
- [ ] View visualization → Render 3D scene

**E2E Tests:**
- [ ] Complete workflow: Upload → Train → Infer → Visualize
- [ ] Model import workflow: Import → Infer → Visualize

### Success Criteria

**✅ Completed:**
- [x] Test data workflow works end-to-end (Phase 2 - Nov 2024)
- [x] Custom data workflow works end-to-end (Phase 2 - Nov 2024)
- [x] FileSelector component with workspace integration (Phase 2 - Nov 2024)
- [x] Real-time training progress with Socket.IO (Phase 2 - Nov 2024)
- [x] Real-time inference progress with Socket.IO (Phase 2 - Nov 2024)
- [x] 3D visualization renders smoothly (60 FPS) (Phase 2 - Nov 2024)
- [x] Navigation between steps without data loss (Phase 2 - Dec 2024)
- [x] UI state restoration on navigation (Phase 2 - Dec 2024)
- [x] Persistent success messages (Phase 2 - Dec 2024)
- [x] Loading feedback during sparse data generation (Phase 2 - Dec 2024)
- [x] Visualization persistence (no reload on re-visit) (Phase 2 - Dec 2024)
- [x] Approval status enforcement (pending users use test data only) (Phase 2 - Nov 2024)

**🎯 Performance Targets:**
- [x] Training completes in <5 min for test data (10 epochs) ✅ Meets target
- [x] Inference completes in <2 min for test data (100 slices) ✅ Meets target
- [x] 3D visualization 60 FPS rendering ✅ Meets target

**📋 Remaining (Phase 2/3):**
- [ ] Original data range sliders (control visible slice range for overlay) - Phase 2
- [ ] Module state persists when switching to other modules (serialize/deserialize) - Phase 3
- [ ] Session recovery after browser refresh - Phase 3
- [ ] Model management (list, delete, rename trained models) - Phase 3
- [ ] Training pause/resume functionality - Phase 3
- [ ] Batch inference (multiple files) - Phase 3
- [ ] Training progress history (view past training curves) - Phase 3

### Recent Improvements (Nov-Dec 2024)

**Custom Upload Fix (Nov 28, 2024):**
- Fixed variable naming inconsistency (snake_case vs camelCase) in file upload
- Added approval status check to workspace upload endpoint
- Enhanced error handling with user-friendly messages
- Comprehensive debug logging added

**UI Polish & Navigation Fixes (Dec 2, 2024):**
- Fixed FileSelector dropdown showing "undefined (unknown)" → Now shows actual filename
- Added loading overlay during sparse data generation (after inference 100%)
- Added persistent success message after segmentation completion
- Fixed visualization reloading/freezing when navigating back to step 5
- Fixed navigation button states after pipeline completion
- Fixed FileSelector preview persistence after validation
- 4 files modified: 651 insertions(+), 143 deletions(-)

**Key Technical Achievements:**
- FileSelector component returns correct file info from backend response
- `onFileUploaded()` returns boolean to indicate validation trigger
- `goToStep()` includes comprehensive UI state restoration for all steps
- `visualizationInitialized` flag prevents Three.js scene re-initialization
- Persistent `<div id="inferenceResult">` replaces temporary success notifications
- Loading overlay shows during visualization data generation (100%+ progress)

**User Experience Improvements:**
- Clear file information in dropdowns (filename + size)
- Comprehensive loading feedback at all stages
- Persistent success confirmation (doesn't disappear)
- Smooth, reliable navigation between all steps
- Correct button states throughout workflow
- Professional, polished interface

---

## 2. Denoising Module

**Status:** Planned
**Priority:** MEDIUM
**Target Phase:** Phase 4 (Mar-Jun 2025)

### Purpose

Remove noise from microscopy images using deep learning (Noise2Noise, Noise2Self, traditional denoising).

### Use Cases

- Denoise low-SNR images (low light, fast acquisition)
- Preprocess images before segmentation (improve segmentation accuracy)
- Reduce acquisition time (less averaging needed)
- Remove Poisson noise, Gaussian noise, salt-and-pepper noise

### Inputs

#### Training

| Input | Format | Constraints | Description |
|-------|--------|-------------|-------------|
| **Noisy Images (Pairs)** | Multi-page TIFF | 8-bit or 16-bit grayscale | Two independent acquisitions of same sample (Noise2Noise) |
| **Single Noisy Images** | Multi-page TIFF | 8-bit or 16-bit grayscale | Single acquisition (Noise2Self, blind-spot network) |
| **Training Config** | JSON/Form | See config table | Hyperparameters |

**Noise2Noise Approach:** Requires two independent noisy images of the same sample. Model learns to map noisy input to noisy target (converges to clean image).

**Noise2Self Approach:** Single noisy image. Model learns to predict each pixel from neighbors (self-supervised, no clean data needed).

#### Inference

| Input | Format | Constraints | Description |
|-------|--------|-------------|-------------|
| **Noisy Images** | Multi-page TIFF | Same dimensions/dtype as training | Images to denoise |
| **Trained Model** | .pth + .json | PyTorch state dict + config | Denoising model |

### Outputs

| Output | Format | Location | Description |
|--------|--------|----------|-------------|
| **Denoised Images** | Multi-page TIFF | `results/denoise_<id>/` | Noise-free images |
| **Before/After** | side-by-side PNG | `results/denoise_<id>/` | Visual comparison (first, middle, last slice) |
| **Metrics** | metrics.json | `results/denoise_<id>/` | PSNR, SSIM (if clean reference available) |

### Configuration

#### Training Configuration

| Parameter | Type | Range | Default | Description |
|-----------|------|-------|---------|-------------|
| **Method** | Enum | Noise2Noise, Noise2Self, Noise2Void | Noise2Noise | Denoising method |
| **Patch Size** | Integer | 32, 64, 128, 256 | 64 | Input patch size |
| **Learning Rate** | Float | 0.00001 - 0.01 | 0.0001 | Initial learning rate |
| **Epochs** | Integer | 1 - 100 | 20 | Number of epochs |
| **Batch Size** | Integer | 1 - 16 | 8 | Patches per batch |
| **Augmentation** | Boolean | - | True | Random flip, rotate |

#### Inference Configuration

| Parameter | Type | Range | Default | Description |
|-----------|------|-------|---------|-------------|
| **Overlap** | Integer | 0 - 64 | 16 | Overlap between patches |

### UI Workflow

```
1. Upload Noisy Images
   ├─ Method: Noise2Noise → Upload 2 noisy images (same sample)
   └─ Method: Noise2Self → Upload 1 noisy image

2. Configure Training
   ├─ Method dropdown
   ├─ Patch Size dropdown
   ├─ Epochs input
   └─ Advanced options

3. Train Denoising Model
   └─ Progress bar, loss curve

4. Apply to New Images
   ├─ Upload noisy images
   └─ Run denoising

5. Results
   ├─ Denoised images
   ├─ Before/After comparison (slider)
   ├─ Metrics (if reference available)
   └─ [Download Denoised TIFF]
```

### Backend Implementation

#### API Endpoints (New)

- `POST /api/workspace/denoising/upload-training`
- `POST /api/workspace/denoising/start-training`
- `POST /api/workspace/denoising/upload-inference`
- `POST /api/workspace/denoising/run-denoising`
- `GET /api/workspace/denoising/results/:id`

#### Python Scripts (New)

- `python/train_denoising.py` - Train Noise2Noise/Noise2Self model
- `python/run_denoising.py` - Apply denoising model to new images
- `python/generate_comparison.py` - Create before/after images

**Architecture:** U-Net (same as segmentation) but trained for regression (pixel values) instead of classification (class labels).

### Testing Requirements

- [ ] Noise2Noise training with paired images
- [ ] Noise2Self training with single image
- [ ] Denoising reduces noise (visual inspection)
- [ ] PSNR/SSIM metrics improve (if clean reference)
- [ ] Before/after comparison UI works

### Success Criteria

- [ ] Reduce noise by 50%+ (visual inspection)
- [ ] Training completes in <10 min (50 slices, 20 epochs)
- [ ] Denoising completes in <1 min (100 slices)
- [ ] Preserves image details (no over-smoothing)
- [ ] Integrates with segmentation pipeline (denoise → segment)

---

## 3. Annotation Module

**Status:** Planned
**Priority:** MEDIUM
**Target Phase:** Phase 4 (Mar-Jun 2025)

### Purpose

Interactive 2D/3D annotation tool for creating training data for segmentation models.

### Use Cases

- Annotate cells, nuclei, organelles for custom segmentation
- Correct segmentation errors (post-inference editing)
- Create ground truth for benchmarking
- Collaborative annotation (multiple annotators)

### Inputs

| Input | Format | Constraints | Description |
|-------|--------|-------------|-------------|
| **Raw Images** | Multi-page TIFF | 8-bit or 16-bit grayscale | Images to annotate |
| **Existing Annotations** | Multi-page TIFF (optional) | 8-bit, class labels | Load and edit existing annotations |

### Outputs

| Output | Format | Location | Description |
|--------|--------|----------|-------------|
| **Annotations** | Multi-page TIFF | `uploads/<sessionId>/annotations/` | Pixel-wise class labels (0-9) |
| **Annotation Stats** | stats.json | `uploads/<sessionId>/annotations/` | Class counts, annotated slices |

### Configuration

| Parameter | Type | Range | Default | Description |
|-----------|------|-------|---------|-------------|
| **Brush Size** | Integer | 1 - 100 | 10 | Brush radius (pixels) |
| **Eraser Size** | Integer | 1 - 100 | 20 | Eraser radius |
| **Opacity** | Float | 0.0 - 1.0 | 0.5 | Annotation overlay opacity |
| **Class Colors** | Array | RGB colors | Predefined | Color for each class |

### UI Workflow

```
1. Load Images
   └─ Upload TIFF or select from workspace

2. Annotation Tools
   ├─ Brush (paint class labels)
   ├─ Eraser (remove annotations)
   ├─ Polygon tool (outline regions)
   ├─ Fill tool (flood fill)
   └─ Undo/Redo

3. Class Management
   ├─ Add class (name, color)
   ├─ Delete class
   └─ Switch active class

4. Navigation
   ├─ Slice slider (navigate slices)
   ├─ Arrow keys (previous/next slice)
   └─ Jump to slice (input)

5. View Controls
   ├─ Zoom (mouse wheel)
   ├─ Pan (drag)
   ├─ Overlay opacity slider
   └─ Toggle overlay (show/hide)

6. Save & Export
   ├─ [Save Annotations] → Save to workspace
   └─ [Export TIFF] → Download annotation TIFF
```

### Backend Implementation

#### API Endpoints (New)

- `POST /api/workspace/annotation/load-image`
- `POST /api/workspace/annotation/save-annotations` - Save annotation TIFF
- `GET /api/workspace/annotation/load-annotations` - Load existing annotations
- `POST /api/workspace/annotation/export` - Export annotation TIFF

#### Frontend Implementation

**Canvas-Based Annotation:**
- HTML5 Canvas for drawing
- Mouse/touch events for brush strokes
- Brush stroke = modify annotation array (class labels)
- Overlay = composite original image + colored annotations (transparency)

**Data Structure:**
```javascript
// In-memory annotation data (per slice)
annotations = {
  0: new Uint8Array(width * height),  // Slice 0
  1: new Uint8Array(width * height),  // Slice 1
  ...
};

// Brush stroke updates annotation array
onMouseMove(x, y) {
  const idx = y * width + x;
  annotations[currentSlice][idx] = activeClass;
}
```

**Save:**
- Serialize annotation arrays to TIFF
- Upload to server via API

### Testing Requirements

- [ ] Brush tool annotates pixels correctly
- [ ] Eraser removes annotations
- [ ] Polygon tool creates closed regions
- [ ] Undo/redo works
- [ ] Save annotations → Load → Same result
- [ ] Export TIFF → Valid multi-page TIFF

### Success Criteria

- [ ] Annotate 100 slices in <30 min (user study)
- [ ] No lag during brush strokes (60 FPS)
- [ ] Annotations save/load correctly
- [ ] Exported TIFF works with segmentation module
- [ ] Intuitive UI (minimal training needed)

---

## 4. Mesh Generation Module

**Status:** Planned
**Priority:** MEDIUM
**Target Phase:** Phase 4 (Mar-Jun 2025)

### Purpose

Generate 3D meshes from segmented image stacks for visualization, quantification, and 3D printing.

### Use Cases

- Generate surface meshes of cells, organelles, tissues
- Export to STL for 3D printing
- Volume and surface area quantification
- High-quality renders for publications

### Inputs

| Input | Format | Constraints | Description |
|-------|--------|-------------|-------------|
| **Segmented Images** | Multi-page TIFF | 8-bit, class labels | Output from segmentation module |
| **Mesh Config** | JSON/Form | See config table | Mesh generation parameters |

### Outputs

| Output | Format | Location | Description |
|--------|--------|----------|-------------|
| **Mesh Files** | STL, OBJ, PLY | `results/mesh_<id>/` | 3D mesh for each class |
| **Preview** | PNG | `results/mesh_<id>/` | Rendered mesh preview |
| **Mesh Stats** | stats.json | `results/mesh_<id>/` | Volume, surface area, vertex/face count |

### Configuration

| Parameter | Type | Range | Default | Description |
|-----------|------|-------|---------|-------------|
| **Algorithm** | Enum | Marching Cubes, Lewiner | Marching Cubes | Mesh generation algorithm |
| **Smoothing** | Enum | None, Laplacian, Taubin | Laplacian | Mesh smoothing method |
| **Smoothing Iterations** | Integer | 0 - 100 | 10 | Number of smoothing iterations |
| **Simplification** | Boolean | - | True | Reduce polygon count |
| **Target Faces** | Integer | 1,000 - 1,000,000 | 100,000 | Target face count after simplification |
| **Class Selection** | Array | Class IDs | All | Which classes to generate meshes for |

### UI Workflow

```
1. Load Segmented Data
   └─ Select inference result from workspace

2. Configure Mesh Generation
   ├─ Select classes to mesh (checkboxes)
   ├─ Algorithm dropdown
   ├─ Smoothing options
   └─ Simplification options

3. Generate Mesh
   └─ Progress bar (per class)

4. Preview
   ├─ 3D preview (Three.js)
   ├─ Rotate, zoom, pan
   └─ Toggle classes on/off

5. Export
   ├─ [Download STL] → For 3D printing
   ├─ [Download OBJ] → For Blender, Maya
   ├─ [Download PLY] → For MeshLab
   └─ [Download Stats] → CSV with volume, surface area

6. Quantification (optional)
   └─ Show volume, surface area, mesh quality metrics
```

### Backend Implementation

#### API Endpoints (New)

- `POST /api/workspace/mesh/generate` - Generate meshes from segmented TIFF
- `GET /api/workspace/mesh/preview/:id` - Get mesh preview (web-friendly format)
- `GET /api/workspace/mesh/download/:id/:format` - Download STL/OBJ/PLY
- `GET /api/workspace/mesh/stats/:id` - Get mesh statistics

#### Python Scripts (New)

**`python/generate_mesh.py`**
```python
# Use scikit-image marching_cubes
from skimage import measure
import trimesh

# Load segmented TIFF
segmented = load_tiff(segmented_path)

# For each class
for class_id in classes:
    # Extract class mask
    mask = (segmented == class_id)

    # Marching cubes
    verts, faces, normals, values = measure.marching_cubes(mask, level=0.5)

    # Create mesh
    mesh = trimesh.Trimesh(vertices=verts, faces=faces)

    # Smoothing
    if smoothing == 'laplacian':
        mesh = trimesh.smoothing.filter_laplacian(mesh, iterations=smoothing_iterations)

    # Simplification
    if simplification:
        mesh = mesh.simplify_quadric_decimation(target_faces)

    # Export
    mesh.export(f'mesh_class_{class_id}.stl')
```

### Testing Requirements

- [ ] Generate mesh from test data
- [ ] Mesh is manifold (watertight)
- [ ] Smoothing reduces jaggedness
- [ ] Simplification reduces file size
- [ ] STL file opens in 3D printing software
- [ ] Volume/surface area calculations accurate

### Success Criteria

- [ ] Generate mesh in <2 min (100 slices, 1 class)
- [ ] Mesh quality: manifold, no self-intersections
- [ ] STL file <10 MB (after simplification)
- [ ] Volume/surface area accurate within 5% (validation with phantoms)
- [ ] Preview renders smoothly in browser

---

## 5. Visualization Module

**Status:** Planned
**Priority:** LOW
**Target Phase:** Phase 4-5 (Apr-Jun 2025)

### Purpose

Advanced 3D visualization of image stacks with volume rendering, isosurfaces, multi-channel overlays, and time-series playback.

### Use Cases

- Volume rendering for presentation and publication
- Multi-channel overlay (e.g., DAPI + GFP + RFP)
- Time-lapse visualization (4D data: 3D + time)
- Interactive exploration of large datasets
- Screenshot and video export for presentations

### Inputs

| Input | Format | Constraints | Description |
|-------|--------|-------------|-------------|
| **Image Stacks** | Multi-page TIFF | 8-bit or 16-bit, single or multi-channel | Raw or segmented images |
| **Time-Series** | Multiple TIFF files | Same dimensions, sequential | 4D data (3D + time) |
| **Transfer Functions** | JSON | Opacity and color maps | Rendering parameters |

### Outputs

| Output | Format | Location | Description |
|--------|--------|----------|-------------|
| **Screenshot** | PNG | `results/viz_<id>/` | High-resolution render |
| **Video** | MP4 | `results/viz_<id>/` | Rotation, time-lapse animation |
| **Interactive View** | HTML | `results/viz_<id>/` | Standalone viewer (share via link) |

### Configuration

| Parameter | Type | Range | Default | Description |
|-----------|------|-------|---------|-------------|
| **Rendering Mode** | Enum | Point Cloud, Volume Rendering, Isosurface | Point Cloud | Visualization method |
| **Transfer Function** | Custom | Opacity/color curves | Linear | Map intensity to opacity and color |
| **Downsampling** | Integer | 1 - 10 | 2 | Downsample factor (reduce data) |
| **Lighting** | Boolean | - | True | Enable lighting and shadows |
| **Background Color** | Color | RGB | Black | Background color |

### UI Workflow

```
1. Load Data
   ├─ Single stack → 3D visualization
   ├─ Multi-channel → Overlay channels
   └─ Time-series → 4D playback

2. Rendering Settings
   ├─ Mode: Point Cloud / Volume / Isosurface
   ├─ Transfer function editor (opacity/color curves)
   ├─ Downsampling slider
   └─ Lighting toggle

3. Multi-Channel (optional)
   ├─ Load additional channels
   ├─ Assign colors (red, green, blue)
   ├─ Adjust intensity/opacity per channel
   └─ Toggle channels on/off

4. Time-Series Playback (optional)
   ├─ Timeline slider
   ├─ Play/pause button
   ├─ Playback speed slider
   └─ Loop toggle

5. Camera Controls
   ├─ Rotate (mouse drag)
   ├─ Zoom (mouse wheel)
   ├─ Pan (right-click drag)
   └─ Reset view

6. Export
   ├─ [Screenshot] → PNG (current view)
   ├─ [Record Video] → MP4 (rotation or time-lapse)
   └─ [Export Viewer] → Standalone HTML
```

### Backend Implementation

#### API Endpoints (New)

- `POST /api/workspace/viz/load-stack` - Load TIFF stack for visualization
- `POST /api/workspace/viz/load-timeseries` - Load time-series data
- `POST /api/workspace/viz/screenshot` - Generate high-res screenshot
- `POST /api/workspace/viz/record-video` - Generate video (server-side rendering)
- `GET /api/workspace/viz/export-viewer/:id` - Export standalone HTML viewer

#### Frontend Implementation

**Three.js Extensions:**
- Volume rendering shader (ray marching)
- Isosurface extraction (marching cubes in JS)
- Multi-channel compositing (additive blending)
- Time-series playback (update texture frame-by-frame)

**Performance:**
- WebGL 2.0 for volume rendering
- Texture compression (reduce memory)
- LOD (level of detail) based on camera distance
- Worker threads for data loading

### Testing Requirements

- [ ] Load 100-slice stack → Renders smoothly
- [ ] Volume rendering shows internal structures
- [ ] Multi-channel overlay (3 channels) works
- [ ] Time-series playback (50 timepoints) smooth
- [ ] Screenshot exports at 4K resolution
- [ ] Video export works (10-second rotation)

### Success Criteria

- [ ] Render 100-slice stack at 30+ FPS
- [ ] Volume rendering quality matches commercial tools (Imaris, Amira)
- [ ] Multi-channel overlay supports 3+ channels
- [ ] Time-series playback at 10+ FPS (100 slices per timepoint)
- [ ] Screenshot export at 4K (3840x2160)
- [ ] Video export < 5 min for 10-second clip

---

## Future Modules

### Quantification Module

**Purpose:** Automated feature extraction and statistical analysis

**Features:**
- Cell counting
- Volume and surface area measurements
- Intensity measurements (mean, median, min, max)
- Shape features (circularity, aspect ratio, solidity)
- Texture features (Haralick, LBP)
- Colocalization analysis (multi-channel)
- Statistical comparisons (t-tests, ANOVA)
- Export to CSV, Excel, R, Python

**Target Phase:** Phase 5-6

---

### Tracking Module

**Purpose:** Track cells/objects over time in time-lapse data

**Features:**
- 2D/3D object tracking
- Trajectory visualization
- Cell lineage trees (division tracking)
- Track quality metrics (track length, gap ratio)
- Export tracks to CSV, TrackMate format

**Target Phase:** Phase 6

---

### Registration Module

**Purpose:** Align multi-modal or time-series images

**Features:**
- Rigid registration (translation, rotation)
- Affine registration (scale, shear)
- Deformable registration (B-splines, optical flow)
- Multi-channel registration
- Time-series registration (drift correction)
- Export transformation matrices

**Target Phase:** Phase 6

---

### Classification Module

**Purpose:** Classify objects (cells, organelles) into categories

**Features:**
- Feature extraction (shape, texture, intensity)
- Supervised classification (SVM, Random Forest, CNN)
- Unsupervised clustering (K-means, DBSCAN)
- Transfer learning (pretrained models)
- Confusion matrix, accuracy metrics
- Export classifications

**Target Phase:** Phase 6

---

## Module Interface Specification

All modules must implement the following interface:

### JavaScript Interface

```javascript
class ModuleName {
  constructor(stateManager) {
    this.state = stateManager;
    this.container = null;
    this.unsubscribers = [];
    this.socket = null;
  }

  async activate() {
    // Required: Render UI, attach listeners, subscribe to state
  }

  async deactivate() {
    // Required: Cleanup, unsubscribe, clear UI
  }

  cleanup() {
    // Optional: Release resources (large data structures)
  }

  serialize() {
    // Optional: Serialize module state (for persistence)
  }

  deserialize(data) {
    // Optional: Restore module state (from persistence)
  }
}

export default ModuleName;
```

### Module Registry Entry

```javascript
{
  id: 'module-id',                      // Unique identifier
  name: 'Module Name',                   // Display name
  description: 'Short description',      // Tooltip/card description
  icon: '🎯',                           // Emoji or icon
  path: '/workspace/js/modules/modulename/ModuleName.js',
  inputs: ['input_type'],               // Required inputs (for pipeline chaining)
  outputs: ['output_type'],             // Produced outputs
  color: '#4A90E2',                     // Theme color
  status: 'available',                  // available, coming_soon, beta
  version: '1.0.0',                     // Semantic versioning
  author: 'Developer Name',             // Module author
  documentation: '/docs/modules/modulename.md'  // Link to docs
}
```

---

## Module Development Guidelines

### Best Practices

1. **State Management:**
   - Use centralized StateManager for all module state
   - Subscribe to state changes, don't poll
   - Update state atomically (one change at a time)

2. **UI Rendering:**
   - Use container (`#module-view`)
   - Clean up on deactivate (innerHTML = '')
   - Responsive design (mobile-friendly)

3. **Event Listeners:**
   - Store references to all listeners
   - Remove listeners on deactivate
   - Use event delegation where possible

4. **Socket.IO:**
   - Connect on activate, disconnect on deactivate
   - Join room with unique ID (trainingId, inferenceId)
   - Handle connection errors gracefully

5. **Error Handling:**
   - Try/catch in async functions
   - Display user-friendly error messages
   - Log errors to console for debugging
   - Notify user via StateManager.notify()

6. **Performance:**
   - Lazy load large assets (images, models)
   - Debounce frequent updates (e.g., slider changes)
   - Use requestAnimationFrame for animations
   - Offload heavy computation to backend or Web Workers

7. **Testing:**
   - Unit tests for core logic
   - Integration tests for API calls
   - E2E tests for full workflow
   - Manual testing with real data

### Code Review Checklist

- [ ] Module follows interface contract (constructor, activate, deactivate)
- [ ] All event listeners removed on deactivate
- [ ] State management used correctly (no direct DOM manipulation of shared state)
- [ ] Error handling for all async operations
- [ ] User feedback for all actions (success, error, progress)
- [ ] Responsive UI (works on different screen sizes)
- [ ] Accessibility (keyboard navigation, ARIA labels)
- [ ] Documentation (JSDoc comments, README)
- [ ] Tests written and passing
- [ ] No console errors or warnings
- [ ] No memory leaks (check DevTools Memory profiler)

---

## Related Documentation

- [Module Creation Guide](../guides/MODULE_CREATION.md) - Step-by-step tutorial
- [Module Architecture](../architecture/MODULE_ARCHITECTURE.md) - System design
- [Platform Vision](PLATFORM_VISION.md) - Long-term vision
- [Roadmap](ROADMAP.md) - Development timeline

---

**Last Updated:** 2025-12-02
**Specifications Version:** 1.1 (Segmentation Module Updated)
**Next Review:** 2025-12-15 (before Phase 4 kickoff)

---

**Navigation:** [← Roadmap](ROADMAP.md) | [Documentation Index](../INDEX.md)
