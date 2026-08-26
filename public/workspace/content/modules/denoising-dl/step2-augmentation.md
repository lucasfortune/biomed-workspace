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

- If your images have a specific required orientation

Note: Augmentation does not affect the noise measurement or mask discovery in autoStructN2V, which happen on the raw stack before training.
