---
id: denoising-dl
title: Deep Learning Denoising
category: module
module: denoising-dl
tags:
  - denoising
  - deep-learning
  - n2v
  - autostructn2v
  - self-supervised
seeAlsoManual:
  - denoising-dl.step1.method
  - denoising-dl.step1.mode
  - denoising-dl.autostructn2v-detail
seeAlsoTags:
  - denoising
  - training
---

# Deep Learning Denoising

Remove noise from TIFF image stacks using self-supervised deep learning methods that require no clean reference images.

Deep learning denoising uses neural networks trained directly on your noisy images — no clean training data required. This is possible through self-supervised learning techniques.

## Available Methods

Noise2Void (N2V)

A fast single-stage method ideal for random, uncorrelated noise like Gaussian or Poisson noise commonly found in microscopy images. N2V works by training a network to predict masked pixels from their surroundings.

autoStructN2V

A two-stage approach for structured noise patterns like scan lines, periodic artifacts from tomography, or camera-specific patterns. Stage 1 trains standard N2V, then analyzes residuals to detect noise patterns. Stage 2 uses these patterns to better preserve real structures while removing noise.

## Workflow

1. Select Method & Data: Choose your denoising method and upload images

2. Configure: Adjust training parameters or use presets

3. Training: Train the model (images are denoised during training)

4. Inference (Optional): Apply the model to additional images
