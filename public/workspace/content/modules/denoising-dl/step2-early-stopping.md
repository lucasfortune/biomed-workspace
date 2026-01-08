---
id: denoising-dl.step2.early-stopping
title: Early Stopping
category: parameter
module: denoising-dl
tags:
  - denoising
  - training
  - early-stopping
  - convergence
seeAlsoManual:
  - denoising-dl.step2.epochs
  - denoising-dl.step3.loss
seeAlsoTags:
  - training
  - convergence
parameterImpact: |
  Early stopping saves time and can improve results by preventing overtraining. Patience controls sensitivity to temporary plateaus.
---

# Early Stopping

Automatically stop training when the model stops improving.

Early stopping monitors validation loss during training and stops when improvement stalls. This prevents wasted computation and can prevent overfitting.

## How it works

1. After each epoch, validation loss is calculated

2. If loss doesn't improve for 'patience' epochs, training stops

3. The best model (lowest validation loss) is saved

## Patience

The number of epochs to wait for improvement before stopping. Higher patience allows for temporary plateaus but may waste time.

## Recommendations

- Keep early stopping enabled (default)

- Patience of 10 works well for most cases

- Increase patience to 15-20 if training seems to stop too early
