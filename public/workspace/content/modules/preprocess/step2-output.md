---
id: preprocess.step2.output
title: Output Data Type
category: parameter
module: preprocess
tags:
  - preprocess
  - dtype
  - bit-depth
  - output
seeAlsoManual:
  - preprocess
  - preprocess.step2.intensity
  - preprocess.step3.apply
seeAlsoTags:
  - dtype
  - preprocess
---

# Output Data Type

Choose the bit depth of the written stack.

## Options

- keep: keep the input's data type. Integer stacks keep their type and are written across that type's full range; float stacks stay as 32-bit float in the range 0 to 1.

- 8-bit: convert to unsigned 8-bit (0 to 255).

- 16-bit: convert to unsigned 16-bit (0 to 65535).

## When a Global Intensity Scan Happens

To convert intensities consistently across the whole stack, the module may first scan it to find a global minimum and maximum. This scan runs when any of these is true:

- An intensity operation is active (window, gamma other than 1, or invert), or

- The output data type is not "keep", or

- Downscaling is active.

The scan is skipped when you have set an explicit window; in that case the window you chose is used directly. During a scan, the progress panel shows "Scanning intensity range". The scan covers the kept, cropped region only.
