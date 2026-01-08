---
id: segmentation.config.patches-per-image
title: Patches per Image
displayTitle: Patches per Image (Segmentation)
category: parameter
module: segmentation
tags:
  - segmentation
  - training
  - patches
  - configuration
  - dataset
seeAlsoManual:
  - segmentation.config.patch-size
  - segmentation.config.batch-size
seeAlsoTags:
  - training
  - dataset
parameterImpact: |
  More patches increase training data diversity but also training time. Start with 50 patches per image. Increase for complex images with many different structures, decrease for simpler images.
---

# Patches per Image

Number of random patches extracted from each training image.

This parameter controls how many patches are randomly sampled from each image in your training set during dataset creation.

More patches per image means a larger training dataset, which can improve model performance but increases training time. Fewer patches trains faster but may not capture all the variability in your images.
