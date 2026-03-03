# Direction-Aware 2.5D U-Net Segmentation — Implementation Roadmap

## 1. Executive Summary

### What This Initiative Achieves

This initiative extends the existing biomedical image segmentation application with direction-aware capabilities specifically designed for electron tomography data. The "missing wedge" effect in cryo-electron tomography causes anisotropic resolution degradation, making filaments oriented along the missing wedge axis harder to segment than those perpendicular to it. Current 2D U-Net models treat all orientations equally and suffer predictable failure modes on obliquely oriented structures.

This plan adds four interconnected capabilities:

1. **Filament centerpoint annotation tooling** — enabling users to trace individual filament trajectories through Z-slices by placing one labeled point per filament per slice
2. **Direction volume generation** — computing local tangent vectors along filament centerlines and painting them onto all microtubule voxels in the class mask
3. **2.5D U-Net with dual output heads** — extending the existing single-head encoder-decoder to accept multi-slice input (for Z-context) and predict both class labels and 3D direction vectors simultaneously
4. **Orientation-weighted training** — a combined loss function that upweights hard-to-segment filament orientations and adds a sign-invariant direction prediction loss

The net result is a segmentation pipeline that explicitly models filament orientation, concentrates learning capacity on the orientations most degraded by the missing wedge, and provides per-voxel direction predictions that downstream tools can use for filament tracing and quality assessment.

### Why It Matters

Standard segmentation networks are orientation-blind. They learn an average performance across all filament orientations, which means orientations aligned with the missing wedge axis are systematically undersegmented. By teaching the network to predict orientation simultaneously with class labels, we achieve two things: (a) the shared encoder learns orientation-sensitive features that benefit segmentation, and (b) the orientation-weighted loss explicitly penalizes the model less for easy orientations and more for hard ones, redirecting learning capacity where it is needed most.

### Related Documents

- [01_overall_idea_and_planning.md](01_overall_idea_and_planning.md) — Problem statement and core idea
- [02_annotation_pipeline.md](02_annotation_pipeline.md) — Annotation workflow design
- [03_loss_function_design.md](03_loss_function_design.md) — Loss function mathematics

---

## 2. Architecture Overview

### How New Components Relate to Existing Ones

```
EXISTING (unchanged)                          NEW (this initiative)
----------------------------------------------+-----------------------------------------------
                                               |
Annotation Module                              |  Phase 1: Centerpoint Tool
  AnnotationModule.js                          |    + CenterpointEngine.js
  BrushEngine.js (brush/eraser painting)       |    + FilamentManager.js
  AnnotationCanvas.js (4-layer canvas)         |    + FilamentCanvas.js (rendering layer)
  AnnotationAPI.js (save/load)                 |    + _filaments.json sidecar format
  annotation.routes.js                         |    + /api/annotation/save-filaments
                                               |    + /api/annotation/load-filaments
                                               |
                                               |  Phase 2: Direction Volume Pipeline
                                               |    + python/compute_direction_vectors.py
                                               |    + python/validate_direction_volume.py
                                               |    + /api/annotation/generate-directions
                                               |
python/train_model.py                          |  Phase 3: 2.5D Dual-Head U-Net
  UNet class (1-ch in, N-class out)            |    + UNet25D class (N-ch in, dual heads)
  Imagedataset (per-slice patches)             |    + Imagedataset25D (multi-slice + directions)
  CrossEntropyLoss                             |    + DirectionAwareLoss (Phase 4)
                                               |
python/run_inference.py                        |  Phase 5: 2.5D Inference
  load_model, preprocess, postprocess          |    + multi-slice input assembly
  per-slice inference loop                     |    + direction prediction output
                                               |
SegmentationModule.js                          |  Phase 5: Frontend Integration
  Templates.js (config form)                   |    + 2D/2.5D mode toggle
  TrainingHandler.js                           |    + alpha/lambda controls
  InferenceHandler.js                          |    + dual-loss chart
  ChartHandler.js                              |    + direction volume overlay
```

