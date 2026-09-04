---
id: segcleanup.step2.painting
title: Painting Corrections
category: feature
module: segcleanup
tags:
  - segcleanup
  - painting
  - brush
  - eraser
  - flood-fill
  - undo
seeAlsoManual:
  - segcleanup
  - segcleanup.step2.cleanup-ops
  - segcleanup.step2.save
seeAlsoTags:
  - editing
  - brush
---

# Painting Corrections

Fix labels by hand directly on each slice. Painting is always active in the Edit & Quantify step, alongside the automated cleanup and quantification panels.

## Tools

- Brush: paint with the active class

- Eraser: erase to background (0)

- Fill: flood-fill the clicked connected region with the active class

The brush size is set with a slider (1 to 100 pixels). The active class is chosen from the class list; the brush and fill tools apply that class, and eraser always writes background.

## Undo and Redo

Undo and redo are tracked per slice, so stepping between slices keeps each slice's own history. History is bounded (the most recent states per slice are kept). Use the undo/redo controls in the viewer header, and note that cancelling a stroke undoes it.

## Pan and Zoom

- Left-drag: paint

- Right-drag or space + drag: pan

- Mouse wheel: zoom

The viewer header also provides zoom in, zoom out, fit, and reset controls, plus slice navigation.

## Grayscale Underlay

The canvas image comes from the grayscale origin resolved from the segmentation's lineage when available; otherwise the label stack itself backs the view. Labels are drawn as a colored overlay on top, so you can paint against the underlying image.
