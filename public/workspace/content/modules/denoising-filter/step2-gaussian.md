---
id: denoising-filter.step2.gaussian
title: Gaussian Parameters
category: parameters
module: denoising-filter
tags:
  - denoising
  - gaussian
  - sigma
  - kernel
seeAlsoManual:
  - denoising-filter.step2.methods
seeAlsoTags:
  - gaussian
  - parameters
---

# Gaussian Parameters

Configure Gaussian filter strength with sigma and kernel size parameters.

Sigma (Standard Deviation)

Controls the spread of the Gaussian weights and thus the amount of smoothing.

- Range: 0.5 - 5.0

- Low values (0.5-1.0): Subtle smoothing, preserves more detail

- Medium values (1.5-2.5): Balanced noise reduction

- High values (3.0-5.0): Strong smoothing, may blur edges

Kernel Size

The size of the filter window in pixels. Must be odd.

- 3x3: Minimal smoothing, fast

- 5x5: Good balance (default)

- 7x7 to 11x11: Stronger smoothing for high noise

Tip: Start with sigma=1.5 and kernel=5x5, then adjust based on results. Increase sigma if noise remains; decrease if details are lost.
