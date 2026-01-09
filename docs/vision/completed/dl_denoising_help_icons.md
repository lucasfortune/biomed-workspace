# Implementation Plan: DL Denoising Help Icons & Method References

## Overview

**Issues Being Fixed:**
1. **#1**: DL denoising module step 2 (config) parameters missing help icons
2. **#2**: N2V and NL-means method references need to be linked

## Files to Modify

| File | Purpose |
|------|---------|
| `public/workspace/js/modules/denoising-dl/handlers/ConfigHandler.js` | Add help icons to parameter labels |
| `public/workspace/content/modules/denoising-dl.json` | Add new parameter articles + N2V reference |
| `public/workspace/content/modules/denoising-filter.json` | Add NL-means reference |

---

## Issue #1: Add Help Icons to DL Denoising Config Parameters

### Current State
- `ConfigHandler.js` renders 3 config forms: `renderN2VConfigForm()`, `renderStageConfigForm()`, `renderMaskExtractorConfig()`
- `Templates.js` already has `renderHelpIcon(articleId)` method
- Many help articles already exist in `denoising-dl.json`

### Implementation

#### Phase 1A: Import Templates and Add Icons to N2V Config

**File:** `ConfigHandler.js`

1. Add import at top:
```javascript
import Templates from '../templates/Templates.js';
```

2. Modify `renderN2VConfigForm()` to add help icons to ALL parameter labels:

| Parameter | Article ID |
|-----------|------------|
| Patch Size | `denoising-dl.step2.patch-size` |
| Patches per Image | `denoising-dl.step2.patches-per-image` |
| Batch Size | `denoising-dl.step2.batch-size` |
| Mask Percentage | `denoising-dl.step2.mask-percentage` |
| Apply Data Augmentation | `denoising-dl.step2.augmentation` (NEW) |
| Number of Features | `denoising-dl.step2.features` |
| Number of Layers | `denoising-dl.step2.num-layers` |
| Learning Rate | `denoising-dl.step2.learning-rate` |
| Number of Epochs | `denoising-dl.step2.epochs` |
| Early Stopping | `denoising-dl.step2.early-stopping` |
| Early Stopping Patience | `denoising-dl.step2.early-stopping` (same article) |
| Resize Convolution | `denoising-dl.step2.resize-conv` (NEW) |
| Upsampling Mode | `denoising-dl.step2.upsampling-mode` (NEW) |
| Masking Strategy | `denoising-dl.step2.masking-strategy` (NEW) |

**Pattern for adding help icons:**
```javascript
// Before:
<label for="stage1_patch_size">Patch Size</label>

// After:
<label for="stage1_patch_size">Patch Size${Templates.renderHelpIcon('denoising-dl.step2.patch-size')}</label>
```

#### Phase 1B: Add Icons to autoStructN2V Config

**File:** `ConfigHandler.js` - `renderStageConfigForm()`

Add help icons to the same parameters as N2V, plus:

| Parameter | Article ID |
|-----------|------------|
| ROI Selection | `denoising-dl.step2.roi-selection` (NEW) |
| ROI Threshold | `denoising-dl.step2.roi-selection` (same article) |

Note: Stage 2 has "Apply Data Augmentation" in advanced options (same article as N2V augmentation)

#### Phase 1C: Add Icons to Mask Extractor Config

**File:** `ConfigHandler.js` - `renderMaskExtractorConfig()`

| Parameter | Article ID |
|-----------|------------|
| Adaptive Thresholding | `denoising-dl.step2.mask-extractor.adaptive` (NEW) |
| Base Percentile | `denoising-dl.step2.mask-extractor.base-percentile` (NEW) |
| Percentile Decay | `denoising-dl.step2.mask-extractor.percentile-decay` (NEW) |
| Max Masked Pixels | `denoising-dl.step2.mask-extractor.max-pixels` (NEW) |

#### Phase 1D: Create New Help Articles

**File:** `denoising-dl.json` - Add these new articles:

1. **`denoising-dl.step2.augmentation`** - Data augmentation toggle
2. **`denoising-dl.step2.resize-conv`** - Resize convolution advanced option
3. **`denoising-dl.step2.upsampling-mode`** - Upsampling mode selection
4. **`denoising-dl.step2.masking-strategy`** - N2V masking strategy
5. **`denoising-dl.step2.roi-selection`** - ROI selection for Stage 1
6. **`denoising-dl.step2.mask-extractor.adaptive`** - Adaptive thresholding
7. **`denoising-dl.step2.mask-extractor.base-percentile`** - Base percentile
8. **`denoising-dl.step2.mask-extractor.percentile-decay`** - Percentile decay
9. **`denoising-dl.step2.mask-extractor.max-pixels`** - Max masked pixels

### Manual Testing for Issue #1

After implementation:
1. Navigate to DL Denoising module
2. Select N2V method → Go to Step 2 (Configure)
3. Verify: ALL parameter labels have help icons (? icons)
4. Click each help icon → Verify: Help panel opens with correct article
5. Go back → Select autoStructN2V method → Go to Step 2
6. Verify: Both Stage 1 and Stage 2 columns have help icons on all parameters
7. Expand "Advanced Options" in both columns → Verify icons present
8. Expand "Mask Extractor Configuration" → Verify icons on all 4 parameters
9. Click several icons → Verify correct articles display

---

## Issue #2: Add Method References

### N2V Reference

**File:** `denoising-dl.json`
**Article:** `denoising-dl.step3.n2v`

Add citation at end of the body text:
```
\n\n**Reference:**\nKrull, A., Buchholz, T.-O., & Jug, F. (2019). Noise2Void - Learning Denoising From Single Noisy Images. In 2019 IEEE/CVF Conference on Computer Vision and Pattern Recognition (CVPR), 2124–2132. [https://doi.org/10.1109/cvpr.2019.00223](https://doi.org/10.1109/cvpr.2019.00223)
```

### NL-means Reference

**File:** `denoising-filter.json`
**Article:** `denoising-filter.step2.nlm`

Add citation at end of the body text:
```
\n\n**Reference:**\nBuades, A., Coll, B., & Morel, J.-M. (2005). A Non-Local Algorithm for Image Denoising. In 2005 IEEE Computer Society Conference on Computer Vision and Pattern Recognition (CVPR'05), 60–65. [https://doi.org/10.1109/cvpr.2005.38](https://doi.org/10.1109/cvpr.2005.38)
```

### Manual Testing for Issue #2

After implementation:
1. Navigate to DL Denoising module → Go to Step 3
2. Click help icon next to "Training Progress" or N2V-related help
3. Verify: N2V article contains reference citation with DOI link
4. Navigate to Filter Denoising module → Go to Step 2
5. Click help icon for NLM method
6. Verify: NLM article contains reference citation with DOI link

---

## Implementation Order

1. **Phase 1A-1C**: Add help icons to ConfigHandler.js (all 3 render functions)
2. **Phase 1D**: Create new help articles in denoising-dl.json
3. **Issue #2**: Add references to both JSON files
4. **Test**: Manual testing per checklist above

---

## Estimated Changes Summary

| File | Lines Changed (Est.) |
|------|---------------------|
| ConfigHandler.js | ~50 lines modified (add help icons to labels) |
| denoising-dl.json | ~200 lines added (9 new articles + 1 reference) |
| denoising-filter.json | ~5 lines added (1 reference) |
