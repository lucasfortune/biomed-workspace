---
id: segmentation.step4
title: Running Inference
category: process
module: segmentation
tags:
  - segmentation
  - inference
  - prediction
  - output
seeAlsoManual:
  - segmentation.step4.inference-data
  - segmentation.step3
seeAlsoTags:
  - inference
  - output
---

# Running Inference

Apply your trained model to new images to generate segmentation masks.

Inference is the process of using your trained model to segment new images that weren't part of the training data. Unlike training, inference only involves the forward pass — no learning occurs.

## How it works

1. Your input image is processed slice by slice

2. Each slice is divided into overlapping patches

3. The model predicts a segmentation mask for each patch

4. Overlapping predictions are blended together for smooth results

5. The final segmentation mask is saved as a TIFF stack

The output segmentation mask has the same dimensions as your input and contains integer values corresponding to class labels (0 for background, 1+ for detected objects).

Inference is much faster than training since no gradient computation or weight updates are needed.
