# Palette, Dark Mode, Scoping, Typography and Icons — One Token Set, One Icon Set, No Leaks

**Date:** 2026-09-03
**Phase:** Workspace consolidation — Phase 4 (palette, dark mode, scoping, typography, icons)
**Duration:** ~3 hours
**Status:** ✅ Complete
**Complexity:** Medium-High

---

## 🎯 Goals

After Phase 3 every module shared the same chrome, but not the same palette: the DL denoising
stylesheet carried a private green/purple/blue/indigo palette (135 hard-coded colour declarations),
blue "running" states, indigo focus rings and amber badges were scattered over eight files, nine
`--card-*` hub tokens were defined but never consumed, `white` stood in for text-on-accent in ~30
places, and Chart.js and status text used theme-blind literals from JS. Module CSS was never
unloaded, and 40–88 % of the rules in six files were unscoped, so Image Viewer rules applied inside
Annotation. Headings, hints, selects, radios, number inputs and toggle switches were re-declared per
module with drifting values, emoji stood in for icons, z-index values were ad hoc (10 … 10001), and
the two-column editors collapsed on viewport breakpoints that ignored the open sidebar.
Tracker B7, B9, B10, B13, B14, B16.

**Primary Objectives:**
- [x] Every colour in workspace CSS/JS from a token; semantic tokens `--module-success/-warning/-danger/-info`; `--module-text-on-accent`; hub keeps the single PoP accent (card colours removed)
- [x] Dark mode: chevron via `currentColor`, low-contrast greys replaced, inline JS colours moved to classes, chart palettes read from tokens
- [x] Every module selector under its root class; module stylesheets unloaded on deactivate
- [x] Zero-specificity baselines for h4 / hints / selects / inputs / checkbox & radio accent; one `.toggle-switch`; two number-input widths
- [x] `core/icons.js` inline-SVG set used by the viewer chrome, FileSelector, validation display and every module; no emoji in module UI
- [x] One z-index ladder; container queries for the two-column editors
- [x] Dead code removed: segmentation's unreferenced 3D-viewer JS + CSS, dead DL/Image Viewer rule blocks
- [x] Verified in headless Chrome, light and dark, plus the Phase 2 and Phase 3 regressions

---

## 📝 Summary

**Accomplished:**
- ✅ **Tokens (B7):** `workspace.css` gained `--accent-primary-light`, `--danger-hover` and the z-index
  ladder `--z-raised/-chrome/-panel/-module-overlay/-notification/-overlay/-modal/-modal-top`;
  `module-base.css` gained `--module-text-on-accent`, `--module-success/-warning/-danger/-info`
  (mirroring the workspace semantic colours) and `--module-input-width-sm/-md`. The nine `--card-*`
  tokens, the registry `color` fields, the `ModuleLoader` `#4A90E2` defaults and the hub's
  `--card-color` inline style are gone (decision 1: one red accent). `dl-denoising.css` lost its
  private palette (purple mask-extractor identity, blue running state, off-palette greens, indigo
  tints); `segmentation-modern.css`, the seven smaller module sheets, `info-panel.css`,
  `slice-viewer.css` and `workspace.css` lost their remaining literals (indigo focus rings, amber
  badges, blue drop overlay, `#c82333` danger hover, JSON syntax colours, `white`). Chart.js
  datasets in segmentation and DL read `--module-primary/-info/-success/-text-secondary/-border`
  from the root at chart creation. Status text and the segmentation inference fallback block use
  classes instead of `style.color`.
- ✅ **Dark mode (B9):** `.file-dropdown` chevron is two `currentColor` gradients; DL `#999/#888`
  text → text tokens; warning badges in Stitching, Segmentation Cleanup and Image Viewer use the
  warning trio; `has-error` fields use `color-mix` of `--module-danger` (the dark override block is
  gone); overlay panels in 3D Visualization and the slice-viewer status derive from
  `--module-viewer-bg` / `--module-text-on-accent`.
- ✅ **Scoping (B10):** every selector in `imageviewer.css`, `stitching.css`, `segcleanup.css`,
  `preprocess.css`, `segmentation-modern.css` and `dl-denoising.css` now starts with the module
  root class (`body` and `#module-view` overrides deleted); `BaseModule.loadCSS()` tags its links
  with `data-module-css`, `BaseModule.unloadCSS()` removes them and `ModuleLoader.deactivate()`
  calls it after the module's own `deactivate()`.
