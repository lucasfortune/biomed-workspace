---
id: stitching.step2.dominance
title: Overlapping Sections Keep
category: parameter
module: stitching
tags:
  - stitching
  - z-overlap
  - merge
  - dominance
  - z_merge
seeAlsoManual:
  - stitching.step2.slice-pair
  - stitching.step2.controls
  - stitching.step3.compose
seeAlsoTags:
  - stitching
  - z-overlap
---

# Overlapping Sections Keep

When two stacks were imaged across the same physical sections, those z positions are duplicated. The "Overlapping sections keep" control decides what happens to the duplicates at that junction. It is a three-way choice: upper, lower, or merge.

## The Three Options

- Upper: keep the upper (previous) stack's slices across the duplicated range; the lower stack's copies are trimmed

- Lower: keep the lower (this) stack's slices; the upper stack's copies are trimmed

- Merge: keep both stacks and average the two images at each duplicated z position

## Merge Is Images Only

- Merge averages pixel values, which is meaningful only for grayscale images

- In label maps mode the merge button is disabled; class IDs cannot be averaged, so duplicated sections fall back to keeping the upper stack

- The recipe records merge as a `z_merge` flag on the lower stack; when a label-map recipe carries that flag the composer ignores it and keeps the earlier stack, with a warning

## When It Applies

- This control only affects continuation junctions, where the footprints overlap enough for the stacks to be reading the same sections in z

- For side-by-side mosaics (small footprint overlap) there are no duplicated z positions, so the setting is ignored and all slices are kept

- The compose step reports how many duplicated sections were actually averaged
