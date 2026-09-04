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
  100 epochs is a reasonable default. Training always runs for the full number of epochs you set, so higher values take proportionally longer. Use fewer epochs (50) for quick experiments.
---

# Number of Epochs

How many complete passes through the training data.

An epoch is one complete pass through all training patches. More epochs give the model more opportunities to learn from the data, but too many can lead to overfitting (memorizing the training data rather than learning general patterns).

Training runs for the full number of epochs you set — there is no early stopping. After every epoch the validation Dice score is checked, and whenever it reaches a new high the model is saved as best_model.pth. At the end of training, that single best-scoring checkpoint is the model you keep, so a few extra epochs never overwrite a better earlier result.