- ✅ **Typography / one component each (B13):** `:where(.module-container)` baselines for `h4`
  (md), `.field-hint` (xs), `select` / `input[type=number|text|search]` (one look, one
  `--module-primary-light` focus ring, `--module-input-width-md`, `.input-sm` modifier) and
  `input[type=checkbox|radio]` (`accent-color: var(--module-primary)`, 16 px); one `.toggle-switch`
  (annotation's rules moved to module-base; DL's two private toggles replaced); ~40 per-module
  restatements deleted; radius / font-size / spacing literals mapped to tokens where a token exists.
- ✅ **Icons (B14):** `core/icons.js` (`icon(name, {label, size, className})`, 45 Material-style
  paths, `.icon` = 1 em `currentColor`). Used by `SliceViewerChrome` (prev/next/zoom/undo/redo),
  `FileSelector` (accepts an icon *name* in `icon:`; default folder), `ValidationDisplay`, the
  annotation tool buttons and class visibility toggle, Segmentation Cleanup tools, Stitching
  dominance buttons, mesh download buttons, DL result/stage/collapsible icons, segmentation
  workflow carets and import validation, 3D Visualization placeholders. The registry SVGs and the
  `&#9658;` play glyph / `&#10003;` success check from Phase 3 stay.
- ✅ **z-index + responsive (B16):** all z-index values in `workspace.css`, `info-panel.css`,
  `module-base.css`, `slice-viewer.css`, `visualization.css`, `LoadingOverlay.js` and
  `ResumeDialog.js` come from the ladder. `.step-contents` is a container-query root (`module`);
  the slice-viewer split (`.sv-main`), 3D Visualization, DL, segmentation and mesh layouts collapse
  on `@container module (max-width: …)` instead of viewport widths, so the 280 px sidebar no longer
  squeezes the editors; segmentation got its first responsive rules.
- ✅ **Dead code:** `modules/segmentation/visualization/` (nine files, imported by nothing — the
  classic app has its own copy) and the matching 61 CSS rules; 48 dead DL rules (`.mode-toggle-*`,
  `.import-stage-panel`, `.loss-charts-*`, `.interim-mask-section`, …); the Image Viewer's old
  card-based picker rules. Module CSS shrank from 11 065 to ~9 000 lines overall.

**Key Findings:**
- `modules/segmentation/visualization/*.js` and the `.viz-*` / `.class-control-panel` /
  `.dual-range-*` block in `segmentation-modern.css` were dead in the workspace: nothing imports
  them, only `public/classic/index.html` renders that markup with its own copies.
- The DL `CollapsibleSection` swapped ▼/▶ glyphs *and* rotated the icon in CSS, so the collapsed
  state pointed up; one `caretDown` plus the CSS rotation fixes it.
- A select cannot draw `currentColor` into a data-URI background; two rotated linear gradients do
  the same chevron and follow the text colour in both themes.
- `--module-danger` etc. resolve to the workspace semantic tokens, so `color-mix()` tints need no
  `[data-theme="dark"]` counterparts.
- The segmentation training-status colour was never reset (sticky orange/green); the class-based
  helper clears it at every neutral message.

**Blockers Encountered:**
- none

---

## 📋 Detailed Log

### Task 1: Shared groundwork ✅

`workspace.css` tokens + z ladder, `module-base.css` tokens + baselines + toggle + icon sizing +
chevron + container root, `slice-viewer.css` container query, `core/icons.js`, `BaseModule.unloadCSS`
+ `ModuleLoader` hook, registry / `ModuleLoader` / `workspace.js` card-colour removal,
`LoadingOverlay` / `ResumeDialog` fallbacks and z tokens, `SliceViewerChrome` / `FileSelector` /
`ValidationDisplay` icons.

### Task 2: DL denoising ✅ (agent)

`dl-denoising.css` 2624 → 2138 lines: palette → tokens, scoped, baselines deleted, toggles on
`.toggle-switch`, container queries; `themeColors()` for Chart.js; `icon()` throughout; dead rules
pruned afterwards.

### Task 3: Segmentation ✅ (agent)

`segmentation-modern.css` 813 → 521 lines: tokens, scoping, `.training-status-text.is-*`,
`.segmentation-inference-loading` fallback block on the shared progress bar, `readChartPalette()`,
carets/check/cross icons, container queries; dead 3D-viewer JS + CSS removed afterwards.

### Task 4: Image Viewer, Stitching, Segmentation Cleanup, Preprocessing, Filter, Mesh, Template ✅ (agent)

Scoping, warning trio badges, `--module-primary-light` rings, baseline restatements deleted,
`.input-sm` on short fields (junction dx/dy/rot, filter sigma/h), icons, mesh container query,
template README "Styling" section.

### Task 5: Annotation, 3D Visualization, core leftovers ✅

Annotation toggle → shared component, tool/visibility icons, whites; 3D Visualization overlay
colours from `--module-viewer-bg`, icons, z ladder; `info-panel.css` z + focus ring;
`docs/dev/tools/token_grep.sh` audit script.