### Data Flow

```
Raw TIFF Stack
      |
      v
[Annotation Module]  -----> Class Mask TIFF + _classes.json   (existing)
      |                                     |
      v                                     |
[Centerpoint Tool]   -----> _filaments.json (Phase 1)
                                            |
                                            v
                            [Direction Volume Generator]  (Phase 2)
                                            |
                                            v
                            Direction Volume TIFF (float32, Z x Y x X x 3)
                                            |
                                            v
[Raw Stack] + [Class Mask] + [Direction Volume]
                                            |
                                            v
                            [2.5D Dual-Head U-Net Training]  (Phase 3+4)
                                            |
                                            v
                            best_model.pth (dual-head)
                                            |
                                            v
                            [2.5D Inference]  (Phase 5)
                                            |
                                            v
                            Segmentation TIFF + Direction Volume TIFF
```

### Backward Compatibility Strategy

All changes are additive. The existing 2D single-head U-Net pipeline remains fully functional:

- Direction volume is an **optional** third input to training
- If no direction volume is provided, training falls back to the existing single-head CrossEntropyLoss pipeline
- Model checkpoints include a `model_type` field (`'standard'` or `'direction_aware'`) for the inference script to select the correct architecture
- The annotation module's existing brush/eraser tools and class label workflow are untouched; the centerpoint tool is an additional tool alongside them
- The 2D/2.5D mode toggle follows the exact same UI pattern already established in the DL Denoising module

---

## 3. Phase Breakdown

### Phase 1: Centerpoint Annotation Tooling

**Objective:** Add filament centerpoint annotation to the existing annotation module, enabling users to click-to-place named points on filament centers across Z-slices, producing a `_filaments.json` sidecar file.

**Prerequisites:** None (this is the foundation phase).

**Deliverables:**

| Deliverable | Type | Description |
|-------------|------|-------------|
| `CenterpointEngine.js` | New file | Click-to-place point tool, ghost markers from adjacent slices |
| `FilamentManager.js` | New file | CRUD operations for filaments: add/remove/rename, color assignment, point storage |
| `FilamentCanvas.js` | New file | Rendering layer for centerpoint markers and ghost markers |
| `AnnotationModule.js` changes | Modified | New "Centerpoint" tool button, "Filaments" toolbar section |
| `AnnotationAPI.js` additions | Modified | `saveFilaments()`, `loadFilaments()` methods |
| `annotation.routes.js` additions | Modified | `POST /api/annotation/save-filaments`, `GET /api/annotation/load-filaments/:fileId` |
| `_filaments.json` schema | Specification | Version 1.0.0 format documented below |

**Key Files to Create/Modify:**

| File | Action | Location |
|------|--------|----------|
| `CenterpointEngine.js` | Create | `public/workspace/js/modules/annotation/` |
| `FilamentManager.js` | Create | `public/workspace/js/modules/annotation/` |
| `FilamentCanvas.js` | Create | `public/workspace/js/modules/annotation/` |
| `AnnotationModule.js` | Modify | `public/workspace/js/modules/annotation/` |
| `AnnotationAPI.js` | Modify | `public/workspace/js/modules/annotation/` |
| `annotation.routes.js` | Modify | `src/routes/` |
| `annotation.css` | Modify | `public/workspace/js/modules/annotation/css/` |

**Technical Approach:**

#### CenterpointEngine.js

Replaces BrushEngine pointer event handling when the "Centerpoint" tool is active:

- **Tool mode:** When "Centerpoint" is selected, BrushEngine pointer events are disconnected and CenterpointEngine takes over the interaction layer
- **Click places a point** for the active filament on the current slice
- **One point per filament per slice** — clicking again repositions the existing point
- **Right-click or Ctrl+click** on a point to delete it
- **Points snap** to integer pixel coordinates
- No brush size, no drag-painting — just precise single clicks

#### FilamentManager.js

Pure data manager (no DOM manipulation):

