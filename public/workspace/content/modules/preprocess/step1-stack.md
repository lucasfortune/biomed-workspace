---
id: preprocess.step1.stack
title: Select Stack
category: data
module: preprocess
tags:
  - preprocess
  - input
  - grayscale
seeAlsoManual:
  - preprocess
  - preprocess.step2.crop
seeAlsoTags:
  - input
  - preprocess
---

# Select Stack

Pick the grayscale image stack to preprocess. The result is saved as a new file, so the original is never changed.

## Compatible Data Sources

- Raw uploads: image stacks in the workspace tagged as raw uploads

- Recent results: grayscale processing results, including denoised and preprocessed stacks

- Test data: the built-in sample raw stack

## What Is Not Listed

- Segmentations and label maps are excluded. In the Recent Results list, results tagged as segmentation are filtered out, and only grayscale data results are shown. Segmentations have their own operations in the segmentation cleanup module.

## File Requirements

- Format: multi-page TIFF (.tif, .tiff)

- Content: grayscale intensity data (not class labels)

## After Selecting

Once you pick a stack, the module reads its dimensions, slice count, data type, and voxel size, and samples an intensity histogram. These details are shown beside the selection, and the current slice starts at the middle of the stack. The Adjust step becomes available once the stack info loads successfully.
