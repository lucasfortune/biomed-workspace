---
id: segmentation.step1.workflow-choice
title: Workflow Options
displayTitle: Workflow Options (Segmentation)
category: process
module: segmentation
tags:
  - segmentation
  - workflow
  - training
  - pretrained
  - import
seeAlsoManual:
  - segmentation.step1
  - segmentation.step1.raw-images
  - segmentation.step1.bioimageio
seeAlsoTags:
  - workflow
  - training
---

# Workflow Options

Choose between training a new model, importing a model trained here before, or running a bioimage.io model.

## You have three options for how to proceed with segmentation

Train from Scratch: Choose this option when you have training data (images with corresponding annotation masks) and want to train a new model specifically for your data. This is the best choice when your images have unique characteristics that differ from standard datasets, or when you need optimal accuracy for your specific use case. Training requires labeled examples but produces a model tailored to your data.

Use Pretrained Model: Choose this option when you already have a trained model (.pth file) and its configuration (.json file) from a previous training session. This allows you to skip the training process entirely and go directly to running inference. This is useful when you want to apply a previously trained model to new data, or when sharing models between team members.

Use a bioimage.io Model: Choose this option to run a published model from the bioimage.io model zoo, or an uploaded bioimage.io package, on your stack. Nothing is trained; the model is downloaded on first use and applied with tiled inference. This is the fastest way to a first segmentation of a common structure such as mitochondria or membranes, and its result can be corrected in the Annotation module and used to train a workspace model.
