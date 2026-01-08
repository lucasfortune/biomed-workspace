---
id: denoising-dl.step1.mode
title: 2D vs 2.5D Processing Mode
category: configuration
module: denoising-dl
tags:
  - denoising
  - 2.5d
  - volumetric
  - mode
  - triplet
seeAlsoManual:
  - denoising-dl.step1.method
  - denoising-dl.step1.input
  - denoising-dl.autostructn2v-detail
seeAlsoTags:
  - 2.5d
  - volumetric
---

# 2D vs 2.5D Processing Mode

Choose between 2D (slice-by-slice) or 2.5D (volumetric triplet) processing for your TIFF stacks.

Processing Mode determines how the network uses spatial context from your image stack.

2D Mode (Default)

Each slice is processed independently. The network sees only a single 2D image at a time.

## Best for

- Images where noise is independent between slices

- Stacks with fewer than 20 slices

- When inter-slice correlation is not important

- Faster processing with lower memory requirements

2.5D Mode

Processes triplets of consecutive slices (z-1, z, z+1) to predict the center slice. The network leverages inter-slice context for better denoising.

## Best for

- Volumetric data with correlated structures across slices

- EM tomography and confocal microscopy stacks

- Noise patterns that span multiple slices

- When preserving 3D structural continuity is important

## Requirements for 2.5D:

- Minimum 20 slices in the stack

- Slices should be spatially contiguous (not random samples)

- More GPU memory required (3x input channels)

## How 2.5D Works:

The network takes 3 consecutive slices as input and predicts only the center slice. This sliding window approach processes the entire stack while using neighboring slice information. Boundary slices (first and last) are copied from the original since they lack full triplet context.

For autoStructN2V in 2.5D:

The structural noise mask becomes 3-dimensional, capturing noise correlations across the triplet. The mask visualization shows three tabs (Z-1, Z center, Z+1) so you can inspect each slice's pattern.
