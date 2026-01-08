---
id: denoising-filter.step2.methods
title: Denoising Methods
displayTitle: Denoising Methods (Filter Denoising)
category: configuration
module: denoising-filter
tags:
  - denoising
  - gaussian
  - nlm
  - methods
seeAlsoManual:
  - denoising-filter.step2.gaussian
  - denoising-filter.step2.nlm
seeAlsoTags:
  - methods
  - configuration
---

# Denoising Methods

Choose between Gaussian smoothing for speed or Non-Local Means for better edge preservation.

Gaussian Filter

A classic smoothing filter that replaces each pixel with a weighted average of its neighbors. Weights decrease with distance following a Gaussian (bell curve) distribution.

## When to use

- Random, uniform noise (like camera sensor noise)

- When processing speed is important

- When some edge blurring is acceptable

Non-Local Means (NLM)

An advanced algorithm that finds similar patches throughout the image and averages them. This preserves edges better because similar structures are averaged together.

## When to use

- Structured images with important edges

- When edge preservation is critical

- When you can afford longer processing time
