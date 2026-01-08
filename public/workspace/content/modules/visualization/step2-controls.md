---
id: visualization.step2.controls
title: Visualization Controls
category: tools
module: visualization
tags:
  - visualization
  - controls
  - opacity
  - visibility
  - clipping
seeAlsoManual:
  - visualization
  - visualization.step1.mesh-data
seeAlsoTags:
  - controls
  - 3d
---

# Visualization Controls

Control visibility, opacity, and slice range for each class in your mesh. Overlay original data for reference.

## Class Controls

## Each segmented class has its own control panel with

Visibility Toggle

Show or hide individual classes to focus on specific structures. Useful when classes overlap or you want to examine one region in isolation.

Opacity Slider

Adjust transparency from 10% to 100%. Lower values let you see through surfaces to underlying structures. Default is 80%.

Slice Range (for slice-based meshes)

Limit the visible depth range using the dual-handle slider. This creates a clipping effect, revealing internal structure. Drag either handle to set the minimum or maximum visible slice.

## Original Data Overlay

If lineage data is available, you can enable the original data overlay:

- Toggle visibility to show/hide the overlay

- Adjust opacity to blend with the mesh

- Set slice range to show specific depth regions

## View Controls

- Reset View: Returns camera and all controls to defaults

- Expand: Enter full-screen mode for detailed examination

- Double-click canvas: Quick reset of view orientation
