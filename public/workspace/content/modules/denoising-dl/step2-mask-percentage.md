---
id: denoising-dl.step2.mask-percentage
title: Mask Percentage
category: parameter
module: denoising-dl
tags:
  - denoising
  - n2v
  - mask
  - blind-spot
seeAlsoManual:
  - denoising-dl.step2.patch-size
seeAlsoTags:
  - configuration
  - n2v
parameterImpact: |
  Higher percentages provide more training signal per patch but may mask too much context. 10-15% is typical.
---

# Mask Percentage

Percentage of pixels masked during N2V training.

N2V works by masking random pixels and training the network to predict them from surrounding pixels. This parameter controls what fraction of pixels are masked in each patch.

Lower percentage (5-10%):

- Fewer masked pixels per patch

- Network sees more complete context

- May need more training iterations

Higher percentage (15-25%):

- More masked pixels per training example

- More training signal per patch

- Risk of too many masked pixels near each other

## Recommendations

- 10-15% works well for most images

- Use lower values for images with fine details

- Use higher values if training seems slow to converge
