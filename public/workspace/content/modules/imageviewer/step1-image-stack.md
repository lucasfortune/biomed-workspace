---
id: imageviewer.step1.image-stack
title: Image Stack Selection
category: data
module: imageviewer
tags:
  - imageviewer
  - upload
  - tiff
  - file-selection
  - comparison
seeAlsoManual:
  - imageviewer
  - imageviewer.step2.ui-controls
seeAlsoTags:
  - upload
  - tiff
---

# Image Stack Selection

Select the TIFF image stack you want to view. Choose from workspace files or results from other processing modules.

## Data Sources

- Workspace Files: TIFF stacks uploaded to your workspace

- Segmentation Results: View output from U-Net segmentation inference

- Denoising Results: View output from N2V or filter-based denoising

## File Requirements

- Format: Multi-page TIFF (.tif, .tiff)

- Bit Depth: 8-bit or 16-bit grayscale

- Dimensions: Any size (large files may load slower)

- Channels: Single channel (grayscale)

## Validation

When you select a file, the system validates it and displays the image dimensions, number of slices, and data type. This helps confirm you've selected the correct file before viewing.

## Compare Stacks

To compare stacks, select a validated file and click "Add selected to comparison". Repeat to build a list of two to four stacks. Each entry shows its name, dimensions, and slice count, and can be removed with its × button.

- With two or more stacks listed, the Next button reads "Next: Compare N Stacks" and opens the side-by-side comparison view.

- Leave the list empty (or add just one stack) to view a single stack normally.
