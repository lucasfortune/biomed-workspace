---
id: file-browser.file-operations
title: File Operations
category: feature
module: file-browser
tags:
  - file-browser
  - download
  - rename
  - delete
  - duplicate
  - split
  - convert
  - voxel-size
  - json
  - bioimageio
seeAlsoManual:
  - file-browser.batch-operations
  - file-browser.bioimageio-export
  - file-browser.upload
  - file-browser
seeAlsoTags:
  - file-operations
---

# File Operations

Download, rename, or delete files using the action buttons or right-click context menu.

## Each file row has action buttons on the right

Download (⬇️)

Saves the file to your computer under its display name. For TIFF stacks, this downloads the complete multi-page file.

Rename (✏️)

Opens the workspace's rename dialog to change the file's display name, the friendly name shown throughout the workspace and used for downloads. Renaming never touches the underlying file or its path, so lineage, downloads and module references keep working. The extension must stay the same. If the new name is already taken by another file, a numbered suffix like " (2)" is appended automatically.

Delete (🗑️)

Permanently removes the file from your workspace after a confirmation dialog. Companion files go with their main file: deleting a model removes its config and results summary, deleting an annotation removes its classes file, deleting a segmentation removes its info file. The dialog lists what will be deleted. This cannot be undone.

## Context Menu

Right-click any file for the full set of operations. Which entries appear depends on the file type:

- Download, View Info, Rename: always shown

- View JSON: for .json files; opens a syntax-highlighted, read-only viewer (files larger than 10 MB cannot be viewed)

- Mark as annotation / Mark as raw image: for uploaded TIFF images, to correct the kind detected at upload (see Uploading Files)

- Duplicate Stack, Split Stack…: for TIFF stacks (see below); not offered for annotations saved with Save Progress

- Convert to…: format conversion offered per type: TIFF ↔ MRC, and mesh .obj to STL, PLY, or glTF (GLB). Converting a TIFF to MRC carries its voxel size through (ADR-010)

- Export as bioimage.io package…: for segmentation .pth model files (workspace U-Nets and imported checkpoints, not denoising models); packages the model for other tools, the model zoo and tiled inference in the workspace (see bioimage.io Export)

- Delete: always shown (shortcut: Del)

## TIFF Stack Operations

Right-clicking on TIFF image stacks provides additional operations:

**Duplicate Stack (📋)**

Creates an exact copy of the TIFF stack in the same folder, named `<original>_copy.tif` (a numbered suffix is added if that name exists). The duplicate keeps the category and tags of the original.

**Split Stack... (✂️)**

Only available for multi-slice TIFF stacks. Opens a dialog where you can:

- Enter the slice number to split at (the stack will be divided after this slice)
- Preview how many slices will be in each part
- Choose whether to delete the original file after splitting

The result is two new files, `<original>_split_part1.tif` and `<original>_split_part2.tif`. Both parts keep the category and tags of the original, and their processing history shows they were split from the source file.

## File Info Details

- Name and path in workspace (the path shows the run folder, e.g. `results/segmentation/seg3/`)

- File size

- Category and tags

- Upload timestamp

- Voxel size (TIFF stacks only), see below

- ID (the internal file identifier)

- Processing history: the lineage chain, showing steps such as Original Upload, Denoising, Segmentation, Segmentation Training, Fine-tuning, Mesh Generation, Annotation, Preprocessing, Stitching, Segmentation Cleanup, Format Conversion, bioimage.io Export, bioimage.io Model, Duplicated, or Split

- Model: the model that produced a segmentation, a denoised stack, an exported package or a fine-tuned model. Models are never part of the chain itself, which always leads back to image data

## Voxel Size

For TIFF stacks, File Info shows a voxel-size row. The physical voxel size is read automatically when a file is uploaded and inherited by outputs derived from it (ADR-008). Click the edit (✏️) button on the row to set x, y, and z spacing and a unit (µm, nm, or mm); x and y must be positive. Leaving all three blank clears the voxel size.

## Convert To

Use Convert to… in the context menu to write a new file in another format. TIFF converts to MRC (and MRC back to TIFF), and mesh .obj files convert to STL, PLY, or glTF (GLB). The converted file is added to the workspace tagged `converted` and named `<original>_conv.<format>` (e.g. `stack_conv.stl`), and a TIFF's voxel size is passed to the MRC output.

## Export as bioimage.io Package

Right-click a segmentation `.pth` model file and choose Export as bioimage.io package… to write a bioimage.io model package (zip) from a workspace U-Net. The dialog asks for a name, a license and a sample image; the package is self-tested on the server and then appears under `models/bioimageio/export<n>` tagged `bioimageio`, ready for the Segmentation module's bioimage.io workflow or for download. Details in the bioimage.io Export article.
