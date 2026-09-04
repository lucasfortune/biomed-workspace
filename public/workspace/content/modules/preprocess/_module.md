---
id: preprocess
title: Preprocessing Module
category: module
module: preprocess
tags:
  - preprocess
  - crop
  - downscale
  - intensity
  - lineage
seeAlsoManual:
  - preprocess.step1.stack
  - preprocess.step2.crop
  - preprocess.step2.geometry
  - preprocess.step2.intensity
  - preprocess.step2.output
seeAlsoTags:
  - preprocess
  - intensity
---

# Preprocessing Module

Prepare a grayscale image stack for the rest of the pipeline: crop it, trim its slice range, flip or rotate it, downscale it, adjust its intensity, and convert its bit depth. Every operation is optional.

The Preprocessing module reads a single image stack, lets you configure a set of operations while previewing intensity changes on the current slice, and writes the result as a new workspace file. The original stack is never modified.

## Key Features

- Non-destructive: the result is saved as a new tracked file; the input is left untouched

- Fixed, predictable operation order so results are reproducible

- Live intensity preview on the current slice, with a crop rectangle drawn as an overlay

- Lineage tracking that links the output back to the input, including the crop origin

- Voxel size inherited from the input and rescaled when you downscale

## Operation Order

Operations always run in the same fixed order, regardless of the order you set them in the interface:

1. Crop (xy rectangle, in original coordinates)

2. Z-range trim (keep a contiguous slice range)

3. Flip (horizontal, then vertical)

4. Rotate (90 / 180 / 270 degrees)

5. Downscale (mean binning)

6. Intensity (window / gamma / invert)

7. Data-type conversion (output bit depth)

## Lineage and Voxel Size

- The output file records a lineage entry linking it to the input file.

- When a crop or z-range is applied, the crop origin (x, y, z) is stored on the lineage. The stitching module uses this to prefill its recipe.

- Voxel size is carried over from the input. When you downscale, the xy voxel size is multiplied by the downscale factor.

## Workflow

1. Select Stack: Pick a grayscale stack (raw upload or processing result)

2. Adjust: Configure crop, z-range, geometry, intensity, and output type

3. Apply: Review the summary and write the preprocessed stack as a new file
