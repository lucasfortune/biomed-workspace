---
id: denoising-filter.step2.nlm
title: Non-Local Means Parameters
category: parameters
module: denoising-filter
tags:
  - denoising
  - nlm
  - filter-strength
  - windows
seeAlsoManual:
  - denoising-filter.step2.methods
seeAlsoTags:
  - nlm
  - parameters
---

# Non-Local Means Parameters

Configure NLM denoising with filter strength and window size parameters.

Filter Strength (h)

Controls how aggressively noise is removed. Higher values remove more noise but may blur fine details.

- Range: 1 - 30

- Low values (1-5): Subtle denoising, preserves all details

- Medium values (10-15): Good balance for moderate noise

- High values (20-30): Aggressive denoising for very noisy images

Template Window Size

The size of the patch used to compare similarity. Larger patches are more robust but slower.

- Recommended: 7 (default)

- Range: 3-11 (must be odd)

Search Window Size

The area searched for similar patches. Larger windows find more matches but increase processing time.

- Recommended: 21 (default)

- Range: 11-41 (must be odd)

Tip: For typical microscopy noise, start with h=10, template=7, search=21. Increase h if noise remains visible.

## Reference

Buades, A., Coll, B., & Morel, J.-M. (2005). A Non-Local Algorithm for Image Denoising. In 2005 IEEE Computer Society Conference on Computer Vision and Pattern Recognition (CVPR'05), 60–65. DOI: 10.1109/cvpr.2005.38
