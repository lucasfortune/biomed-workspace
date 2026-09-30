---
id: file-browser.search
title: Search & Filter
category: feature
module: file-browser
tags:
  - file-browser
  - search
  - filter
seeAlsoManual:
  - file-browser.categories
  - file-browser
seeAlsoTags:
  - search
  - filter
---

# Search & Filter

Find files quickly by searching names or tags.

## Search Box

Type in the search box above the file tree to filter files. Results update as you type (with a brief delay for performance).

## What You Can Search

## Names

Any part of the name matches. 'sample' finds 'sample_raw.tif', 'my_sample.tif', etc. The name on disk matches too.

## Tags

Every file carries tags (shown in the file info panel). A search word matches when it is part of a tag or of one of its synonyms:

- 'raw', 'image', 'input' → raw image stacks

- 'annotation', 'mask', 'label' → annotation masks

- 'segmentation', 'segment', 'result' → segmentation results

- 'denoising', 'denoised' → denoised stacks

- 'mesh', '3d', 'surface' → meshes

- 'weights', 'model', 'pth' → model weights; 'config' → model configuration files; 'card' → zoo model cards

- 'bioimageio', 'zoo', 'package' → bioimage.io packages and cards

- 'preprocess', 'stitching', 'segcleanup', 'cleanup' → outputs of those modules; 'recipe' → stitching recipes; 'report', 'csv' → quantification reports

- 'wip', 'progress', 'unfinished' → annotations saved with Save Progress; 'info', 'metadata' → companion files

- 'sample', 'demo', 'built-in' → the built-in sample data

## Multi-Word Search

Space-separated words use OR logic. 'mesh model' finds files matching 'mesh' OR 'model'.

## Search Results View

## When searching, files display in a flat list (not tree) showing:

- Name

- Parent folder path

- Action buttons

## Clearing Search

Click the X button in the search box or the 'Clear search' button in empty results.
