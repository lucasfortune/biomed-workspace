---
id: segmentation.step1.bioimageio-package
title: bioimage.io Package Upload
displayTitle: bioimage.io Package Upload (Segmentation)
category: data
module: segmentation
tags:
  - segmentation
  - bioimageio
  - package
  - upload
  - zip
seeAlsoManual:
  - segmentation.step1.bioimageio
  - segmentation.step1.model-file
seeAlsoTags:
  - bioimageio
  - upload
---

# bioimage.io Package Upload

Use a bioimage.io model that is not in the zoo, for example one you exported from another tool or received from a collaborator.

A bioimage.io package is a zip file containing the model description (rdf.yaml or bioimageio.yaml), the weights and, for PyTorch state dict models, the Python file that defines the architecture. Upload it through the file browser under Model Files, or with the upload button of this selector. The file appears here once it is in the workspace.

## Requirements

The same rules as for zoo models apply: torch weights, one single-channel input, 2D or 3D. Packages with other weight formats (ONNX, TensorFlow, Keras) are refused with a message naming the formats found.

## Security note

A state dict package runs its own architecture code on the server when the model is loaded. Zoo models are reviewed before publication; an uploaded package is not. This is the same trust you already extend to a .pth file imported with its config. Package upload therefore needs an approved account, like every custom upload.

## Provenance

The uploaded zip itself is the model file that every result points at in its lineage. There is no separate model card for uploads.
