---
id: annotation
title: Annotation
category: module
module: annotation
tags:
  - annotation
  - segmentation
  - labels
  - brush
  - training-data
seeAlsoManual:
  - annotation.step1.source-image
  - annotation.step2.tools
seeAlsoTags:
  - annotation
  - segmentation
---

# Annotation

Create ground-truth segmentation masks for training machine learning models. Paint annotations directly on your images using brush and eraser tools.

The Annotation module provides a browser-based painting interface for creating segmentation masks on TIFF image stacks. These annotations serve as ground truth for training U-Net segmentation models.

## Key Features

- Multi-class support with color-coded labels

- Brush and eraser tools with adjustable size (1-50 px)

- Per-slice undo/redo history (up to 20 steps per slice)

- Slice navigation with buttons, a numeric field, a slider, and the arrow keys

- Zoom and pan (mouse wheel, on-screen buttons, or right/middle/Space drag)

- Autosave every 2 minutes to prevent data loss

- Resume unfinished work or edit an existing annotation

## Workflow

1. Select Source Image: Choose a TIFF stack to annotate, resume an unfinished annotation, or edit an existing one

2. Annotate: Paint labels on each slice using the brush tool, moving through slices as you go

3. Save: Save progress to keep working later, or create a final annotation file

## Saving Your Work

Two separate actions save annotations, and both become available after your first stroke:

- Save Progress: Writes a work-in-progress (WIP) file you can reopen later from the source selector. Autosave uses this same action.

- Create Annotation: Writes the final multi-page annotation TIFF that the U-Net Segmentation module can train on. If no pixels have been painted, it asks you to confirm before creating an empty annotation.

If you leave the module or close the tab with unsaved changes, the tool asks you to confirm first.
