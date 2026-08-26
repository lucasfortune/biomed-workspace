---
id: denoising-dl.step2.mask-extractor.spine-thresh
title: Spine Threshold
category: parameter
module: denoising-dl
tags:
  - denoising
  - autostructn2v
  - mask-extractor
  - threshold
seeAlsoManual:
  - denoising-dl.step2.mask-extractor.rho-floor
  - denoising-dl.step2.mask-extractor.bg-side
  - denoising-dl.routing-decision
seeAlsoTags:
  - mask-extractor
  - autostructn2v
parameterImpact: |
  Statistical certainty (|z|) required for an ACF feature to enter the mask. Lower values are more sensitive but risk admitting noise; higher values keep only unambiguous features. Default 8.
---

# Spine Threshold

The statistical certainty (|z| score) a noise-correlation feature needs before it enters the spine mask.

The extractor measures the noise autocorrelation function (ACF) on many background tiles, so it can estimate not just the strength of each correlation but also its uncertainty. The Spine Threshold sets how many standard errors (|z|) a feature must stand above zero to be considered a real part of the noise structure.

## Values

- 4-6: Sensitive; picks up weaker features but may admit spurious pixels

- 8 (Default): Conservative; features must be unambiguous

- 10-15: Very strict; only the strongest structure survives

## Relationship to the Correlation Floor

The two thresholds answer different questions:

- Spine Threshold: "Are we sure this correlation exists?" (certainty)

- Correlation Floor: "Is this correlation big enough to matter?" (effect size)

A pixel must pass both to stay in the mask.

## Recommendations

- Keep the default (8) for most data

- Lower it if a clearly visible noise pattern is not captured by the mask

- Raise it if the mask contains scattered pixels that do not follow any visible pattern
