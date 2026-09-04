---
id: stitching.step2.auto-align
title: Aligning a Junction
category: feature
module: stitching
tags:
  - stitching
  - alignment
  - auto-align
  - phase-correlation
  - confidence
seeAlsoManual:
  - stitching.step2.controls
  - stitching.step2.slice-pair
seeAlsoTags:
  - stitching
  - alignment
---

# Aligning a Junction

Line up the two slices of the current junction: move the green (moving) slice onto the magenta (fixed) one until shared structure turns gray.

## Moving the Slice

- Drag with the left mouse button to move the moving slice; arrow keys nudge by 1 pixel, Shift plus arrow by 10

- The dx, dy, and rotation fields show the current transform and accept typed values

- Any manual move clears the confidence score, since it no longer reflects the current position

## Auto Align and Confidence

- Auto-align estimates dx and dy by phase correlation on the declared slice pair (a boundary map is used for label stacks); it runs coarse-to-fine but does not estimate rotation, so set that by hand

- Each run reports a confidence score (overlap correlation) in the viewer footer: above 0.5 is good, at or below is poor, and below 0.3 raises a warning

- If confidence stays low, confirm the pair shows the same physical section, check for a large rotation, and fall back to manual alignment, using the flicker toggle to verify the fit

## Per-Junction Buttons

- Auto-align: estimate the transform automatically

- Reset: clear dx, dy, and rotation back to zero and drop the confidence score
