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

Configure the Gaussian filter with sigma and kernel size. Sigma controls how much the image is blurred; kernel size sets the window the Gaussian is evaluated in.

Sigma (Standard Deviation)

Sigma is the actual blur control — it sets the spread of the Gaussian weights and therefore how strongly the image is smoothed.

- Range: 0.5 - 5.0

- Low values (0.5-1.0): Subtle smoothing, preserves more detail

- Medium values (1.5-2.5): Balanced noise reduction

- High values (3.0-5.0): Strong smoothing, may blur edges

Kernel Size

Kernel size sets the width of the window (in pixels, odd) that the Gaussian is sampled over. Internally it is converted to scipy's `truncate` value so the filter spans exactly that many pixels; the weights outside the window are cut off and the remainder is renormalised. It does not, by itself, set the blur strength — sigma does — but it caps how far the blur can reach.

- Available: 3, 5 (default), 7, 9, or 11 pixels

- Small windows (3x3): Cut off the tails of the Gaussian. Combined with a large sigma this behaves like a box-limited blur rather than a true Gaussian.

- Larger windows (7x7 to 11x11): Let a wide Gaussian extend fully. Keep the window at least about four times sigma to avoid truncating a smooth Gaussian.

Tip: Start with sigma=1.5 and kernel=5x5, then adjust based on results. Increase sigma if noise remains; decrease if details are lost. Widen the kernel only when you also raise sigma.
