---
id: stitching.step1.stacks
title: Selecting and Ordering Stacks
category: data
module: stitching
tags:
  - stitching
  - input
  - ordering
  - data-mode
seeAlsoManual:
  - stitching
  - stitching.step1.workflow
  - stitching.step2.slice-pair
seeAlsoTags:
  - stitching
  - input
---

# Selecting and Ordering Stacks

Add the stacks you want to join and arrange them in order. The list order defines the reference and the alignment chain, so it matters.

## Ordering

- The top of the list is the reference stack, the top of the assembled volume

- Each following stack is aligned against the one directly above it

- Reorder with the up and down arrows, or remove a stack with the times button

- You need at least two stacks before you can move to Align

## Data Mode

- The mode is detected from the first stack you add and shown in a badge: "images (grayscale)" or "label maps (segmentations, annotations)"

- Images are raw uploads or processed grayscale results; label maps are segmentation results and annotation masks

- Images and label maps are never mixed in one stitch; once the first stack sets the mode, incompatible files are filtered out of the picker and cannot be added

## Adding Stacks

- Pick from workspace files, recent results, uploads, or built-in test data

- Only multi-page TIFFs of a known, compatible data mode are selectable; recipe and info files are excluded

- A file already in the list will not appear again

- Removing every stack clears the mode, so you can start over with the other data type
