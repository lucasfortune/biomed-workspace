---
id: denoising-dl.step1.import.config
title: Model Configuration File
displayTitle: Model Configuration File (DL Denoising)
category: data
module: denoising-dl
tags:
  - denoising
  - import
  - config
  - json
seeAlsoManual:
  - denoising-dl.step1.import.model
  - denoising-dl.step1.workflow
seeAlsoTags:
  - import
  - config
---

# Model Configuration File

Select the JSON configuration file from a previous training session.

The configuration file (.json) contains all the settings used during training, including model architecture and training parameters. It must match the model weights file exactly.

## What the config contains

- Method type (N2V or autoStructN2V)

- Model architecture (features, layers)

- Training parameters used

- For current autoStructN2V models: the trained branch (StructN2V or N2V) and its mask

- For legacy two-stage models: the stage configurations and processing mode (2D or 2.5D)

## Where to find it

Nothing is downloaded during training. The config file is saved into your workspace when training completes and appears among your recent results and in the file selector, so pick it from there.

Important: Using mismatched config and model files will cause errors. Always use files from the same training run.
