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

When you select a file, the system validates it and displays information about the image dimensions, number of slices, and data type. This helps confirm you've selected the correct file before viewing.
