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
  - annotation.step2.history
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

Removes annotations by painting back to background (value 0).

Fill (F)

Click inside a region to fill it with the active class. The region is the connected area that shares the clicked value: an enclosed patch of background, or a whole patch of another class. Outline a structure with the brush, then fill it with one click.

Eyedropper (Alt+click)

Alt+click a painted pixel to make its class the active class, with any tool.

All tools only affect classes that are visible and unlocked. Hiding or locking a class protects its pixels, so you can paint another class right up to and over a protected structure without changing it.

## Brush Size

The Size slider under the tools sets the brush diameter in image pixels (1 to 50). The [ and ] keys change it in steps of 5. The brush preview on the canvas shows exactly which pixels a click would paint. See Brush Size for guidance on choosing a size.

## History

The row of small buttons under the tools holds Undo and Redo (Ctrl+Z, Ctrl+Y) and, after an interpolation run, Revert interpolation. History is kept per slice, up to 20 steps. Autosave lives in the header next to Save Progress. See History & Autosave for details.

## Keyboard Shortcuts

- B - Switch to brush tool

- E - Switch to eraser tool

- F - Switch to fill tool

- 1 to 9 - Select the first to ninth class

- Alt+click - Pick the class under the cursor

- V (hold) - Peek at the raw image without overlays

- S - Suggest the current slice with the pixel classifier; A - accept its suggestion

- [ - Decrease brush size

- ] - Increase brush size

- Ctrl+Z / Cmd+Z - Undo last stroke

- Ctrl+Y / Ctrl+Shift+Z (Cmd equivalents) - Redo undone stroke

- Left/Right arrows - Navigate between slices

- , and . - Jump to the previous/next slice annotated with the active class

## Slice Navigation

Move through the stack with the Previous/Next buttons, the numeric slice field, the slider beneath the canvas, or the left/right arrow keys. The slice indicator uses 1-based numbering (for example, 5 / 64).

## Zoom & Pan

- Mouse wheel: Zoom toward the cursor

- Zoom buttons: Zoom out, zoom in, Fit to view, and Actual size (100%)

- Zoom range: 10% to 1000%

- Pan: Right-drag, middle-drag, or hold Space and drag; on touch devices, use a two-finger pinch to pan and zoom

- The zoom and position are kept when you change slices, so a region you zoomed into stays in view while you step through the stack. Fit to view resets it.

## Status Bar

The footer under the canvas shows the live cursor position (X / Y in image pixels) and the image dimensions, so you always know where the brush is landing.
