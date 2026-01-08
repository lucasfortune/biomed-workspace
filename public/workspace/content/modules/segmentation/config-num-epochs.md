---
id: segmentation.config.num-epochs
title: Number of Epochs
displayTitle: Number of Epochs (Segmentation)
category: parameter
module: segmentation
tags:
  - segmentation
  - training
  - epochs
  - configuration
  - duration
seeAlsoManual:
  - segmentation.config.learning-rate
seeAlsoTags:
  - training
  - duration
parameterImpact: |
  100 epochs is a reasonable default. The model saves checkpoints and uses early stopping, so training may end sooner if convergence is reached. Use fewer epochs (50) for quick experiments.
---

# Number of Epochs

How many complete passes through the training data.

An epoch is one complete pass through all training patches. More epochs give the model more opportunities to learn from the data, but too many can lead to overfitting (memorizing the training data rather than learning general patterns).

The training process includes early stopping, which automatically stops if validation performance stops improving, so you can set a high number of epochs as an upper limit.
