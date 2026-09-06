---
id: mesh.step2.z-voxel-scale
title: Z Voxel Scale
category: configuration
module: mesh
tags:
  - mesh
  - z-aspect
  - voxel
  - anisotropic
  - spacing
  - scale
seeAlsoManual:
  - mesh
  - mesh.step2.output-options
seeAlsoTags:
  - voxel
  - anisotropic
---

# Z Voxel Scale

Controls the voxel aspect ratio along the z (slice) axis relative to the in-plane x/y pixels, so the generated mesh keeps true physical proportions when your acquisition is anisotropic.

## What It Does

Image stacks are often **anisotropic**: the distance between slices (the z-step) is not the same as the size of a pixel within a slice. By default the mesh generator assumes **cubic voxels** — that x, y and z are all the same physical size. If that assumption is wrong, the resulting 3D surface looks squashed or stretched along the depth axis even though the segmentation is correct.

The Z Voxel Scale lets you tell the generator how large a voxel is along z compared to x/y, and the mesh is scaled accordingly.

## Values

- **1 (default):** cubic voxels — x : y : z = 1 : 1 : 1. Use this when slice spacing equals the in-plane pixel size.
- **Greater than 1:** stretches the stack along z. For example, a value of `2` produces a 1 : 1 : 2 aspect, appropriate when the z-step is twice the in-plane pixel size.
- **Less than 1:** compresses the stack along z, for finely-sampled z stacks where slices are closer together than the in-plane pixel size.

The accepted range is **0.05 to 20**. Invalid or empty entries fall back to `1`.

## How To Choose

Compute the ratio from your acquisition metadata:

```
Z Voxel Scale = z-step (slice spacing) / in-plane pixel size
```

For example, if pixels are 0.2 µm and the spacing between slices is 0.5 µm, set the scale to `0.5 / 0.2 = 2.5`.

## Where It Applies

The scale is baked into the exported **OBJ** geometry — and therefore also into any STL, PLY, or glTF file you create from it with the file browser's "Convert to..." action — so meshes opened in external software (Blender, Maya, 3D printing slicers) already have correct z proportions. The built-in **3D Visualization** module also reads the recorded aspect and applies it to the Three.js JSON mesh, the slice/capping meshes, and the original-data overlay, so the in-app view matches the exported files.

Tip: If your data is isotropic (cubic voxels), leave this at `1` — the default — and nothing changes.
