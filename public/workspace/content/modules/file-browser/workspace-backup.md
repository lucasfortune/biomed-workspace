---
id: file-browser.workspace-backup
title: Workspace Backup & Restore
category: feature
module: file-browser
tags:
  - file-browser
  - workspace
  - backup
  - restore
  - session
  - persistence
seeAlsoManual:
  - file-browser
  - file-browser.upload
  - file-browser.batch-operations
seeAlsoTags:
  - backup
  - restore
  - persistence
---

# Workspace Backup & Restore

Download your entire workspace as a ZIP file and restore it later to continue your work across sessions.

## Why This Matters

This application uses session-based storage: your workspace is kept for up to 48 hours after your last activity, then it is deleted automatically. Your login session expires on the same 48-hour schedule, and logging out (after its confirmation dialog) deletes the workspace immediately. Anything not downloaded before then, uploaded files and generated results alike, is gone.

## The workspace backup/restore feature solves this by letting you

1. Download everything before ending a session

2. Restore your workspace when you return

## Download Workspace

Click the download icon (⬇️) next to the 'Workspace' header in the sidebar. This creates a ZIP file containing:

- All uploaded files (raw images, annotations, models)

- All generated results (segmentation, denoised images, meshes, annotations)

- The complete folder structure, as shown in the tree, plus the workspace manifest (`metadata.json`)

The archive is named `workspace_<timestamp>.zip` (the timestamp is the download time). Cache directories are left out to keep it small: `.thumbnails`, `.slices`, `.mesh-previews`, `.preprocess`, `.segcleanup` and `.classifier` are all regenerated automatically after a restore.

A confirmation dialog shows file count and estimated size. Large workspaces may take several minutes to prepare.

## Restore Workspace

1. Upload the workspace ZIP like any other file (Upload button or drag and drop). The workspace recognises it as a backup by its `metadata.json`.

2. Confirm the restore (warning: this replaces your current workspace). Cancelling discards the uploaded archive.

3. Wait for extraction to complete

Restore progress runs through several phases, shown as it proceeds: validating the archive, clearing the existing workspace, extracting files and updating metadata. Thumbnails are then regenerated in the background.

Backups made by older versions of the workspace restore too: their manifest is upgraded on the fly (folders and file names stay as they were; new runs use the current numbered folders).

## Important Considerations

- Restore REPLACES your current workspace: existing files are deleted

- Only restore from workspace ZIPs created by this application

- The ZIP preserves the folder structure, so files return to their original locations, and run numbering continues where it left off

- Models and results work immediately after restore

## Best Practices

- Download your workspace at the end of each session

- Keep workspace ZIPs organized with dates in filenames

- Verify restore by checking file counts match
