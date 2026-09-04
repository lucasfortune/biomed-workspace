---
id: preprocess.step2.crop
title: Crop and Z Range
category: process
module: preprocess
tags:
  - preprocess
  - crop
  - z-range
  - lineage
seeAlsoManual:
  - preprocess
  - preprocess.step2.geometry
  - preprocess.step2.intensity
seeAlsoTags:
  - crop
  - preprocess
---

# Crop and Z Range

Restrict the stack to a rectangular region in xy and to a contiguous range of slices in z. Both are optional; leave them untouched to keep the full stack.

## Cropping in XY

There are two ways to set the crop rectangle:

- Draw on image: click "Draw on image", then drag on the preview to draw the rectangle. The rectangle is outlined and the area outside it is dimmed. Drawing ends when you release, and "Clear" removes the crop.

- Numeric inputs: type x, y, w, and h directly. x and y are the top-left origin; w and h are the width and height.

Both methods use the same coordinates:

- Coordinates are in the original image frame, not the (possibly downsampled) preview.

- Values are clamped to the stack size. x must fall within the image width and y within the height; w and h are limited so the rectangle stays inside the frame.

- A typed value must be a whole number inside the stack. While a field is out of range, its message shows and the crop keeps its previous value until you fix the entry.

## Z-Range Trim

- Set "first" and "last" to keep only that slice range.

- Slice numbers are 1-based and inclusive: "first" and "last" are both kept.

- Leave the fields untouched to keep the whole stack.

## Crop Origin and Lineage

When a crop or z-range is applied, the crop origin (x, y, z) is recorded on the output file's lineage. The stitching module reads this origin to prefill its recipe, so cropping here stays consistent with a later stitch.
