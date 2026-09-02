# CSS Foundation — Shared Buttons, Sliders, Tokens, Layout Rules

**Date:** 2026-09-02
**Phase:** Workspace consolidation — Phase 0 (CSS foundation)
**Duration:** ~2 hours
**Status:** ✅ Complete
**Complexity:** Medium

---

## 🎯 Goals

First phase of the workspace consolidation plan. Everything later phases build on (shared slice-viewer
chrome, step chrome, palette clean-up) needs one set of button variants, one slider look, defined
tokens and hoisted layout rules in `module-base.css`.

**Primary Objectives:**
- [x] Shared button variants (`small`, `tiny`, `large`, `primary`, `secondary`, `danger`, icon button, glyph span)
- [x] One `.range-slider` rule set, applied to every range input in the workspace
- [x] Define the tokens modules reference but nobody defined; align module greys with workspace greys
- [x] Hoist `.step-inner`, `.section-card`, `.success-card` family, `.step-description` into `module-base.css`
- [x] Remove dead / harmful CSS: `segmentation.css`, the unscoped loading-overlay override, the annotation coral override
- [x] Theme-safe `ResumeDialog` and `LoadingOverlay`
- [x] Verify every module in light and dark mode

---

## 📝 Summary

**Accomplished:**
- ✅ `module-base.css` is now the single source for buttons, sliders, section/success cards and the step wrapper.
- ✅ All 11 module stylesheets lost their private copies (−709 lines app-wide, +359 in the shared file).
- ✅ The three new editing steps (Preprocessing Adjust, Segmentation Cleanup Edit, Stitching Align) show the
  PoP-red slider thumb on a grey track like the annotation module; the annotation module itself is PoP red
  instead of coral.
- ✅ Start Training / Start Denoising (filled red) and Cancel Training (outlined danger) are distinguishable.
- ✅ `segmentation.css` (551 unused lines) deleted.

**Key Findings:**
- `.btn-icon` had two meanings (icon button vs glyph span inside a text button). The glyph span is now
  `.btn-glyph`; `.btn-icon` is the shared 28 px icon button.
- Every module defined its own `.step-inner` width (800 or 900 px). 900 px is now the shared width, matching
  the `.step-content` cap that was already in `module-base.css`.
- The ADR-005 slider spec calls for a JS-driven gradient fill. Not implemented here (would need a listener per
  slider); the shared rule uses a static track. Can be added later as one delegated listener if wanted.

**Blockers Encountered:**
- none

---

## 📋 Detailed Log

### Task 1: Buttons (tracker B6) ✅

**Problem:** `.btn.small`, `.btn.tiny`, `.btn.primary`, `.btn-danger` and the icon button were undefined
globally; each module redefined a subset with different values; six job-running buttons used `btn-danger`
and looked identical to Cancel.

**Solution:** Defined all variants once in `module-base.css` (`.btn` is now `inline-flex` with a 6 px gap so
glyph + label align; `.btn.danger` is outlined and fills on hover). Renamed glyph spans to `.btn-glyph`
in seven JS files. Job-running buttons (Apply, Compose, Save as New File, Start Denoising) switched to
`btn primary`. Deleted the per-module copies. Aligned the six `workspace.css` button radii to 6 px.

**Files Changed:** `module-base.css`, `annotation.css`, `imageviewer.css`, `stitching.css`,
`segcleanup.css`, `preprocess.css`, `dl-denoising.css`, `segmentation-modern.css`, `workspace.css`,
`FileSelector.js`, `StitchingModule.js`, `PreprocessModule.js`, `SegcleanupModule.js`,
`segmentation/templates/Templates.js`, `denoising-dl/templates/Templates.js`, `ResultsDisplay.js`.

### Task 2: Sliders (tracker B1) ✅

**Solution:** One `.range-slider` block (6 px `--module-border` track, 16 px `--module-primary` thumb with
2 px white ring, `-moz` variants, `accent-color` fallback, disabled state). Class added to 17 range
inputs across 8 modules; seven divergent thumb rule sets deleted. The visualization module's opacity and
dual-range sliders keep their own rules (they implement the gradient fill and the two-thumb track).

