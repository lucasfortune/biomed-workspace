---
id: segmentation.step4
title: Running Inference
category: process
module: segmentation
tags:
  - segmentation
  - inference
  - prediction
  - output
seeAlsoManual:
  - segmentation.step4.inference-data
  - segmentation.step4.output-conversion
  - segmentation.step3
  - annotation.step1.source-image
seeAlsoTags:
  - inference
  - output
---

# Running Inference

Apply your trained model to new images to generate segmentation masks.

Inference is the process of using your trained model to segment new images that weren't part of the training data. Unlike training, inference only involves the forward pass — no learning occurs.

## How it works

1. Your input stack is processed one slice at a time

2. Each slice is passed through the model whole — inference does not tile images into patches

3. The model predicts a class for every pixel in the slice

4. The per-slice predictions are stacked back together

5. The final segmentation mask is saved as a TIFF stack

Because each slice is segmented as a whole image, the slice dimensions must be compatible with the model's depth: the smallest dimension has to be between 32 and 4096 pixels and divisible by 2 to the power of the number of layers. The module runs a pre-flight check and warns you before inference if a stack does not meet this requirement.

The output segmentation mask has the same dimensions as your input and contains integer values corresponding to class labels (0 for background, 1+ for detected objects).

Inference is much faster than training since no gradient computation or weight updates are needed.

## bioimage.io models

A bioimage.io model runs differently: each slice (or the whole stack, for a 3D model) is split into overlapping tiles of the size the model declares, the tiles are predicted and stitched back, so any slice size works. The model's channels are turned into class labels by the Output conversion rule shown above the Run button. On the first run the weights are downloaded; the progress line says so.

## After the run

- Open in Image Viewer shows the result next to the input stack.

- Correct in Annotation opens the result in the Annotation module as labels over the raw stack. Fix the prediction with brush, eraser and fill, then Create Annotation. The corrected annotation appears in the Annotations selector of Step 1 and can be trained on, together with your other pairs. Repeating this loop is usually the fastest way to improve a model.
