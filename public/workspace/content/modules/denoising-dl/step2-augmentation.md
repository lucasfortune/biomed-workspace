---
id: denoising-dl.step2.augmentation
title: Data Augmentation
displayTitle: Data Augmentation (DL Denoising)
category: parameter
module: denoising-dl
tags:
  - denoising
  - augmentation
  - training
  - configuration
seeAlsoManual:
  - denoising-dl.step2.patch-size
  - denoising-dl.step2.patches-per-image
seeAlsoTags:
  - configuration
  - training
parameterImpact: |
  Generally improves results by reducing overfitting. Keep enabled unless you have a specific reason to disable.
---

# Data Augmentation

Apply random transformations to training patches to improve model generalization.

Data augmentation artificially expands the training dataset by applying random transformations to image patches during training.

## Transformations applied

- Random rotations (90°, 180°, 270°)

- Horizontal and vertical flips

## Benefits

- Helps the model generalize to different orientations

- Reduces overfitting on small datasets

- Improves robustness to image orientation

## When to enable

- Most cases benefit from augmentation

- Especially helpful with smaller training datasets

## When to disable

- autoStructN2V Stage 1: Disabled by default because augmentation can interfere with structural noise pattern detection

- If your images have a specific required orientation

Note: For autoStructN2V, augmentation is only available in Stage 2 (advanced options) after the noise pattern has been detected.
