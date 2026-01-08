---
id: segmentation.config.patch-size
title: Patch Size
displayTitle: Patch Size (Segmentation)
category: parameter
module: segmentation
tags:
  - segmentation
  - training
  - patch
  - configuration
seeAlsoManual:
  - segmentation.config.batch-size
seeAlsoTags:
  - training
  - configuration
parameterImpact: |
  Larger values capture more context but require more memory and training time. Smaller values train faster but may miss large structures. Typical values range from 64 to 256 pixels.
---

# Patch Size

Controls the size of image patches extracted during training.

The patch size determines the dimensions of square image regions used to train the network. During training, random patches of this size are extracted from your training images.

Smaller patches (e.g., 64x64) train faster and use less memory, but may miss larger structures in your images.

Larger patches (e.g., 256x256) capture more context and can better segment large structures, but require more GPU memory and train more slowly.