- `addFilament(name, classId)` — creates a filament with auto-assigned color and default name ("MT-1", "MT-2", ...)
- `removeFilament(id)` — removes filament and all its points
- `renameFilament(id, newName)` — updates filament name
- `setPoint(filamentId, sliceIndex, {x, y})` — sets or updates point
- `removePoint(filamentId, sliceIndex)` — removes point
- `getPointsForSlice(sliceIndex)` — returns all filaments' points on this slice (for rendering)
- `getGhostPoints(filamentId, sliceIndex, range)` — returns adjacent slice points for ghost rendering
- `toJSON()` / `fromJSON(data)` — serialize/deserialize to `_filaments.json` format
- Color palette: 10 distinct colors, cycling for additional filaments

#### FilamentCanvas.js

Renders on the preview canvas layer (or a new fifth layer). Rendering priorities per frame:

- **All filaments' points on current slice:** colored filled circles (8px diameter) with filament color
- **Active filament's point:** larger circle (12px) with highlight ring
- **Ghost markers:** active filament's points from slices z-1 and z+1, rendered at 40% opacity with dashed outline
- **Connecting line:** for the active filament, if it has points on both z-1 and z+1, draw a faint line from ghost → current → ghost showing the trajectory

#### Toolbar UI Changes

Add to the existing Tools section:

```html
<button id="toolCenterpoint" class="tool-btn" title="Centerpoint (C)">
  <span class="tool-icon">+</span>
  <span class="tool-label">Center</span>
</button>
```

Add a new "Filaments" section after the Classes section:

```html
<div class="toolbar-section filaments-section">
  <div class="filaments-header">
    <h4>Filaments</h4>
    <button id="addFilamentBtn" class="btn-add-class" title="Add filament">+</button>
  </div>
  <div id="filamentList" class="filament-list">
    <!-- Rendered dynamically: scrollable list -->
  </div>
</div>
```

Each filament list item: color swatch + name (editable on double-click) + point count badge + delete button. Same event delegation pattern as the existing class list.

**Keyboard shortcut:** `C` key activates centerpoint tool (alongside existing `B` for brush, `E` for eraser).

#### Data Format: `_filaments.json`

Saved alongside the existing `_classes.json` sidecar:

```json
{
  "version": "1.0.0",
  "sourceFileId": "abc123",
  "filaments": [
    {
      "id": 1,
      "name": "MT-1",
      "color": "#FF6B6B",
      "classId": 2,
      "points": {
        "12": { "x": 145, "y": 230 },
        "13": { "x": 147, "y": 228 },
        "14": { "x": 150, "y": 225 }
      }
    }
  ]
}
```

#### Backend Endpoints

- `POST /api/annotation/save-filaments` — saves `_filaments.json` as a sidecar, registered in workspace metadata with tags `['annotation', 'filaments']`
- `GET /api/annotation/load-filaments/:fileId` — loads filament data from sidecar JSON

These follow the exact same pattern as the existing `_classes.json` sidecar handling in `annotation.routes.js`.

**Testing/Verification Criteria:**

- Place points for 3 filaments across 10 slices, save, reload — all points preserved correctly
- Ghost markers appear from z-1 and z+1 for the active filament
- Switching between brush tool and centerpoint tool preserves both brush annotations and centerpoints
- Filament list scrolls properly with 20+ filaments
- Undo/redo works for point placement

**Estimated Complexity:** Medium-Large

---

### Phase 2: Direction Volume Generation Pipeline

**Objective:** Create a Python pipeline that converts filament centerpoint annotations into a float32 direction vector volume `(Z, Y, X, 3)`, suitable for use as training target for the direction prediction head.

**Prerequisites:** Phase 1 (filament annotations must exist as `_filaments.json`).

**Deliverables:**

| Deliverable | Type | Description |
|-------------|------|-------------|
| `compute_direction_vectors.py` | New file | Filaments JSON + class mask TIFF --> direction volume TIFF |
| `validate_direction_volume.py` | New file | Validates shape, unit-norm, coverage metrics |
| Backend endpoint | Modified | `POST /api/annotation/generate-directions` in `annotation.routes.js` |

