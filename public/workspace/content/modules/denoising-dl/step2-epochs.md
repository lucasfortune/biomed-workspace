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
  More epochs allow better convergence. With early stopping enabled, a high value is safe — training stops once it stops improving.
---

# Number of Epochs

Maximum number of complete passes through the training data.

An epoch is one complete pass through all sampled training patches. This field sits in the **Training Budget** group, accepts values from 10 to 500 (step 10), and is the main knob the presets change.

## Preset budgets

The epoch count set by each preset depends on which branch trains:

- Fast: 50 (N2V branch) / 50 (StructN2V branch)

- Balanced: 200 (N2V branch) / 100 (StructN2V branch)

- High Quality: 400 (N2V branch) / 200 (StructN2V branch)

Fewer epochs train faster but may not fully converge; more epochs give a better chance of convergence at the cost of runtime.

## Early Stopping

When enabled, training stops automatically if the validation loss does not improve for several epochs (set by the patience value). This means you can set a high epoch count safely — training ends early once it converges.

## Recommendations

- Use the Balanced preset for most work

- Switch to High Quality for final results, or Fast for quick tests

- Leave early stopping on so the epoch count acts as a ceiling, not a fixed runtime
