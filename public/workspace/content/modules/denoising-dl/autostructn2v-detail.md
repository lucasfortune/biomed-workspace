---
id: denoising-dl.autostructn2v-detail
title: autoStructN2V Explained
category: concept
module: denoising-dl
tags:
  - denoising
  - autostructn2v
  - structured-noise
  - routing
  - spine-mask
seeAlsoManual:
  - denoising-dl.step1.method
  - denoising-dl.routing-decision
  - denoising-dl.step3.autostructn2v
seeAlsoTags:
  - autostructn2v
  - structured-noise
---

# autoStructN2V Explained

A self-supervised method that measures your noise, decides automatically whether it is structured, and trains a single model with the right mask.

autoStructN2V (ASN2V) extends Noise2Void to handle structured (correlated) noise that standard N2V cannot fully remove.

## Why Standard N2V Falls Short

N2V assumes noise is independent between pixels. When noise has structure, like horizontal scan lines or detector streaks, neighboring pixels share correlated noise. The network can then "cheat" by copying the correlated noise from neighbors instead of removing it.

## How autoStructN2V Works

Noise Measurement on the Raw Stack

Before any training, background regions are selected automatically from your raw images. Your only required input is which intensity side the background is on (see Background Side). The noise autocorrelation function (ACF) is then measured on detrended background tiles. This takes seconds.

Routing Decision

A directionality statistic (Dmax) is computed from the ACF. If the noise shows usable directional correlation, the StructN2V branch is chosen with an automatically discovered mask. Otherwise the plain N2V branch is chosen, which is the same blind-spot training with a single-pixel (1x1) center mask. See the Routing Decision article for details.

Mask Discovery (StructN2V route)

The discovered mask is a "spine": one-pixel-wide line summaries of the significant ACF features (positive and negative correlations alike), ray-connected to the center and symmetric under 180-degree rotation. Two knobs control it: the Correlation Floor (effect-size floor) and the Spine Threshold (statistical certainty).

Your Approval, Then One Training

The mask and routing decision appear seconds after you press Start, before any GPU time is spent. You can approve, adjust parameters and regenerate (also seconds), or override to plain N2V. Then exactly one model trains, and your full stack is denoised.

## When to Use autoStructN2V

- Visible line artifacts in EM or tomography data

- Streaks or periodic patterns from detector readout

- Camera-specific fixed-pattern noise

- Whenever you are unsure: if no usable structure is found, the router falls back to plain N2V automatically

## Reference

Fortune (2026), the ASN2V paper. Code: https://github.com/lucasfortune/asn2v
