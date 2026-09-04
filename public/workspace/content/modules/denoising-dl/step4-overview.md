---
id: denoising-dl.step4.overview
title: Process Additional Data
category: process
module: denoising-dl
tags:
  - denoising
  - inference
  - additional-data
seeAlsoManual:
  - denoising-dl.step4.data
  - denoising-dl.step3.overview
seeAlsoTags:
  - inference
  - additional-data
---

# Process Additional Data

Apply your trained model to denoise additional images beyond the original training data.

Step 4 is optional. If your only goal was to denoise the images you uploaded in Step 1, you're done — those images were denoised during training.

## Use Step 4 when

- You have additional images from the same experiment

- You want to process more data without retraining

- You're batch processing a large dataset

## Model Information

At the top of the step, a **Model Information** card summarizes the model that will be applied — its source (Trained Model or Imported Model), the method (N2V or autoStructN2V), and the training ID or imported model details.

## How it works

1. Select additional TIFF images to process

2. Press Process Data — the trained model denoises them (no training occurs)

3. When it finishes, the denoised result is saved to your workspace. Use **Open in Image Viewer** to inspect it, or **Start New Run** to process another stack.

There is no separate download button; results are workspace files you open in the Image Viewer. This is much faster than training since the model just applies what it already learned.
