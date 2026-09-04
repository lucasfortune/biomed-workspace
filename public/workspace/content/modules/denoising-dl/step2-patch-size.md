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
  Larger patches capture more context but need more memory. The N2V branch defaults to 64, the StructN2V branch to 128.
---

# Patch Size

Size of the square image patches used for training.

During training, small square patches are extracted from your images. This dropdown lives under **Advanced Options**, and its default and choices depend on the branch.

## The control

- N2V branch: default 64, options 32, 48, 64, 96, 128

- StructN2V branch: default 128, options 32, 48, 64, 96, 128, 256

The StructN2V branch defaults larger so the structural mask has enough spatial context around each pixel.

## Smaller patches

- Train faster with less memory

- Good for fine-grained noise

## Larger patches

- Capture more context

- Better for structured noise with larger periods

- Require more GPU memory

## Validation

The patch size is checked live against your image and the network geometry:

- It cannot exceed the smaller image dimension. Options larger than your image are disabled automatically.

- The extract size (patch size + 32 pixels of overlap-tile padding) must be divisible by 4. An invalid value is flagged and the Next button is blocked until it is corrected.

## Recommendations

- Keep the branch default (64 for N2V, 128 for StructN2V)

- Reduce it if you hit memory errors or your images are small
