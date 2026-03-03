---
id: segmentation.config.alpha
title: Alpha (Orientation Weight)
category: parameter
module: segmentation
tags:
  - segmentation
  - training
  - direction
  - loss
  - configuration
seeAlsoManual:
  - segmentation.config.lambda-dir
  - segmentation.step1.mode
seeAlsoTags:
  - training
  - configuration
  - direction
parameterImpact: |
  Higher alpha values increase emphasis on correctly segmenting filaments that run along the z-axis. A value of 0 disables orientation weighting entirely. Default 1.0 works well for most cases.
---

# Alpha (Orientation Weight)

Controls the orientation-based weighting in the segmentation loss function. This parameter is only active during direction-aware 2.5D training with filament annotations.

## What It Does

Alpha adjusts how much the training loss penalizes errors on filament voxels based on their local orientation. Specifically, the per-voxel loss weight for filament regions is calculated as:

weight = 1 + alpha * (1 - |dz|)

Where |dz| is the absolute z-component of the direction vector at that voxel. Filament segments running perpendicular to the z-axis (low |dz|) receive higher weight, while segments running parallel to z (high |dz|) receive lower additional weight.

## Why It Matters

Filaments that run mostly within a single slice (perpendicular to z) are harder to segment because they appear as thin cross-sections. By weighting these regions more heavily, the model is encouraged to pay extra attention to the most challenging orientations.

## Recommended Values

- 0.0: No orientation weighting (standard cross-entropy loss)
- 1.0 (default): Moderate orientation weighting
- 2.0-5.0: Strong orientation weighting for datasets where in-plane filaments are poorly segmented
- Values above 5.0 are rarely needed

Start with the default value of 1.0 and increase only if you observe that in-plane filaments are being missed by the model.
