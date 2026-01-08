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
  - denoising-dl.step1.workflow
seeAlsoTags:
  - import
  - model
---

# Model Weights File

Select the trained model weights file (.pth) for denoising.

The model weights file (.pth) contains the learned parameters from training. This is the actual "knowledge" the model acquired about noise patterns.

## For N2V

One model file is needed — the trained N2V model.

## For autoStructN2V

## Two model files are needed

- Stage 1 Model: The initial N2V model

- Stage 2 Model: The structure-aware model trained with the noise mask

## File Requirements

- Format: PyTorch state dictionary (.pth)

- Must be paired with the matching config file

## Where to find it

Model files are downloaded automatically when training completes. The files are named to indicate their purpose (e.g., stage1_model.pth, stage2_model.pth).
