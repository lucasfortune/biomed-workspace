---
id: file-browser.upload
title: Uploading Files
category: feature
module: file-browser
tags:
  - file-browser
  - upload
  - drag-drop
  - mrc
seeAlsoManual:
  - file-browser
  - file-browser.categories
seeAlsoTags:
  - upload
---

# Uploading Files

Upload TIFF images, model files, or restore a workspace backup using the category dropdown and upload button or drag-and-drop.

## How to Upload

1. Select a category from the dropdown: Raw Images, Annotations, Model Files, or Restore Workspace (ZIP)

2. Click Upload or drag files onto the sidebar

3. Wait for upload to complete

## Supported File Types

- Raw Images, Annotations: TIFF stacks (.tif, .tiff) or MRC volumes (.mrc)

- Model Files: PyTorch weights (.pth) and config files (.json)

- Restore Workspace: ZIP files from a previous workspace download

## MRC Import

MRC volumes (.mrc) are accepted wherever TIFF images are — pick Raw Images or Annotations and upload the .mrc file. It is imported alongside your TIFF stacks and can be worked with the same way (ADR-010).

## File Size Limits

- Individual files: 200 MB maximum

- Workspace ZIP: 5 GB maximum

## Drag and Drop

You can drag files directly onto the sidebar. Make sure to select a category first — the overlay will show where files will be uploaded.

## Tips

- Upload all related files together (e.g., raw images and their annotations)

- Use descriptive filenames for easier identification

- Recently uploaded files show a 'NEW' badge briefly
