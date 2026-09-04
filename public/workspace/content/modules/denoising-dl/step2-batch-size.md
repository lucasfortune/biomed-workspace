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
  Larger batches give more stable training but need more GPU memory. Reduce it if you hit memory errors.
---

# Batch Size

Number of patches processed together during each training step.

Batch size controls how many patches are processed simultaneously before the model weights are updated. The control differs between the two branches, because the StructN2V branch works on larger patches that consume more memory.

## N2V branch

- A dropdown with options 1, 2, 4, 8, 16, 32, 64, 128

- Default: 128

- The small 64×64 patches let many fit in memory at once

## StructN2V branch

- A numeric field accepting values from 1 to 256

- Default: 24

- The larger 128×128 patches need a smaller batch to fit in memory

## Smaller batches

- Use less GPU memory

- Can lead to noisier training gradients

## Larger batches

- More stable training gradients

- Require more GPU memory

## Recommendations

- Keep the preset default (128 for N2V, 24 for StructN2V)

- Reduce it if you see out-of-memory errors, especially when running on CPU or a small GPU
