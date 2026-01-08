---
id: segmentation.config.batch-size
title: Batch Size
displayTitle: Batch Size (Segmentation)
category: parameter
module: segmentation
tags:
  - segmentation
  - training
  - batch
  - configuration
  - memory
seeAlsoManual:
  - segmentation.config.patch-size
  - segmentation.config.learning-rate
seeAlsoTags:
  - training
  - configuration
parameterImpact: |
  Larger values provide more stable training but require more memory. Smaller values use less memory but may result in noisier updates. Start with 4-8 and adjust based on your GPU memory.
---

# Batch Size

Number of image patches processed simultaneously during each training step.

Batch size controls how many patches are processed together before updating the model weights. This affects both training stability and memory usage.

Larger batch sizes generally provide more stable training gradients but require more GPU memory. Smaller batch sizes use less memory but may result in noisier training.
