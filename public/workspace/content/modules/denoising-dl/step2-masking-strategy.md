---
id: denoising-dl.step2.masking-strategy
title: Masking Strategy
category: parameter
module: denoising-dl
tags:
  - denoising
  - n2v
  - masking
  - blind-spot
  - advanced
seeAlsoManual:
  - denoising-dl.step2.mask-percentage
  - denoising-dl.step3.n2v
seeAlsoTags:
  - n2v
  - advanced
parameterImpact: |
  Affects how the network learns to fill masked regions. Local Mean is safest; others are for experimentation.
---

# Masking Strategy

Choose how masked pixels are replaced during N2V training.

N2V training masks random pixels and predicts them from surrounding context. This parameter controls what value is used to replace masked pixels.

## Local Mean (Default - Strategy 0)

Masked pixels are replaced with the mean value of their local neighborhood. This provides the network with a reasonable initial guess without giving away the true value.

## Zeros (Strategy 1)

Masked pixels are set to zero. The network must predict from context with no hint about the pixel value. Can work well when noise has non-zero mean.

## Random (Strategy 2)

Masked pixels are replaced with random values from the image. Provides variety but can sometimes confuse the network.

## Recommendations

- Local Mean: Best for most microscopy images, especially with Gaussian-like noise

- Zeros: Try if your noise has a strong bias or you want stricter self-supervision

- Random: Experimental, try if other strategies don't work well
