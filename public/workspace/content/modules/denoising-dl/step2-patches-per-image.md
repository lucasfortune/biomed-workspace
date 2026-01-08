---
id: denoising-dl.step2.patches-per-image
title: Patches per Image
displayTitle: Patches per Image (DL Denoising)
category: parameter
module: denoising-dl
tags:
  - denoising
  - patches
  - dataset
  - configuration
seeAlsoManual:
  - denoising-dl.step2.patch-size
  - denoising-dl.step2.batch-size
seeAlsoTags:
  - configuration
  - dataset
parameterImpact: |
  More patches provide better coverage of image content but increase training time proportionally. Balance based on image diversity and available time.
---

# Patches per Image

Number of random patches extracted from each image slice for training.

This controls how many training examples are generated from each image in your stack. More patches mean more training data.

## Fewer patches (50-100)

- Faster dataset creation and training

- May not capture all variations in the image

- Good for quick experiments

## More patches (200-500)

- More comprehensive coverage of image variations

- Longer training time

- Better for images with diverse content

## Recommendations

- 100 patches is a good starting point

- Increase if your images have varied content

- Decrease for quick testing or limited compute time
