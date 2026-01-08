---
id: segmentation.config.augmentation
title: Data Augmentation
displayTitle: Data Augmentation (Segmentation)
category: parameter
module: segmentation
tags:
  - segmentation
  - training
  - augmentation
  - configuration
  - dataset
seeAlsoManual:
  - segmentation.config.patches-per-image
seeAlsoTags:
  - training
  - dataset
parameterImpact: |
  Enable augmentation to improve model generalization, especially with limited training data. Disable only if your images require very specific orientations or if augmentation causes artifacts.
---

# Data Augmentation

Apply random transformations to training images to improve model robustness.

Data augmentation applies random transformations (rotations, flips, brightness/contrast changes) to training patches during training. This artificially increases training data diversity and helps the model generalize better to new images.

Augmentation is especially useful when you have limited training data. The transformations are applied on-the-fly during training, so your original images are not modified.