### Task 3: Tokens (tracker B8) ✅

**Solution:** Added `--module-bg-secondary/-tertiary/-hover`, `--module-surface`, `--module-viewer-bg`,
`--module-bg-dark`, `--module-chrome-bg`, `--module-primary-hover`, `--module-primary-light` to both theme
blocks. Module neutrals now equal the workspace greys. Replaced every reference to an undefined token
(`--surface-*`, `--accent-color`, `--error-color`, `--text-tertiary`, `--primary-bg`, `--secondary-bg`,
`--accent-primary-hover`) in CSS and JS.

### Task 4: Hoisted layout rules (tracker B11, hoist part) ✅

**Solution:** `.step-inner`, `.step-inner.wide` + `.step-content.wide`, `.step-description`,
`.section-card` (+ `h4`), `.success-card`, `.success-header`, `.success-icon` (green circle badge),
`.success-title`, `.success-actions`, and the 768 px `.step-inner` padding now live in `module-base.css`.
All module copies deleted. `.navigation-buttons` gained `align-items: center` and a gap.

### Task 5: Dead code and theme fixes (tracker D16 part, B9 part) ✅

**Solution:** `git rm segmentation.css`; removed the `segmentation-modern.css` `.module-loading-overlay`
`!important` override (it darkened every module's overlay after segmentation had been opened);
`LoadingOverlay` backdrop is `color-mix` of `--bg-primary`; `ResumeDialog` uses `--bg-*` and
`--accent-hover` (was white-on-white in dark mode with a blue hover).

### Task 6: Decision 1 — drop the annotation coral override ✅

**Solution:** Deleted the `.annotation-module { --module-primary: #FF6B6B … }` block. Active tool, add-class
button, autosave toggle and both sliders render PoP red; verified in both themes.

### Verification

Headless Chrome (DevTools protocol) with a temporary admin user and the built-in test stacks, light and
dark: hub, step 1 of all ten modules, the editing steps of Annotation, Preprocessing, Segmentation
Cleanup, Stitching (align) and Image Viewer, Filter Denoising configure, and the training steps of
DL Denoising and Segmentation. No console errors. Temporary user and its workspace removed afterwards.

Pre-existing, not touched: the Image Viewer zoom "Reset" label overflows its 36 px `.zoom-btn`
(covered by B5 in Phase 2).

---

## 💻 Code Changes Summary

### Modified Files (26)
- 📝 `public/workspace/js/core/css/module-base.css` — tokens, hoisted layout rules, button family, `.range-slider`
- 📝 `public/workspace/css/workspace.css` — undefined tokens replaced, button radius 6 px
- 📝 11 module stylesheets — private copies removed, tokens replaced
- 📝 `core/components/FileSelector.js`, `LoadingOverlay.js`, `ResumeDialog.js`, `components/FileBrowser.js`
- 📝 8 module JS files — `range-slider` class, `.btn-glyph`, `btn primary` job buttons

### Deleted Files (−1)
- ❌ `public/workspace/js/modules/segmentation/css/segmentation.css` — never loaded

---

## 🔄 Next Steps

**Immediate Follow-up:**
1. [ ] Phase 1 — critical bugs (D6 annotation resume, D7, D8, D9, D10, D1, D2) on `fix/critical-bugs`

**Deferred:**
1. [ ] ADR-005 dynamic slider fill — one delegated `input` listener for `.range-slider` (optional polish)

---

## 🔗 Related Documentation

**Architecture Decisions:**
- [ADR-005](../decisions/005_design_system_color_scheme.md) — design tokens, slider spec

**Related Sessions:**
- [Annotation Module Slice Slider Control](2026-06-02_annotation_slice_slider.md) — the slider look this session generalised

---

## 📊 Metrics

| Metric | Value |
|--------|-------|
| Files Changed | 27 |
| Lines Added | +359 |
| Lines Removed | −709 |
| Commits | 1 |
| Tracker items closed | B1, B6, B8 (B9, B11, D16 partially) |

---

**Navigation:**
← [Session Index](INDEX.md) | [Documentation Index](../INDEX.md) →

---

**Session Type:** Refactor
**Phase Status After Session:** On Track
