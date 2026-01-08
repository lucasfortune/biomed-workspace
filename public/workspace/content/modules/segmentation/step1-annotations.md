---
id: segmentation.step1.annotations
title: Annotation Masks
category: data
module: segmentation
tags:
  - segmentation
  - upload
  - annotations
  - labels
  - masks
seeAlsoManual:
  - segmentation.step1.raw-images
  - segmentation.step1
seeAlsoTags:
  - upload
  - annotations
---

# Annotation Masks

Upload annotation masks that label the structures you want the model to segment.

Annotation masks are labeled versions of your training images where each pixel is assigned a class value. These teach the model what to segment.

## File Requirements

- Format: TIFF stack (multi-page TIFF)

- Bit depth: 8-bit or 16-bit (will be converted to 8-bit if needed)

- Dimensions: Must exactly match your raw images (same width, height, and number of slices)

## Pixel Values

- 0 = Background (areas not to segment)

- 1, 2, 3... = Object classes (each unique value represents a different class)

## Annotation Guidelines

- Be consistent in how you label structures across all slices

- Ensure object boundaries are accurately traced

- Include examples of objects at different sizes, orientations, and positions

- Label all instances of structures you want to detect — unlabeled objects will be treated as background

- The quality of your annotations directly affects model accuracy
