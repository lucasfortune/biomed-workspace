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
  - file-browser.upload
  - file-browser.workspace-backup
  - file-browser.batch-operations
seeAlsoTags:
  - workspace
  - files
---

# File Browser & Workspace

Manage your workspace files: upload data, organize by category, download results, and backup/restore your entire workspace between sessions.

The File Browser provides complete control over your workspace files. Since this application uses session-based storage (no permanent backend storage), understanding the workspace system is essential for preserving your work.

## Key Features

## File Organization

Files are organized into categories

- Raw Images: Source TIFF stacks for processing

- Annotations: Training masks and labels

- Inference Data: Images for model inference

- Model Files: Trained model weights (.pth) and configs (.json)

- Results: Outputs from segmentation, denoising, and mesh generation

File Operations

- Upload: Add files via button or drag-and-drop

- Download: Save individual files or batch download as ZIP

- Rename: Change filenames (extension must stay the same)

- Delete: Remove files (with confirmation)

- View Info: See file details and processing history

Workspace Persistence

Important: All data exists only for your current session. When you log out or your session expires, files are cleared. Use the workspace download/restore features to save and continue your work across sessions.

See the related articles for detailed information on each feature.
