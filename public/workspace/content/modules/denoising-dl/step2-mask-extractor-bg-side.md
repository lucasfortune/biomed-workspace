---
id: denoising-dl.step2.mask-extractor.bg-side
title: Background Side
category: parameter
module: denoising-dl
tags:
  - denoising
  - autostructn2v
  - mask-extractor
  - background
seeAlsoManual:
  - denoising-dl.step2.mask-extractor.rho-floor
  - denoising-dl.step2.mask-extractor.spine-thresh
  - denoising-dl.autostructn2v-detail
seeAlsoTags:
  - mask-extractor
  - autostructn2v
parameterImpact: |
  The one required extractor input. Picking the wrong side makes the noise measurement run on foreground structures instead of background, which can distort the mask and the routing decision.
---

# Background Side

Tell the noise extractor which intensity side of your images is background.

autoStructN2V measures the noise on background regions of your raw stack, where there is no biological structure to confuse the measurement. These regions are selected automatically, but the extractor needs to know what "background" looks like in your data.

## Light

Background is brighter than the structures of interest. Typical for dense EM data, where resin or embedding medium appears bright and stained structures appear dark.

## Dark

Background is darker than the structures of interest. Typical for fluorescence-like images, where labeled structures glow against a dark background.

## Off

No intensity preference; regions are selected by flatness only. Use this when neither side clearly corresponds to background, for example when the image is densely filled with structure.

## Recommendations

- Dense EM (bright resin): Light

- Fluorescence or dark-background data: Dark

- If the resulting mask looks wrong, check this setting first and regenerate; it only takes seconds
