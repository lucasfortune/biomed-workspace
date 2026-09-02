# Shared Slice-Viewer Chrome — One Header, Slider Strip, Footer and Toolbar for the Five Viewers

**Date:** 2026-09-02
**Phase:** Workspace consolidation — Phase 2 (shared slice-viewer chrome)
**Duration:** ~2.5 hours
**Status:** ✅ Complete
**Complexity:** Medium-High

---

## 🎯 Goals

The five slice viewers (Image Viewer gallery, Annotation edit, Preprocessing adjust, Stitching align,
Segmentation Cleanup edit) differed in every chrome aspect: header/footer look, canvas background,
slice readout (0- vs 1-based), slider placement, zoom controls, icon buttons, toolbar sections,
loading/error states. Tracker B5 (inventory) and B2 (grey chrome bands); decisions 2 (toolbar
sections) and 4 (1-based readouts) from the consolidation plan.

**Primary Objectives:**
- [x] One stylesheet `core/css/slice-viewer.css` (`.sv-*`) for the viewer card, header, canvas box, slider strip, footer, toolbar and sections
- [x] One component `core/components/SliceViewerChrome.js` that renders the frame and wires slider, number field, prev/next and ←/→
- [x] Adopt it in Segmentation Cleanup, Preprocessing, Stitching, Annotation and Image Viewer; delete every private copy
- [x] 1-based "n / N" readouts everywhere; canvas on `--module-viewer-bg`; one status overlay with error state
- [x] Same zoom semantics (0.1–10, wheel anchored at the cursor) in the viewers that zoom
- [x] Verify all five in light and dark mode with the headless-Chrome kit

---

## 📝 Summary

**Accomplished:**
- ✅ New shared chrome: `.sv-main` (viewer + toolbar row), `.sv-wrap` (card), `.sv-header` (slice nav
  "◀ [n] / N ▶" with an editable number field, undo/redo, module extras, zoom "− % + ⊡ 1:1"),
  `.sv-area` + `.sv-canvas-host` (canvas box on `--module-viewer-bg`), `.sv-status` (dimmed overlay +
  spinner, `.is-error`), `.sv-slider-strip`, `.sv-footer` (12 px monospace, `good`/`poor` modifiers),
  `.sv-toolbar` (260 px) with `.sv-section` cards (h4 + help-icon slot) and `.sv-row`.
- ✅ `SliceViewerChrome` API: `render()`, `mount(root)`, `area`, `setSlice(i0, n)`, `setSlices(n)`,
  `setZoom(factor)`, `setStatus(text, isError)`, `setFooter(left, right, leftClass, rightClass)`,
  `setHistory(canUndo, canRedo)`, `destroy()`; options `slices, slice, showPrevNext, showSlider,
  showZoom, showUndoRedo, headerExtra, footerLeft/Right, keyboard, isActive, onSliceChange,
  onZoomIn/Out/Fit/Reset, onUndo/Redo`. Keys are ignored while typing in inputs or when `isActive()`
  is false; the slider is not snapped back while the user is scrubbing.
- ✅ All five viewers adopted it; 1,476 lines of module CSS/JS removed against 1,212 added (most of the
  additions are the two shared files).
- ✅ Stitching gained Space+drag panning, cursor-anchored wheel zoom, zoom limits and a 1:1 button;
  Image Viewer gained ←/→ keys, 0.1–10 zoom limits, cursor-anchored wheel zoom, always-on left/middle
  drag panning, fit (⊡) and 1:1, and a footer with the stack dimensions.
- ✅ Preprocessing's Z-range inputs and the Stitching slice pickers are 1-based in the UI (internal
  indices unchanged; the Apply summary says "Keep slices 1–23").

**Key Findings:**
- `AnnotationCanvas` clears its container on construction, so the chrome puts the module's canvas in a
  dedicated `.sv-canvas-host` and keeps the status overlay as a sibling.
- Module-wide `.x-module input[type="number"]` rules (10 px padding) outrank a plain class selector
  and clipped the header's slice number field; the chrome's input rules now carry three-class
  specificity.
- Segmentation Cleanup tears the editor down on every file selection; destroying the chrome there
  (instead of on deactivate) left the edit step without a canvas host.
- Stitching's ←/→ keep their nudge meaning (1 px, Shift 10 px) — the slice pickers live in the toolbar,
  so the chrome's key handling is disabled there. The other four viewers change slices with ←/→.

**Blockers Encountered:**
- none

---

## 📋 Detailed Log

### Task 1: Shared stylesheet ✅

`core/css/slice-viewer.css`, imported once from `module-base.css` (so every module sees `.sv-*`).
Header, slider strip and footer sit on `--module-chrome-bg`; the canvas box on `--module-viewer-bg`;
the status overlay is a `color-mix` of the viewer background. Toolbar width 260 px (decision 2, between
the annotation 220 px and the 290 px of the newer modules). Responsive: the toolbar wraps under the
viewer below 1024 px; the header stacks below 768 px.

### Task 2: `SliceViewerChrome` component ✅

Elements are addressed by `data-sv` attributes, so no ids collide with module markup. Exported from
`core/components/index.js`.

### Task 3: Segmentation Cleanup ✅

