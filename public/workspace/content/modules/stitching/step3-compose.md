---
id: stitching.step3.compose
title: Composing the Volume
category: process
module: stitching
tags:
  - stitching
  - compose
  - output
  - recipe
  - warnings
seeAlsoManual:
  - stitching.step2.dominance
  - stitching.step1.workflow
  - stitching
seeAlsoTags:
  - stitching
  - output
---

# Composing the Volume

Composing turns the placements into a single output volume. It lives in the Align & Compose step: review the placement summary in the toolbar, set the output options, and press Compose; the stitch is streamed slice by slice and the recipe is saved alongside the result.

## Placement Summary

- A table lists every stack with its z offset, dx, dy, rotation, and the slice range kept

- A per-junction note shows the inferred relationship: "continues in z", "continues in z, merged", or "side by side"

- The mode line notes how seams are handled: images get feathered seams; label maps use nearest-neighbor with hard seams by design

## Options

- Match intensities between stacks: rescales each stack to the reference stack's mean and standard deviation; recommended when stacks came from separate sessions. Grayscale only, so this option is hidden for label maps

- Crop to common area: outputs only the xy region all stacks share, instead of a union canvas with the gaps filled

- Output name: the basename of the stitched TIFF

## Output and Recipe

- The output is a multi-page TIFF written to the results area; its size and dtype are reported on completion

- A recipe (stitch_recipe.json) is saved next to the output with workspace-relative paths, ready to reapply to sibling volumes

- If any duplicated sections were merged, the result reports how many were averaged

- Open the result directly in the Image Viewer, or start a new run

## Warnings

The composer reports issues rather than failing silently:

- dtype mismatch between a stack and the reference (it is cast to the reference dtype)

- In label maps mode, a merge flag ignored because class IDs cannot be averaged

- Label sets that differ from the reference (classes present in a stack but not the reference, sampled at the junction slices)

- z gaps: output slices with no contributing stack, which are filled

- Overlapping kept ranges that were averaged even though no stack was flagged to merge, which usually means a hand-edited recipe
