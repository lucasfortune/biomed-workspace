---
id: file-browser.tree-navigation
title: Tree Navigation
category: feature
module: file-browser
tags:
  - file-browser
  - tree
  - folders
  - navigation
seeAlsoManual:
  - file-browser
  - file-browser.categories
seeAlsoTags:
  - navigation
  - folders
---

# Tree Navigation

Navigate the folder structure to find and manage your files. The tree mirrors the folders on disk, which is also the layout of a workspace backup.

## Folder Structure

## Files are organized in a tree with three top-level branches

uploads/

├── raw/             - Raw image stacks (TIFF/MRC), under their original names

└── annotations/     - Uploaded label masks

models/

├── segmentation/train`<n>`/ - Trained segmentation models (best_model.pth, config.json, results.json)

├── denoising/dn`<n>`/       - Trained denoising models and their artifacts

├── imported/                - Model files you upload (.pth, .json, bioimage.io .zip)

└── bioimageio/              - export`<n>`/ (packages exported here) and zoo/`<model id>`/ (model cards)

results/

├── segmentation/seg`<n>`/   - Segmentation outputs

├── denoising/filter`<n>`/   - Filter denoising outputs

├── denoising/dn`<n>`/       - Deep-learning denoising outputs

├── preprocess/prep`<n>`/    - Preprocessing outputs

├── stitching/stitch`<n>`/   - Stitching outputs and recipes

├── segcleanup/clean`<n>`/   - Segmentation cleanup outputs and reports

├── meshes/mesh`<n>`/        - Generated 3D meshes

└── annotation/annot`<n>`/   - Annotations made in the Annotation module (labels plus classes file)

Run folders are numbered per workspace in the order the runs were made (`seg1`, `seg2`, ...). They are created on demand, so you only see the ones that hold files. Inside a run folder, files carry the same names you see in the tree.

## Expanding/Collapsing

Click a folder row to expand or collapse it. The arrow (▶/▼) indicates the current state. Run folders sort in numeric order; files sort by name.

## File Display

## Each file shows

- Thumbnail (for TIFF images)

- Name

- File size

- Upload time (relative, e.g., '2h ago')

- Action buttons on hover

## Thumbnails

Image files display a small preview thumbnail. If thumbnail generation fails, a file type icon is shown instead.

## Empty Folders

Only the three top-level directories, uploads, models and results, always appear. Their subfolders are created the first time a file lands in them, so an empty branch never clutters the tree.