`SegcleanupModule.js`: chrome created in `renderStep2()`, mounted in `setupEditControls()`;
`AnnotationCanvas` in `chrome.area`; `onZoomChange → setZoom`; status/footer/history through the
chrome; toolbar sections → `.sv-section`, rows → `.sv-row`. Gains the zoom set (its engine already
supported it) and ←/→. `segcleanup.css` lost its viewer/controls/footer/toolbar/row rules.

### Task 4: Preprocessing ✅

`PreprocessModule.js`: `showZoom: false` (fit-only 2-D canvas kept); the preview canvas is created in
`chrome.area`; `drawCanvas()` clears instead of painting `#111`; footer left = name · size · slices ·
dtype, right = crop hint; Z range 1-based. `preprocess.css` reduced accordingly.

### Task 5: Stitching ✅

`StitchingModule.js`: `showPrevNext/showSlider: false`, overlay opacity + flicker via `headerExtra`,
`keyboard: false`; overlay canvas in `chrome.area`; `zoomBy(factor, cx, cy)` anchored, clamped
`ZOOM_MIN/ZOOM_MAX` (0.1/10), new `zoomActual()`; Space+drag pans (`_onKeyUp` added); alignment score
in the footer with `good`/`poor`; slice pickers as `.sv-row` with 1-based number fields.

### Task 6: Annotation ✅

`AnnotationModule.js`: the canvas-wrapper block replaced by `chrome.render()`; `updateSliceIndicator /
updateSliceButtons / updateZoomIndicator / updateCoordsDisplay / updateDimensionsDisplay /
showCanvasLoading` delegate to the chrome; ←/→ removed from the module's key handler; the
`sliderScrubbing` flag moved into the chrome. `annotation.css` lost ~290 lines (canvas wrapper,
controls, status, loading, toolbar, section headers, responsive blocks).

### Task 7: Image Viewer ✅

`ImageViewerModule.js`: `mountChrome()` builds the card inside `#viewContainer` for the single and the
comparison gallery; the image wrapper / comparison grid fill `chrome.area`; transform is now
`translate(pan) scale(zoom)` so `setZoom(level, anchor)` can keep the cursor point fixed; pointer
events with capture; `zoomActual()` shows the served image at native pixels. `imageviewer.css` lost
the nav/zoom pill buttons (the "Reset" overflow from Phase 0 is gone with them), gallery controls,
loading rules; `.view-container` is a plain flex column and `.icon-grid-view` carries its own card.

### Verification

Headless Chrome (`docs/dev/tools/scenario_p2.json`): for every viewer in both themes — open the edit /
adjust / align / annotate / view step, probe the readout, press → and re-probe, click "+" twice and
re-probe, screenshot. Results: readouts 1-based (12/23 → 13/23 in PP/SC, 1/23 → 2/23 in AN/IV), zoom
readouts change (AN 152 → 238 %, SC 251 → 392 %, ST 219 → 342 %, IV 100 → 156 %), ST → nudges dx 0 → 1,
canvas box `rgb(26, 26, 46)` everywhere, footers populated, 4/5/5/4 toolbar sections; no console
errors or exceptions after the two fixes above. Temporary user, workspace and session removed.

---

## 💻 Code Changes Summary

### New Files (2)
- ✨ `public/workspace/js/core/css/slice-viewer.css` — shared viewer chrome styles
- ✨ `public/workspace/js/core/components/SliceViewerChrome.js` — shared viewer chrome component

### Modified Files (13)
- 📝 `core/css/module-base.css` — imports the shared stylesheet
- 📝 `core/components/index.js` — export
- 📝 `annotation/utils/AnnotationCanvas.js` — viewport background from `--module-viewer-bg`
- 📝 `segcleanup/SegcleanupModule.js`, `segcleanup/css/segcleanup.css`
- 📝 `preprocess/PreprocessModule.js`, `preprocess/css/preprocess.css`
- 📝 `stitching/StitchingModule.js`, `stitching/css/stitching.css`
- 📝 `annotation/AnnotationModule.js`, `annotation/css/annotation.css`
- 📝 `imageviewer/ImageViewerModule.js`, `imageviewer/css/imageviewer.css`

---

## 🔄 Next Steps

**Immediate Follow-up:**
1. [ ] Phase 3 — step chrome, hub order, module behaviour (B3, B11, B12, B15, B17, B18, D17, D18) on `fix/step-chrome`

**Deferred:**
1. [ ] Help articles for the three new modules could fill the empty help-icon slots in their toolbar sections (C10–C12)
2. [ ] The Preprocessing / Segmentation Cleanup / Stitching edit steps still grow with the toolbar height (page scrolls); the Annotation step is height-bounded. A shared bounded layout is a Phase 3 step-chrome topic.

---

## 🔗 Related Documentation

**Architecture Decisions:**
- [ADR-005](../decisions/005_design_system_color_scheme.md) — design tokens

**Related Sessions:**
- [CSS Foundation](2026-09-02_css_foundation.md) — tokens, `.btn-icon`, `.range-slider` this session builds on
- [Critical Bugs](2026-09-02_critical_bugs.md) — Phase 1

---

## 📊 Metrics

| Metric | Value |
|--------|-------|
| Files Changed | 15 (2 new) |
| Lines Added | +1,212 |
| Lines Removed | −1,476 |
| Commits | 1 |
| Tracker items closed | B2, B5 (B1 now fully applied) |

---

**Navigation:**
← [Session Index](INDEX.md) | [Documentation Index](../INDEX.md) →

---

**Session Type:** Refactor
**Phase Status After Session:** On Track