**Key Files to Create/Modify:**

| File | Action | Location |
|------|--------|----------|
| `compute_direction_vectors.py` | Create | `python/` |
| `validate_direction_volume.py` | Create | `python/` |
| `annotation.routes.js` | Modify | `src/routes/` |
| `constants.js` | Modify | `src/config/` (add script path) |

**Technical Approach:**

#### `compute_direction_vectors.py`

```
Input:
  --filaments_json  path to _filaments.json
  --class_mask      path to class label TIFF (Z, Y, X, uint8)
  --output          path to write direction volume TIFF
  --smoothing_k     smoothing window for tangent computation (default: 2)
  --class_id        class ID for filament voxels (default: 2)

Output:
  direction_volume.tif  (Z, Y, X, 3, float32)
  stdout: JSON with coverage stats
```

Algorithm steps:

1. **Parse filament centerpoints** from JSON. For each filament, extract list of `(z, x, y)` points sorted by z-index.

2. **Compute local tangent vectors** via finite differences with smoothing:
   - Interior points at slice z with smoothing window k: `tangent[z] = normalize(point[z+k] - point[z-k])`
   - Endpoints: one-sided differences
   - Handle gaps in z-indices by linear interpolation of missing positions
   - Normalize each tangent to unit length

3. **Sign convention:** orient all tangent vectors so that `dz >= 0`. If `dz < 0`, negate the entire vector. When `dz == 0`, use secondary tie-break: orient so `dy >= 0`, then `dx >= 0`.

4. **Paint onto class mask voxels:** for each microtubule voxel (class == `class_id`) in the class mask, find the nearest filament centerpoint on the same z-slice and assign that centerpoint's tangent vector.

5. **Output:** write as float32 TIFF with shape `(Z, Y, X, 3)`.

6. **Report** coverage statistics via stdout JSON:
   ```json
   {
     "total_filament_voxels": 15000,
     "assigned_voxels": 14200,
     "coverage_percent": 94.7,
     "num_filaments": 12,
     "mean_filament_length_slices": 25.3
   }
   ```

#### `validate_direction_volume.py`

Validation checks:
- Shape matches class mask: `(Z, Y, X, 3)` where `(Z, Y, X)` matches class mask dimensions
- All non-zero vectors have norm in `[0.95, 1.05]` (unit vector within tolerance)
- Non-zero direction vectors only exist where class mask has `class_id` value
- Coverage report: percentage of filament voxels that have direction assignments

#### Backend Endpoint

`POST /api/annotation/generate-directions` — spawns `compute_direction_vectors.py` as a child process (following the existing spawn-Python-and-parse-stdout pattern). Registers the output direction volume TIFF in workspace metadata with tags `['annotation', 'direction_volume']`.

**Testing/Verification Criteria:**

- Generate direction volume from test filament data (5 filaments, 40 slices)
- Validate all output vectors are unit-norm where non-zero
- Verify sign convention (all `dz >= 0`)
- Coverage >= 90% for densely annotated data

**Estimated Complexity:** Medium

---

### Phase 3: 2.5D U-Net Architecture with Dual Output Heads

**Objective:** Extend the UNet class in `train_model.py` to support multi-slice input (2.5D) and a second output head for direction vector prediction, while maintaining backward compatibility with the existing single-head 2D pipeline.

**Prerequisites:** Phase 2 (direction volumes must exist for training).

**Deliverables:**

| Deliverable | Type | Description |
|-------------|------|-------------|
| `UNet25D` class | New class | Multi-slice input, dual output heads |
| `Imagedataset25D` class | New class | Dataset that loads multi-slice patches + direction targets |
| Direction-aware augmentation | New function | Augmentation that correctly transforms direction vectors |
| Updated checkpoint format | Modified | Records `model_type`, `in_channels`, `has_direction_head` |

