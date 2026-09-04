---
id: stitching
title: Stack Stitching Module
category: module
module: stitching
tags:
  - stitching
  - alignment
  - mosaic
  - z-concatenation
  - recipe
seeAlsoManual:
  - stitching.step1.workflow
  - stitching.step1.stacks
  - stitching.step2.slice-pair
  - stitching.step2.dominance
  - stitching.step3.compose
seeAlsoTags:
  - stitching
  - alignment
---

# Stack Stitching Module

Join several stacks into one volume: z-concatenation, z-overlap, and side-by-side xy mosaics, all through a single placement model. Align once, then reuse the placements on sibling volumes.

Each stack after the first is placed by a declared slice pair, "these two slices are the same physical section", which fixes the z-offset, plus an in-plane transform (dx, dy, rotation) that you align in an overlay viewer. Whether a junction is a z-continuation or a side-by-side mosaic is inferred from how much the two footprints overlap, not asked as a separate question.

## Key Features

- One placement model for z-concatenation, z-overlap, and xy mosaics

- Overlay alignment with automatic phase correlation plus manual nudge and rotate

- Per-junction control over duplicated z sections: keep the upper stack, keep the lower stack, or merge (average)

- Stitch recipes saved next to the output and reapplied to sibling volumes without re-aligning

## Supported Input

- Multi-page TIFF stacks (.tif, .tiff)

- Two data modes, detected automatically and never mixed in one stitch: images (grayscale raw or denoised) and label maps (segmentations, annotations)

- All stacks in a stitch share the same pixel grid

## Workflow

1. Select Stacks: start a new stitch, or apply a saved recipe

2. Align: for each junction, pick the matching slice pair and align the overlay

3. Compose: review the placement table and compose the output volume

The result is a stitched TIFF plus a recipe. Duplicated z sections are trimmed by default (one stack's slices are dropped); a junction set to merge keeps both and averages them (images only), recorded as `z_merge` in the recipe.
