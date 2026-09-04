---
id: preprocess.step3.apply
title: Apply
category: process
module: preprocess
tags:
  - preprocess
  - apply
  - output
  - progress
seeAlsoManual:
  - preprocess
  - preprocess.step2.output
  - preprocess.step1.stack
seeAlsoTags:
  - output
  - preprocess
---

# Apply

Review the operations you configured and write the preprocessed stack as a new workspace file.

## Summary

The summary lists the input, the resulting output dimensions, and each active operation (crop, kept slice range, flips, rotation, downscale, intensity window, gamma, invert, and data-type conversion). When downscaling is active and the input has a voxel size, it also shows the rescaled xy voxel size. If nothing is configured, the summary notes that the output would be an identical copy.

## Output Name

- The "Output name" field sets the file name; it defaults to "preprocessed".

- The name is sanitized and a .tif extension is added automatically. The file is saved as a new workspace result.

## Progress

Click "Apply" to start. The progress panel shows status and a progress bar. If a global intensity scan is needed it reports "Scanning intensity range" first, then reports each slice as it is processed.

## Result Actions

When the run completes, a success panel shows the output path and size (dimensions, slice count, and data type) and offers two actions:

- Open in Image Viewer: opens the new stack in the Image Viewer module.

- Start New Run: clears the selection and returns to the Select Stack step.

The new file is tracked with lineage back to the input (including the crop origin), and the file list refreshes so the result is available to other modules.
