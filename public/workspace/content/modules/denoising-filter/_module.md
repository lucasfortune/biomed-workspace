---
id: denoising-filter
title: Filter-Based Denoising
category: module
module: denoising-filter
tags:
  - denoising
  - filter
  - gaussian
  - nlm
  - noise-reduction
seeAlsoManual:
  - denoising-filter.step1.input
  - denoising-filter.step2.methods
seeAlsoTags:
  - denoising
  - filter
---

# Filter-Based Denoising

Remove noise from TIFF image stacks using traditional filtering methods: Gaussian smoothing or Non-Local Means (NLM) denoising.

Filter-based denoising applies mathematical filters to reduce noise in your images. These methods are fast and don't require training data.

## Available Methods

Gaussian Filter

Applies a weighted average based on distance from each pixel. Fast and simple, but may blur edges.

- Best for: Uniform, random noise

- Speed: Very fast

- Trade-off: More smoothing = more blur

Non-Local Means (NLM)

Compares similar patches across the image to reduce noise while preserving edges.

- Best for: Structured images with important edges

- Speed: Slower than Gaussian

- Trade-off: Better edge preservation but computationally intensive

## Workflow

1. Select Image: Choose a TIFF stack to denoise

2. Configure: Select method and adjust parameters

3. Process: Apply denoising and view results
