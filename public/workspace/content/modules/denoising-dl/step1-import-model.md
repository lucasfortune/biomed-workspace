---
id: denoising-dl.step1.import.model
title: Model Weights File
displayTitle: Model Weights File (DL Denoising)
category: data
module: denoising-dl
tags:
  - denoising
  - import
  - model
  - pth
seeAlsoManual:
  - denoising-dl.step1.import.config
  - denoising-dl.step1.mode
seeAlsoTags:
  - import
  - model
---

# Model Weights File

Select the trained model weights file (.pth) for denoising.

The model weights file (.pth) contains the learned parameters from training. This is the actual "knowledge" the model acquired about noise patterns.

## For N2V and current autoStructN2V

One model file is needed. Current autoStructN2V trainings produce a single model (whichever branch the router selected), saved together with its mask and route decision.

## For legacy two-stage autoStructN2V

Models trained with the previous version of this module come as a pair, and both files are needed:

- Stage 1 Model: The initial N2V model (e.g., stage1_model.pth)

- Stage 2 Model: The structure-aware model (e.g., stage2_model.pth)

Legacy 2.5D pairs are also supported; see the Legacy 2.5D Models article.

## File Requirements

- Format: PyTorch state dictionary (.pth)

- Must be paired with the matching config file

## Where to find it

Nothing is downloaded during training. The model file is saved into your workspace when training completes and appears among your recent results and in the file selector. The files are named to indicate their purpose.
