---
id: segmentation.step1.training-pairs
title: Training Pairs
category: data
module: segmentation
tags:
  - segmentation
  - training-data
  - pairs
  - partial-annotation
  - labelled-slices
seeAlsoManual:
  - segmentation.step1.raw-images
  - segmentation.step1.annotations
  - segmentation.config.validation-split
seeAlsoTags:
  - training-data
  - annotations
---

# Training Pairs

A training pair is one raw image stack together with the annotation stack that labels it. A run can train on one pair or on several, for example annotated stacks from different acquisitions.

## Adding pairs

- Select a raw stack and its annotations in the two selectors. The pair is validated at once; a single pair is enough to train.

- Click Add pair to keep it in the list and free the selectors for the next pair. Remove a pair with the cross at the end of its row.

- Every pair is checked on its own (matching width, height and slice count; 8-bit conversion if needed), then all pairs are validated together. The Next button opens once the whole list is valid.

## Which slices are used

Only labelled slices take part in training. A slice counts as labelled when its annotation has at least one non-zero pixel; slices with no labels at all are skipped, so you can annotate every fifth slice, or a few slices from each stack, and train on exactly those. The validation summary shows how many slices of each pair are labelled.

On a labelled slice, every unlabelled pixel is background. So finish the slices you include: a slice with only a few strokes teaches the model that everything else on it is background.

## Classes across pairs

Label values are mapped to class ids once for the whole list, so the same value means the same class in every pair. A class that is missing from one stack keeps its id everywhere; the summary warns you when the pairs do not all contain the same classes.

## Sizes

Pairs may differ in width and height. The patch size chosen in Step 2 must fit the smallest slice of all pairs.
