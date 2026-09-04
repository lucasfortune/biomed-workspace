---
id: segmentation.config.num-layers
title: Number of Layers
displayTitle: Number of Layers (Segmentation)
category: parameter
module: segmentation
tags:
  - segmentation
  - training
  - architecture
  - configuration
  - model
seeAlsoManual:
  - segmentation.config.num-features
  - segmentation.config.patch-size
seeAlsoTags:
  - architecture
  - model
parameterImpact: |
  4 layers is the standard U-Net depth (allowed range 2-6). Use fewer for small images or limited memory. Use more for very large images where global context matters. Match to your image size.
---

# Number of Layers

Depth of the U-Net encoder/decoder structure.

This sets how many encoding/decoding stages the U-Net has (between 2 and 6, default 4). Each encoding stage downsamples the image by half, while each decoding stage upsamples back to the original resolution.

More layers allow the model to capture larger-scale context but increase memory usage and training time. Fewer layers create a shallower model that may miss global patterns but trains faster.

## Effect on patch and image size

Because each layer halves the resolution, the depth constrains the sizes the network can accept. The patch extract size during training, and the smallest slice dimension during inference, must be divisible by 2 to the power of the number of layers. Increasing the layer count therefore requires larger, more strictly sized inputs.
