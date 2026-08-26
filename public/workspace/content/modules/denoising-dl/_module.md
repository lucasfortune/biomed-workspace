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
  - denoising-dl.autostructn2v-detail
  - denoising-dl.routing-decision
seeAlsoTags:
  - denoising
  - training
---

# Deep Learning Denoising

Remove noise from TIFF image stacks using self-supervised deep learning methods that require no clean reference images.

Deep learning denoising uses neural networks trained directly on your noisy images, with no clean training data required. This is possible through self-supervised learning techniques.

## Available Methods

autoStructN2V (auto-routed)

The recommended method. Before any training, the noise is measured on background regions of your raw stack (this takes seconds). If the noise has usable directional structure (scan lines, streaks, detector patterns), training uses StructN2V with an automatically discovered mask. If not, training falls back to plain N2V. You review the discovered mask and the routing decision before training starts.

Noise2Void (N2V)

Plain blind-spot training with a single-pixel mask. Choose this to skip noise measurement entirely, for example when you know your noise is random and uncorrelated (Gaussian, Poisson).

## Workflow

1. Select Method & Data: Choose your denoising method and upload images

2. Configure: Adjust training parameters or use presets

3. Training: Review the discovered mask and route (autoStructN2V), then one model trains (images are denoised during training)

4. Inference (Optional): Apply the model to additional images
