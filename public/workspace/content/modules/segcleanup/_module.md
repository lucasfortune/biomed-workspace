---
id: segcleanup
title: Segmentation Cleanup Module
category: module
module: segcleanup
tags:
  - working-copy
  - segcleanup
  - cleanup
  - quantification
  - editing
  - segmentation
seeAlsoManual:
  - segcleanup.step1.segmentation
  - segcleanup.step2.painting
  - segcleanup.step2.cleanup-ops
  - segcleanup.step2.quantification
  - segcleanup.step2.save
seeAlsoTags:
  - segmentation
  - cleanup
---

# Segmentation Cleanup Module

Correct and measure a labeled segmentation stack in one integrated editor. Paint fixes by hand, run automated cleanup over the whole volume, quantify the result, and save it as a new file.

The Segmentation Cleanup module works on a two-step flow: select a segmentation, then edit and quantify it. All operations run against a server-side working copy. The original file is never modified; every change is written out as a new, tracked file.

## Key Features

- Manual painting with brush, eraser, and flood-fill tools

- Automated cleanup: merge or remove classes, fill holes, remove small components, smooth boundaries

- Per-class quantification: voxel counts, physical volume, connected components, surface area

- Report export to CSV, registered in the file browser

- Non-destructive: edits apply to a working copy, results are saved as new files

## Supported Input

- Segmentation results from U-Net inference

- Annotation masks uploaded or created in the Annotation Tool

- Any labeled TIFF stack with at least one non-zero class

Outputs are tagged as segmentation results, so the Mesh Generation and Stitching pickers accept them directly.

## Workflow

1. Select: choose a segmentation or annotation mask to edit and measure

2. Edit & Quantify: paint corrections, apply automated cleanup, and review per-class metrics

3. Create report: write the quantification to CSV files in the workspace

4. Save as New File: write the cleaned stack as a tracked output, then continue editing or open it in the Image Viewer