**Key Files to Create/Modify:**

| File | Action | Location |
|------|--------|----------|
| `train_model.py` | Modify | `python/` |
| `validate_imported_model.py` | Modify | `python/` (accept dual-head models) |

**Technical Approach:**

#### UNet25D Class

```python
class UNet25D(nn.Module):
    def __init__(self, features, num_layers, in_channels=3, num_classes=3,
                 has_direction_head=True):
        # Shared encoder-decoder (identical structure to existing UNet)
        # ...

        # Segmentation head (existing pattern)
        self.seg_head = nn.Conv2d(features, num_classes, kernel_size=1)

        # Direction head (new — extra conv block for regression capacity)
        if has_direction_head:
            self.dir_head = nn.Sequential(
                nn.Conv2d(features, features // 2, kernel_size=3, padding=1),
                nn.BatchNorm2d(features // 2),
                nn.ReLU(inplace=True),
                nn.Conv2d(features // 2, 3, kernel_size=1)
            )

    def forward(self, x):
        # Shared encoder-decoder path
        # ...
        seg_logits = self.seg_head(features)

        if self.has_direction_head:
            dir_raw = self.dir_head(features)
            dir_norm = F.normalize(dir_raw, p=2, dim=1, eps=1e-6)
            return seg_logits, dir_norm
        else:
            return seg_logits
```

Key design decisions:
- Direction head has an additional Conv-BN-ReLU block before the 1x1 projection (regression benefits from more nonlinear capacity)
- L2 normalization constrains predictions to the unit sphere during both training and inference
- When `has_direction_head=False`, the class behaves identically to the original UNet

#### Imagedataset25D Class

- Operates directly on the TIFF stacks (does not split into per-slice files), following the denoising module's 2.5D pattern
- For `num_slices=3`: stacks slices `[z-1, z, z+1]` as 3 input channels
- Extracts patches randomly, returning `(image_tensor, mask_onehot, dir_tensor)`
- Valid center slices: `range(half_slices, Z - half_slices)`

#### Direction-Aware Augmentation

This is one of the most critical implementation details:

| Transform | Image/Mask | Direction Vector |
|-----------|-----------|-----------------|
| Horizontal flip | Flip left-right | Negate `dx` |
| Vertical flip | Flip top-bottom | Negate `dy` |
| 90-degree rotation | Rotate CCW | `(dx, dy) -> (-dy, dx)` |
| 180-degree rotation | Rotate 180 | Negate `dx` and `dy` |
| 270-degree rotation | Rotate CW | `(dx, dy) -> (dy, -dx)` |

The `dz` component is **never** affected by XY augmentations.

#### Updated Checkpoint Format

```python
model_save_dict = {
    'model_state_dict': model.state_dict(),
    'model_config': {
        'features': config['features'],
        'num_layers': config['num_layers'],
        'in_channels': config.get('in_channels', 1),
        'num_classes': config.get('num_classes', 3),
        'model_type': 'direction_aware',       # NEW
        'has_direction_head': True,             # NEW
        'num_input_slices': config.get('num_input_slices', 1)  # NEW
    },
    # ... other fields as before
}
```

**Testing/Verification Criteria:**

- UNet25D with `in_channels=3` produces correct output shapes: `(B, num_classes, H, W)` for seg head, `(B, 3, H, W)` for direction head
- UNet25D with `has_direction_head=False` produces identical output to original UNet
- Direction vectors from direction head are unit-norm (within numerical tolerance)
- Augmentation test: flip image horizontally, verify `dx` is negated in direction target
- Existing 2D single-head training path still works unchanged

**Estimated Complexity:** Large

---

### Phase 4: Loss Function Implementation

**Objective:** Implement the combined orientation-weighted segmentation loss and sign-invariant direction loss, as specified in [03_loss_function_design.md](03_loss_function_design.md).

**Prerequisites:** Phase 3 (dual-head model must exist).

**Deliverables:**

