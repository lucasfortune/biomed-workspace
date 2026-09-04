---
id: segcleanup.step1.segmentation
title: Selecting a Segmentation
category: data
module: segcleanup
tags:
  - segcleanup
  - input
  - segmentation
  - annotations
  - voxel-size
seeAlsoManual:
  - segcleanup
  - segcleanup.step2.painting
  - segcleanup.step2.quantification
seeAlsoTags:
  - input
  - segmentation
---

# Selecting a Segmentation

Pick the labeled stack you want to edit and measure. The module reads the stack's classes and shape before opening the editor.

## Compatible Data Sources

- Segmentation Results: label maps from U-Net inference, and prior cleanup outputs

- Annotation Masks: annotation uploads tagged as annotations, and completed annotations from the Annotation Tool

- Test Data: the built-in annotation test stack

## File Requirements

- Format: multi-page TIFF (.tif, .tiff)

- Pixel Values: integer class labels (0 = background, non-zero = classes)

- Must contain at least one labeled (non-zero) class

## Class Chips

Once a file is selected, each detected class is shown as a chip with its color, its value, and an approximate voxel count. This confirms the classes the editor will load before you continue.

## Voxel-Size Hint

If the file has no voxel size set, a hint notes that quantification will report voxel counts only. Set the voxel size through the file browser's file info dialog to get physical volume and surface-area units.

## Image Underlay

When the segmentation's lineage points to a grayscale origin image, that image is resolved automatically and used as the underlay in the editor. The selected-file summary names the underlay when one is found. It is optional — editing works without it.
