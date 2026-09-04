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

Convert segmented image stacks into 3D surface meshes for visualization and export. Meshes feed the built-in 3D viewer and can be exported for external software.

The Surface Mesh Generation module transforms segmented TIFF image stacks into 3D surface meshes using the Marching Cubes algorithm. These meshes can be viewed in the 3D Visualization module or downloaded for use elsewhere.

## Key Features

- Generates two files per run: a JSON file for the built-in 3D viewer and an OBJ geometry file

- Per-class mesh generation with separate surfaces

- Real-time progress tracking during generation

- Direct hand-off to the 3D Visualization module

## Supported Input

- Segmentation results from U-Net inference

- Annotation masks from the Annotation Tool

- Any labeled integer TIFF stack with discrete class values

## Workflow

1. Select Data: Choose segmentation results or annotation data

2. Configure Options: Choose which class(es) to generate and set the Z voxel scale

3. Generate: Watch real-time progress as meshes are created

4. View or Export: Open the result in the 3D viewer, or download the JSON/OBJ files

## Other Export Formats

The module itself only writes JSON and OBJ. To obtain STL, PLY, or glTF, generate the mesh here, then use the file browser's right-click "Convert to..." action on the OBJ file.
