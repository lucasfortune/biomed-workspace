---
id: segcleanup.step2.quantification
title: Quantification and Reports
category: metric
module: segcleanup
tags:
  - segcleanup
  - quantification
  - metrics
  - volume
  - surface-area
  - report
seeAlsoManual:
  - segcleanup
  - segcleanup.step1.segmentation
  - segcleanup.step2.cleanup-ops
seeAlsoTags:
  - metric
  - quantification
---

# Quantification and Reports

Measure the current labels per class. Quantification runs automatically when you enter the edit step and stays visible below the viewer.

## Metrics

For each class the table reports:

- Voxels: total labeled voxels

- Volume: physical volume, shown only when the input has a voxel size

- Objects: number of 3D connected components

- Mean size: mean component size in voxels

- Largest: size of the largest component in voxels

- Surface area: computed with marching cubes; in physical units when a voxel size is set, otherwise in px²

Without a voxel size, physical columns are omitted and a hint points you to the file info dialog to set one.

## Staleness and Updating

When you paint or otherwise change labels, the metrics go stale: a "labels edited" badge appears with an "Update" button. Press Update to recompute against the current state. Applying automated cleanup recomputes quantification as part of that run.

## Create Report

"Create report (CSV)" registers the quantification as files in the file browser. Two CSVs are written:

- report.csv: the per-class summary (voxels, components, component-size statistics, and volume / surface area when available)

- objects.csv: one row per individual connected component

The report becomes available once quantification has produced results. Saved reports are tracked outputs and are kept even after their working copy is superseded.
