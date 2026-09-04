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
seeAlsoTags:
  - n2v
  - training
---

# N2V Training Process

Single training run for removing random, uncorrelated noise.

## N2V training is a straightforward process

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

## What to expect

- Training typically takes 5-30 minutes depending on data size and GPU

- Loss should decrease steadily during training

- Results are available immediately when training completes

Note: When autoStructN2V routes to the N2V branch, this same process runs; the only difference from forced N2V is that the noise was measured first.

## Reference

Krull, A., Buchholz, T.-O., & Jug, F. (2019). Noise2Void - Learning Denoising From Single Noisy Images. In 2019 IEEE/CVF Conference on Computer Vision and Pattern Recognition (CVPR), 2124-2132. DOI: 10.1109/cvpr.2019.00223
