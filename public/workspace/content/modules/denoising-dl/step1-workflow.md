---
id: denoising-dl.step1.workflow
title: Workflow Options
displayTitle: Workflow Options (DL Denoising)
category: process
module: denoising-dl
tags:
  - denoising
  - workflow
  - training
  - import
seeAlsoManual:
  - denoising-dl.step1.input
  - denoising-dl.step1.import.config
seeAlsoTags:
  - workflow
  - training
---

# Workflow Options

Choose between training a new model from scratch or using a previously trained model.

Train from Scratch

Upload your noisy images and train a new denoising model. The model learns the noise characteristics specific to your data. Training also denoises your input images — you get results as soon as training completes.

## Best when

- This is your first time processing this type of data

- Your images have different noise characteristics than previous datasets

- You want optimal results tailored to your specific images

Import Previously Trained Model

Use an existing model to denoise new images without retraining. This is much faster since you skip the training step entirely.

## Best when

- You have a model from a previous training session

- Your new images have similar noise characteristics to the original training data

- You want quick results and already have a working model

Important: Imported models work best on images from the same acquisition conditions as the original training data.
