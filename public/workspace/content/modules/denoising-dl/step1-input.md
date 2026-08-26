---
id: denoising-dl.step1.input
title: Input Image Stack
displayTitle: Input Image Stack (DL Denoising)
category: data
module: denoising-dl
tags:
  - denoising
  - input
  - tiff
  - upload
seeAlsoManual:
  - denoising-dl.step1.workflow
  - denoising-dl.step2.mask-extractor.bg-side
  - denoising-dl
seeAlsoTags:
  - input
  - upload
---

# Input Image Stack

Select the noisy TIFF image stack you want to denoise.

Your input images are used both for training the denoising model and as the data to be denoised. Unlike supervised methods, no clean reference images are needed.

## File Requirements

- Format: Multi-page TIFF (.tif, .tiff)

- Bit Depth: 8-bit or 16-bit grayscale

- Content: Images with noise to be removed

For autoStructN2V:

The noise measurement runs on background regions selected automatically from the raw stack, so your images should contain some background (resin, embedding medium, or empty areas). You tell the extractor which intensity side the background is on (see Background Side).

## Data Sources

- Workspace Files: TIFF stacks from your workspace

- Test Data: Built-in noisy images for testing the module

## Tips for Best Results

- Include multiple slices if available, as more data generally improves the model

- Images should be representative of all the data you want to denoise

- The model learns noise patterns from these images, so ensure they contain typical noise for your acquisition setup
