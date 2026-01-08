---
id: denoising-dl.step3.autostructn2v
title: autoStructN2V Training Process
category: process
module: denoising-dl
tags:
  - denoising
  - autostructn2v
  - training
  - two-stage
seeAlsoManual:
  - denoising-dl.autostructn2v-detail
  - denoising-dl.step3.loss
  - denoising-dl.step1.mode
seeAlsoTags:
  - autostructn2v
  - training
---

# autoStructN2V Training Process

Two-stage training with automatic structured noise detection and removal.

autoStructN2V training has three phases:

Stage 1: Initial N2V Training

Standard N2V training removes random noise. This produces an intermediate result where structured noise may still be visible.

Mask Extraction & Review

## After Stage 1

- The system analyzes residual noise patterns

- A mask showing detected structure is generated

- You can review and adjust the mask before proceeding

- Options: Approve mask, regenerate with different settings, or skip Stage 2

Stage 2: Structure-Aware Training

A second model is trained using the noise mask. Masking follows the detected noise structure, teaching the network to specifically remove those patterns.

2.5D Mode Differences:

In 2.5D mode, the mask becomes 3-dimensional, capturing noise correlations across consecutive slices. The mask visualization shows three tabs (Z-1, Z center, Z+1) so you can inspect each slice's pattern before approving.

## What to expect

- Total training time is roughly 2x single-stage N2V

- Stage 1 and Stage 2 can have different configurations

- The mask review step requires your input before Stage 2 begins

- Final results combine both stages for optimal noise removal