| Deliverable | Type | Description |
|-------------|------|-------------|
| `OrientationWeightedCELoss` | New class | Cross-entropy with per-voxel orientation weights |
| `SignInvariantDirectionLoss` | New class | `1 - \|v_pred . v_gt\|`, masked to filament voxels |
| `CombinedDirectionAwareLoss` | New class | Combines both with hyperparameters alpha and lambda |
| Updated progress reporting | Modified | Reports seg_loss, dir_loss, combined_loss separately |

**Key Files to Modify:**

| File | Action | Location |
|------|--------|----------|
| `train_model.py` | Modify | `python/` (add loss classes, modify training loop) |

**Technical Approach:**

#### OrientationWeightedCELoss

Per-voxel weight for filament voxels: `w = 1 + alpha * (1 - |dz|)`

- When `|dz| ~ 1` (filament runs along Z, well-resolved): weight ~ 1 (normal)
- When `|dz| ~ 0` (filament runs in XY, poorly resolved): weight ~ `1 + alpha` (boosted)
- Non-filament voxels always get weight = 1

#### SignInvariantDirectionLoss

Per-voxel: `L = 1 - |v_pred . v_gt|`

- Sign-invariant: parallel vectors (same or opposite direction) yield loss = 0
- Masked to filament voxels only (non-filament contributes zero)
- Averaged over the number of filament voxels in the batch

#### CombinedDirectionAwareLoss

```
L_total = L_seg_weighted + lambda_dir * L_direction
```

Returns all three components for separate tracking.

#### New Hyperparameters

| Parameter | Default | Range | Description |
|-----------|---------|-------|-------------|
| `alpha` | 1.0 | 0.0 - 5.0 | Orientation weight strength |
| `lambda_dir` | 0.3 | 0.0 - 2.0 | Direction loss weight |
| `filament_class_id` | 2 | 1-N | Which class represents filaments |

#### Modified Progress Reporting

The `PROGRESS:` JSON now includes additional fields:

```json
{
  "epoch": 5,
  "total_epochs": 50,
  "metrics": {
    "train_loss": 0.45,
    "train_dice": 0.72,
    "val_loss": 0.52,
    "val_dice": 0.68,
    "train_seg_loss": 0.40,
    "train_dir_loss": 0.15,
    "val_seg_loss": 0.47,
    "val_dir_loss": 0.18
  }
}
```

The additional fields are only present when direction-aware training is active, maintaining backward compatibility with the existing frontend parser.

**Testing/Verification Criteria:**

- `OrientationWeightedCELoss` with `alpha=0` produces identical loss to standard `CrossEntropyLoss`
- `SignInvariantDirectionLoss` returns 0 when pred matches gt (and when pred is negation of gt)
- `CombinedDirectionAwareLoss` with `lambda_dir=0` produces same loss as standard training
- Training converges on a small test dataset (3 filaments, 20 slices)

**Estimated Complexity:** Medium

---

### Phase 5: Frontend Training Integration + Inference + Visualization

**Objective:** Wire all backend changes into the workspace UI: training configuration controls for direction-aware mode, 2D/2.5D toggle, dual-loss chart, direction-aware inference, and direction vector visualization.

**Prerequisites:** Phases 1-4 complete.

**Deliverables:**

| Deliverable | Type | Description |
|-------------|------|-------------|
| 2D/2.5D mode toggle | UI | Toggle in segmentation configuration (same pattern as denoising module) |
| Direction volume file selector | UI | Optional third file input in Step 1 |
| Alpha/lambda controls | UI | New fields in Step 2 configuration |
| Dual-loss chart | UI | Additional datasets on existing loss chart |
| 2.5D inference support | Modified | `run_inference.py` handles multi-slice input |
| Direction volume output | Modified | Inference produces segmentation + direction TIFFs |
| Direction overlay visualization | UI | Color-mapped direction vectors in Image Viewer |

**Key Files to Create/Modify:**

