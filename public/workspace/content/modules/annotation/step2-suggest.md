---
id: annotation.step2.suggest
title: Suggestions (Pixel Classifier)
category: tools
module: annotation
tags:
  - annotation
  - classifier
  - suggestions
  - machine-learning
  - random-forest
seeAlsoManual:
  - annotation.step2.classes
  - annotation.step2.interpolation
seeAlsoTags:
  - classes
  - labels
---

# Suggestions (Pixel Classifier)

Let a classifier propose the annotation of a slice from a few strokes, the way ilastik and Labkit do. You paint examples, the module trains a random forest on per-pixel texture features, and the prediction appears as a translucent suggestion you can accept or correct.

## Background examples

In this workspace the background is never a label: pixels you do not paint stay 0. The classifier still needs examples of what to leave empty, so one class is marked as the background class. Its strokes are training examples only. When you create the final annotation, its pixels are written as 0, and the class is left out of the class list, so the segmentation module never sees it. Save Progress keeps the strokes so you can continue later. The class shows a "bg" badge in the class list.

## Getting a suggestion

1. Open the Suggest section and click Add background class, or pick an existing class in the dropdown. Paint a few strokes on it: cytoplasm, resin, anything that is not a structure you want.

2. Paint a few strokes of each structure class. Strokes on several slices help, and the strokes do not need to cover whole objects.

3. Click Suggest slice (or press S). Training takes a few seconds the first time and again whenever you change the labels; predicting a slice takes about a second.

4. The suggestion appears under your annotations at reduced opacity, stronger where the classifier is confident. It is only drawn where the slice is still empty, so it shows exactly what Accept would write.

5. Accept (or press A) writes the suggestion into the empty pixels of the slice as one undo step. Discard drops it. Then correct with brush, eraser and fill as needed.

## Settings

- Background class: strokes of this class teach the classifier what to leave empty. Suggest refuses to run without one.

- Min confidence: pixels predicted with lower confidence are left empty. Raise it for cleaner but sparser suggestions, lower it to fill more.

- Smooth result: a small median filter removes speckles from the prediction.

## Ranges

Enter a slice range and click Range to suggest many slices at once. Pending suggestions are shown as hollow marks above the slider. Step through them, accept or discard each, or use Accept all.

## How it interacts with the other tools

- Pixels of other classes are never overwritten, and locked classes gain no pixels.

- Accepted suggestions are marked like interpolated slices (light marks) until you paint on that slice. Those slices are not used for training, so the classifier keeps learning from your own strokes rather than from its previous output.

- Any label change (stroke, fill, undo, interpolation) makes the model stale; the next Suggest retrains automatically.

## Limits

The classifier looks at local texture and intensity at several scales. It is good at telling tissues apart (membranes, cytoplasm, dense organelles) and weak at object-level structure: thin membranes may come out broken and touching objects are not separated. Combine it with the fill tool and, for finished stacks, with the cleanup module.
