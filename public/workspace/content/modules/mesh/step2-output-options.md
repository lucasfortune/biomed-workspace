---
id: mesh.step2.output-options
title: Output Options
category: configuration
module: mesh
tags:
  - mesh
  - output
  - classes
seeAlsoManual:
  - mesh
  - mesh.step1.segmentation-data
  - mesh.step2.z-voxel-scale
seeAlsoTags:
  - export
  - 3d
---

# Output Options

Choose which classes to include and set the voxel proportions before generating the mesh. Every run writes a JSON file (for the built-in 3D viewer) and an OBJ geometry file.

## Selected Data

A summary card shows the file you chose, its dimensions and slice count, the classes detected, the data type, and a preview of the middle slice, so you can confirm the input before generating.

## Class Selection

- All Classes: Generate a separate mesh surface for every detected class

- Single Class: Pick one class value to generate on its own

## Z Voxel Scale

If your acquisition is anisotropic (slice spacing differs from the in-plane pixel size), use the **Z Voxel Scale** option to keep correct physical proportions — see its dedicated help article for details.

## Generation & Results

While the mesh is generated, a progress bar reports the current class and an elapsed timer. When it finishes, a results panel shows:

- Total vertices, total faces, and the number of classes processed

- Generation time (and the Z voxel scale, when it is not 1)

- Download buttons for the JSON and OBJ files

- Open in 3D Visualization to inspect the mesh immediately

- Start New Run to return to step 1 and process another file

If you navigate away while a generation is running, returning to the module resumes it: an in-progress job re-attaches to its progress bar, and a job that finished while you were away shows its results.

## Other Export Formats

STL, PLY, and glTF are not produced here. Generate the mesh, then right-click the OBJ file in the file browser and use "Convert to..." to create those formats.
