---
id: segmentation.step4.inference-data
title: Inference Data
category: data
module: segmentation
tags:
  - segmentation
  - inference
  - upload
  - input
  - tiff
seeAlsoManual:
  - segmentation.step4
  - segmentation.step1.raw-images
seeAlsoTags:
  - inference
  - upload
---

# Inference Data

Upload the images you want to segment using your trained model.

Inference data are the new images you want to segment. The model will apply what it learned during training to generate segmentation masks for these images.

## File Requirements

- Format: TIFF stack (multi-page TIFF)

- Bit depth: Should match your training data (8-bit or 16-bit grayscale)

- Size: The smallest slice dimension must be between 32 and 4096 pixels, and divisible by 2 to the power of the model's number of layers (for example, 16 for a 4-layer model). Each slice is segmented whole rather than in patches, so dimensions that do not divide evenly will cause a shape mismatch.

## Best Practices

- Use images acquired under similar conditions to your training data (same microscope, magnification, staining)

- The model performs best on images similar to what it was trained on

- Very different image characteristics (brightness, contrast, resolution) may reduce accuracy

- The module runs a pre-flight check on your stack and shows a warning banner if the dimensions are not compatible with the model's depth

## Output

The segmentation results will be saved as a TIFF stack with the same dimensions as your input, where each pixel value indicates the predicted class.
