---
id: segmentation.config.context-slices
title: Input Slices
category: parameter
module: segmentation
tags:
  - segmentation
  - training
  - context
  - 2.5D
  - configuration
seeAlsoManual:
  - segmentation.step1.mode
  - segmentation.config.patch-size
seeAlsoTags:
  - training
  - configuration
parameterImpact: |
  More slices provide richer volumetric context but increase memory usage and training time. 3 slices is a good default. Increase to 5 or 7 only if structures require broader z-context.
---

# Input Slices

Controls the number of adjacent slices used as input channels in 2.5D mode. This parameter determines how much volumetric context the model sees around each target slice.

## Available Values

- 3 slices (default): The target slice plus one slice above and one below. Good balance of context and efficiency.

- 5 slices: The target slice plus two slices in each direction. Provides broader context for structures that change gradually across slices.

- 7 slices: The target slice plus three slices in each direction. Maximum context, useful for very thick or slowly changing structures.

## How It Works

The input slices form a context window centered on the target slice. At stack boundaries, slices are reflected (mirrored) to maintain the window size, so every slice in the stack can be segmented regardless of its position.

Each context slice becomes an input channel to the U-Net, similar to how an RGB image has 3 channels. The model learns to combine information from all context slices to produce the segmentation for the center slice.

## Memory and Performance

More input slices increase the number of input channels, which increases memory usage for the first convolutional layer. If you encounter out-of-memory errors, try reducing the input slices or the patch size.

Training time per epoch increases slightly with more input slices due to the larger input tensor size.
