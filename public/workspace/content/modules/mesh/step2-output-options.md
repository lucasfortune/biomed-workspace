---
id: mesh.step2.output-options
title: Output Options
category: configuration
module: mesh
tags:
  - mesh
  - formats
  - output
  - export
seeAlsoManual:
  - mesh
  - mesh.step1.segmentation-data
seeAlsoTags:
  - formats
  - export
---

# Output Options

Configure output formats and select which classes to include in the generated mesh.

## Output Formats

Three.js JSON

Optimized format for the built-in 3D Visualization module. Includes vertex colors and is loaded directly by the viewer. Recommended if you plan to view meshes in this application.

OBJ (Wavefront)

Widely supported 3D format compatible with most 3D modeling software (Blender, Maya, 3ds Max, etc.). Includes vertex positions and face definitions. Good for further editing or analysis.

STL (Stereolithography)

Standard format for 3D printing. Contains only geometry without color information. Use this if you plan to 3D print your structures.

## Class Selection

- All Classes: Generate separate mesh surfaces for each detected class

- Single Class: Generate mesh for only the selected class value

Tip: Select multiple formats to have options for different use cases. The Three.js JSON format is required for the built-in 3D viewer.
