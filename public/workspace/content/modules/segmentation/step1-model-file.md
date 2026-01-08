---
id: segmentation.step1.model-file
title: Model Weights File
displayTitle: Model Weights File (Segmentation)
category: data
module: segmentation
tags:
  - segmentation
  - import
  - model
  - pretrained
  - weights
seeAlsoManual:
  - segmentation.step1.config-file
  - segmentation.step1.workflow-choice
seeAlsoTags:
  - import
  - pretrained
---

# Model Weights File

Select the PyTorch model weights file (.pth) containing your trained U-Net model.

The model weights file (.pth) contains the learned parameters of your trained U-Net model. This is the actual "knowledge" the model acquired during training.

## File Requirements

- Format: PyTorch state dictionary (.pth)

- Must be paired with the matching configuration file (.json) from the same training session

## Where to find it

After training completes, the best-performing model is saved as 'best_model.pth' in your training results folder. This is the model checkpoint with the lowest validation loss during training.

## Important Notes

- Always use the best_model.pth file, not intermediate checkpoints

- The model file and config file must come from the same training run

- Model files can be shared between users as long as the matching config file is included
