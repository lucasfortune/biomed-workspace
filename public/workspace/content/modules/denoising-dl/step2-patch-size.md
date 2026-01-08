---
id: denoising-dl.step2.patch-size
title: Patch Size
displayTitle: Patch Size (DL Denoising)
category: parameter
module: denoising-dl
tags:
  - denoising
  - patch
  - configuration
seeAlsoManual:
  - denoising-dl.step2.patches-per-image
  - denoising-dl.step2.batch-size
seeAlsoTags:
  - configuration
  - patches
parameterImpact: |
  Larger patches capture more context but require more memory. For random noise, smaller patches (32-64) work well. For structured noise, try larger patches (64-128).
---

# Patch Size

Size of image patches used for training the denoising network.

During training, small square patches are extracted from your images. The patch size determines the dimensions of these regions.

## Smaller patches (32x32)

- Train faster with less memory

- Good for fine-grained noise

- May miss larger noise patterns

## Larger patches (64-128)

- Capture more context

- Better for structured noise with larger periods

- Require more GPU memory

## Recommendations

- Start with 32 or 64 for most images

- Use larger patches if noise has visible structure spanning many pixels

- Reduce if you encounter memory errors
