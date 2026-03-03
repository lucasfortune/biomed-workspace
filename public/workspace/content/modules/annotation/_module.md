---
id: annotation
title: Quick Annotation Tool
category: module
module: annotation
tags:
  - annotation
  - segmentation
  - labels
  - brush
  - filaments
  - training-data
seeAlsoManual:
  - annotation.step1.source-image
  - annotation.step2.tools
  - annotation.step2.filaments
seeAlsoTags:
  - annotation
  - segmentation
---

# Quick Annotation Tool

Create ground-truth segmentation masks for training machine learning models. Paint annotations directly on your images using brush and eraser tools.

The Quick Annotation Tool provides a browser-based painting interface for creating segmentation masks on TIFF image stacks. These annotations serve as ground truth for training U-Net segmentation models.

## Key Features

- Multi-class support with color-coded labels

- Brush, eraser, and fill tools with adjustable size

- Filament annotation for tracing tubular structures (e.g., microtubules)

- Full undo/redo history for each slice

- Autosave to prevent data loss

- Resume unfinished work or edit existing annotations

## Workflow

1. Select Source Image: Choose a TIFF stack to annotate

2. Annotate: Paint labels on each slice using the brush, eraser, and fill tools. Optionally trace filament centerpoints for direction-aware segmentation.

3. Save: Create a final annotation file or save progress for later

The resulting annotation file can be used directly with the U-Net Segmentation module for training. If filament annotations were created, a direction volume is also generated for direction-aware training.
