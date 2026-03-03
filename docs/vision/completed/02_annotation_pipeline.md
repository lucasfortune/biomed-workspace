# Annotation Pipeline for Direction-Aware Segmentation

## Overview

The annotation pipeline produces two volumes per tomogram:

1. **Class label volume** `(Z, Y, X)` — integer class IDs (existing workflow).
2. **Direction vector volume** `(Z, Y, X, 3)` — per-voxel unit tangent vectors for filament classes.

The direction vectors are derived from manually annotated centerpoints, not painted by hand.

## Step 1: Class Annotation (Existing)

Continue using the existing annotation tool to paint per-voxel class labels:

- 0 = Background
- 1 = Cell body
- 2 = Microtubule
- (Future: 3 = Flagellum)

No changes are needed to this step.

## Step 2: Centerpoint Annotation

For each microtubule visible in the image stack, paint a **single center point per slice** using the modified annotation tool.

### What to mark

- One point at the approximate center of each microtubule cross-section, per slice.
- If a microtubule spans 40 slices, it gets 40 center points (one per slice).

### Sparse annotation option

For straight or gently curving microtubules, it is not strictly necessary to mark every slice. Marking every 3rd–5th slice and interpolating with a spline can save significant annotation time. Dense marking (every slice) should be used where microtubules curve sharply or where multiple microtubules are close together and correspondence could be ambiguous.

## Step 3: Centerline Linking

The annotation tool links center points across slices to reconstruct each microtubule's 3D centerline.

### Linking strategy

- Use **nearest-neighbor matching** between adjacent slices with a maximum displacement threshold.
- For microtubules running steeply (close to the Z axis), center points move very little between slices — linking is straightforward.
- For microtubules at shallow angles, center points shift more between slices but are typically still unambiguous if microtubules are not too densely packed.
- A semi-automatic workflow is recommended: the tool proposes linkages, the annotator reviews and corrects mistakes.
- Each linked set of center points defines one microtubule centerline in 3D.

### If sparse annotation was used

Interpolate between marked points with a cubic spline to produce a center point at every slice the microtubule passes through.

## Step 4: Local Tangent Vector Computation

From each 3D centerline, compute the local tangent vector at every point.

### Method

At each centerline point at slice `z`, the local tangent is the normalized finite difference using a small neighborhood window:

```
tangent(z) = normalize( centerpoint(z + k) - centerpoint(z - k) )
```

- Use a window half-width of `k = 2–4` slices. This smooths out annotation noise while preserving real curvature.
- At the ends of a centerline (within `k` slices of the first/last point), use one-sided differences:
  - Start: `tangent(z) = normalize( centerpoint(z + k) - centerpoint(z) )`
  - End: `tangent(z) = normalize( centerpoint(z) - centerpoint(z - k) )`
- The resulting tangent vector should be normalized to unit length.

### Sign convention

Because filament orientation is bidirectional (no preferred polarity), the sign of the tangent vector is arbitrary. The loss function handles this with sign-invariant comparison. For consistency in the annotation data, one convention can be adopted (e.g., always orient vectors so that `dz >= 0`), but this is optional since the loss is invariant to sign flips.

## Step 5: Painting Vectors onto the Voxel Mask

Transfer the centerline tangent vectors to all voxels belonging to each microtubule in the class label volume.

### Method

For each voxel labeled as microtubule (class 2) in the class label volume:

1. Find the nearest centerline point (typically this is simply the centerline point at the same Z slice for the same microtubule — since microtubules are thin, most mask voxels are very close to the centerline).
2. Assign that centerline point's tangent vector to the voxel in the direction volume.

For non-filament voxels (background, cell body), the direction volume contains zeros. These voxels are masked out during loss computation and carry no directional meaning.

## Output Format

| File | Shape | Dtype | Description |
|---|---|---|---|
| `labels.npy` (or similar) | `(Z, Y, X)` | `int` | Class label per voxel |
| `directions.npy` (or similar) | `(Z, Y, X, 3)` | `float32` | Unit tangent vector `(dx, dy, dz)` per voxel; `(0, 0, 0)` for non-filament voxels |

## Summary of Annotation Workflow

```
1. Paint class labels (existing tool, no changes)
       ↓
2. Paint center points per microtubule per slice (modified tool)
       ↓
3. Link center points across slices → 3D centerlines (tool-assisted, semi-automatic)
       ↓
4. Compute local tangent vectors along each centerline (automatic)
       ↓
5. Assign tangent vectors to all microtubule voxels (automatic)
       ↓
6. Export class volume + direction volume
```

Steps 3–6 should be fully or nearly fully automatic once center points are marked.
