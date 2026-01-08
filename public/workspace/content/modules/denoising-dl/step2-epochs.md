---
id: denoising-dl.step2.epochs
title: Number of Epochs
displayTitle: Number of Epochs (DL Denoising)
category: parameter
module: denoising-dl
tags:
  - denoising
  - training
  - epochs
  - duration
seeAlsoManual:
  - denoising-dl.step2.early-stopping
  - denoising-dl.step2.learning-rate
seeAlsoTags:
  - training
  - duration
parameterImpact: |
  More epochs allow better convergence. With early stopping enabled, you can set a high value and training will stop when optimal.
---

# Number of Epochs

Maximum number of complete passes through the training data.

An epoch is one complete pass through all training patches. More epochs give the model more opportunities to learn.

## Fewer epochs (30-50)

- Faster training

- Good for quick experiments

- May not fully converge

## More epochs (100-200)

- Better chance of convergence

- Early stopping prevents wasted time

- Recommended for final results

## Early Stopping

When enabled, training automatically stops if validation loss doesn't improve for several epochs (set by patience). This prevents overtraining and saves time.

## Recommendations

- Use 100 epochs with early stopping enabled

- The model will stop early if it converges sooner

- Use 50 epochs for quick tests
