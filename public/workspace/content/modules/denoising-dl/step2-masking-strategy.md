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
  Affects how the network learns to fill masked regions. UPS 5×5 is the publication-faithful default for plain N2V; strategy 4 is required for autoStructN2V Stage 2.
---

# Masking Strategy

Choose how masked pixels are replaced during N2V training.

N2V training masks random pixels and predicts them from surrounding context. This parameter controls what value is used to replace masked pixels (and, for structured-noise variants, how neighbouring pixels are handled).

## Local Mean (Strategy 0)

Masked pixels are replaced with the mean value of their local neighborhood. The network sees a reasonable initial guess without the true value being leaked. Legacy default; works for Gaussian-like noise.

## Zeros (Strategy 1)

Masked pixels are set to zero. The network must predict from context with no hint about the pixel value. Can work well when noise has non-zero mean.

## Random (Strategy 2)

Masked pixels are replaced with random values from the image. Provides variety but can sometimes confuse the network.

## UPS 5×5 (Strategy 3) — default for plain N2V

Uniform Pixel Selection from a 5×5 neighbourhood — the publication-faithful N2V masking strategy (Krull et al. 2019). Replaces the masked centre with a randomly sampled neighbour pixel from a 5×5 window around it. This is the default for plain N2V and for autoStructN2V Stage 1, validated by the CAREamics reference implementation.

## UPS center + struct neighbors (Strategy 4) — default for autoStructN2V Stage 2

Applies UPS only to the prediction centre; structural-kernel neighbour pixels (defined by the auto-discovered mask from Stage 1) are replaced with random values. This is required for autoStructN2V Stage 2 because pure UPS (strategy 3) would leak correlated noise through the structural footprint. Matches the CAREamics struct-mask strategy.

## Recommendations

- **Plain N2V**: UPS 5×5 (strategy 3). Paper-faithful, validated.
- **autoStructN2V Stage 1**: UPS 5×5 (strategy 3). Stage 1 is a vanilla N2V pre-denoising step.
- **autoStructN2V Stage 2**: UPS center + struct neighbors (strategy 4). Required for the structural mask.
- Local Mean / Zeros / Random: Legacy options, kept for experimentation. Not recommended for new training runs.

## References

- Krull, A., Buchholz, T.-O., & Jug, F. (2019). Noise2Void — Learning Denoising From Single Noisy Images. *CVPR 2019.* https://doi.org/10.1109/cvpr.2019.00223
- Broaddus, C. et al. (2020). Removing structured noise with self-supervised blind-spot networks. (StructN2V — basis for strategy 4 in autoStructN2V Stage 2.)
- CAREamics 0.1.0 reference implementation (validates UPS masking).
