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

Find files quickly by searching filenames or category keywords.

## Search Box

Type in the search box above the file tree to filter files. Results update as you type (with a brief delay for performance).

## What You Can Search

## Filenames

Any part of the filename matches. 'sample' finds 'sample_001.tif', 'my_sample.tif', etc.

## Category Keywords

## Search using natural terms that map to categories

- 'raw', 'image', 'training' → Raw Images

- 'annotation', 'mask', 'label' → Annotations

- 'model', 'weights', 'pth' → Model Files

- 'mesh', '3d', 'surface' → Meshes

- 'denoise', 'clean' → Denoised results

- 'segment', 'result' → Segmentation results

## Multi-Word Search

Space-separated words use OR logic. 'mesh model' finds files matching 'mesh' OR 'model'.

## Search Results View

## When searching, files display in a flat list (not tree) showing:

- Filename

- Parent folder path

- Action buttons

## Clearing Search

Click the X button in the search box or the 'Clear search' button in empty results.
