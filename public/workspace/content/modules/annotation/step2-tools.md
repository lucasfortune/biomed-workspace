---
id: annotation.step2.tools
title: Drawing Tools
category: tools
module: annotation
tags:
  - annotation
  - brush
  - eraser
  - tools
  - navigation
  - zoom
seeAlsoManual:
  - annotation.step2.brush-size
  - annotation.step2.classes
seeAlsoTags:
  - tools
  - brush
---

# Drawing Tools

Use the brush to paint annotations and the eraser to remove them. Keyboard shortcuts provide quick access.

## Available Tools

Brush (B)

Paints with the currently selected class color. Click and drag to draw continuous strokes. The brush respects the current brush size setting.

Eraser (E)

Removes annotations by painting back to background (value 0). The eraser only affects classes that are currently visible, so hiding a class protects its pixels while you clean up others.

## Keyboard Shortcuts

- B - Switch to brush tool

- E - Switch to eraser tool

- [ - Decrease brush size

- ] - Increase brush size

- Ctrl+Z / Cmd+Z - Undo last stroke

- Ctrl+Y / Ctrl+Shift+Z (Cmd equivalents) - Redo undone stroke

- Left/Right arrows - Navigate between slices

## Slice Navigation

Move through the stack with the Previous/Next buttons, the numeric slice field, the slider beneath the canvas, or the left/right arrow keys. The slice indicator uses 1-based numbering (for example, 5 / 64).

## Zoom & Pan

- Mouse wheel: Zoom toward the cursor

- Zoom buttons: Zoom out, zoom in, Fit to view, and Actual size (100%)

- Zoom range: 10% to 1000%

- Pan: Right-drag, middle-drag, or hold Space and drag; on touch devices, use a two-finger pinch to pan and zoom

## Status Bar

The footer under the canvas shows the live cursor position (X / Y in image pixels) and the image dimensions, so you always know where the brush is landing.
