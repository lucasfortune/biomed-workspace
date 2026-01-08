---
id: denoising-dl.step2.upsampling-mode
title: Upsampling Mode
category: parameter
module: denoising-dl
tags:
  - denoising
  - architecture
  - upsampling
  - interpolation
  - advanced
seeAlsoManual:
  - denoising-dl.step2.resize-conv
  - denoising-dl.step2.features
seeAlsoTags:
  - architecture
  - advanced
parameterImpact: |
  Minor effect on output quality. Bilinear is the safe default; only change if results seem too smooth or too blocky.
---

# Upsampling Mode

Choose the interpolation method used when upsampling feature maps in the decoder.

When Resize Convolution is enabled, this option determines which interpolation method is used to resize feature maps.

## Bilinear (Default)

Smooth interpolation using 4 nearest pixels. Good balance between quality and speed. Recommended for most cases.

## Nearest

Simple nearest-neighbor interpolation. Fastest but can produce blocky results. May be useful if you want to preserve sharp edges.

## Bicubic

Smoother interpolation using 16 neighboring pixels. Slightly slower but produces smoother gradients. May help with very high-frequency noise.

## Recommendations

- Bilinear: Default choice, works well for most microscopy data

- Nearest: Try if bilinear produces overly smooth results

- Bicubic: Try if you need extra smoothness or have high-frequency artifacts
