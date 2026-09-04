---
id: stitching.step2.auto-align
title: Auto-Align and Confidence
category: feature
module: stitching
tags:
  - stitching
  - auto-align
  - phase-correlation
  - confidence
seeAlsoManual:
  - stitching.step2.controls
  - stitching.step2.slice-pair
seeAlsoTags:
  - stitching
  - alignment
---

# Auto-Align and Confidence

Auto-align estimates the in-plane translation between the two slices of the current junction for you, so you can start from a close fit rather than dragging from scratch.

## How It Works

- Auto-align uses phase correlation on the declared slice pair to find the dx and dy that place the moving slice onto the fixed one

- For images it correlates the intensities; for label maps it correlates a boundary map extracted from the labels, since class IDs themselves carry no correlation meaning

- It runs coarse-to-fine: a downsampled pass first, then a refinement on full-resolution central windows

- It fills in dx and dy but does not estimate rotation; adjust rotation by hand if the slices are turned relative to each other

## The Confidence Score

- Each run returns a confidence score, the correlation of the overlap after the estimated shift, shown as "overlap correlation" in the viewer footer

- Above 0.5 the score is treated as good; at or below 0.5 it is flagged as poor

- Below 0.3 a warning appears, prompting you to check the slice pair and adjust manually

- Any manual nudge, drag, rotation, or Reset clears the score, because it no longer describes the current position

## If Confidence Is Low

- Confirm the slice pair really shows the same physical section

- Check for a large rotation, which auto-align does not correct

- Fall back to manual alignment: drag, arrow-key nudges, and the flicker toggle to verify the fit
