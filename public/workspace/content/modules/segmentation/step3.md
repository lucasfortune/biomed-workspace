---
id: segmentation.step3
title: Training Progress
category: process
module: segmentation
tags:
  - segmentation
  - training
  - progress
  - neural-network
  - optimization
seeAlsoManual:
  - segmentation.step3.loss-curves
  - segmentation.step3.dice-score
seeAlsoTags:
  - training
  - metrics
---

# Training Progress

Monitor your model as it learns to segment your images through iterative optimization.

During training, the model iteratively adjusts its internal parameters to better match your annotations. This process involves:

Forward Pass: The model processes training patches and produces predicted segmentation masks.

Loss Calculation: The predictions are compared to your annotations using a loss function that measures how different they are.

Backward Pass: The error is propagated back through the network to compute gradients — directions to adjust each parameter.

Weight Update: Parameters are adjusted in the direction that reduces the loss, controlled by the learning rate.

This cycle repeats for every batch of patches in each epoch. Over time, the loss should decrease as the model learns to produce predictions that match your annotations more closely.
