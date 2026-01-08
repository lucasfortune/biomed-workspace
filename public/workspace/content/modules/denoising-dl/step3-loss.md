---
id: denoising-dl.step3.loss
title: Loss Curves
displayTitle: Loss Curves (DL Denoising)
category: metric
module: denoising-dl
tags:
  - denoising
  - training
  - loss
  - metrics
seeAlsoManual:
  - denoising-dl.step3.best-val-loss
  - denoising-dl.step2.learning-rate
seeAlsoTags:
  - metrics
  - training
---

# Loss Curves

Loss measures how well the network predicts masked pixels — lower is better.

## The loss chart shows two curves

Training Loss (typically red/orange)

Error on the patches used for learning. Should decrease steadily as the model learns.

Validation Loss (typically blue/green)

Error on held-out patches not used for training. Shows how well the model generalizes.

## What to look for

## Healthy Training

Both curves decrease together, then flatten. A small gap between them is normal.

## Overfitting

Training loss keeps decreasing but validation loss starts rising. The model is memorizing training data. Early stopping will typically catch this.

## Underfitting

Both losses stay high and don't decrease much. Try longer training, larger model, or different learning rate.

## Instability

Losses jump around erratically. Try reducing learning rate or increasing batch size.

Note: Unlike segmentation, there's no Dice score for denoising. Loss is the primary metric — visual inspection of results is important.
