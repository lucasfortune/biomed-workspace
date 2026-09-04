---
id: file-browser.categories
title: File Categories
category: concept
module: file-browser
tags:
  - file-browser
  - categories
  - organization
  - tags
seeAlsoManual:
  - file-browser
  - file-browser.search
  - file-browser.tree-navigation
seeAlsoTags:
  - categories
  - organization
---

# File Categories

Every file belongs to one of three categories — **uploads**, **models**, or **results** — and each file also carries tags that describe what it is and which module produced it. The category and tags drive both the tree grouping and search.

## uploads

Data you bring into the workspace.

- Raw images (`raw` tag) — source TIFF/MRC stacks, stored under `uploads/raw`. These are the inputs for denoising, annotation, or segmentation. Data uploaded for inference is stored here too — there is no separate inference folder.

- Annotations (`annotation` tag) — training masks and labels, stored under `uploads/annotations`. They must match the dimensions of their raw images.

- Imported models are placed under `uploads/imported_models` when you upload external model files.

## models

Trained models produced by the training modules.

- Each model carries a method tag (`segmentation`, `denoising`, or `unspecified`) plus a type tag (`weights`, `config`, or `info`).

- Segmentation models live under `models/segmentation/<id>` and denoising models under `models/denoising/<id>`.

## results

Outputs from the processing modules.

- Each result carries a method tag (`segmentation`, `denoising`, `annotation`, or `mesh`) plus a type tag (`data`, `info`, or `wip`).

- Results are stored per job under `results/segmentation/<id>`, `results/denoising/<id>`, `results/meshes/<id>`, `results/preprocess/<id>`, `results/stitching/<id>`, and `results/segcleanup/<id>`.

## Searching by Category

Type a category name (`uploads`, `models`, `results`), a tag, or a tag synonym into the search box to filter files — for example `model`, `mesh`, or `annotation`. See the Search & Filter article for the full keyword list.
