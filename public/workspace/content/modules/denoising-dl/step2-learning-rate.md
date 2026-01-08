---
id: denoising-dl.step2.learning-rate
title: Learning Rate
displayTitle: Learning Rate (DL Denoising)
category: parameter
module: denoising-dl
tags:
  - denoising
  - training
  - learning-rate
  - optimization
seeAlsoManual:
  - denoising-dl.step2.batch-size
  - denoising-dl.step2.epochs
seeAlsoTags:
  - training
  - optimization
parameterImpact: |
  Higher rates train faster but risk instability. Lower rates are more stable but slower. 1e-4 is a safe default.
---

# Learning Rate

Controls how quickly the model adapts during training.

The learning rate determines the step size when updating model weights. This is one of the most important hyperparameters.

## Too high

- Training may diverge (loss increases or oscillates)

- Model fails to converge

## Too low

- Very slow training

- May get stuck in poor solutions

## Available options

- 1e-5: Very conservative, stable

- 5e-5: Good for fine-tuning

- 1e-4: Standard default, works well for most cases

- 2e-4: Faster training, slightly less stable

## Recommendations

- Start with 1e-4 (the default)

- Reduce to 1e-5 if training is unstable

- Stage 2 of autoStructN2V often benefits from a lower rate
