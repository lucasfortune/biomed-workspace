---
id: denoising-dl.step1.method
title: Denoising Methods
displayTitle: Denoising Methods (DL Denoising)
category: configuration
module: denoising-dl
tags:
  - denoising
  - n2v
  - autostructn2v
  - method-selection
seeAlsoManual:
  - denoising-dl
  - denoising-dl.autostructn2v-detail
  - denoising-dl.routing-decision
seeAlsoTags:
  - method-selection
---

# Denoising Methods

Choose autoStructN2V for automatic noise analysis and routing, or N2V to force plain blind-spot training.

autoStructN2V (auto-routed)

Best for: Most cases, including structured noise (scan lines, streaks, periodic artifacts)

How it works: The noise is measured on background regions of your raw stack in seconds. The router then chooses StructN2V with an automatically discovered mask (structured noise found) or plain N2V (no usable structure). You approve the mask and route before training begins.

Cost: One training run, comparable to N2V, plus a few seconds of noise measurement.

N2V (force plain)

Best for: Skipping noise measurement and mask approval entirely

How it works: Standard blind-spot training with a single-pixel mask. Effective on random, uncorrelated noise (Gaussian, Poisson).

Not sure which to choose?

Choose autoStructN2V. If your noise has no usable directional structure, the router selects plain N2V by itself, so you lose nothing.
