---
id: mesh
title: Surface Mesh Generation Module
category: module
module: mesh
tags:
  - mesh
  - 3d
  - surface
  - marching-cubes
  - visualization
seeAlsoManual:
  - mesh.step1.segmentation-data
  - mesh.step2.output-options
seeAlsoTags:
  - mesh
  - 3d
---

# Surface Mesh Generation Module

Convert segmented image stacks into 3D surface meshes for visualization and export. Generate meshes in multiple formats for different applications.

The Surface Mesh Generation module transforms segmented TIFF image stacks into 3D surface meshes using the Marching Cubes algorithm. These meshes can be visualized in the 3D Visualization module or exported for use in external software.

## Key Features

- Multi-format output: Three.js JSON, OBJ, STL

- Per-class mesh generation with separate surfaces

- Real-time progress tracking during generation

- Direct integration with 3D Visualization module

## Supported Input

- Segmentation results from U-Net inference

- Annotation masks from the Annotation Tool

- Any labeled TIFF stack with class values 1-255

## Workflow

1. Select Data: Choose segmentation results or annotation data

2. Configure Options: Select output formats and target classes

3. Generate: Watch real-time progress as meshes are created

4. View or Export: Open in 3D viewer or download mesh files
