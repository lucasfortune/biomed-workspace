---
id: segmentation.step2
title: Training Configuration
category: process
module: segmentation
tags:
  - segmentation
  - configuration
  - training
  - parameters
  - workflow
seeAlsoManual:
  - segmentation.config.patch-size
  - segmentation.config.num-layers
  - segmentation.step3
seeAlsoTags:
  - training
  - configuration
---

# Training Configuration

Set the parameters that control how your U-Net model is built and trained before starting a run.

Step 2 groups the settings into three sections:

Dataset Configuration: Patch size, patches per image, batch size, and whether to apply data augmentation. These control how training patches are sampled from your images.

Model Architecture: Number of features and number of layers, which define the size and depth of the U-Net.

Training Parameters: Learning rate and number of epochs, which govern the optimization process.

## Real-time validation

Fields are checked as you edit them. In particular, the patch size is validated against your image dimensions and the chosen number of layers, so incompatible combinations are flagged inline before you can advance. Defaults (patch size 64, batch size 8, 64 features, 4 layers, learning rate 1e-3, 100 epochs) are chosen to work for most biomedical stacks.

When you continue, your configuration is saved and you move on to Step 3 to start training.
