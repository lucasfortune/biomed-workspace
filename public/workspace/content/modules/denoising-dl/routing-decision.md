---
id: denoising-dl.routing-decision
title: Routing Decision
category: concept
module: denoising-dl
tags:
  - denoising
  - autostructn2v
  - routing
  - dmax
  - mask-approval
seeAlsoManual:
  - denoising-dl.autostructn2v-detail
  - denoising-dl.step3.autostructn2v
  - denoising-dl.step2.mask-extractor.bg-side
seeAlsoTags:
  - autostructn2v
  - routing
---

# Routing Decision

How autoStructN2V decides between structured masking and plain N2V, and what the numbers on the decision card mean.

After measuring the noise autocorrelation (ACF) on background regions of your raw stack, autoStructN2V decides which branch to train. The decision is shown seconds after you press Start, before any training.

## The Dmax Gate

Dmax measures how directional the noise correlation is. If Dmax is at or above the threshold of 0.012, the noise has usable directional correlation and the StructN2V branch is chosen, trained with the discovered spine mask. Below the threshold, the plain N2V branch is chosen: mechanically the same blind-spot training, but with a single-pixel (1x1) center mask.

## Routing to Plain N2V Is a Good Outcome

Structured masking only helps when the noise actually has directional structure. Applying a structural mask to unstructured noise removes useful context from the network without any benefit. When the router picks plain N2V, it has determined that your noise does not need the structured treatment. This is an informative result, not an error.

## Mask leak coverage (Σρ²)

For the StructN2V route, the decision card also reports **Mask leak coverage Σρ²**: the sum of squared correlations over the mask's off-center positions. It estimates the fraction of the center pixel's noise variance that the mask covers. Higher values mean the mask plugs more of the correlated noise.

## The Mask Review Panel

Alongside the decision card, the pause shows the discovered mask as a pixel grid:

- Statistics: kernel size, active pixels, pattern type, and coverage percentage

- A legend distinguishing active (masked) pixels, inactive pixels, and the center pixel

- An extractor parameter panel with sliders for Background Side, Correlation Floor, Significance Threshold (|z|), and Max Masked Pixels, plus **Reset to Defaults** and **Regenerate Mask** buttons

If the mask comes back with very few active pixels, a "Low Structural Noise Detected" warning appears with a shortcut to continue with plain N2V instead.

## Your Options at the Approval Pause

- Approve & Train: train the routed branch with the mask as shown. When the route is already plain N2V, this button instead reads **Continue with N2V**.

- Adjust and regenerate: change the extractor parameters (Background Side, Correlation Floor, Significance Threshold (|z|), Max Masked Pixels) and recompute the mask and routing decision, which again takes only seconds

- Use Plain N2V Instead: override the router and train with the 1x1 center mask instead (hidden when the route is already N2V)

An **Auto-approve** toggle lets training continue without the pause. It can only be set before the analysis runs — once the noise measurement completes, the toggle is disabled and you review the mask manually (unless auto-approve was already on).
