---
id: mesh.step1.segmentation-data
title: Segmentation Data Selection
category: data
module: mesh
tags:
  - mesh
  - input
  - segmentation
  - annotations
seeAlsoManual:
  - mesh
  - mesh.step2.output-options
seeAlsoTags:
  - input
  - segmentation
---

# Segmentation Data Selection

Select the segmented image stack to convert into a 3D mesh. Use results from segmentation inference or annotation masks.

## Compatible Data Sources

- Segmentation Results: Output from U-Net inference (Recent Results section)

- Annotation Masks: Completed annotations from the Annotation Tool

- Uploaded Files: Any labeled TIFF stack with class values

## File Requirements

- Format: Multi-page TIFF (.tif, .tiff)

- Pixel Values: Integer class labels (0=background, 1-255=classes)

- Bit Depth: 8-bit recommended (16-bit supported but converted)

## Class Detection

The system automatically detects unique class values in your data and allows you to generate meshes for all classes or select specific ones.

Note: Background pixels (value 0) are excluded from mesh generation. Only non-zero class values produce surfaces.
