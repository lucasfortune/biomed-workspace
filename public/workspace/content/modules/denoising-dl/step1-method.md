---
id: denoising-dl.step1.method
title: Denoising Methods
displayTitle: Denoising Methods (DL Denoising)
category: configuration
module: denoising-dl
tags:
  - denoising
  - n2v
  - autostructn2v
  - method-selection
seeAlsoManual:
  - denoising-dl
  - denoising-dl.autostructn2v-detail
  - denoising-dl.step1.mode
seeAlsoTags:
  - method-selection
---

# Denoising Methods

Choose between N2V for random noise or autoStructN2V for structured noise patterns.

Noise2Void (N2V)

Best for: Random, uncorrelated noise (Gaussian, Poisson)

Speed: Fast single-stage training

Use when: Your noise appears as random pixel variations without visible patterns

autoStructN2V

Best for: Structured noise patterns (scan lines, periodic artifacts)

Speed: Slower two-stage training with interactive mask review

Use when: You can see repeating patterns, lines, or systematic artifacts in your noise

Not sure which to choose?

Start with N2V — it works well for most microscopy images. If you notice the denoised result still has visible patterns or artifacts, try autoStructN2V.
