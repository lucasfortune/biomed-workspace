---
id: segmentation.step1.bioimageio
title: bioimage.io Models
displayTitle: bioimage.io Models (Segmentation)
category: data
module: segmentation
tags:
  - segmentation
  - bioimageio
  - model zoo
  - pretrained
  - inference
seeAlsoManual:
  - segmentation.step1.bioimageio-package
  - segmentation.step4.output-conversion
  - segmentation.step1.workflow-choice
  - segmentation.config.starting-point
seeAlsoTags:
  - pretrained
  - inference
---

# bioimage.io Models

Run a published model from the bioimage.io model zoo on your stack without training anything.

The bioimage.io model zoo is a community collection of trained deep learning models for microscopy, each shipped with a description of its inputs, outputs and preprocessing. The workspace lists the models it can run, downloads a model on first use and applies it with tiled inference.

## Which models are listed

The list is filtered to what this workspace can execute and what makes sense as a segmentation:

- PyTorch weights (torchscript or a state dict with the packaged architecture)

- One input tensor with a single grayscale channel

- 2D models (applied slice by slice) or 3D models (applied to the whole stack)

- Tags that do not mark the model as denoising, restoration, super-resolution, classification or in-silico labelling

- For models that ship only a PyTorch state dict: the packaged Python file that builds the network imports only packages installed on this server. Models that fail this check are not listed; a line at the end of the list says how many were left out for that reason

Tick "Show all runnable models" to lift the tag filter. Denoising models will then appear as well, but their output is an image, not labels, so the conversion to a class map is not meaningful for them.

## What happens when you select a model

- Only the model description is fetched; the weights are downloaded when the first run starts. The server keeps one shared copy, so later runs and other users do not download again.

- A small model card is written to your workspace under models in the file browser. Every result the model produces records that card in its lineage.

- The card in this step shows the input geometry, the number of output channels, the weight format, the license and the citation. Zoo models are published under their own licenses; cite them when you use their output.

- An uploaded package that ships only a PyTorch state dict is checked the same way at selection: if its architecture file imports packages the server does not have, the model is refused with their names. Ask the administrator to install them, or choose a model that also provides torchscript weights (those need nothing beyond PyTorch).

## Tiled inference

Zoo models declare the tile size they accept and the border they need. The workspace splits every slice into overlapping tiles, runs them and stitches the predictions back, so the "divisible by 2 to the power of layers" rule of the workspace U-Net does not apply here. Models with a fixed tile size are tiled at that size.

## What to expect

Zoo models were trained on specific datasets. On unlike data the result can be poor; that is normal, not a failure. Use Correct in Annotation on the result, fix the worst slices, and train a workspace model on the corrected annotation. A zoo prediction is often a good starting point for that loop.

If tile edges show in a result, the model is not confident anywhere on that data: its outputs sit close to the threshold, so the tiny differences between neighbouring tiles flip pixels from one class to the other. On data the model handles, the tiled and the whole-image prediction agree to well under a percent, and the edges disappear.

3D models load the whole stack into memory as float values. Runs above 1.5 billion voxels are refused; crop or downsample such stacks first.

## Fine-tuning a zoo model

A zoo model whose output is a softmax over classes or a single sigmoid channel can also be trained further on your annotations: choose Train from Scratch in Step 1, validate your pairs, and pick the model under Starting Point in Step 2. The result is a new bioimage.io package in your workspace.
