---
id: denoising-dl.step2.resize-conv
title: Resize Convolution
category: parameter
module: denoising-dl
tags:
  - denoising
  - architecture
  - upsampling
  - advanced
seeAlsoManual:
  - denoising-dl.step2.upsampling-mode
  - denoising-dl.step2.features
seeAlsoTags:
  - architecture
  - advanced
parameterImpact: |
  Affects output quality subtly. Default (enabled) is recommended for artifact-free denoising.
---

# Resize Convolution

Use resize-convolution instead of transposed convolution for upsampling in the U-Net decoder.

The U-Net architecture requires upsampling in its decoder pathway. This option controls how that upsampling is performed.

## Resize Convolution (Enabled - Default)

First resizes the feature maps using interpolation, then applies a convolution. This approach avoids checkerboard artifacts that can occur with transposed convolutions.

## Transposed Convolution (Disabled)

Uses learned upsampling through transposed (deconvolution) layers. Can produce sharper results but may introduce checkerboard patterns.

## Recommendations

- Keep enabled (default) for most cases

- The resize-convolution approach generally produces smoother, artifact-free results

- Only disable if you observe overly smooth results and want to experiment
