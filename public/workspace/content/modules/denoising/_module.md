---
id: denoising
title: Denoising Module
category: module
module: denoising
tags:
  - denoising
  - noise-reduction
  - image-processing
  - deep-learning
  - filter
seeAlsoManual:
  - denoising-dl
  - denoising-filter
seeAlsoTags:
  - denoising
  - noise-reduction
---

# Denoising Module

Remove noise from TIFF image stacks using either traditional filter-based methods or self-supervised deep learning approaches.

The Denoising module provides two complementary approaches for removing noise from microscopy images. Choose the method that best fits your noise type and requirements.

Deep Learning (N2V / autoStructN2V)

Self-supervised neural networks that learn noise patterns directly from your images — no clean reference data required.

- Noise2Void (N2V): Fast single-stage training for random, uncorrelated noise like Gaussian or Poisson noise

- autoStructN2V: Two-stage approach for structured noise patterns like scan lines or periodic artifacts

- Best for: Complex noise patterns, when you need optimal quality

- Trade-off: Requires training time (5-30 minutes typically)

Filter-Based (Gaussian / NLM)

Traditional mathematical filters that apply smoothing operations to reduce noise.

- Gaussian: Fast weighted averaging based on pixel distance

- Non-Local Means (NLM): Compares similar patches to preserve edges while denoising

- Best for: Quick results, simple noise patterns

- Trade-off: May blur fine details, less effective on structured noise

Which should I choose?

- Start with Filter-Based if you need quick results or have simple random noise

- Use Deep Learning for best quality, structured noise, or when filter methods leave artifacts

- Both methods work on multi-page TIFF stacks and preserve bit depth
