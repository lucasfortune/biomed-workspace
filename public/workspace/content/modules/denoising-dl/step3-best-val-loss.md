---
id: denoising-dl.step3.best-val-loss
title: Best Validation Loss
category: metric
module: denoising-dl
tags:
  - denoising
  - training
  - validation
  - metrics
seeAlsoManual:
  - denoising-dl.step3.loss
  - denoising-dl.step2.early-stopping
seeAlsoTags:
  - metrics
  - validation
---

# Best Validation Loss

The lowest validation loss achieved during training — indicates the best model checkpoint.

During training, the model checkpoint with the lowest validation loss is automatically saved. This "best" model is used for producing your final denoised images.

## Why Best Val Loss Matters

- Validation loss measures performance on unseen data

- The epoch with lowest validation loss typically produces the best denoising quality

- Later epochs might overfit, making the early "best" checkpoint superior

## What the number means

- Lower is better

- Typical values depend on your data and noise level

- Compare relative values within your training run, not across different datasets

## How it's used:

- The model checkpoint at this loss value is saved

- This checkpoint denoises your images when training completes

- If you download the model, you get this best checkpoint
