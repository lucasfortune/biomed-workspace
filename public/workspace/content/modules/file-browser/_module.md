---
id: file-browser
title: File Browser & Workspace
category: feature
module: file-browser
tags:
  - file-browser
  - workspace
  - files
  - upload
  - download
seeAlsoManual:
  - file-browser.tree-navigation
  - file-browser.categories
  - file-browser.search
  - file-browser.upload
  - file-browser.file-operations
  - file-browser.batch-operations
  - file-browser.workspace-backup
seeAlsoTags:
  - workspace
  - files
---

# File Browser & Workspace

Manage your workspace files: upload data, organize by category, download results, and backup/restore your entire workspace between sessions.

The File Browser provides complete control over your workspace files. Since this application uses session-based storage (no permanent backend storage), understanding the workspace system is essential for preserving your work.

## Key Features

## File Organization

Every file belongs to one of three categories, refined by tags:

- uploads: source data you bring in — raw TIFF/MRC stacks (`raw` tag) and annotation masks (`annotation` tag)

- models: trained model weights (.pth) and configs (.json), tagged by method (segmentation or denoising)

- results: outputs from the processing modules — segmentation, denoising, meshes, preprocessing, stitching, and segmentation cleanup

The category and tags drive search and the way files group in the tree. See the File Categories article for the full tag scheme.

File Operations

- Upload: Add files via button or drag-and-drop

- Download: Save individual files or batch download as ZIP

- Rename: Change a file's display name (the underlying file is never touched)

- Delete: Remove files (with confirmation)

- View Info: See file details and processing history

Workspace Persistence

Important: All data is session-based and temporary. Your workspace is kept for up to 48 hours after your last activity and is then deleted automatically; logging out (after confirmation) deletes it immediately. Use the workspace download/restore features to save and continue your work across sessions.

See the related articles for detailed information on each feature.
