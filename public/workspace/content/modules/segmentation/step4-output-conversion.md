---
id: segmentation.step4.output-conversion
title: Output Conversion
displayTitle: Output Conversion (bioimage.io)
category: process
module: segmentation
tags:
  - segmentation
  - bioimageio
  - inference
  - threshold
  - argmax
  - classes
seeAlsoManual:
  - segmentation.step1.bioimageio
  - segmentation.step4
seeAlsoTags:
  - bioimageio
  - inference
---

# Output Conversion

How the channels a bioimage.io model predicts become the class labels of a workspace segmentation.

A zoo model does not return class labels. It returns one or more channels of values between 0 and 1, and the model description does not say what the channels mean. The workspace therefore asks you for the rule that turns them into a class map. The rule is recorded in the result's metadata file.

## One class per channel (threshold)

Each channel is thresholded on its own. Pixels above the threshold in channel 1 become class 1, pixels above the threshold in channel 2 become class 2, and so on; where channels overlap, the later channel wins. Everything else is background.

This is the right rule for the common electron microscopy models that predict a foreground channel and a boundary channel: class 1 is the object, class 2 its boundary. It is also the only rule for single-channel models, where it simply thresholds the foreground probability.

## Argmax

Every pixel takes the channel with the highest value; the class id equals the channel index, so channel 0 is background. This is the right rule for models whose channels are mutually exclusive classes, typically those that declare a softmax step. The threshold is not used.

## Default

The workspace preselects argmax when the model declares a softmax, and one class per channel otherwise. Change it when the model's documentation says something else, and check the result in the Image Viewer.

Controls that do not apply are greyed out rather than hidden: for a single-channel model both rules are greyed with "one class per channel" selected, and with argmax selected the threshold is greyed. The block always looks the same, whichever model is loaded.

## Threshold

The default is 0.5. Lower it when objects come out fragmented, raise it when the prediction bleeds into the background. The threshold applies to every channel.
