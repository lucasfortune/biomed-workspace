---
id: segmentation.config.lambda-dir
title: Lambda Dir (Direction Loss Weight)
category: parameter
module: segmentation
tags:
  - segmentation
  - training
  - direction
  - loss
  - configuration
seeAlsoManual:
  - segmentation.config.alpha
  - segmentation.step1.mode
seeAlsoTags:
  - training
  - configuration
  - direction
parameterImpact: |
  Higher values make the model prioritize accurate direction prediction at the potential cost of segmentation quality. Lower values focus on segmentation accuracy. Default 0.3 provides a good balance.
---

# Lambda Dir (Direction Loss Weight)

Controls the balance between segmentation loss and direction prediction loss in the combined training objective. This parameter is only active during direction-aware 2.5D training with filament annotations.

## What It Does

The total training loss is computed as:

L_total = L_seg + lambda_dir * L_dir

Where L_seg is the segmentation cross-entropy loss and L_dir is the direction prediction loss (cosine similarity loss between predicted and ground-truth direction vectors). Lambda Dir scales how strongly the direction loss contributes to the total.

## Why It Matters

The direction-aware U-Net has two output heads: one for segmentation masks and one for local direction vectors. Both heads are trained simultaneously, but the two loss components may have different magnitudes. Lambda Dir lets you balance their contributions so neither task dominates the training signal.

## Recommended Values

- 0.0: Ignore direction loss entirely (direction head still exists but is not trained)
- 0.1-0.2: Mild direction supervision
- 0.3 (default): Balanced segmentation and direction training
- 0.5-1.0: Stronger emphasis on direction accuracy
- Values above 1.0 are rarely beneficial

Start with the default value of 0.3. If the model's direction predictions are inaccurate (visible in the output direction volume), try increasing to 0.5. If segmentation quality suffers, reduce the value.
