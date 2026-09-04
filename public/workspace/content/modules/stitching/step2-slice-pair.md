---
id: stitching.step2.slice-pair
title: Choosing the Slice Pair
category: process
module: stitching
tags:
  - stitching
  - alignment
  - slice-pair
  - z-offset
seeAlsoManual:
  - stitching.step2.controls
  - stitching.step2.dominance
  - stitching.step3.compose
seeAlsoTags:
  - stitching
  - alignment
---

# Choosing the Slice Pair

For every junction you declare one slice from the fixed (upper) stack and one from the moving (lower) stack that show the same physical section. This pair pins the two stacks together in z, and everything else follows from it.

## What the Pair Means

- The fixed slice and the moving slice you choose are treated as the same z position in the assembled volume

- That single choice sets the z-offset for the whole moving stack; the in-plane transform then handles the xy alignment

- Choose the pair with the slice sliders (a slider plus a 1-based number field for each side); the fixed slider defaults to the last slice of the upper stack and the moving slider to the first slice of the lower stack

## Concatenation vs Overlap

- Last slice of the upper stack paired with the first slice of the lower stack means the stacks simply meet end to end: a pure z-concatenation with no shared sections

- Any other pair implies the stacks were re-imaged across some sections, so those z positions are duplicated and overlap

- How duplicated sections are resolved (keep one side or merge) is set by the "Overlapping sections keep" control

## Continuation vs Mosaic

- Whether a junction is a z-continuation or a side-by-side mosaic is not asked directly; it is inferred from how much the two footprints overlap in xy once you have aligned them

- A large footprint overlap reads as a continuation (the stacks stack on top of each other in z); a small overlap reads as a mosaic, where all slices of both stacks are kept side by side
