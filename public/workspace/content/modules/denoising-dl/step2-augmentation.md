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
  Reduces overfitting on the N2V branch. The StructN2V branch keeps it off in every preset to avoid rotating directional noise.
---

# Data Augmentation

Apply random transformations to training patches to improve generalization.

Data augmentation artificially expands the training set by applying random transformations to patches during training. It is a checkbox under **Advanced Options**, and the presets set it differently for each branch.

## Preset defaults

- N2V branch: on in every preset

- StructN2V branch: off in every preset

The StructN2V branch keeps augmentation off on purpose: rotating or flipping a patch would rotate the directional noise structure too, breaking the alignment between the patch and its discovered structural mask.

## Transformations applied

- Random rotations (90°, 180°, 270°)

- Horizontal and vertical flips

## Benefits

- Helps the model generalize to different orientations

- Reduces overfitting on small datasets

## Recommendations

- Leave augmentation on for the N2V branch

- Leave it off for the StructN2V branch, matching the presets

Note: Augmentation does not affect the noise measurement or mask discovery in autoStructN2V, which happen on the raw stack before training.
