---
id: file-browser.bioimageio-export
title: bioimage.io Export
displayTitle: bioimage.io Export
category: feature
module: file-browser
tags:
  - file-browser
  - bioimageio
  - export
  - model
  - package
  - segmentation
seeAlsoManual:
  - file-browser.file-operations
  - segmentation.step1.bioimageio-package
  - segmentation.step1.bioimageio
seeAlsoTags:
  - bioimageio
  - export
---

# bioimage.io Export

Turn a U-Net trained in the workspace into a bioimage.io model package that other tools, the model zoo and the workspace itself can run.

Right-click a `.pth` model file under models in the file browser and choose **Export as bioimage.io package...**. This works for models trained in the Segmentation module and for `.pth` files you imported, as long as they are workspace checkpoints.

## The dialog

- **Name**: the model name in the package. The default is built from the model file's name.
- **License**: CC-BY-4.0 (the zoo's usual choice), MIT, BSD-3-Clause or CC0-1.0.
- **Sample image**: a raw TIFF from your workspace. A centre crop of its middle slice becomes the package's test input, the model's prediction for it the test output, and both make the cover picture. The image the model was trained on is preselected when the workspace knows it.

The author recorded in the package is the full name of your account.

## What happens

The export runs on the server in four stages: loading the checkpoint, tracing the network to TorchScript, writing the package, and running the package's own self-test for both weight formats. It takes a few seconds for a small model and up to a minute for a large one. A package that fails its self-test is not kept; the message names the failing check.

The result is a zip under models in the file browser, tagged `bioimageio`, with a processing history pointing at the model file and the sample image. It contains the model description (rdf.yaml), the architecture file, the state dict, the TorchScript copy, the test tensors, a cover image and a README with the training settings.

## Using the package

- **In the workspace**: select it in the Segmentation module under Step 1, *Use a bioimage.io Model*, as an uploaded package. It then runs with tiled inference and a halo, so the image size no longer has to be a multiple of 2 to the number of layers. The output conversion defaults to argmax, which gives the same class map as the model's ordinary run.
- **As a starting point**: pick it under Starting Point in Step 2 of a training run to fine-tune it on corrected annotations; the result is another package.
- **Elsewhere**: download the zip and open it in any tool that reads bioimage.io packages (for example ilastik, deepImageJ, QuPath or napari), or upload it to [bioimage.io](https://bioimage.io) for publication.

## Normalisation note

The workspace scales each slice by its maximum. The package declares min-max scaling instead, because the model description format has no "divide by maximum" step. Both are the same for images whose darkest pixel is 0, and differ by a constant offset otherwise. The package README states this.