### Verification

Token audit (`docs/dev/tools/token_grep.sh`): no colour literal outside token definitions, `var()`
fallbacks, neutral black shadows and canvas drawing code; no unscoped selector in any module sheet;
no emoji/pictograph in module or core JS (play glyph and success check excepted); no raw z-index.
All modified JS files pass `node --check`; every stylesheet's braces balance.

Headless Chrome (`docs/dev/tools/scenario_p4.json`, 23 scenarios, both themes): hub cards carry no
`style` attribute and the icon fill is the accent; `link[data-module-css]` is empty on the hub and
holds exactly the active module's sheet inside a module; a probe element with Image Viewer / Stitching
/ Cleanup class names is unstyled inside Annotation; every module reports zero inline colour styles
(only the viewer background token and class swatches), `svg.icon` present, h4 16 px (14 px in toolbar
section headers, by design), hints 12 px, selects on the border-dark token, checkbox/radio
`accent-color` red, primary buttons red, `.file-dropdown` chevron a gradient; `.sv-main` flips to a
column when `.step-contents` is forced to 700 px and back; the annotation toggle is 36×20 with a red
track. Re-shot after the last tweaks: hub I/O glyphs masked SVG, segmentation workflow caret 16 px,
Image Viewer footer no longer clipped. Regressions: `scenario_p3.json` (hub order, step chrome, nav
rows, success cards, test-data import, reset on leave, stitching list mode) and `scenario_p2b.json`
(five viewers, readout / arrow key / zoom, both themes) unchanged. Only console errors: the starter
template is not in the registry (expected). Test server, workspace, session and user removed.

---

## 💻 Code Changes Summary

### New Files (1)
- ✨ `public/workspace/js/core/icons.js` — shared inline-SVG icon set

### Deleted (9)
- 🗑️ `public/workspace/js/modules/segmentation/visualization/*.js` — unreferenced 3D viewer copy

### Modified Files (52)
- 📝 `css/workspace.css`, `css/info-panel.css`, `core/css/module-base.css`, `core/css/slice-viewer.css`
- 📝 `core/BaseModule.js`, `core/ModuleLoader.js`, `core/components/FileSelector.js`, `SliceViewerChrome.js`, `ValidationDisplay.js`, `LoadingOverlay.js`, `ResumeDialog.js`, `workspace.js`, `modules/registry.js`
- 📝 denoising-dl: `css/dl-denoising.css`, `DLDenoisingModule.js`, `templates/Templates.js`, `handlers/*.js`, `components/*.js`
- 📝 segmentation: `css/segmentation-modern.css`, `SegmentationModule.js`, `templates/Templates.js`, `handlers/*.js`
- 📝 imageviewer, stitching, segcleanup, preprocess, denoising-filter, mesh, template: `css/*.css` + `*Module.js`; `template/README.md`
- 📝 annotation: `css/annotation.css`, `AnnotationModule.js`; visualization: `css/visualization.css`, `VisualizationModule.js`

---

## 🔄 Next Steps

**Immediate Follow-up:**
1. [ ] Phase 5 — remaining code items (D3, D4, D5, D11–D16, D19, decision 7)

**Deferred:**
1. [ ] Filter/mesh/template `.params-section` / `.progress-section` are `.section-card`-shaped with private class names; fold onto `.section-card` when their markup is next touched
2. [ ] Chart palettes are sampled at chart creation; a theme toggle while a chart is on screen keeps the old colours until the chart is rebuilt
3. [ ] Sidebar `FileBrowser.js` and the hub notification glyphs still use emoji (outside module UI; B14 scope was module UI)
4. [ ] Help articles for preprocess / segcleanup / stitching (C1, C15, Phase 7)

---

## 🔗 Related Documentation

**Architecture Decisions:**
- [ADR-005](../decisions/005_design_system_color_scheme.md) — design tokens, SVG icons

**Related Sessions:**
- [Step Chrome, Hub and Module Behaviour](2026-09-03_step_chrome.md) — Phase 3
- [Shared Slice-Viewer Chrome](2026-09-02_slice_viewer_chrome.md) — Phase 2
- [CSS Foundation](2026-09-02_css_foundation.md) — Phase 0

---

## 📊 Metrics

| Metric | Value |
|--------|-------|
| Files Changed | 62 |
| Lines Added | +1,621 |
| Lines Removed | −6,301 |
| Commits | 1 |
| Tracker items closed | B7, B9, B10, B13, B14, B16 |

---

**Navigation:**
← [Session Index](INDEX.md) | [Documentation Index](../INDEX.md) →

---

**Session Type:** Refactor
**Phase Status After Session:** On Track
