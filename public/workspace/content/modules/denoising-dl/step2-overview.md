---
id: denoising-dl.step2.overview
title: Configuration Overview
category: process
module: denoising-dl
tags:
  - denoising
  - configuration
  - parameters
  - presets
seeAlsoManual:
  - denoising-dl.step2.epochs
  - denoising-dl.step2.patch-size
  - denoising-dl.step2.mask-extractor.bg-side
seeAlsoTags:
  - configuration
  - parameters
---

# Configuration Overview

Configure training with a preset, then optionally adjust individual settings.

The configuration step controls how the denoising model is trained. Pick a preset for a quick start, or open the advanced options to fine-tune.

## Presets

The preset dropdown offers three options, each carrying the same validated recipe and differing only in compute budget:

- Fast: Quick preview: fewer epochs and fewer sampled patches. Same validated recipe, lower compute.

- Balanced: The publication training budget. Recommended for most use cases.

- High Quality: Extended training budget: more epochs and denser patch sampling. Longest runtime.

## Parameter Groups

Each recipe form has two groups:

- Training Budget: number of epochs, patches per image, batch size, and early stopping. These are the compute knobs the presets change.

- Advanced Options (collapsed by default): patch size, learning rate, mask percentage, and data augmentation. The network architecture itself is fixed to the published recipe and is no longer exposed; the defaults here are the validated values.

## N2V vs autoStructN2V

- For N2V, you configure a single recipe column.

- For autoStructN2V, two recipe columns appear side by side — an **N2V branch** and a **StructN2V branch**. The noise measurement routes each run to exactly one branch and only that branch trains, but you configure both here so either outcome is ready.

## Noise Measurement (autoStructN2V only)

autoStructN2V adds a **Noise Measurement** section. Background side is the one required choice (light, dark, or off). The advanced extractor knobs — Correlation Floor, Significance Threshold (|z|), and Max Masked Pixels — control how the structural mask is discovered. You can also adjust these later while reviewing the mask, since regenerating it only takes seconds.

## Real-Time Validation

Fields are validated as you type. Patch-size options larger than your image are disabled, out-of-range values are flagged, and the Next button stays blocked until every field is valid.

## After You Start

Pressing Start on the next step trains the model. You can Cancel Training at any time, and if you leave and return while a run is in progress, a resume dialog offers to reconnect to it. Only one training can run at a time across the whole workspace.
