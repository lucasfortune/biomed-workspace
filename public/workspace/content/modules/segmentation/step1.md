---
id: segmentation.step1
title: Training Data or Model
category: process
module: segmentation
tags:
  - segmentation
  - upload
  - workflow
  - training-data
  - annotations
seeAlsoManual:
  - segmentation
  - segmentation.step1.workflow-choice
seeAlsoTags:
  - upload
  - annotations
---

# Training Data or Model

Step 1 is where you provide what the pipeline works from. Start by choosing a workflow, then fill in the inputs that workflow needs.

## What This Step Does

- Pick a workflow — train a new model, or import one you already have; the "Choose Workflow" help explains how to decide

- Provide the matching inputs for that workflow using the file selectors below the choice

- Advance when the required inputs are in place: training continues to Step 2 (Configure), import jumps to Step 4 (Inference)

## Inputs by Workflow

- Train from scratch: raw training images and their annotation masks

- Use a pretrained model: the model weights (.pth) and its configuration (.json)

Each selector has its own help icon describing the file it expects and how to prepare it.
