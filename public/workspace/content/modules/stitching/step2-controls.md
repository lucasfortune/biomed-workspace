---
id: stitching.step2.controls
title: The Overlay Viewer
category: feature
module: stitching
tags:
  - stitching
  - alignment
  - viewer
  - overlay
  - controls
seeAlsoManual:
  - stitching.step2.slice-pair
  - stitching.step2.auto-align
  - stitching.step2.dominance
seeAlsoTags:
  - stitching
  - alignment
---

# The Overlay Viewer

The Align step shows the two slices of a junction superimposed so you can line them up. The fixed slice is tinted magenta and the moving slice green; where structure is correctly registered the two tints combine to gray.

## Color and Overlay

- Fixed slice: magenta. Moving slice: green. Aligned structure: gray

- Overlay slider: sets the moving slice's opacity (starts at 50%)

- Flicker: a checkbox that rapidly alternates the two slices (about three times a second) instead of blending them, which makes small misregistrations easier to spot

## Moving the Slice

- Drag with the left mouse button to move the moving slice over the fixed one

- Arrow keys nudge the moving slice by 1 pixel; hold Shift to nudge by 10 pixels

- The dx, dy, and rotation fields show the current transform and can be typed into directly

- Any manual move clears the alignment confidence score, since it no longer reflects the current position

## Panning and Zoom

- Pan the view (moving both slices together to inspect another area) with a middle-button drag, Shift plus left drag, or Space plus left drag

- The mouse wheel zooms, anchored at the cursor; the zoom buttons offer zoom in, out, fit, and 1:1

- Zoom is limited to a 0.1x to 10x range

## Per-Junction Buttons

- Auto-align: estimate the transform automatically (see the auto-align article)

- Reset: clear dx, dy, and rotation back to zero and drop the confidence score
