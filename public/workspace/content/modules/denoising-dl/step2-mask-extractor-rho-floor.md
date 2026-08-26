---
id: denoising-dl.step2.mask-extractor.rho-floor
title: Correlation Floor
category: parameter
module: denoising-dl
tags:
  - denoising
  - autostructn2v
  - mask-extractor
  - threshold
seeAlsoManual:
  - denoising-dl.step2.mask-extractor.spine-thresh
  - denoising-dl.step2.mask-extractor.max-pixels
  - denoising-dl.routing-decision
seeAlsoTags:
  - mask-extractor
  - autostructn2v
parameterImpact: |
  An effect-size floor on mask correlations. Raising it shrinks the mask to the strongest correlations; lowering it admits weaker ones. Default 0.05 works for most data.
---

# Correlation Floor

Minimum correlation strength (|rho|) a pixel must have to stay in the discovered mask.

The spine mask is built from the noise autocorrelation function (ACF). The Correlation Floor (rho_floor) drops mask pixels whose absolute correlation is below the floor, no matter how statistically certain they are.

## Why an effect-size floor

With enough background tiles, even tiny correlations become statistically significant. A correlation of 0.01 is "real" but contributes almost nothing to the noise, so masking it costs the network context for no gain. The floor keeps the mask focused on correlations that matter.

## Values (0 to 0.15)

- 0: No floor; every statistically significant pixel stays

- 0.05 (Default): Balanced; ignores negligible correlations

- 0.10-0.15: Aggressive; keeps only strong correlations, producing a smaller mask

## Recommendations

- Keep the default (0.05) for most data

- Raise it if the mask looks large and includes faint tails

- Lower it if a visible noise direction is missing from the mask

The reported mask coverage (mask_rho2) helps you judge the trade-off: if raising the floor barely reduces coverage, the dropped pixels were not contributing.
