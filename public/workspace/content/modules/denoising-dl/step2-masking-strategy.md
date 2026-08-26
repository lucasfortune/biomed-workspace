---
id: denoising-dl.step2.masking-strategy
title: Masking Strategy
category: parameter
module: denoising-dl
tags:
  - denoising
  - n2v
  - masking
  - blind-spot
  - advanced
seeAlsoManual:
  - denoising-dl.step2.mask-percentage
  - denoising-dl.step3.n2v
seeAlsoTags:
  - n2v
  - advanced
parameterImpact: |
  Affects how the network learns to fill masked regions. UPS 5×5 is the publication-faithful default for the plain N2V branch; strategy 4 is used automatically for the StructN2V branch.
---

# Masking Strategy

Choose how masked pixels are replaced during blind-spot training.

Blind-spot training masks pixels and predicts them from surrounding context. This parameter controls what value is used to replace masked pixels (and, for the structured-noise branch, how neighbouring pixels are handled).

## Local Mean (Strategy 0)

Masked pixels are replaced with the mean value of their local neighborhood. The network sees a reasonable initial guess without the true value being leaked. Legacy default; works for Gaussian-like noise.

## Zeros (Strategy 1)

Masked pixels are set to zero. The network must predict from context with no hint about the pixel value. Can work well when noise has non-zero mean.

## Random (Strategy 2)

Masked pixels are replaced with random values from the image. Provides variety but can sometimes confuse the network.

## UPS 5×5 (Strategy 3), default for plain N2V

Uniform Pixel Selection from a 5×5 neighbourhood, the publication-faithful N2V masking strategy (Krull et al. 2019). Replaces the masked centre with a randomly sampled neighbour pixel from a 5×5 window around it. This is the default for the plain N2V branch, validated by the CAREamics reference implementation.

## UPS center + struct neighbors (Strategy 4), used by the StructN2V branch

Applies UPS only to the prediction centre; structural-kernel neighbour pixels (defined by the automatically discovered spine mask) are replaced with random values. This is required for the StructN2V branch because pure UPS (strategy 3) would leak correlated noise through the structural footprint. Matches the CAREamics struct-mask strategy.

## Recommendations

- **Plain N2V branch**: UPS 5×5 (strategy 3). Paper-faithful, validated.
- **StructN2V branch**: UPS center + struct neighbors (strategy 4). Selected automatically when the router chooses the structured branch.
- Local Mean / Zeros / Random: Legacy options, kept for experimentation. Not recommended for new training runs.

## References

- Krull, A., Buchholz, T.-O., & Jug, F. (2019). Noise2Void: Learning Denoising From Single Noisy Images. *CVPR 2019.* https://doi.org/10.1109/cvpr.2019.00223
- Broaddus, C. et al. (2020). Removing structured noise with self-supervised blind-spot networks. (StructN2V, basis for strategy 4.)
- CAREamics 0.1.0 reference implementation (validates UPS masking).
