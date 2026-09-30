---
id: segmentation.config.validation-split
title: Validation Split
displayTitle: Validation Split (Segmentation)
category: parameter
module: segmentation
tags:
  - segmentation
  - training
  - validation
  - configuration
  - dataset
seeAlsoManual:
  - segmentation.step1.training-pairs
  - segmentation.step3.dice-score
seeAlsoTags:
  - training
  - validation
parameterImpact: |
  A larger split gives a more reliable validation Dice but leaves fewer slices for training. 15% suits most stacks; go lower only when very few slices are labelled, higher when you have many.
---

# Validation Split

Share of the labelled slices held back to measure the model instead of training it.

The validation slices are never used for weight updates. After every epoch the model is scored on them, and the checkpoint with the best validation Dice is the model you keep. The split is set in percent (5 to 40, default 15).

## How the slices are chosen

The split is applied per training pair, on that pair's labelled slices only. The validation slices are a contiguous block at the end of each pair's labelled slices, not a random pick: neighbouring slices of a stack look almost identical, and a random pick would let the model see near copies of its validation slices during training, which inflates the score. A pair with two or more labelled slices contributes at least one validation slice; a pair with a single labelled slice goes to training entirely.

There is no separate test split. The best validation Dice is the number reported for the run.
