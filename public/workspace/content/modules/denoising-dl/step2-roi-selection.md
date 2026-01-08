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
  Improves training efficiency by focusing on meaningful content. Keep enabled unless your images have uniform content.
---

# ROI Selection

Filter training patches to focus on regions with meaningful content.

ROI (Region of Interest) Selection filters out patches that contain mostly background or empty space, focusing training on informative regions.

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
