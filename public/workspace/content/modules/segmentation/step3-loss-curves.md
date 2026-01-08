---
id: segmentation.step3.loss-curves
title: Loss Curves
displayTitle: Loss Curves (Segmentation)
category: metric
module: segmentation
tags:
  - segmentation
  - training
  - loss
  - metrics
  - convergence
seeAlsoManual:
  - segmentation.step3.dice-score
  - segmentation.step3
seeAlsoTags:
  - training
  - metrics
---

# Loss Curves

The loss measures how different the model's predictions are from your annotations — lower is better.

Loss is a numerical measure of prediction error. The chart shows two curves:

Training Loss (red): Error on the patches used for learning. Should decrease steadily as the model learns.

Validation Loss (blue): Error on held-out patches not used for training. Shows how well the model generalizes to unseen data.

## What to look for

Healthy Training: Both curves decrease together and eventually flatten. The validation loss may be slightly higher than training loss.

Overfitting: Training loss continues to decrease but validation loss starts increasing. The model is memorizing training data rather than learning generalizable patterns. Consider reducing epochs or adding more training data.

Underfitting: Both losses remain high and don't decrease much. The model isn't learning effectively. Try increasing model capacity (more features/layers) or training longer.

Instability: Losses jump around erratically. Try reducing the learning rate for smoother optimization.
