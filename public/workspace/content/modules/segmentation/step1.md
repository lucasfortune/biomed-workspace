---
id: segmentation.step1
title: Data Upload (Step 1)
category: process
module: segmentation
tags:
  - segmentation
  - upload
  - workflow
  - training-data
  - annotations
seeAlsoManual:
  - segmentation
  - segmentation.training-data
seeAlsoTags:
  - upload
  - annotations
---

# Data Upload (Step 1)

Upload training images and annotations, or import a pretrained model to skip training.

In Step 1, you have two workflow options:

Train New Model: Upload your training images (TIFF stack) and corresponding annotation masks. The annotation masks should have the same dimensions as your training images, with each pixel value representing a class label (0 for background, 1+ for objects).

Use Pretrained Model: Import a previously trained model (.pth file) along with its configuration (.json file) to skip directly to inference.
