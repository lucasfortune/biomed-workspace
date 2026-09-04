---
id: imageviewer.step2.ui-controls
title: Viewer Controls
category: process
module: imageviewer
tags:
  - imageviewer
  - controls
  - gallery
  - thumbnails
  - zoom
  - comparison
seeAlsoManual:
  - imageviewer
  - imageviewer.step1.image-stack
seeAlsoTags:
  - controls
  - navigation
---

# Viewer Controls

The viewer offers two modes for exploring your image stack: Gallery mode for detailed inspection and Thumbnail mode for a quick overview. Both work for a single stack and for a side-by-side comparison.

## Gallery Mode

Gallery mode displays a single slice at full resolution with zoom and pan.

- Navigation: Use the Previous/Next buttons, the numeric slice field, the slider, or the left/right arrow keys to move between slices

- Zoom: Use the zoom in/out buttons or the mouse wheel (which zooms toward the cursor). The range is 10% to 1000%, in 1.25x steps

- Fit / Actual size: "Fit to view" resets the zoom and re-centers; "Actual size" sets the served slice image to 1:1

- Pan: Drag with the left or middle mouse button, or hold Space and drag, to move around the image

## Thumbnail Mode

Thumbnail mode displays all slices as a grid of small previews. This is useful for:

- Getting an overview of the entire stack

- Quickly finding slices of interest

Click any thumbnail to switch to Gallery mode for that slice.

## Comparison Mode

When you added two or more stacks in step 1, the viewer shows them together:

- Gallery: A pane per stack, all driven by one shared slice slider, zoom, and pan, so the same z position and view stay aligned across stacks. A stack shorter than the others clamps to its last slice and shows an "end of stack" badge.

- Thumbnails: A table with one column per stack and one row per slice index, so the same depth lines up across stacks. Click a cell to open that slice in the comparison gallery.

## File Info Display

The toolbar shows the current filename (or "Comparing N stacks") and the total slice count. The slice indicator shows your current position using 1-based numbering (for example, "25 / 100").

## Returning to Selection

Use the Back button to return to step 1, where you can choose a different file or adjust the comparison list.
