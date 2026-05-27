---
id: denoising-dl.step2.roi-selection
title: ROI Selection
category: parameter
module: denoising-dl
tags:
  - denoising
  - roi
  - autostructn2v
  - stage1
  - advanced
seeAlsoManual:
  - denoising-dl.step2.patches-per-image
  - denoising-dl.autostructn2v-detail
seeAlsoTags:
  - autostructn2v
  - advanced
parameterImpact: |
  Improves training efficiency by focusing on meaningful content. Auto-enabled for autoStructN2V Stage 1 (required for mask-extractor quality); off for plain N2V.
---

# ROI Selection

Filter training patches to focus on regions with meaningful content.

ROI (Region of Interest) Selection filters out patches that contain mostly background or empty space, focusing training on informative regions.

## Auto-enabled for autoStructN2V Stage 1

When you select **autoStructN2V** as the denoising method, ROI is automatically enabled for Stage 1 regardless of the preset. This is required because Stage 1's residual autocorrelation feeds the mask extractor — concentrating patches on foreground regions produces a cleaner autocorrelation signal and a more reliable structural-noise kernel.

For **plain N2V** (single-stage), ROI is off by default. The validated N2V recipe expects uniformly sampled patches.

## How it works

- Each potential patch is analyzed for content

- Patches are scored based on variance/intensity

- Only patches above the threshold are used for training

## ROI Threshold

Controls how selective the filtering is (0.3 to 0.7).

- Lower values (0.3-0.4): Less selective, includes more patches

- Default (0.5): Balanced filtering

- Higher values (0.6-0.7): More selective, only high-content patches

## When to use

- Enable (default) when images have significant background/empty regions

- Helps focus model on actual structures rather than noise in empty areas

## When to disable

- If your images are densely packed with structures

- If you notice the model missing fine details in lower-intensity regions
