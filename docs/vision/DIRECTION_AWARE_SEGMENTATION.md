# Direction-Aware 2.5D Segmentation & Filament Network Visualization

A comprehensive summary of the direction-aware segmentation pipeline, from filament annotation through model training, inference, and 3D network visualization.

---

## Table of Contents

1. [Overview](#overview)
2. [Why Direction-Aware Segmentation?](#why-direction-aware-segmentation)
3. [Pipeline at a Glance](#pipeline-at-a-glance)
4. [Phase 1: Filament Centerpoint Annotation](#phase-1-filament-centerpoint-annotation)
5. [Phase 2: Direction Volume Generation](#phase-2-direction-volume-generation)
6. [Phase 3: The 2.5D Dual-Head U-Net](#phase-3-the-25d-dual-head-u-net)
7. [Phase 4: Direction-Aware Training](#phase-4-direction-aware-training)
8. [Phase 5: Inference & Direction Output](#phase-5-inference--direction-output)
9. [Phase 6: Filament Network Extraction & Visualization](#phase-6-filament-network-extraction--visualization)
10. [How the Phases Connect](#how-the-phases-connect)
11. [Technical Reference](#technical-reference)

---

## Overview

Standard 2D semantic segmentation classifies each pixel into a category (background, filament, etc.) but discards all structural information — it cannot tell you which direction a filament is running, whether two segments belong to the same fiber, or how the network is organized in 3D. Direction-aware segmentation addresses this by predicting both **what** each pixel is and **which way** the structure runs at that point.

The system adds a complete pipeline on top of the existing segmentation workflow:

1. **Annotate** filament centerpoints across z-slices (sparse, one click per filament per slice)
2. **Generate** a dense 3D direction volume from the sparse annotations (automatic)
3. **Train** a dual-head 2.5D U-Net that predicts both segmentation masks and direction vectors
4. **Run inference** to produce a segmentation volume plus a direction volume
5. **Extract and visualize** the filament network as a direction-colored 3D graph

---

## Why Direction-Aware Segmentation?

### The Limitations of Standard Segmentation

A standard U-Net operating on individual 2D slices has two fundamental blind spots:

1. **No cross-slice context.** Each slice is processed independently. A filament running nearly parallel to the imaging plane appears as a large, diffuse blob on one slice and may vanish on the next. The model has no way to understand this continuity.

2. **No orientation information.** The output is a flat label map — class 2 means "filament" but says nothing about direction. Two crossing filaments that happen to overlap on one slice are indistinguishable from a single wide filament.

### What 2.5D Adds

The 2.5D approach feeds three consecutive slices (z-1, z, z+1) as input channels to an architecturally 2D network. This gives the model cross-slice context without the memory cost of full 3D convolutions. The model can now "see" whether a bright spot on slice z also appears slightly shifted on z-1 and z+1, which is the signature of a filament running at an angle through the volume.

### What Direction-Awareness Adds

The dual-head architecture goes further: it predicts a 3D unit vector at every filament pixel, indicating the local orientation of the filament. This has three benefits:

1. **Better segmentation.** The orientation-weighted cross-entropy loss up-weights filament pixels that run nearly horizontally (small |dz|), which are the hardest cases — they appear as diffuse patches rather than clear cross-sections. The direction head acts as a regularizer that forces the network to understand structure, not just intensity.

2. **Direction output for downstream analysis.** The predicted direction volume can be used to study filament organization — which directions are dominant, how orientation varies across the sample, where the network changes direction.

3. **Direction-colored network visualization.** The direction vectors are used to color the extracted filament network using the DTI convention (|dx| to Red, |dy| to Green, |dz| to Blue), making it immediately visible which way each branch runs.

---

## Pipeline at a Glance

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        ANNOTATION MODULE                                │
│                                                                         │
│  Raw Stack ──► Brush: class masks (background, filament, ...)          │
│             ──► Centerpoint Tool: one (x,y) per filament per z-slice   │
│                                                                         │
│  "Create Annotation" ──► class_mask.tif + _filaments.json              │
│                      ──► compute_direction_vectors.py (automatic)       │
│                      ──► _directions.tif (Z, Y, X, 3) float32         │
└─────────────────────────────┬───────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       SEGMENTATION MODULE                               │
│                                                                         │
│  Inputs: raw stack + class_mask.tif + _directions.tif                  │
│  Mode: Direction-Aware 2.5D (auto-detected from direction volume)      │
│  Model: UNet25D with dual heads (segmentation + direction)             │
│  Loss: L_seg (orientation-weighted CE) + 0.3 * L_dir (sign-invariant) │
│                                                                         │
│  Output: best_model.pth (model_type: 'direction_aware')                │
└─────────────────────────────┬───────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        INFERENCE                                        │
│                                                                         │
│  Auto-detects model type from checkpoint                                │
│  Input: raw stack (reflect-padded, global-normalized, triplet windows) │
│  Output: segmentation_inference.tif + direction_inference.tif           │
│          (direction vectors zeroed at non-filament pixels)             │
└─────────────────────────────┬───────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     MESH + NETWORK GENERATION                           │
│                                                                         │
│  Mesh: marching cubes on segmentation ──► mesh_data.json               │
│  Network (chained after mesh):                                          │
│    segmentation mask ──► skeletonize ──► 26-connectivity graph         │
│    direction volume  ──► DTI coloring (|dx|→R, |dy|→G, |dz|→B)        │
│    ──► network_data.json (per-z-bucket LineSegments)                   │
└─────────────────────────────┬───────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     3D VISUALIZATION MODULE                             │
│                                                                         │
│  Mesh: Three.js surface mesh (existing)                                │
│  Network overlay: THREE.LineSegments per z-bucket                      │
│  Controls: visibility toggle + z-range dual slider                     │
│  Coloring: per-edge vertex colors from direction volume                │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Filament Centerpoint Annotation

### The Problem

Direction-aware training needs ground-truth direction vectors. Computing direction at every voxel requires knowing the filament's path through 3D space. But annotating full 3D paths is impractical — the user works with 2D slices.

### The Solution: Sparse Centerpoint Annotation

The annotation module provides a **centerpoint tool** alongside the existing brush tool. For each filament, the user places a single pixel marker on each z-slice where that filament is visible, indicating the approximate center of the filament cross-section.

### How It Works

**Data model (FilamentManager).** Each filament is a named object (auto-named "MT-1", "MT-2", etc.) with a distinct color from a 10-color palette and a sparse point map:

```
Filament {
  id: 1, name: "MT-1", color: "#00BFFF", classId: 2,
  points: {
    "5":  { x: 142, y: 87 },
    "8":  { x: 147, y: 91 },
    "12": { x: 155, y: 96 }
  }
}
```

Points are stored per z-slice (string keys). There is at most one point per filament per slice — placing a new point overwrites the previous one on that slice.

**Interaction (CenterpointEngine).** When the centerpoint tool is active:
- **Left-click** places a 1-pixel marker at the clicked position for the active filament on the current z-slice.
- **Right-click** removes the nearest marker within a 10-pixel radius.
- A **hover preview** shows exactly which pixel would be marked.

**Ghost markers for multi-z context.** When navigating slices, the active filament shows "ghost" markers from adjacent slices (z-1 and z+1) at 40% opacity, with dashed connecting lines to the current-slice marker. This helps the user track filament continuity across slices without switching back and forth.

**Tool switching.** The toolbar provides both brush tools (for class masks) and the centerpoint tool (for filaments). Clicking a class item auto-switches to the brush; clicking a filament item auto-switches to centerpoint. The two tools are mutually exclusive — enabling one disables the other.

**Persistence.** Filament data is saved as a JSON sidecar (`_filaments.json`) alongside the annotation TIFF. It can be saved as work-in-progress and restored when re-editing.

### What the User Does

1. Create the class mask using the brush tool (paint filament regions as class 2, etc.)
2. Click "+" in the Filaments panel to create a new filament
3. Navigate to a z-slice where the filament is visible
4. Click on the center of the filament cross-section (single pixel)
5. Navigate to another z-slice, click again — ghost markers show the previous position
6. Repeat for each filament visible in the volume
7. Click "Create Annotation" — this saves the class mask, the filament sidecar, and automatically triggers direction volume generation

The annotation does not need to be exhaustive. Every z-slice where a point is placed contributes to the direction volume; gaps between annotated slices are interpolated. Even annotating every 3rd-5th slice gives good results.

---

## Phase 2: Direction Volume Generation

### What It Produces

A float32 TIFF of shape **(Z, Y, X, 3)** where each voxel that belongs to a segmented filament class holds a unit-length 3D tangent vector `[dx, dy, dz]` representing the local direction of the filament at that point. Background voxels and unassigned voxels are `[0, 0, 0]`.

### When It Runs

Automatically, when the user clicks "Create Annotation" in the annotation module. If the annotation contains filaments with at least one point, `compute_direction_vectors.py` is spawned as a post-processing step. It is non-fatal — if it fails, the annotation is still saved.

### Algorithm Step by Step

**Step 1: Linear interpolation between annotated slices.**

The user annotates only some z-slices per filament. For each filament, the algorithm fills in the gaps with linear interpolation in (x, y):

```
Annotated: z=5 → (142, 87),  z=12 → (155, 96)
Interpolated: z=6 → (143.9, 88.3), z=7 → (145.7, 89.6), ... z=11 → (153.1, 94.7)
```

This produces a dense centerline: one (x, y) coordinate for every integer z from the filament's first annotated slice to its last.

**Step 2: Tangent computation via smoothed finite differences.**

At each z position along the interpolated centerline, the local tangent is computed using a central-difference scheme with a smoothing window of half-width k (default 2):

```
tangent[z] = normalize( point[z+k] - point[z-k] )
```

The window is clamped at endpoints. The raw difference vector `[dx, dy, dz]` is normalized to unit length. Single-point filaments get a default tangent of `[0, 0, 1]` (pure z-direction).

**Step 3: Sign convention enforcement.**

Filament orientation is inherently unsigned — a filament running "up" and one running "down" are the same structure. To create a consistent training target, all tangent vectors are oriented so that:

```
Primary:    dz >= 0  (tangent points "upward" in the stack)
Tie-break:  if dz = 0, then dy >= 0
Second TB:  if dz = dy = 0, then dx >= 0
```

If a computed tangent violates this, it is flipped: `t = -t`. This ensures the direction volume is smooth and learnable — no sudden sign flips between adjacent voxels.

**Step 4: KDTree nearest-neighbor assignment.**

The centerline gives directions at a sparse set of (x, y) positions per z-slice, but the segmentation mask may cover a wide area around each filament. The algorithm assigns a direction to every mask voxel using nearest-neighbor lookup:

For each class and each z-slice:
1. Find all mask voxels: `mask[z] == class_id`
2. Find all centerline points for this class at this z
3. Build a 2D KDTree from the centerline (x, y) coordinates
4. For each mask voxel, query the nearest centerline point
5. Assign that centerline point's tangent vector to the voxel

This means every filament-class pixel gets the direction of the nearest annotated filament center, which is a reasonable approximation for tube-like structures.

**Important design choice:** If a z-slice has mask voxels but no centerline points (the filament was not annotated on that slice and is outside the interpolation range), those voxels remain `[0, 0, 0]`. The system does not guess — it marks them as unknown. The coverage percentage reported to the user reveals how complete the annotations are.

### Output and Metadata

The direction volume is saved as `<annotation>_directions.tif` in the annotations directory and registered in workspace metadata with:
- `tags: ['annotation', 'direction_volume']`
- `parentId: <annotationFileId>`
- Lineage linking it to the source annotation

Coverage statistics are returned to the frontend and shown in the success notification: *"Direction volume generated (87% coverage)"*.

---

## Phase 3: The 2.5D Dual-Head U-Net

### Architecture

The model (`UNet25D`) is architecturally a standard 2D U-Net — all convolutions are `Conv2d` — but it takes **multiple z-slices as input channels**. By default, 3 slices (z-1, z, z+1) are stacked as channels, giving the network cross-slice context without the memory cost of 3D convolutions.

```
Input: (batch, 3, H, W)    ← three consecutive slices as channels
         │
    ┌────┴────┐
    │ Encoder │  ConvBlock → Pool → ConvBlock → Pool → ...
    └────┬────┘
         │  skip connections
    ┌────┴────┐
    │ Decoder │  Up → Cat(skip) → ConvBlock → Up → ...
    └────┬────┘
         │
    shared features: (batch, F, H, W)
         │
    ┌────┴──────────────┐
    │                   │
    ▼                   ▼
 Seg Head           Dir Head
 Conv2d(F→C)       Conv2d(F→F/2) → BN → ReLU → Conv2d(F/2→3)
    │                   │
    ▼                   ▼
 seg_logits         dir_raw → L2 normalize → dir_norm
 (B, C, H, W)      (B, 3, H, W)   unit vectors
```

**Segmentation head:** A single 1x1 convolution producing per-class logits (identical to the standard U-Net output).

**Direction head:** A small two-layer sub-network (3x3 conv → BN → ReLU → 1x1 conv) that regresses a 3-component vector per pixel, followed by L2 normalization to produce unit vectors. The normalization is applied unconditionally; the loss function restricts supervision to filament pixels only.

### Why Dual Heads?

The two heads share the entire encoder-decoder, which means the direction task acts as an **auxiliary objective** that regularizes the shared representation. The encoder is forced to learn features that are useful for both segmentation and direction prediction — this generally produces features that better capture the elongated, oriented nature of filaments.

### Comparison with Standard Modes

| Mode | Input | Model | Output |
|------|-------|-------|--------|
| Standard 2D | 1 slice (B, 1, H, W) | UNet | Segmentation logits |
| Standard 2.5D | 3 slices (B, 3, H, W) | UNet25D (no dir head) | Segmentation logits |
| Direction-Aware 2.5D | 3 slices (B, 3, H, W) | UNet25D (dual head) | Segmentation logits + Direction vectors |

---

## Phase 4: Direction-Aware Training

### Loss Function

The combined loss has two components:

```
L_total = L_seg + lambda_dir * L_dir
```

Default: `lambda_dir = 0.3`, keeping direction as a secondary signal.

#### Orientation-Weighted Cross-Entropy (L_seg)

Standard cross-entropy, but filament pixels where the filament runs nearly horizontally (small |dz|) receive extra weight:

```
weight(pixel) = 1 + alpha * (1 - |dz|)     for filament-class pixels
weight(pixel) = 1                           for all other pixels
```

When `alpha = 1.0` (default): a perfectly horizontal filament pixel (dz = 0) gets weight 2.0, while a vertical one (|dz| = 1) gets weight 1.0. This addresses the observation that horizontal filaments are harder to segment because they appear as diffuse blobs rather than clear cross-sections.

#### Sign-Invariant Direction Loss (L_dir)

Since filament orientation is unsigned (both +v and -v describe the same direction), the loss uses the absolute dot product:

```
L_dir = mean over filament pixels [ 1 - |dot(predicted, ground_truth)| ]
```

This equals `1 - |cos(theta)|` where theta is the angle between vectors. It is zero when vectors are parallel **or** antiparallel (both correct), and 1 when perpendicular. Only filament-class pixels contribute; background pixels are masked out.

### Direction-Aware Data Augmentation

Spatial augmentations (flips and 90-degree rotations) must be applied consistently to both the image and the direction vectors. The key insight is that flipping or rotating the image changes the coordinate frame, so the direction vector components must be transformed accordingly:

| Augmentation | Image transform | Direction vector transform |
|---|---|---|
| Horizontal flip | columns reversed | negate dx |
| Vertical flip | rows reversed | negate dy |
| 90° CCW rotation | rows ↔ cols | (dx, dy) → (-dy, dx) |
| 180° rotation | both reversed | (dx, dy) → (-dx, -dy) |
| 270° CCW rotation | rows ↔ cols | (dx, dy) → (dy, -dx) |

After any augmentation, the sign convention (dz >= 0) is re-enforced by flipping any vectors that ended up with negative dz.

### Dataset: Triplet Formation

The 2.5D dataset works at the level of the full 3D stack. The stack is reflect-padded along z so that edge slices can still form complete triplets. For each training sample, a center slice z is selected and the context window `[z-1, z, z+1]` is extracted as the 3-channel input. The segmentation mask and direction vector are taken from the center slice only.

The z-axis split is **contiguous** (slices 0-69 for training, 70-84 for validation, 85-99 for test) rather than random. This prevents context windows from leaking test-slice data into training through the adjacent-slice channels.

### Frontend Integration

In the segmentation module:
- When the user selects annotation files that have a direction volume, a "Use filament annotations" checkbox appears automatically, the mode toggle locks to 2.5D, and the direction config panel shows three hyperparameters: context slices (3/5/7), alpha, and lambda_dir.
- During training, four additional metric cards appear (train/val seg loss and dir loss) along with four dashed lines on the loss chart. These activate automatically when the backend reports direction sub-losses.

---

## Phase 5: Inference & Direction Output

### Model Auto-Detection

The inference script reads `model_type` from the saved checkpoint:

| `model_type` | Model class | Inference path | Outputs |
|---|---|---|---|
| `'standard'` (or missing) | UNet | Per-slice, independent normalization | Segmentation only |
| `'standard_25d'` | UNet25D (no dir head) | Triplet windows, global normalization | Segmentation only |
| `'direction_aware'` | UNet25D (dual head) | Triplet windows, global normalization | Segmentation + Direction |

No user configuration is needed — the model checkpoint fully determines the inference behavior.

### 2.5D Inference Process

1. **Global normalization** of the entire input stack to [0, 1] (matching training)
2. **Reflect-padding** along z by `context_slices // 2` on each side
3. For each center slice z, extract the context window and run the model
4. The segmentation head output is argmaxed to produce the label map
5. The direction head output (B, 3, H, W) is stored as the direction volume
6. **Filament masking:** direction vectors at non-filament pixels are zeroed out

### Output Files

- `segmentation_inference_<ID>.tif` — standard segmentation volume (Z, H, W) uint8
- `direction_inference_<ID>.tif` — direction volume (Z, H, W, 3) float32, non-zero only at filament pixels

Both files are registered in workspace metadata with shared lineage (same process ID), enabling downstream modules to find the direction volume that belongs to a given segmentation.

---

## Phase 6: Filament Network Extraction & Visualization

### Why Extract a Network?

The segmentation volume shows where filaments are, and the direction volume shows which way they run, but neither directly reveals the **topology** of the filament network — how many branches there are, where they connect, how they're organized in 3D. Network extraction converts the volumetric data into a graph that can be explored interactively.

### Step 1: Skeletonization

The filament class mask (a thick 3D region) is reduced to a 1-voxel-wide skeleton using `skimage.morphology.skeletonize`. This is a 3D medial-axis thinning algorithm that iteratively removes boundary voxels while preserving connectivity and endpoints. The result traces the center of each filament tube.

### Step 2: Graph Building (26-Connectivity)

Skeleton voxels are loaded into a hash set for O(1) neighbor lookup. For each voxel, 13 "forward" neighbor offsets are checked (half of the 26-connectivity neighborhood, using lexicographic ordering to avoid duplicate edges). If a neighbor is also in the skeleton set, an edge is recorded between the two voxels.

The 13 forward offsets are selected by the condition `(dz, dy, dx) > (0, 0, 0)` in Python's tuple comparison — this cleanly partitions the 26 neighbors into 13 forward and 13 backward directions without any explicit deduplication.

### Step 3: Direction-Based Coloring (DTI Convention)

Each edge is colored using the **DTI (Diffusion Tensor Imaging) convention**:

| Direction component | Color channel | Meaning |
|---|---|---|
| \|dx\| (column axis) | Red | Filament runs left-right |
| \|dy\| (row axis) | Green | Filament runs up-down |
| \|dz\| (slice/depth axis) | Blue | Filament runs through the stack |

The direction is sampled at both edge endpoints from the direction volume, averaged, absolute-valued, and normalized. Diagonal filaments produce mixed colors (e.g., a filament at 45 degrees in the XZ plane appears magenta).

### Step 4: Per-Z-Bucket Organization

Edges are sorted by the z-coordinate of their midpoint into per-slice "buckets". The output JSON stores start indices and vertex counts for each bucket, enabling the frontend to show/hide edges by z-range without rebuilding any buffers — it simply toggles the `.visible` flag on each bucket's `THREE.LineSegments` object.

### Step 5: 3D Rendering

The frontend creates one `THREE.LineSegments` per z-bucket, each with vertex-colored `BufferGeometry`. All buckets are added to the mesh group so the network rotates with the surface mesh. The coordinate transform (centering and scaling) matches the mesh exactly, ensuring perfect overlay.

### User Controls

- **Visibility checkbox:** toggles the entire network on/off (starts hidden by default)
- **Z-range dual slider:** shows only edges whose midpoint falls within the selected z-range, useful for examining specific depth regions of the volume

### Automatic Detection

The network option appears in the mesh module when a direction volume is detected for the selected segmentation file. Detection uses three strategies:
1. Direct parent-child relationship (annotation workflow)
2. Shared inference process ID (both segmentation and direction volume from the same inference run)
3. Lineage inputs lookup (direction volume lists the segmentation as an input)

In the visualization module, `network_data.json` is detected by checking the mesh output directory, regardless of how the user navigated there.

---

## How the Phases Connect

The six phases form a pipeline where each phase's output feeds the next:

```
Annotation ──► Direction Volume ──► Training ──► Inference ──► Network ──► Visualization
  (manual)      (automatic)        (supervised)  (automatic)   (automatic)   (interactive)
```

**The key linkages:**

1. **Filament JSON → Direction Volume.** The sparse centerpoint annotations are the source of ground-truth direction information. The `compute_direction_vectors.py` script bridges the gap between sparse user input and dense training targets via interpolation and nearest-neighbor assignment.

2. **Direction Volume → Training Loss.** The direction volume serves dual purpose in training: it provides the regression target for the direction head, and it provides the orientation weights for the segmentation head (horizontal filaments get up-weighted).

3. **Trained Model → Inference Direction Output.** The dual-head model produces direction vectors at inference time, meaning new unseen data gets direction information without any manual annotation.

4. **Inference Direction Output → Network Coloring.** The direction volume from inference (or from the original annotation) provides the per-edge coloring for the network visualization. This closes the loop: annotations define directions, the model learns to predict them, and the predictions are visualized as colored 3D graphs.

**The user experience is designed to be automatic at every handoff.** The user's only manual steps are (1) painting the class mask, (2) placing centerpoint markers, and (3) clicking through the pipeline. Direction volume generation, model type detection, network generation, and visualization loading all happen without user configuration.

---

## Technical Reference

### Key Files

| File | Purpose |
|------|---------|
| `public/.../annotation/utils/FilamentManager.js` | Filament data model (CRUD, serialization) |
| `public/.../annotation/utils/CenterpointEngine.js` | Pointer interaction, ghost markers, rendering |
| `python/compute_direction_vectors.py` | Sparse annotations → dense direction volume |
| `python/validate_direction_volume.py` | Direction volume validation (norms, signs, coverage) |
| `python/models/unet.py` | UNet and UNet25D architectures |
| `python/train_model.py` | Loss functions, dataset, training loop (2D / 2.5D / direction-aware) |
| `python/run_inference.py` | Auto-detecting inference (2D / 2.5D / direction-aware) |
| `python/generate_network.py` | Skeletonization, graph building, DTI coloring |
| `public/.../visualization/visualization/networkRenderer.js` | Three.js LineSegments rendering |
| `src/routes/mesh.routes.js` | Direction volume detection, network generation backend |
| `src/routes/annotation.routes.js` | Direction volume trigger after annotation creation |

### Hyperparameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `context_slices` | 3 | Number of z-slices in the input window (3, 5, or 7) |
| `alpha` | 1.0 | Orientation weighting strength (0 = no weighting, higher = more weight on horizontal filaments) |
| `lambda_dir` | 0.3 | Direction loss weight relative to segmentation loss |
| `smoothing_k` | 2 | Half-width of the tangent smoothing window for direction computation |
| `filament_classes` | [2] | Which class IDs are treated as filaments |

### Data Formats

| File | Shape | Type | Description |
|------|-------|------|-------------|
| Direction volume (training) | (Z, Y, X, 3) | float32 | Ground-truth tangent vectors from annotations |
| Direction volume (inference) | (Z, Y, X, 3) | float32 | Predicted tangent vectors (zeroed at non-filament pixels) |
| `network_data.json` | — | JSON | Flat position/color arrays + per-z-bucket indices |
| `_filaments.json` | — | JSON | Sparse centerpoint map per filament |

---

**Navigation:**
[Documentation Index](../INDEX.md) | [Session Logs](../sessions/INDEX.md) | [Architecture Overview](../architecture/OVERVIEW.md)
