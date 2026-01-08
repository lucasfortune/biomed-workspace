---
id: segmentation.step1.config-file
title: Model Configuration File
displayTitle: Model Configuration File (Segmentation)
category: data
module: segmentation
tags:
  - segmentation
  - import
  - config
  - pretrained
  - json
seeAlsoManual:
  - segmentation.step1.model-file
  - segmentation.step1.workflow-choice
seeAlsoTags:
  - import
  - pretrained
---

# Model Configuration File

Select the JSON configuration file that defines the architecture of your pretrained model.

The configuration file (.json) contains the architectural settings used when training the model. It must match the model weights file exactly — using mismatched files will cause errors.

## What the config file contains

- Number of input and output channels

- Number of feature maps at each layer

- Number of encoder/decoder layers

- Training parameters used (for reference)

## Where to find it

When you train a model, the configuration file is automatically saved alongside the model weights in the training results folder. Both files share the same training ID.

The configuration file ensures the model architecture is reconstructed exactly as it was during training. Without it, the system cannot correctly load the model weights.
