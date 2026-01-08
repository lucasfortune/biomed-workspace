---
id: denoising-dl.step2.features
title: Number of Features
displayTitle: Number of Features (DL Denoising)
category: parameter
module: denoising-dl
tags:
  - denoising
  - architecture
  - features
  - model
seeAlsoManual:
  - denoising-dl.step2.num-layers
seeAlsoTags:
  - architecture
  - model
parameterImpact: |
  More features create a more powerful model but require more memory and time. 64 features balance capability and efficiency.
---

# Number of Features

Base number of convolutional filters in the network.

This controls the initial number of feature maps (filters) in the first layer of the U-Net. More features mean a more powerful model.

## Fewer features (32-48)

- Smaller, faster model

- Less memory usage

- May miss complex noise patterns

## More features (64-128)

- More powerful model

- Better at learning complex patterns

- Requires more GPU memory and training time

## Recommendations

- 64 is a good default

- Reduce to 32 if memory is limited

- Increase to 96-128 for complex structured noise
