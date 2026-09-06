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
seeAlsoManual:
  - file-browser.batch-operations
  - file-browser
seeAlsoTags:
  - file-operations
---

# File Operations

Download, rename, or delete files using the action buttons or right-click context menu.

## Each file row has action buttons on the right

Download (⬇️)

Saves the file to your computer. For TIFF stacks, this downloads the complete multi-page file.

Rename (✏️)

Change the file's display name — the friendly name shown throughout the workspace. Renaming never touches the underlying file or its path, so lineage, downloads, and module references keep working. Useful for organizing files with descriptive names.

Delete (🗑️)

Permanently removes the file from your workspace. A confirmation dialog appears to prevent accidents. This cannot be undone.

## Context Menu

Right-click any file for the full set of operations. Which entries appear depends on the file type:

- Download, View Info, Rename — always shown

- View JSON — for .json files; opens a syntax-highlighted, read-only viewer (files larger than 10 MB cannot be viewed)

- Duplicate Stack, Split Stack… — for TIFF stacks (see below)

- Convert to… — format conversion offered per type: TIFF ↔ MRC, and mesh .obj to STL, PLY, or glTF (GLB). Converting a TIFF to MRC carries its voxel size through (ADR-010)

- Delete — always shown (shortcut: Del)

## TIFF Stack Operations

Right-clicking on TIFF image stacks provides additional operations:

**Duplicate Stack (📋)**

Creates an exact copy of the TIFF stack in the same folder. The copy is named `<original>_copy.tif`. If a file with that name already exists, a numbered suffix is added (e.g., `_copy_1.tif`). The duplicate retains the same category and tags as the original.

**Split Stack... (✂️)**

Only available for multi-slice TIFF stacks. Opens a dialog where you can:

- Enter the slice number to split at (the stack will be divided after this slice)
- Preview how many slices will be in each part
- Choose whether to delete the original file after splitting

The result is two new files named `<original>_part1.tif` and `<original>_part2.tif`. Both parts retain the same category and tags as the original, and their processing history will show they were split from the source file.

## File Info Details

- Name and path in workspace

- File size

- Category and tags

- Upload timestamp

- Voxel size (TIFF stacks only) — see below

- ID (the internal file identifier)

- Processing history — the lineage chain, showing steps such as Original Upload, Denoising, Segmentation, Mesh Generation, Preprocessing, Stitching, Segmentation Cleanup, Format Conversion, Duplicated, or Split

## Voxel Size

For TIFF stacks, File Info shows a voxel-size row. The physical voxel size is read automatically when a file is uploaded and inherited by outputs derived from it (ADR-008). Click the edit (✏️) button on the row to set x, y, and z spacing and a unit (µm, nm, or mm); x and y must be positive. Leaving all three blank clears the voxel size.

## Convert To

Use Convert to… in the context menu to write a new file in another format. TIFF converts to MRC (and MRC back to TIFF), and mesh .obj files convert to STL, PLY, or glTF (GLB). The converted file is added to the workspace tagged `converted`, and a TIFF's voxel size is passed to the MRC output.
