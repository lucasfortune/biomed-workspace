---
id: segmentation
title: U-Net Segmentation Module
category: module
module: segmentation
tags:
  - segmentation
  - u-net
  - deep-learning
  - training
  - inference
seeAlsoManual:
  - segmentation.step1
  - segmentation.step1.workflow-choice
seeAlsoTags:
  - training
  - inference
---

# U-Net Segmentation Module

Train and run U-Net segmentation models on biomedical images. This module provides a complete pipeline from data upload through training to inference.

The U-Net Segmentation module provides a 4-step workflow for training deep learning models to segment biomedical images.

U-Net is a convolutional neural network architecture designed specifically for biomedical image segmentation. It uses an encoder-decoder structure with skip connections that preserve spatial information, making it particularly effective at segmenting objects in microscopy images.

Step 1: Select one or more training pairs (a raw stack with its annotation mask), or choose to use a pretrained model if you already have one. Only labelled slices are used, so partially annotated stacks train correctly.

Step 2: Configure training parameters like patch size, batch size, learning rate, and number of epochs. These settings control how the model learns from your data.

Step 3: Monitor training progress with real-time loss charts and Dice score metrics. Watch for convergence and potential overfitting.

Step 4: Run inference on new images using your trained model to generate segmentation masks. Correct a result in the Annotation module and train again to improve the model.
