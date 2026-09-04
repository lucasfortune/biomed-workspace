---
id: segcleanup.step2.save
title: Saving the Result
category: process
module: segcleanup
tags:
  - working-copy
  - segcleanup
  - save
  - output
  - export
seeAlsoManual:
  - segcleanup
  - segcleanup.step2.cleanup-ops
  - segcleanup.step2.quantification
seeAlsoTags:
  - output
  - process
---

# Saving the Result

Write the current cleaned stack as a new file. The original input is never changed — saving always produces a separate, tracked output.

## Save as New File

"Save as New File" writes the current labels, including painted edits and any applied cleanup, to a new TIFF. Set the file name in the output name field (default: `cleaned`); the name is sanitized and a `.tif` extension is added. The saved file is registered in the file browser and tagged as a segmentation result, so the Mesh Generation and Stitching modules can use it.

## Continuing to Edit

Saving does not end the session. After a save, editing continues on top of the saved file, so you can keep painting or run further cleanup and save again. A confirmation banner shows the saved file name.

## After Saving

From the saved banner you can:

- Open in Image Viewer: load the saved file in the Image Viewer module

- Start New Run: drop the current session and return to a clean selection step

Leaving the module also starts fresh next time; working copies and quantification directories are cleaned up, while saved files and reports remain in the workspace.
