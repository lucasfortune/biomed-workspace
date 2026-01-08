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

## How it works

1. Select additional TIFF images to process

2. The trained model denoises them (no training occurs)

3. Download or view the denoised results

This is much faster than training since the model just applies what it already learned.
