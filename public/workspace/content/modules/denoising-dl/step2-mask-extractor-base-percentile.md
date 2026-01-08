---
id: denoising-dl.step2.mask-extractor.base-percentile
title: Base Percentile
category: parameter
module: denoising-dl
tags:
  - denoising
  - autostructn2v
  - mask-extractor
  - threshold
seeAlsoManual:
  - denoising-dl.step2.mask-extractor.adaptive
  - denoising-dl.step2.mask-extractor.percentile-decay
seeAlsoTags:
  - mask-extractor
  - autostructn2v
parameterImpact: |
  Lower values detect more patterns but risk false positives. Start with 50% and adjust based on mask preview.
---

# Base Percentile

The percentile threshold for detecting noise pattern peaks in the Fourier residuals.

Base Percentile sets the sensitivity for detecting structural noise patterns in the frequency domain analysis.

## How it works

- After Stage 1, residuals are analyzed in Fourier space

- Peaks above this percentile threshold are identified as structured noise

- Lower percentile = more sensitive (detects weaker patterns)

- Higher percentile = less sensitive (only strong patterns)

## Values (30-70)

- 30-40%: Very sensitive, may detect subtle patterns but risk false positives

- 50% (Default): Balanced detection

- 60-70%: Conservative, only detects prominent patterns

## Recommendations

- Start with default (50%)

- Decrease if the mask seems to miss visible noise patterns

- Increase if the mask includes too many false detections

Note: When Adaptive Thresholding is enabled, this serves as the starting point that gets adjusted based on pattern strength.
