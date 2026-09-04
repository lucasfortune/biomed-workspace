---
id: denoising-dl.step4.data
title: Select Data to Process
category: data
module: denoising-dl
tags:
  - denoising
  - inference
  - input
  - additional-data
seeAlsoManual:
  - denoising-dl.step4.overview
  - denoising-dl.step1.input
seeAlsoTags:
  - inference
  - data
---

# Select Data to Process

Select additional images to denoise using your trained model.

When processing additional images, the trained model applies what it learned about noise patterns to new data.

## File Requirements

The file is validated the same way as the training input:

- Format: Multi-page TIFF (.tif, .tiff)

- Bit Depth: 8-bit or 16-bit grayscale. Float32/float64 data is accepted with a warning and normalized before processing.

- Minimum size: at least 64×64 pixels per slice

- Minimum slices: at least 10 slices

Within those limits the image is processed in patches, so larger stacks are fine.

## Critical Consideration

The model works best on images with the same noise characteristics as your training data. For optimal results:

- Use images from the same acquisition session

- Same microscope/camera settings

- Same sample preparation method

- Similar imaging conditions

If your new images have different noise patterns (different detector, different settings, etc.), the model may not perform as well. In that case, consider training a new model on the new data.

## What NOT to expect

A model trained on one type of noise won't effectively remove a different type of noise. Each noise source has unique characteristics the model must learn.