| File | Action | Location |
|------|--------|----------|
| `Templates.js` | Modify | `public/workspace/js/modules/segmentation/templates/` |
| `SegmentationModule.js` | Modify | `public/workspace/js/modules/segmentation/` |
| `FileHandler.js` | Modify | `public/workspace/js/modules/segmentation/handlers/` |
| `TrainingHandler.js` | Modify | `public/workspace/js/modules/segmentation/handlers/` |
| `ChartHandler.js` | Modify | `public/workspace/js/modules/segmentation/handlers/` |
| `InferenceHandler.js` | Modify | `public/workspace/js/modules/segmentation/handlers/` |
| `SegmentationAPI.js` | Modify | `public/workspace/js/modules/segmentation/` |
| `run_inference.py` | Modify | `python/` |
| `ml.routes.js` | Modify | `src/routes/` |

**Technical Approach:**

#### Step 1 UI: Data Upload

- Add optional third file selector for the direction volume, visible when "Train from Scratch" is selected
- Filter to files with tags `['annotation', 'direction_volume']`
- Add 2D/2.5D mode toggle following the denoising module pattern

#### Step 2 UI: Configuration

Add a "Direction-Aware Training" config group (conditionally visible when direction volume is provided):

- Orientation Weight (alpha): number input, default 1.0
- Direction Loss Weight (lambda): number input, default 0.3
- Input Slices (2.5D): select with options 1 (2D), 3 (triplet), 5

#### Step 3 UI: Training Progress

- Extend ChartHandler to display direction loss as an additional chart
- Combined loss chart adds seg_loss and dir_loss as additional, lighter-colored lines

#### 2.5D Inference (`run_inference.py`)

- Detect model type from checkpoint `model_config.model_type`
- For 2.5D: stack adjacent slices as input channels, predict center slice
- Output both segmentation TIFF and direction volume TIFF
- Edge slices: reflect-pad at stack boundaries

#### Direction Vector Visualization

- Map direction vectors to colors: `(|dx|, |dy|, |dz|) -> (R, G, B)` — standard DTI colormap
- X-oriented filaments appear red, Y-oriented green, Z-oriented blue
- Overlay alpha controlled by a slider in the Image Viewer

#### Backend Changes (`ml.routes.js`)

- `/configure-training` accepts new fields: `alpha`, `lambda_dir`, `num_input_slices`, `direction_volume_path`
- `/start-training` passes these to `train_model.py` via the config JSON
- `/run-inference` detects model type from checkpoint and uses the appropriate inference function
- Inference result JSON optionally includes `direction_output_path`

**Testing/Verification Criteria:**

- Full end-to-end: annotate filaments, generate direction volume, train 2.5D model for 10 epochs, run inference
- 2D/2.5D toggle correctly shows/hides related configuration
- Direction loss chart renders without breaking existing loss/dice charts
- Models trained without direction volume still load and run inference correctly

**Estimated Complexity:** Large

---

## 4. Risk Assessment

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| **Direction-aware augmentation bugs** introduce systematic errors in training | High | Medium | Unit test every augmentation transform with known direction vectors. Verify rotational equivariance with synthetic data. |
| **2.5D memory pressure** — multi-slice input increases GPU memory per sample | Medium | High | Default to 3-slice (triplet) rather than 5-slice. Reduce patch size recommendations when 2.5D is selected. Add memory estimation in Step 2 config. |
| **Sparse filament annotations** produce poor direction volumes | High | Medium | Validate coverage % in Phase 2 and warn user if below 80%. Provide guidance on minimum annotation density. |
| **Sign convention inconsistency** if `dz=0` for some vectors | Low | Low | Use secondary tie-break when `dz == 0`: orient so `dy >= 0`, then `dx >= 0`. |
| **Loss balancing (alpha/lambda) requires tuning** per dataset | Medium | High | Provide sensible defaults (`alpha=1.0`, `lambda=0.3`). Consider adding presets. |
| **Breaking existing 2D pipeline** during refactoring | High | Low | All new code paths gated behind `has_direction_head` and `model_type` checks. Existing paths not modified, only extended. |
| **UNet class duplication** between `train_model.py` and `run_inference.py` | Medium | High | Extract to shared `python/models/unet.py` module as part of Phase 3. |
| **Browser performance** with direction overlay on large volumes | Low | Medium | Compute overlay per-slice on demand, not for entire volume at once. |
| **Frontend complexity** of conditional UI (2D vs 2.5D, with/without direction) | Medium | Medium | Use clear show/hide logic gated on boolean flags, following the denoising module pattern. |

