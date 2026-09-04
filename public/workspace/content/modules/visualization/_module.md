---
id: visualization
title: 3D Visualization Module
category: module
module: visualization
tags:
  - visualization
  - 3d
  - mesh
  - threejs
  - interactive
seeAlsoManual:
  - visualization.step1.mesh-data
  - visualization.step2.controls
seeAlsoTags:
  - visualization
  - 3d
---

# 3D Visualization Module

Interactive 3D viewer for mesh files with per-class controls, opacity adjustment, slice range selection, and original data overlay.

The 3D Visualization module provides an interactive Three.js-based viewer for exploring surface meshes generated from your segmentation data.

## Key Features

- Per-class visibility and opacity controls

- Slice range selection for viewing specific regions

- Original data overlay (when lineage data is available)

- Mouse, keyboard, and touch controls for rotation, zoom, and pan

- Expand mode for full-screen viewing, with a hideable controls panel

- Reset view to return to the default state

## Mouse Controls

- Left-click + drag: Rotate the mesh

- Right-click + drag: Rotate the mesh

- Ctrl/Cmd + drag: Pan the view

- Scroll wheel: Zoom in/out

- Double-click: Reset view

## Keyboard Controls

- Arrow keys: Rotate the mesh

- Ctrl/Cmd + arrow keys: Pan the view

- R: Reset rotation and position

- Escape: Exit expanded mode

## Touch Controls

- One finger: Rotate the mesh

- Two fingers: Pinch to zoom and drag to pan

## Workflow

1. Select Mesh: Choose a mesh JSON file from recent results or workspace

2. View in 3D: Explore your data with interactive controls
