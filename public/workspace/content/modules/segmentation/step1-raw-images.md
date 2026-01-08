---
id: segmentation.step1.raw-images
title: Raw Training Images
category: data
module: segmentation
tags:
  - segmentation
  - upload
  - training-data
  - tiff
  - images
seeAlsoManual:
  - segmentation.step1.annotations
  - segmentation.step1
seeAlsoTags:
  - upload
  - training-data
---

# Raw Training Images

Upload your raw microscopy images as a TIFF stack for training the segmentation model.

Raw training images are the microscopy images you want the model to learn to segment. These should be representative examples of the type of data you will later run inference on.

## File Requirements

- Format: TIFF stack (multi-page TIFF with multiple slices)

- Bit depth: 8-bit or 16-bit grayscale (16-bit will be automatically normalized)

- Dimensions: Must match your annotation images exactly (same width, height, and number of slices)

## Best Practices

- Include diverse examples that cover the range of conditions in your data (different staining intensities, object sizes, background variations)

- More training images generally lead to better model generalization

- Ensure images are properly focused and representative of your typical acquisition conditions

- The model will learn patterns from these images, so include examples of all the structures you want to segment
