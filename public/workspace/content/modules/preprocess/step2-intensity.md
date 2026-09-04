---
id: preprocess.step2.intensity
title: Intensity
category: process
module: preprocess
tags:
  - preprocess
  - intensity
  - histogram
  - gamma
  - contrast
seeAlsoManual:
  - preprocess
  - preprocess.step2.geometry
  - preprocess.step2.output
seeAlsoTags:
  - intensity
  - preprocess
---

# Intensity

Remap the intensity range with a display window, gamma, and inversion. These changes preview live on the current slice.

## Histogram

- The histogram is built from a few slices sampled through the stack (spatially strided), not the whole volume, so it loads quickly and stays representative.

- Bar heights are log-scaled, which makes the low, sparse counts typical of EM data readable.

## Window (min / max)

The window sets the intensity range that is stretched across the full output range; values below the minimum go to black and values above the maximum go to white.

- Drag the two markers on the histogram to set the minimum and maximum, or type raw intensity values into the min and max fields.

- Auto 1%: sets the window to the 1% and 99% percentiles of the sampled data.

- Auto 0.1%: sets the window to the 0.1% and 99.9% percentiles.

- Reset: clears the window and returns gamma to 1 and invert to off.

## Gamma

- The gamma slider ranges from 0.2 to 3.0 (default 1.0).

- Gamma below 1 brightens dark regions; gamma above 1 darkens them.

## Invert

Invert flips the intensity so bright becomes dark and dark becomes bright.

## About the Preview

The live preview shows intensity changes only, applied to the full original frame. The crop rectangle is drawn as an overlay, and the geometry operations (flip, rotate, downscale) are not previewed; they apply when the output is written.
