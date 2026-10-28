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

Manage your workspace files: upload data, find files by name or tag, download results, and back up or restore your entire workspace between sessions.

The File Browser provides complete control over your workspace files. Since this application uses session-based storage (no permanent backend storage), understanding the workspace system is essential for preserving your work.

## Key Features

## File Organization

Every file belongs to one of three categories, refined by tags:

- uploads: source data you bring in, raw TIFF/MRC stacks (`raw` tag) and annotation masks (`annotation` tag). The kind is detected when you upload.

- models: model weights (.pth), configs (.json), bioimage.io packages (.zip) and zoo model cards, tagged by method (segmentation, denoising, bioimageio or unspecified)

- results: outputs of the processing modules: segmentation, denoising, meshes, preprocessing, stitching, segmentation cleanup and annotations made in the workspace

The tree shows the folders on disk: uploads by kind, and one numbered folder per run (`seg1`, `prep2`, `annot3`, ...) whose files carry the names you see. The category and tags drive search and the file selectors of the modules. See the File Categories article for the full tag scheme.

File Operations

- Upload: add files via button or drag-and-drop; the workspace detects what they are

- Download: save individual files or batch download as ZIP

- Rename: change a file's display name (the underlying file is never touched)

- Delete: remove files (with confirmation); companion files go with their main file

- View Info: see file details, the model used and the processing history

Workspace Persistence

Important: On the public server all data is session-based and temporary. Your workspace is kept for up to 48 hours after your last activity and is then deleted automatically; logging out (after confirmation) deletes it immediately. Use the workspace download/restore features to save and continue your work across sessions.

None of this applies to a local installation running in local mode (the sidebar says "Local mode" instead of an approval status): there is one permanent workspace, nothing expires, and there is no logout.

See the related articles for detailed information on each feature.
