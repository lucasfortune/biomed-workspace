---
id: denoising-dl.step2.batch-size
title: Batch Size
displayTitle: Batch Size (DL Denoising)
category: parameter
module: denoising-dl
tags:
  - denoising
  - batch
  - memory
  - configuration
seeAlsoManual:
  - denoising-dl.step2.learning-rate
  - denoising-dl.step2.patch-size
seeAlsoTags:
  - configuration
  - memory
parameterImpact: |
  Larger batches provide more stable training but require more memory. If training seems unstable (erratic loss), try larger batches.
---

# Batch Size

Number of patches processed together during each training step.

Batch size controls how many patches are processed simultaneously before updating model weights.

## Smaller batches (1-4)

- Use less GPU memory

- Can lead to noisier training

- Necessary for limited GPU memory

## Larger batches (8-32)

- More stable training gradients

- Require more GPU memory

- Can train faster per epoch

## Recommendations

- Start with 4-8 and adjust based on GPU memory

- Reduce if you see memory errors

- Larger batches work better with larger learning rates
