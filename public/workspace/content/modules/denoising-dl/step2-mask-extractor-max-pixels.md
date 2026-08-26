---
id: denoising-dl.step2.mask-extractor.max-pixels
title: Max Mask Pixels
category: parameter
module: denoising-dl
tags:
  - denoising
  - autostructn2v
  - mask-extractor
  - limit
seeAlsoManual:
  - denoising-dl.step2.mask-extractor.rho-floor
  - denoising-dl.autostructn2v-detail
seeAlsoTags:
  - mask-extractor
  - autostructn2v
parameterImpact: |
  Optional hard cap on the size of the discovered spine mask. Usually unnecessary; the Correlation Floor and Spine Threshold already control mask size.
---

# Max Mask Pixels

Optional upper limit on the number of active pixels in the discovered spine mask.

The spine mask is normally sized by the noise itself: pixels enter only if their correlation is statistically certain (Spine Threshold) and large enough to matter (Correlation Floor). Max Mask Pixels adds a hard cap on top of that.

## How it works

- If the discovered spine exceeds the cap, the weakest pixels (lowest |correlation|) are dropped until the cap is met

- The mask stays a connected, 180-degree symmetric spine

- With no cap set, the mask size is determined entirely by the thresholds

## When to use

- To bound training cost when the noise has very long-range correlation and the spine grows large

- To keep the mask compact if you find large masks remove too much context

## Recommendations

- Leave unset (package default) for most data

- Prefer raising the Correlation Floor over capping: the floor removes pixels by relevance, while the cap is a blunt limit

- Watch the mask coverage (mask_rho2) when capping; a large drop means the cap is cutting into meaningful correlations
