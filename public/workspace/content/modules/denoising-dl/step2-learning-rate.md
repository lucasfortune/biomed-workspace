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
  Higher rates train faster but risk instability. Lower rates are more stable but slower. The validated default is 0.001.
---

# Learning Rate

Controls how quickly the model adapts during training.

The learning rate determines the step size when updating model weights. It lives under **Advanced Options** because the default is the validated publication value and rarely needs changing.

## The control

- A numeric field accepting values from 1e-6 to 0.01

- Default: 0.001 (used by every preset and by both the N2V and StructN2V branches)

## Too high

- Training may diverge (loss increases or oscillates)

- Model fails to converge

## Too low

- Very slow training

- May get stuck in poor solutions

## Recommendations

- Keep the default of 0.001 for most data

- Lower it (for example to 1e-4) if the loss curve is unstable

- Values are typed directly, so any number in the 1e-6 to 0.01 range is accepted
