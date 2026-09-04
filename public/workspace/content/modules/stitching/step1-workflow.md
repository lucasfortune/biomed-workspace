---
id: stitching.step1.workflow
title: New Stitch or Saved Recipe
category: process
module: stitching
tags:
  - stitching
  - workflow
  - recipe
  - reuse
seeAlsoManual:
  - stitching
  - stitching.step1.stacks
  - stitching.step3.compose
seeAlsoTags:
  - stitching
  - recipe
---

# New Stitch or Saved Recipe

Step 1 offers two ways to start. Pick "New stitch" to select stacks and align them by hand, or "Apply saved recipe" to reuse the placements from an earlier stitch.

## New Stitch

- Select two or more stacks and put them in order

- Align each junction yourself in the next step (Align)

- Composing saves a recipe alongside the output, ready for reuse

- The Next button reads "Next: Align"

## Apply Saved Recipe

- Choose a recipe file saved by a previous stitch (tagged as a stitching recipe)

- The recipe lists one stack slot per placement; swap each slot for the volume you want to compose now

- Alignment is skipped entirely, the Next button reads "Next: Compose", and you go straight to composing

## When to Reuse a Recipe

- The recipe stores placements, not pixels, so it applies to sibling volumes acquired the same way, on the same pixel grid

- Typical case: you aligned the raw images, and now want to stitch their segmentations or their denoised versions with the exact same geometry

- Swap each recipe slot for the matching sibling volume and compose without re-aligning

- A recipe aligned on images can be applied to label maps and vice versa; the data mode follows the files you actually select
