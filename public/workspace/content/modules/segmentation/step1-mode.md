---
id: segmentation.step1.mode
title: 2D / 2.5D Mode
category: configuration
module: segmentation
tags:
  - segmentation
  - mode
  - 2.5D
  - configuration
seeAlsoManual:
  - segmentation.config.context-slices
seeAlsoTags:
  - segmentation
  - training
  - configuration
---

# 2D / 2.5D Mode

Choose between standard 2D segmentation and volumetric 2.5D segmentation. This toggle controls how the U-Net model processes your image stack.

## 2D Mode

In 2D mode, the model processes each slice independently. A single 2D image is fed as input and the model predicts a segmentation mask for that slice alone. This is the default mode and works well for most use cases.

## 2.5D Mode

In 2.5D mode, the model receives multiple adjacent slices as input channels, providing volumetric context around each target slice. For example, with 3 input slices, the model sees the slice above, the target slice, and the slice below. This helps the model understand 3D structure without the full memory cost of true 3D segmentation.

2.5D mode is particularly useful for:

- Structures that span multiple slices and benefit from z-axis context
- Improving segmentation consistency between adjacent slices
- Direction-aware training with filament annotations

## Direction-Aware Training

When 2.5D mode is active and filament annotations (with direction data) are provided, the model automatically enters direction-aware training. In this mode, the U-Net has a dual output head: one for segmentation masks and one for predicting local orientation vectors. This enables the model to learn both what structures look like and which direction they run.

## When to Use Each Mode

Use 2D mode when your structures are clearly visible within individual slices and do not require inter-slice context, or when you want faster training with lower memory usage.

Use 2.5D mode when your structures are thin or oriented along the z-axis, when slice-to-slice consistency matters, or when you have filament annotations and want direction-aware segmentation.
