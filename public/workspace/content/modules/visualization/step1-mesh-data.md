---
id: visualization.step1.mesh-data
title: Mesh Data Selection
category: data
module: visualization
tags:
  - visualization
  - mesh
  - json
  - input
seeAlsoManual:
  - visualization
  - visualization.step2.controls
seeAlsoTags:
  - mesh
  - input
---

# Mesh Data Selection

Select the mesh JSON file to visualize. Use recent results from mesh generation or browse workspace files.

## Compatible Data Sources

- Recent Results: Mesh files from the Surface Mesh Generation module

- Workspace Files: Previously generated or uploaded mesh JSON files

## Supported Formats

The viewer reads mesh JSON in three shapes:

- VoxelSlices: The default output of the Surface Mesh Generation module. It stores voxel data slice by slice (no triangle faces) and is what enables the per-class slice-range controls.

- BufferGeometry: A marching-cubes surface mesh with vertex positions and faces.

- Three.js ObjectLoader JSON: A standard Three.js scene export.

## Validation

When you select a file, it is validated and a short summary card confirms the number of classes detected and the detected format. A second card reports whether original source data is available for overlay (found through the file's lineage).

## Lineage Tracking

When you select a mesh file, the system checks for lineage information to find the original source data. If found, you can overlay the original image data on the 3D mesh for reference.

Tip: For best results, generate meshes with the Surface Mesh Generation module, which produces the VoxelSlices format used by the slice-range controls.
