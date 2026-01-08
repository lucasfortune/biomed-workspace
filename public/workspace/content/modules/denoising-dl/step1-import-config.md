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

- Stage configurations for autoStructN2V

## Where to find it

Configuration files are saved automatically when training completes. Look in your downloads or workspace for files from previous training sessions.

Important: Using mismatched config and model files will cause errors. Always use files from the same training run.
