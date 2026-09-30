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
  - segmentation.step1.training-pairs
  - segmentation.step1
seeAlsoTags:
  - upload
  - annotations
---

# Annotation Masks

Upload annotation masks that label the structures you want the model to segment.

Annotation masks are labeled versions of your training images where each pixel is assigned a class value. These teach the model what to segment. Each mask forms a training pair with its raw stack; several pairs can be combined in one run (see Training Pairs).

## Where masks come from

- Annotations created in the Annotation module or uploaded as TIFF masks

- Segmentation results: the output of an earlier inference run or of Segmentation Cleanup, listed under Recent Results. Correct a prediction in the Annotation module, then train on the corrected annotation.

## File Requirements

- Format: TIFF stack (multi-page TIFF)

- Bit depth: 8-bit or 16-bit (will be converted to 8-bit if needed)

- Dimensions: Must exactly match your raw images (same width, height, and number of slices)

## Pixel Values

- 0 = Background (areas not to segment)

- 1, 2, 3... = Object classes (each unique value represents a different class)

## Partially annotated stacks

Only slices that carry at least one labelled pixel are used for training; empty slices are skipped. You can annotate every fifth slice, or only the slices where a structure is visible, and train on those.

On a slice you did label, every unlabelled pixel counts as background. Label such a slice completely: unlabeled objects on it are learned as background.

## Annotation Guidelines

- Be consistent in how you label structures across all slices

- Ensure object boundaries are accurately traced

- Include examples of objects at different sizes, orientations, and positions

- Label all instances of structures you want to detect on the slices you include

- The quality of your annotations directly affects model accuracy
