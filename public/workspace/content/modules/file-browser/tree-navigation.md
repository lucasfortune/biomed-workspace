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

## Files are organized in a tree with these main branches

uploads/

├── raw/           - Raw image stacks

├── annotations/   - Training masks

├── inference_data/ - Images for inference

└── imported_models/ - External models

models/

├── segmentation/  - Trained segmentation models

└── denoising/     - Trained denoising models

results/

├── segmentation/  - Segmentation outputs

├── denoised/      - Denoising outputs

└── meshes/        - Generated 3D meshes

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

Folders with no files still appear in the tree to show the complete structure. They collapse to save space.
