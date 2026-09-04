---
id: preprocess.step2.geometry
title: Geometry
category: process
module: preprocess
tags:
  - preprocess
  - flip
  - rotate
  - downscale
  - voxel-size
seeAlsoManual:
  - preprocess
  - preprocess.step2.crop
  - preprocess.step2.intensity
seeAlsoTags:
  - downscale
  - preprocess
---

# Geometry

Flip, rotate, and downscale the stack. These operations are not shown in the live preview; they apply when the output is written.

## Flip

- Flip horizontal and flip vertical are independent checkboxes.

- When both are set, the horizontal flip is applied before the vertical flip.

## Rotate

Rotation is a single choice, in 90-degree steps:

- none

- 90 degrees clockwise

- 180 degrees

- 90 degrees counter-clockwise (shown as 90 ccw)

A 90 or 270 degree rotation swaps the width and height of the output.

## Downscale

Downscale reduces the xy resolution using mean binning (each output pixel is the average of a block of input pixels):

- none

- 2x (bins 2x2 blocks)

- 4x

- 8x

Downscaling averages over blocks, so it also reduces noise. Slice count (z) is not affected.

## Effect on Voxel Size

Downscaling changes the physical size each pixel represents. The xy voxel size is multiplied by the downscale factor and stored on the output file (for example, a 2x downscale doubles the xy voxel spacing). If the input has no voxel size set, none is added. The Apply summary shows the rescaled xy voxel size when downscaling is active.
