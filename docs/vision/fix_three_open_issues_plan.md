# Bug Fix Plan: 3 Open Issues

## Issue 1: Segmentation Module Step 4 - Inference File Selector Missing Results

**Problem:** Dropdown only shows `uploads` category files with `raw` tag. Should also show `results` category files with `denoising` and `data` tags in a "Recent Results" section.

**Fix:** In `FileHandler.js` (lines 54-65), update the inference selector config:
- Add `showRecentResults: true`
- Add `resultTags: ['denoising', 'data']` to filter for denoised data results

**File:** `public/workspace/js/modules/segmentation/handlers/FileHandler.js`

---

## Issue 2: Segmentation Module Step 4 - "Open in Viewer" Button Color

**Problem:** Button has `background: linear-gradient(135deg, #667eea 0%, #764ba2 100%)` (blue/purple). Should be primary red. Success container has a large checkmark symbol that should be removed.

**Fix:** In `Templates.js` (lines 322-331):
- Change button inline style to `background: var(--accent-primary)` with hover handled by CSS
- Remove the `<div style="font-size: 48px; margin-bottom: 15px;">✓</div>` line
- Update success container colors to use design tokens instead of hardcoded greens

**File:** `public/workspace/js/modules/segmentation/templates/Templates.js`

---

## Issue 3: FileSelector "No Files Available" Message Bugs

**Problem:** Two sub-issues:
1. Message shows even when files exist in the dropdown (because it checks `availableFiles.length === 0` but other sections like test data or recent results may have files)
2. Message says "upload one above" but upload button is below the dropdown

**Fix:** In `FileSelector.js` (lines 323-330):
1. Change the condition: only show the message when the dropdown has NO option groups with files at all (check total option count excluding placeholder)
2. Change text from "upload one above" to "upload one below"

**File:** `public/workspace/js/core/components/FileSelector.js`

---

## Execution Order

1. **Issue 1** (inference file selector) - Change FileHandler.js config
2. **Issue 2** (button color) - Update Templates.js inline styles, use /frontend-design skill
3. **Issue 3** (empty message) - Fix FileSelector.js logic and text

## Manual Testing After Each Fix

**Issue 1:** Open segmentation module > go to step 4 > check dropdown has "Recent Results" section showing denoised files
**Issue 2:** Complete an inference > verify button is red, no checkmark symbol
**Issue 3:** Check any file selector with files > verify no "no files" message appears; check empty selector > verify message says "below"

## Files to Modify
- `public/workspace/js/modules/segmentation/handlers/FileHandler.js`
- `public/workspace/js/modules/segmentation/templates/Templates.js`
- `public/workspace/js/core/components/FileSelector.js`

## Plan File Destination
Save to: `docs/vision/fix_three_open_issues_plan.md`
Move to `docs/vision/completed/` when done.
