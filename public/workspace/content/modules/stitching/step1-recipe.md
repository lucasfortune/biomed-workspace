---
id: stitching.step1.recipe
title: Applying a Saved Recipe
category: data
module: stitching
tags:
  - stitching
  - recipe
  - reuse
  - placements
seeAlsoManual:
  - stitching.step1.workflow
  - stitching.step1.stacks
  - stitching.step3.compose
seeAlsoTags:
  - stitching
  - recipe
---

# Applying a Saved Recipe

A recipe holds the placements from an earlier stitch, not its pixels. Choosing one lets you compose sibling volumes with the exact same geometry, without aligning again.

## Choosing a Recipe

- Pick a recipe file saved by a previous stitch (tagged as a stitching recipe); other files are excluded from the picker

- The recipe lists one stack slot per placement, in the original order

- Each slot remembers the original stack by its file identity and prefills it when the file is still in the workspace; a slot whose file has been deleted is marked as missing, and composing is blocked until you pick a replacement for it

- Clearing the selection removes the recipe and its slots

## Swapping Slots

- Swap each slot for the volume you want to compose now, one per placement

- Every replacement must sit on the same pixel grid as the original, so alignment still holds

- A recipe aligned on images can be applied to label maps and vice versa; the data mode follows the files you actually select

## When to Reuse a Recipe

- Typical case: you aligned the raw images, and now want to stitch their segmentations or their denoised versions with the same geometry

- Because the recipe stores placements only, it applies to any sibling volume acquired the same way on the same grid

- Once the slots are filled, go straight to Compose, no re-alignment needed
