# Direction-Aware U-Net Segmentation for Electron Tomography

## Problem

Standard U-Net segmentation of cytoskeletal structures (microtubules, flagella) in electron tomography data suffers from **anisotropic resolution** caused by the **missing wedge effect**. Resolution in the Z direction is significantly degraded, leading to orientation-dependent segmentation quality:

- Structures running perpendicular to the image plane (along Z) appear well-resolved in each XY slice and segment reliably.
- Structures running parallel to the image plane (in XY) are smeared across slices and segment poorly.

A standard per-voxel classification loss treats all microtubule voxels equally, but they are not equal from the network's perspective due to this directional resolution bias.

## Core Idea

Extend the existing U-Net from pure semantic segmentation to a **joint segmentation-and-orientation prediction** framework using **multi-task learning**.

Each voxel in the annotation data carries two pieces of information:

1. **Class label** (integer): background, cell body, microtubule (and later flagellum).
2. **Direction vector** (3D unit vector): the local tangent direction of the filamentous structure at that voxel. Only defined for filament classes; zero/masked for all other classes.

The network has **two output heads** sharing a common encoder-decoder backbone:

- **Segmentation head**: predicts per-voxel class probabilities — shape `(Z, Y, X, num_classes)`.
- **Direction head**: predicts a per-voxel 3D vector — shape `(Z, Y, X, 3)`.

## Why This Helps

1. **Auxiliary task regularization**: Predicting orientation forces the encoder to learn features that capture local geometry, not just texture. This improves the shared feature representations and benefits segmentation quality overall.

2. **Orientation-weighted segmentation loss**: Using ground-truth direction vectors, we can assign higher segmentation loss weights to voxels where filaments run parallel to the imaging plane (where the missing wedge hurts most). This directly targets the primary failure mode.

3. **Direction-aware post-processing**: At inference time, predicted orientation vectors enable anisotropic smoothing along filament direction or orientation-dependent threshold adjustments.

## Current Classes

- **Background** (0)
- **Cell body** (1)
- **Microtubules** (2)

## Future Classes

- **Flagellum**: Fits naturally into the same framework as another filament class with its own segmentation label and orientation vectors. Flagella are thicker composite structures with potentially more curvature, but a per-voxel unit vector still captures local direction adequately.

## Data Representation

Two separate annotation volumes (the "two-volume approach"):

| Volume | Shape | Dtype | Content |
|---|---|---|---|
| Class labels | `(Z, Y, X)` | Integer | Class ID per voxel |
| Direction vectors | `(Z, Y, X, 3)` | Float | Unit vector `(dx, dy, dz)` per voxel; zeros for non-filament voxels |

This is cleaner than a combined volume because class labels are integers and direction vectors are floats.

## Architecture Overview

- The existing U-Net encoder-decoder is kept intact.
- A second output head branches off the decoder (at or near the final layer).
- The segmentation head outputs class logits.
- The direction head outputs a 3-component vector per voxel, L2-normalized to unit length before loss computation.
- Both heads are trained jointly with a combined loss function.

## Training Strategy

- Combined loss: `L_total = L_segmentation + λ × L_direction`
- The direction loss is masked to only apply at filament voxels.
- The segmentation loss is weighted by orientation: voxels with filaments running parallel to the imaging plane receive higher weight.
- `λ` (direction loss weight) starts at 0.1–0.5 and is tuned based on training dynamics.
