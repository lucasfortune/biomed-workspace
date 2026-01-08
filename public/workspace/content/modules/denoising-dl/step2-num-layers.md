---
id: denoising-dl.step2.num-layers
title: Number of Layers
displayTitle: Number of Layers (DL Denoising)
category: parameter
module: denoising-dl
tags:
  - denoising
  - architecture
  - layers
  - model
seeAlsoManual:
  - denoising-dl.step2.features
  - denoising-dl.step2.patch-size
seeAlsoTags:
  - architecture
  - model
parameterImpact: |
  More layers capture larger-scale patterns but need more memory. Match to your noise pattern size.
---

# Number of Layers

Depth of the U-Net encoder/decoder structure.

This sets how many encoding/decoding stages the network has. Each stage captures patterns at different scales.

## Fewer layers (2)

- Smaller receptive field

- Faster training

- Good for local noise patterns

## More layers (3-4)

- Larger receptive field

- Better for patterns spanning many pixels

- More memory and compute time

## Recommendations

- 2-3 layers for random noise

- 3-4 layers for structured noise with larger patterns

- Consider patch size — more layers need larger patches to be effective
