---
id: denoising-dl.step2.mask-extractor.max-pixels
title: Max Masked Pixels
category: parameter
module: denoising-dl
tags:
  - denoising
  - autostructn2v
  - mask-extractor
  - limit
seeAlsoManual:
  - denoising-dl.step2.mask-extractor.adaptive
  - denoising-dl.autostructn2v-detail
seeAlsoTags:
  - mask-extractor
  - autostructn2v
parameterImpact: |
  Limits mask complexity. Default (25) works for typical patterns; adjust based on mask preview.
---

# Max Masked Pixels

Maximum number of pixels that can be active in the structural noise mask.

Max Masked Pixels sets an upper limit on how many pixels can be marked as structural noise in the detection mask.

## How it works

- The mask extractor identifies pixels contributing to structured noise

- This parameter caps the total active pixels in the mask

- Prevents over-detection that could remove real image features

## Values (5-50)

- 5-15: Very conservative, for subtle patterns

- 20-25 (Default): Balanced, suitable for typical scan line artifacts

- 30-50: Allows detection of complex or widespread patterns

## When to adjust

- Increase if your noise pattern is complex with many components

- Decrease if the mask is too aggressive and affecting image details

## Visual Check

Always review the mask visualization before approving. If the mask shows too many active pixels, reduce this value. If visible patterns aren't captured, increase it.

Note: This is a hard limit — the mask will never exceed this many active pixels regardless of other settings.
