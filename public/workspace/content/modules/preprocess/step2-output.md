---
id: preprocess.step2.output
title: Output
category: parameter
module: preprocess
tags:
  - preprocess
  - dtype
  - bit-depth
  - output
  - progress
seeAlsoManual:
  - preprocess
  - preprocess.step2.intensity
  - preprocess.step1.stack
seeAlsoTags:
  - dtype
  - preprocess
---

# Output

Set how the preprocessed stack is written, name it, and save it as a new workspace file. The original is never modified.

## Data Type

Choose the bit depth of the written stack:

- keep: keep the input's data type. Integer stacks keep their type and are written across that type's full range; float stacks stay as 32-bit float in the range 0 to 1.

- 8-bit: convert to unsigned 8-bit (0 to 255).

- 16-bit: convert to unsigned 16-bit (0 to 65535).

## File Name

- The "file name" field sets the output name; it defaults to the input name with a `_ppd` suffix.

- The name is sanitized and a .tif extension is added automatically.

## Saving and Progress

Click "Save as New File" to start. The progress panel shows status and a progress bar. If a global intensity scan is needed it reports "Scanning intensity range" first (see below), then reports each slice as it is processed.

When the run completes, a success panel shows the output path and size (dimensions, slice count, and data type) and offers two actions:

- Open in Image Viewer: opens the new stack in the Image Viewer module.

- Start New Run: clears the selection and returns to the Select Stack step.

The new file is tracked with lineage back to the input (including the crop origin), and the file list refreshes so the result is available to other modules.

## When a Global Intensity Scan Happens

To convert intensities consistently across the whole stack, the module may first scan it to find a global minimum and maximum. This scan runs when any of these is true:

- An intensity operation is active (window, gamma other than 1, or invert), or

- The output data type is not "keep", or

- Downscaling is active.

The scan is skipped when you have set an explicit window; in that case the window you chose is used directly. During a scan, the progress panel shows "Scanning intensity range". The scan covers the kept, cropped region only.
