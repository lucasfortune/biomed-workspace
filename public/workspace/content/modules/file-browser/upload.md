---
id: file-browser.upload
title: Uploading Files
category: feature
module: file-browser
tags:
  - file-browser
  - upload
  - drag-drop
seeAlsoManual:
  - file-browser
  - file-browser.categories
seeAlsoTags:
  - upload
---

# Uploading Files

Upload TIFF images, model files, or restore a workspace backup using the category dropdown and upload button or drag-and-drop.

## How to Upload

1. Select a category from the dropdown (Raw Images, Annotations, etc.)

2. Click Upload or drag files onto the sidebar

3. Wait for upload to complete

## Supported File Types

- Raw Images, Annotations, Inference Data: TIFF files (.tif, .tiff)

- Model Files: PyTorch weights (.pth) and config files (.json)

- Restore Workspace: ZIP files from previous workspace download

## File Size Limits

- Individual files: 200 MB maximum

- Workspace ZIP: No strict limit (large files may take time)

## Drag and Drop

You can drag files directly onto the sidebar. Make sure to select a category first — the overlay will show where files will be uploaded.

## Tips

- Upload all related files together (e.g., raw images and their annotations)

- Use descriptive filenames for easier identification

- Recently uploaded files show a 'NEW' badge briefly
