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
  - file-browser.batch-operations
seeAlsoTags:
  - backup
  - restore
  - persistence
---

# Workspace Backup & Restore

Download your entire workspace as a ZIP file and restore it later to continue your work across sessions.

## Why This Matters

This application uses session-based storage — your files exist only during your current session. When you log out, close the browser, or your session expires, all uploaded files and generated results are cleared.

## The workspace backup/restore feature solves this by letting you

1. Download everything before ending a session

2. Restore your workspace when you return

## Download Workspace

Click the download icon (⬇️) next to the 'Workspace' header in the sidebar. This creates a ZIP file containing:

- All uploaded files (raw images, annotations, models)

- All generated results (segmentation, denoised images, meshes)

- Complete folder structure preserved

A confirmation dialog shows file count and estimated size. Large workspaces may take several minutes to prepare.

## Restore Workspace

1. Select 'Restore Workspace (ZIP)' from the upload category dropdown

2. Click Upload and select your workspace ZIP file

3. Confirm the restore (warning: this replaces your current workspace)

4. Wait for extraction to complete

## Important Considerations

- Restore REPLACES your current workspace — existing files are deleted

- Only restore from workspace ZIPs created by this application

- The ZIP preserves folder structure, so files return to their original locations

- Models and results work immediately after restore

## Best Practices

- Download your workspace at the end of each session

- Keep workspace ZIPs organized with dates in filenames

- Verify restore by checking file counts match
