---
id: denoising-dl.step2.mask-extractor.adaptive
title: Adaptive Thresholding
category: parameter
module: denoising-dl
tags:
  - denoising
  - autostructn2v
  - mask-extractor
  - threshold
seeAlsoManual:
  - denoising-dl.step2.mask-extractor.base-percentile
  - denoising-dl.autostructn2v-detail
seeAlsoTags:
  - mask-extractor
  - autostructn2v
parameterImpact: |
  Controls how aggressively noise patterns are detected. Keep enabled for automatic optimization.
---

# Adaptive Thresholding

Automatically adjust the noise detection threshold based on the detected pattern strength.

Adaptive Thresholding dynamically adjusts the noise detection sensitivity based on how strong the structured noise pattern is.

## How it works

- The mask extractor analyzes Fourier residuals to find periodic noise

- With adaptive thresholding enabled, the threshold adjusts based on signal strength

- Stronger patterns get tighter thresholds; weaker patterns get more lenient ones

## Enabled (Default)

- Automatically balances sensitivity

- Works well for most noise patterns

- Recommended for first attempts

## Disabled

- Uses fixed threshold based on Base Percentile

- More predictable but may miss weak patterns or over-detect strong ones

- Use if adaptive detection is catching too much or too little

## When to disable

- If the auto-detected mask includes too many false positives

- If you want precise manual control over detection sensitivity
