---
id: denoising-dl.step2.overview
title: Configuration Overview
category: process
module: denoising-dl
tags:
  - denoising
  - configuration
  - parameters
  - presets
seeAlsoManual:
  - denoising-dl.step2.patch-size
  - denoising-dl.step2.epochs
seeAlsoTags:
  - configuration
  - parameters
---

# Configuration Overview

Configure training parameters using presets or customize individual settings.

The configuration step lets you control how the denoising model is trained. You can use presets for quick setup or customize individual parameters.

## Presets

- Fast: Quick training for testing, lower quality

- Balanced: Good trade-off for most use cases (recommended)

- High Quality: Best results, longer training time

## Parameter Groups

- Dataset Configuration: How training patches are extracted

- Model Architecture: Network size and complexity

- Training Parameters: Learning rate, epochs, early stopping

- Advanced Options: Fine-tuning options for experienced users

## For autoStructN2V

You'll see two columns — one for each training stage. Stage 1 and Stage 2 can have different settings to optimize each phase of the training process.
