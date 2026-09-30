---
id: segmentation.config.starting-point
title: Starting Point
displayTitle: Starting Point (Segmentation)
category: parameter
module: segmentation
tags:
  - segmentation
  - training
  - fine-tuning
  - bioimageio
  - configuration
  - pretrained
seeAlsoManual:
  - segmentation.step2
  - segmentation.step1.bioimageio
  - segmentation.step1.bioimageio-package
  - file-browser.bioimageio-export
seeAlsoTags:
  - fine-tuning
  - training
parameterImpact: |
  Starting from a trained model usually reaches a good result in far fewer epochs than a new model, and it is the way to adapt a zoo model to your data. Keep the learning rate low (1e-4 is the default here) so the pretrained weights are refined, not overwritten.
---

# Starting Point

Train a new model, continue training a workspace model, or fine-tune a bioimage.io model on your annotations.

The training run in Step 3 always uses the training pairs you validated in Step 1. What differs is where the weights start:

- **New model**: random weights, with the architecture you set below (features and layers). This is the default.
- **Continue from a workspace model**: pick a `.pth` model from Model Files (one trained here before, or an imported one). The architecture is fixed by that model, so the features and layers fields are locked. The result is a new `.pth` model, listed under Model Files with a processing history that points at the parent and the training pairs.
- **Fine-tune a bioimage.io model**: pick a package from Model Files (an uploaded package or one exported from a workspace model) or a zoo model from the list. The model's own preprocessing is applied to your slices, its architecture is trained further, and the result is a new bioimage.io package. When training finishes, that package is selected for Step 4 and appears under Model Files, ready for tiled inference, for another round of fine-tuning, or for download.

## What is checked when you pick a model

The choice is checked against your training pairs at once:

- **Classes.** A model with a softmax over C channels needs annotations with exactly C classes (background included; class k goes to channel k). A model with a single sigmoid channel needs annotations with exactly two classes (background and one foreground class). A mismatch is refused with the numbers; change the annotations or pick another model.
- **Patch size.** Some bioimage.io models declare a fixed input size (often 256) or a size rule (a minimum plus multiples of a step). The patch size list only offers sizes the model accepts.
- **Head.** Zoo models that can be fine-tuned are those with a softmax over classes, one sigmoid channel, or one channel of probabilities. Models that predict foreground plus boundaries, 3D models and models with torchscript weights only are not listed. The zoo list is narrowed further to models whose class count matches your pairs, so with three or more classes only softmax models remain, and the zoo's single-channel models appear for two-class annotations.

## Defaults for fine-tuning

Choosing a starting model sets the learning rate to 1e-4 and the epochs to 30, unless you edited those fields yourself. Choosing "New model" restores 1e-3 and 100. Patches, augmentation and the validation split work as for any run.

## What the run looks like

Step 3 shows extra stages for a bioimage.io parent: loading the model (a zoo model is downloaded on first use), then, after the last epoch, writing the package and running its self-test. A package that fails its self-test is not kept and the run reports the failure.
