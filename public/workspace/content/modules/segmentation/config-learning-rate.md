---
id: segmentation.config.learning-rate
title: Learning Rate
displayTitle: Learning Rate (Segmentation)
category: parameter
module: segmentation
tags:
  - segmentation
  - training
  - learning-rate
  - configuration
  - optimization
seeAlsoManual:
  - segmentation.config.batch-size
seeAlsoTags:
  - training
  - optimization
parameterImpact: |
  Higher values train faster but risk instability. Lower values are more stable but train slowly. The default value of 0.001 works well for most cases. Reduce if training is unstable.
---

# Learning Rate

Controls how quickly the model adapts to the training data.

The learning rate determines the step size when updating model weights during training. This is one of the most important hyperparameters affecting training success.

A learning rate that's too high can cause training to diverge (loss increases or oscillates wildly). A learning rate that's too low will result in very slow training that may get stuck.
