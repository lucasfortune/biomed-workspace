---
id: denoising-dl.step2.mask-extractor.percentile-decay
title: Percentile Decay
category: parameter
module: denoising-dl
tags:
  - denoising
  - autostructn2v
  - mask-extractor
  - adaptive
seeAlsoManual:
  - denoising-dl.step2.mask-extractor.adaptive
  - denoising-dl.step2.mask-extractor.base-percentile
seeAlsoTags:
  - mask-extractor
  - autostructn2v
parameterImpact: |
  Fine-tunes adaptive detection behavior. Default works well; only adjust if mask preview shows issues.
---

# Percentile Decay

Controls how quickly the adaptive threshold relaxes when searching for noise patterns.

Percentile Decay determines how the detection threshold adjusts during adaptive analysis.

## How it works

- When searching for noise patterns, the algorithm may need to adjust sensitivity

- Decay rate controls how quickly the threshold changes

- Higher decay = faster adjustment = more aggressive detection

- Lower decay = slower adjustment = more conservative detection

## Values (1.0-1.3):

- 1.0: No decay (fixed threshold)

- 1.10-1.15: Moderate adjustment (recommended)

- 1.15 (Default): Good balance

- 1.20-1.30: Aggressive adjustment, may over-detect

## Recommendations

- Keep at default (1.15) for most cases

- Decrease toward 1.0 if mask includes too many patterns

- Increase if obvious patterns are being missed

Note: Only effective when Adaptive Thresholding is enabled.
