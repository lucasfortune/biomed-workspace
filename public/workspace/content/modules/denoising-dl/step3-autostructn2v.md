---
id: denoising-dl.step3.autostructn2v
title: autoStructN2V Training Process
category: process
module: denoising-dl
tags:
  - denoising
  - autostructn2v
  - training
  - routing
  - mask-approval
seeAlsoManual:
  - denoising-dl.autostructn2v-detail
  - denoising-dl.routing-decision
  - denoising-dl.step3.loss
seeAlsoTags:
  - autostructn2v
  - training
---

# autoStructN2V Training Process

Noise measurement and routing in seconds, your approval, then a single training run.

autoStructN2V training has three phases:

1. Noise Measurement and Routing (seconds)

Right after you press Start, background regions are selected from your raw stack and the noise autocorrelation is measured. The router then decides: StructN2V with the discovered spine mask, or plain N2V if the noise has no usable directional structure. No GPU time is spent in this phase.

2. Mask and Route Review

The pipeline pauses and shows a route decision card (chosen branch, reason, Dmax versus threshold, mask coverage) alongside the mask visualization. See the Routing Decision article for what the numbers mean. Your options:

- Approve: continue with the routed branch and the shown mask

- Adjust and regenerate: change extractor parameters and recompute the mask in seconds

- Force plain N2V: override the router and train with the single-pixel center mask

An auto-approve toggle skips this pause if you prefer a hands-off run. When the router picks plain N2V, that is an informative outcome, not an error; approving simply continues as plain N2V.

3. Single Training and Denoising

Exactly one model trains with the approved mask, then the full stack is denoised. There are no separate stages anymore.

## What to expect

- Total time is comparable to a plain N2V run (the old two-stage flow took roughly twice as long)

- Loss curves behave like any blind-spot training; see Loss Curves

- The mask, route decision, model, and denoised stack are all saved with the results
