---
id: denoising-dl.step3.n2v
title: N2V Training Process
category: process
module: denoising-dl
tags:
  - denoising
  - n2v
  - training
  - single-stage
seeAlsoManual:
  - denoising-dl.step3.loss
  - denoising-dl.step3.best-val-loss
  - denoising-dl.step1.mode
seeAlsoTags:
  - n2v
  - training
---

# N2V Training Process

Single-stage training for removing random, uncorrelated noise.

## N2V training is a straightforward single-stage process

1. Dataset Preparation

Patches are extracted from your images according to your configuration (patch size, patches per image).

2. Training Loop

For each epoch, the network processes all patches:

- Random pixels are masked based on mask percentage

- Network predicts masked pixel values from surrounding context

- Loss measures prediction accuracy

- Weights are updated to improve predictions

3. Validation

After each epoch, performance is evaluated on held-out patches. This validation loss guides early stopping.

4. Denoising

Once trained, the model processes your full images to produce denoised results.

2.5D Mode Differences:

In 2.5D mode, the network takes 3 consecutive slices as input and predicts the center slice. This uses inter-slice context for better denoising of volumetric data. Boundary slices are copied from the original.

## What to expect

- Training typically takes 5-30 minutes depending on data size and GPU

- Loss should decrease steadily during training

- Results are available immediately when training completes

## Reference

Krull, A., Buchholz, T.-O., & Jug, F. (2019). Noise2Void - Learning Denoising From Single Noisy Images. In 2019 IEEE/CVF Conference on Computer Vision and Pattern Recognition (CVPR), 2124–2132. DOI: 10.1109/cvpr.2019.00223
