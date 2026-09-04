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
  Sets how much blind-spot training signal each patch carries. The validated defaults are 1.5% (N2V) and 15% (StructN2V).
---

# Mask Percentage

Percentage of pixels masked during blind-spot training.

Blind-spot training works by masking pixels and training the network to predict them from their surroundings. This parameter controls what fraction of pixels are masked in each patch. It lives under **Advanced Options**, and the default depends on which branch you are configuring.

## The control

- N2V branch: default 1.5%, range 0.5–30% (step 0.5)

- StructN2V branch: default 15%, range 5–30% (step 1)

The StructN2V branch masks a larger fraction because each masked pixel also blanks its correlated neighbours through the discovered structural mask, so more sites are needed to give a comparable training signal.

## Lower percentage

- Fewer masked pixels per patch

- Network sees more complete context

- May need more training iterations

## Higher percentage

- More masked pixels per training example

- More training signal per patch

- Risk of masking too much context

## Recommendations

- Keep the branch default (1.5% for N2V, 15% for StructN2V)

- Adjust only if training seems slow to converge or the result looks over-smoothed
