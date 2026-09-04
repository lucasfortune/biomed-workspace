---
id: segcleanup.step2.cleanup-ops
title: Automated Cleanup
category: process
module: segcleanup
tags:
  - segcleanup
  - cleanup
  - merge
  - fill-holes
  - components
  - smoothing
seeAlsoManual:
  - segcleanup
  - segcleanup.step2.painting
  - segcleanup.step2.quantification
seeAlsoTags:
  - cleanup
  - process
---

# Automated Cleanup

Run label-cleaning operations over the whole stack at once. Configure the operations you want, then apply them; the editor reloads from the result.

## Operations

- Merge or remove classes: for each class, keep it, remove it (set to background), or merge it into another class value

- Fill holes: off, 2D (per slice), or 3D

- Min size: remove connected components smaller than the given number of voxels (0 leaves this off)

- Smooth: majority-filter boundary smoothing, with a radius from 0 to 5 (0 leaves this off)

## Fixed Order

When applied, the operations always run in the same order regardless of how you set them:

1. Merge / relabel classes

2. Fill holes (2D or 3D)

3. Remove small components (3D)

4. Smooth boundaries (majority filter, per slice)

Fill and smoothing only claim background voxels — they never overwrite the foreground of another class. The label bit depth (8-bit or 16-bit) is preserved.

## Applying

"Apply cleanup" runs on the full stack, including any unsaved paint edits, and produces a new working copy. The editor then reloads from that working copy: the cleaned labels replace what is on screen, the class list updates for any merges or removals, and the cleanup controls reset. You must configure at least one operation before applying. Quantification is recomputed as part of the same run.
