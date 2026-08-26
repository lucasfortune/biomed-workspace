---
id: denoising-dl.step3.overview
title: Run Denoising
category: process
module: denoising-dl
tags:
  - denoising
  - training
  - progress
seeAlsoManual:
  - denoising-dl.step3.n2v
  - denoising-dl.step3.autostructn2v
seeAlsoTags:
  - training
  - progress
---

# Run Denoising

Train the denoising model on your images. The training process directly produces denoised images.

Unlike segmentation where training and inference are separate, denoising training directly produces your results. During training, the model learns noise patterns and simultaneously denoises your input images.

For autoStructN2V, the run pauses seconds after start to show the discovered noise mask and routing decision. You approve (or adjust) before any training time is spent.

## What happens during training

1. Patches are extracted from your images

2. Pixels are masked (randomly for N2V, following the approved mask for StructN2V)

3. The network learns to predict masked pixels from context

4. This learned prediction removes noise from the full images

## When training completes

- Your images have been denoised

- A trained model is saved for processing additional images

- Step 4 (Inference) is optional; use it only if you have more images to process

Tip: You can start viewing results as soon as training completes. Step 4 is only needed to denoise additional images not included in training.
