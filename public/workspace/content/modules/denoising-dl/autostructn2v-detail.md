---
id: denoising-dl.autostructn2v-detail
title: autoStructN2V Explained
category: concept
module: denoising-dl
tags:
  - denoising
  - autostructn2v
  - structured-noise
  - two-stage
seeAlsoManual:
  - denoising-dl.step1.method
  - denoising-dl.step1.mode
  - denoising-dl.step3.autostructn2v
seeAlsoTags:
  - autostructn2v
  - structured-noise
---

# autoStructN2V Explained

A two-stage deep learning approach that automatically detects and removes structured noise patterns from images.

autoStructN2V extends Noise2Void to handle structured (correlated) noise that standard N2V cannot fully remove.

## Why Standard N2V Falls Short

N2V assumes noise is independent between pixels. When noise has structure — like horizontal scan lines or periodic patterns — neighboring pixels share correlated noise. N2V's masking strategy cannot distinguish this correlated noise from real image features.

## How autoStructN2V Works

Stage 1: Standard N2V Training

First, a standard N2V model is trained. This removes most random noise but leaves structured patterns partially intact.

Mask Extraction

The system analyzes the difference between the original and denoised images in Fourier space. Periodic patterns appear as peaks in the frequency domain. These are automatically detected and converted into a spatial mask showing the noise structure.

Interactive Mask Review

You can review and adjust the detected noise pattern before proceeding. This ensures the mask correctly captures the structured noise without including real image features.

Stage 2: Structure-Aware Training

A second N2V model is trained using the noise mask. During training, pixels are masked according to the detected noise pattern, teaching the network to specifically remove that structure.

## When to Use autoStructN2V

- Visible line artifacts in EM tomography reconstructions

- Periodic patterns from detector readout

- Camera-specific fixed-pattern noise

- Any noise with visible spatial correlation or structure

2.5D Mode:

In 2.5D mode, autoStructN2V extends its analysis to 3D, detecting noise correlations across consecutive slices. The mask becomes three-dimensional (Z-1, Z center, Z+1), allowing the network to learn inter-slice noise patterns. See the 2.5D Mode article for details.
