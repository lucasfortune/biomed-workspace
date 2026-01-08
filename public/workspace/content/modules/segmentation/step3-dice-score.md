---
id: segmentation.step3.dice-score
title: Dice Score
category: metric
module: segmentation
tags:
  - segmentation
  - training
  - dice
  - metrics
  - accuracy
seeAlsoManual:
  - segmentation.step3.loss-curves
  - segmentation.step3
seeAlsoTags:
  - training
  - metrics
---

# Dice Score

The Dice score measures segmentation accuracy by comparing overlap between predictions and annotations — higher is better.

The Dice coefficient (also called F1 score for segmentation) measures how well the predicted segmentation overlaps with the ground truth annotations. It ranges from 0 to 1:

0.0 = No overlap at all (complete failure)

0.5 = Partial overlap

1.0 = Perfect overlap (predictions exactly match annotations)

## The chart shows

Training Dice (teal): Accuracy on training patches.

Validation Dice (purple): Accuracy on held-out validation patches. This is the more important metric as it shows real-world performance.

## What to look for

Good Progress: Both curves increase over time, with validation Dice reaching 0.7+ for typical biomedical segmentation tasks.

Gap Between Curves: A large gap where training Dice is much higher than validation Dice indicates overfitting.

Plateau: When curves flatten, the model has converged. Further training is unlikely to improve results significantly.

Typical Values: Dice scores of 0.8-0.9 are considered good for many biomedical applications. Scores above 0.9 indicate excellent segmentation quality.
