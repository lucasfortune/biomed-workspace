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

## Runs that start from a model

When Step 2 names a starting point, the status line shows the extra stages: loading the model first (a zoo model is downloaded on first use), and, for a bioimage.io parent, writing the fine-tuned package and running its self-test after the last epoch. The package is then selected for Step 4 and listed under Model Files; a run that continued from a workspace `.pth` model produces a new `.pth` model as usual.

## Which slices take part

When the run starts, the progress panel states how many labelled slices it trains on, out of how many slices in total, and how many of them are held back for validation. Unlabelled slices are skipped. After each epoch the model is scored on the validation slices, and the checkpoint with the best validation Dice is the one you keep; there is no separate test split.
