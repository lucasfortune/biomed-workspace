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

- Size: Can be any dimensions — the model processes images in patches

## Best Practices

- Use images acquired under similar conditions to your training data (same microscope, magnification, staining)

- The model performs best on images similar to what it was trained on

- Very different image characteristics (brightness, contrast, resolution) may reduce accuracy

- You can run inference on images of any size — large images just take longer to process

## Output

The segmentation results will be saved as a TIFF stack with the same dimensions as your input, where each pixel value indicates the predicted class.
