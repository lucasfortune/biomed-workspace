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

Every file belongs to one of three categories, **uploads**, **models** or **results**, and carries tags that say what it is and which module produced it. The tree in the sidebar follows the folders on disk; the category and the tags drive search and the file selectors of the modules.

## uploads

Data you bring into the workspace. The kind of an upload is detected from the file itself (see Uploading Files).

- Raw images (`raw` tag): source TIFF/MRC stacks, stored under `uploads/raw`. They are the inputs for denoising, annotation and segmentation. Data uploaded for inference lands here too.

- Annotations (`annotation` tag): label masks, stored under `uploads/annotations`. They must match the dimensions of their raw images. Annotations you make in the workspace are results (below), not uploads.

Uploads keep their original file name on disk. A second upload of the same name gets a numbered suffix.

## models

Model files, trained here or imported.

- Each model carries a method tag (`segmentation`, `denoising`, `bioimageio` or `unspecified`) plus a type tag (`weights`, `config`, `info` or `card`).

- Training runs write to `models/segmentation/train<n>` and `models/denoising/dn<n>`: the weights (`best_model.pth`), the config and the results summary. Config and results are companions of the weights and are deleted with them.

- Imported model files (`.pth`, `.json`, bioimage.io `.zip` packages) go to `models/imported`.

- bioimage.io packages exported from a workspace model go to `models/bioimageio/export<n>`; a model chosen from the zoo leaves a model card (`card` tag) under `models/bioimageio/zoo/<model id>`.

## results

Outputs of the processing modules.

- Each result carries a method tag (`segmentation`, `denoising`, `annotation`, `mesh`, `preprocess`, `stitching` or `segcleanup`) plus a type tag (`data`, `info`, `wip`, `recipe` or `report`).

- Every run gets a numbered folder: `results/segmentation/seg<n>`, `results/denoising/filter<n>` and `dn<n>`, `results/preprocess/prep<n>`, `results/stitching/stitch<n>`, `results/segcleanup/clean<n>`, `results/meshes/mesh<n>` and `results/annotation/annot<n>`. The numbers count up per workspace and never repeat.

- Inside a run folder the files carry their display names, so `results/segmentation/seg3/` holds `trypB_seg.tif` and `trypB_seg_info.json`. Training and mesh folders keep their conventional file names (`best_model.pth`, `mesh.obj`).

- Info, config and recipe files are companions of the main output: deleting the output deletes them too.

## Searching by Category

Type a category name (`uploads`, `models`, `results`), a tag, or a tag synonym into the search box to filter files, for example `model`, `mesh` or `annotation`. See the Search & Filter article for the full keyword list.
