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
  - segmentation.step1.bioimageio
seeAlsoTags:
  - training
  - inference
---

# U-Net Segmentation Module

Train and run U-Net segmentation models on biomedical images. This module provides a complete pipeline from data upload through training to inference.

The U-Net Segmentation module provides a 4-step workflow for training deep learning models to segment biomedical images.

U-Net is a convolutional neural network architecture designed specifically for biomedical image segmentation. It uses an encoder-decoder structure with skip connections that preserve spatial information, making it particularly effective at segmenting objects in microscopy images.

Step 1: Select one or more training pairs (a raw stack with its annotation mask), choose a pretrained workspace model if you already have one, or pick a model from the bioimage.io model zoo. Only labelled slices are used, so partially annotated stacks train correctly.

Step 2: Choose the starting point (a new model, a workspace model to continue, or a bioimage.io model to fine-tune) and configure training parameters like patch size, batch size, learning rate, and number of epochs. These settings control how the model learns from your data.

Step 3: Monitor training progress with real-time loss charts and Dice score metrics. Watch for convergence and potential overfitting.

Step 4: Run inference on new images using your trained model to generate segmentation masks. bioimage.io models run tiled and their channels are converted to class labels by a rule you choose. Correct a result in the Annotation module and train again to improve the model.