---

## 5. Open Questions

### Architecture Decisions

1. **Shared UNet module vs inline duplication:** Currently `train_model.py` and `run_inference.py` each define their own `UNet` class (identical copies). Should Phase 3 extract model definitions into a shared `python/models/` package?
   - **Recommendation:** Yes, create `python/models/unet.py` and `python/models/unet25d.py` as a preliminary refactoring step in Phase 3.

2. **Number of input slices:** The design specifies 3 (triplet) as default, with 5 as an option. Should we also support 7?
   - **Recommendation:** Support 3 and 5 only. 7-slice input significantly increases memory with diminishing returns.

3. **Edge slice handling in 2.5D inference:** For a 3-slice model, slices 0 and Z-1 cannot form complete triplets. Options: (a) reflect-pad, (b) zero-pad, (c) skip edge slices.
   - **Recommendation:** Reflect-pad (mirror the stack at boundaries).

### Data Format Decisions

4. **Direction volume storage:** Float32 TIFF with shape `(Z, Y, X, 3)` is proposed. Alternative: 3 separate single-channel TIFFs.
   - **Recommendation:** Single 4D TIFF. `tifffile` handles this natively, and it keeps components together.

5. **Filament class ID assignment:** Currently defaults to class 2 (microtubule). Should this be configurable per-filament?
   - **Recommendation:** Yes, make configurable per-filament (the `classId` field already supports this), but default to 2.

### UI/UX Decisions

6. **When to show "Generate Direction Vectors":** In the annotation module, the segmentation module, or both?
   - **Recommendation:** Both. In annotation: action button when both class and filament annotations exist. In segmentation Step 1: part of file selection flow if user has annotations but no direction volume.

7. **Direction vector visualization colormap:** RGB colormap only, or also offer quiver plots?
   - **Recommendation:** Start with RGB colormap only. Quiver plots can be added later as a sparse sampling overlay.

---

## 6. Phase Dependency Graph

```
Phase 1: Centerpoint Annotation Tooling
    |
    v
Phase 2: Direction Volume Generation
    |
    v
Phase 3: 2.5D Dual-Head U-Net Architecture
    |
    v
Phase 4: Loss Function Implementation
    |
    v
Phase 5: Frontend Integration + Inference + Visualization
```

All phases are strictly sequential. Each phase's output is a prerequisite for the next.

---

## 7. Critical Files Reference

| File | Relevance |
|------|-----------|
| `python/train_model.py` | Core ML pipeline. Phases 3 and 4 make major modifications. |
| `public/workspace/js/modules/annotation/AnnotationModule.js` | Main annotation UI. Phase 1 adds centerpoint tool and filament section. |
| `public/workspace/js/modules/annotation/BrushEngine.js` | Pattern reference for CenterpointEngine (same pointer event architecture). |
| `public/workspace/js/modules/segmentation/templates/Templates.js` | Segmentation UI templates. Phase 5 adds direction-aware controls. |
| `src/routes/annotation.routes.js` | Annotation backend. Phases 1 and 2 add new endpoints. |
| `python/run_inference.py` | Inference pipeline. Phase 5 adds 2.5D and direction output support. |
| `src/routes/ml.routes.js` | Training/inference endpoints. Phase 5 adds new config fields. |
| `python/denoising/models.py` | Reference for 2.5D pattern (CenterChannelWrapper, triplet handling). |
