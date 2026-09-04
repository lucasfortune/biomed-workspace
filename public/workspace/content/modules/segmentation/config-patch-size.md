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
  - segmentation.config.num-layers
seeAlsoTags:
  - training
  - configuration
parameterImpact: |
  Larger values capture more context but require more memory and training time. Smaller values train faster but may miss large structures. Selectable options are 32, 48, 64, 96, 128, and 256 pixels.
---

# Patch Size

Controls the size of image patches extracted during training.

The patch size determines the dimensions of square image regions used to train the network. During training, random patches of this size are extracted from your training images. You choose from a fixed set of options: 32, 48, 64, 96, 128, or 256 pixels (64 is the default).

Smaller patches (e.g., 32 or 48) train faster and use less memory, but may miss larger structures in your images.

Larger patches (e.g., 128 or 256) capture more context and can better segment large structures, but require more GPU memory and train more slowly.

## Constraints

The field is validated in real time against two rules:

- The patch size cannot exceed the smallest dimension of your training images.

- The extract size (the patch plus the internal tiling padding) must be divisible by 2 to the power of the number of layers, so that the U-Net encoder and decoder line up. If a combination is invalid, the form shows an inline error before you can continue.
