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
  - detection
seeAlsoManual:
  - file-browser
  - file-browser.categories
  - file-browser.workspace-backup
seeAlsoTags:
  - upload
---

# Uploading Files

Upload images, annotations, model files, bioimage.io packages or a workspace backup with the Upload button or by dropping files onto the sidebar. You do not choose what kind of file it is: the workspace detects the kind from the file.

## How to Upload

1. Click Upload and pick one or more files, or drag them onto the sidebar

2. Wait for the upload to finish

3. Read the notification: it names each file and the kind it was filed as

## What is Detected

- TIFF stacks (.tif, .tiff) and MRC volumes (.mrc): the content decides. An integer stack with at most 100 distinct values is filed as an annotation, everything else as raw image data. MRC volumes are converted to TIFF on import, voxel size included (ADR-010).

- PyTorch weights (.pth, .pt) and configuration files (.json): model files, stored under `models/imported`

- ZIP archives: a bioimage.io package (it contains an `rdf.yaml`) is stored under `models/imported`; a workspace backup (it contains a `metadata.json`) opens the restore confirmation instead of being stored (see Workspace Backup & Restore). Other archives are refused.

Files keep their original names. A second file with the same name gets a numbered suffix on disk and a "(2)" in its display name.

## Wrong Guess?

A small 8-bit image with few grey levels can be taken for an annotation. Right-click the file and choose Mark as raw image (or Mark as annotation) to change the kind. Only the tags change; the file stays where it is.

Uploads made from inside a module (the Add button of a file selector) are filed as the kind that selector asks for, so no guessing happens there.

## File Size Limits

On the public server:

- Images: 200 MB per file

- Model files and packages: 2 GB per file

- Workspace ZIP: 5 GB

A local installation on your own machine can set its own limits in its `.env` file, and in local mode they default to 20 GB for images and models and 50 GB for workspace ZIPs. The file browser always checks against the limits the server you are using reports.

## Drag and Drop

Drop files anywhere on the sidebar. Several files of different kinds can be dropped at once.

## Tips

- Upload all related files together (raw images and their annotations)

- Use descriptive file names; derived files inherit the name of their source

- Recently uploaded files show a 'NEW' badge briefly
