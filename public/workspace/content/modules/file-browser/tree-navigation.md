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

Navigate the hierarchical folder structure to find and manage your files.

## Folder Structure

## Files are organized in a tree with three top-level branches

uploads/

├── raw/             - Raw image stacks (TIFF/MRC)

├── annotations/     - Training masks

└── imported_models/ - External models you upload

models/

├── segmentation/`<id>`/ - Trained segmentation models

└── denoising/`<id>`/    - Trained denoising models

results/

├── segmentation/`<id>`/ - Segmentation outputs

├── denoising/`<id>`/    - Denoising outputs

├── meshes/`<id>`/       - Generated 3D meshes

├── preprocess/`<id>`/   - Preprocessing outputs

├── stitching/`<id>`/    - Stitching outputs

└── segcleanup/`<id>`/   - Segmentation cleanup outputs

Subfolders and per-job `<id>` folders are created on demand as modules run, so you only see the ones that hold files.

## Expanding/Collapsing

Click a folder row to expand or collapse it. The arrow (▶/▼) indicates current state.

## File Display

## Each file shows

- Thumbnail (for TIFF images)

- Filename

- File size

- Upload time (relative, e.g., '2h ago')

- Action buttons on hover

## Thumbnails

Image files display a small preview thumbnail. If thumbnail generation fails, a file type icon is shown instead.

## Empty Folders

Only the three top-level directories — uploads, models, and results — always appear. Their subfolders are created on demand the first time a file lands in them, so an empty branch will not clutter the tree.
