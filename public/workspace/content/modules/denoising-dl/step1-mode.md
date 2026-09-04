---
id: denoising-dl.step1.mode
title: Legacy 2.5D Models
category: configuration
module: denoising-dl
tags:
  - denoising
  - 2.5d
  - legacy
  - import
  - inference
seeAlsoManual:
  - denoising-dl.step1.import.model
  - denoising-dl.step1.import.config
  - denoising-dl.step1.workflow
seeAlsoTags:
  - 2.5d
  - import
---

# Legacy 2.5D Models

New training runs are always 2D (slice by slice). The 2.5D option only applies when importing models trained with the previous version of this module.

The previous two-stage version of this module offered a 2.5D training mode that used triplets of consecutive slices (z-1, z, z+1) to predict the center slice. The current routed autoStructN2V method trains in 2D only, so 2.5D no longer appears in the training workflow.

## Importing Legacy 2.5D Models

Models trained in 2.5D by the old version can still be imported and used for inference:

- There is no 2.5D control to set. The mode is read from the imported config file: if it records a 2.5D model, slices are fed to the model as triplets automatically

- The stack you process should have contiguous slices (at least 3)

- Boundary slices (first and last) are copied from the original since they lack full triplet context

## Notes

- The config file saved with a legacy model records whether it was trained in 2D or 2.5D, and that is what determines how inference runs

- Legacy two-stage imports need both stage model files; see the Model Weights File article
