---
id: segmentation.config.num-features
title: Number of Features
displayTitle: Number of Features (Segmentation)
category: parameter
module: segmentation
tags:
  - segmentation
  - training
  - architecture
  - configuration
  - model
seeAlsoManual:
  - segmentation.config.num-layers
seeAlsoTags:
  - architecture
  - model
parameterImpact: |
  Higher values (up to the maximum of 128) create more powerful models but need more memory. Lower values (32, 48) train faster and use less memory. Start with 64 for most biomedical images.
---

# Number of Features

Base number of convolutional filters in the U-Net model.

This controls the initial number of feature maps (filters) in the first layer of the U-Net. The number of features doubles at each encoding stage and halves at each decoding stage.

The selectable values are 32, 48, 64, 96, and 128. More features allow the model to learn more complex patterns but require more GPU memory and training time. Fewer features create a lighter model that trains faster but may miss subtle details.
