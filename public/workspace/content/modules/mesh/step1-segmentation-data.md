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

- Uploaded Files: Any labeled integer TIFF stack

## File Requirements

- Format: Multi-page TIFF (.tif, .tiff)

- Pixel Values: Integer class labels (0 = background, non-zero = classes)

- Data Type: An integer type - uint8, uint16, uint32, int8, int16, or int32. The data is used as-is; no bit-depth conversion is applied.

## Validation

When you select a file, it is checked before you can continue. A file is rejected if:

- No class labels can be read from it

- Only background is present (no object classes)

- More than 50 unique values are found (this looks like raw image data, not discrete labels)

- The data type is not one of the supported integer types

If a freshly uploaded file fails these checks, it is automatically removed from your workspace so it does not clutter the file list.

## Class Detection

The system automatically detects the unique class values in your data. In the next step you can generate meshes for all classes at once or for a single class.

Note: Background pixels (value 0) are excluded from mesh generation. Only non-zero class values produce surfaces.
