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

Each segmented class has its own control panel:

Visibility Toggle

Show or hide individual classes to focus on specific structures. Classes start visible. Useful when classes overlap or you want to examine one region in isolation.

Opacity Slider

Adjust transparency from 10% to 100%. Default is 80%. Lower values let you see through surfaces to underlying structures.

Slice Range (for slice-based meshes)

Limit the visible depth range using the dual-handle slider. This creates a clipping effect, revealing internal structure. Drag either handle to set the minimum or maximum visible slice.

## Original Data Overlay

If lineage data is available, an Original Data panel lets you overlay the source image on the mesh:

- The overlay starts hidden - tick its checkbox to show it

- Opacity ranges from 5% to 100%, defaulting to 30% so it blends behind the mesh

- A slice-range slider appears only when the source has more than one slice

## Z Voxel Scale

When the mesh was generated with a non-cubic Z voxel scale, that ratio is stored in the mesh metadata and applied automatically, so the model appears with the correct physical proportions.

## View Controls

- Reset View: Returns the camera and all controls to defaults

- Expand: Enter full-screen mode for detailed examination (Escape exits)

- Hide controls: In expanded mode, collapse the control panel with the × button, and bring it back with the Controls button

- Double-click canvas: Quick reset of the view orientation

Your control settings - class visibility, opacity, slice ranges, and camera position - are remembered when you leave the viewer and return to it during the same session.
