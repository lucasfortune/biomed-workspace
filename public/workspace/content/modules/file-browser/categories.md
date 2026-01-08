---
id: file-browser.categories
title: File Categories
category: concept
module: file-browser
tags:
  - file-browser
  - categories
  - organization
seeAlsoManual:
  - file-browser
  - file-browser.search
seeAlsoTags:
  - categories
  - organization
---

# File Categories

Files are organized into categories that correspond to different stages of the image processing workflow.

## Upload Categories

Raw Images (uploads/raw)

Source TIFF image stacks — your original microscopy data. These are inputs for denoising, annotation, or direct segmentation.

Annotations (uploads/annotations)

Training masks and labels. Must match the dimensions of corresponding raw images. Used for training segmentation models.

Inference Data (uploads/inference_data)

Images to process with trained models. Separate from training data to keep your workflow organized.

Model Files (uploads/imported_models)

Previously trained models (.pth files) and their configuration files (.json). Import models to skip training and run inference directly.

## Result Categories

Segmentation Results (results/segmentation)

Output from U-Net segmentation — labeled image stacks.

Denoised (results/denoised)

Output from denoising modules — cleaned image stacks.

Meshes (results/meshes)

Generated 3D surface meshes in various formats.

## Searching by Category

Type category-related keywords in the search box (e.g., 'model', 'mesh', 'annotation') to filter files.
