# ADR-011: Shared Slice-Viewer Chrome and Module UI Conventions

**Status:** Accepted, implemented + verified (workspace consolidation,
Phases 0–7 + pre-release batch, released as 1.3.0 on 2026-09-04)
**Context:** The code review, the help-article audit and the
design-consistency audit (2026-09-02) found the same UI element built
three different ways across the eight workspace modules: three toolbar
looks, three places for the primary action button, 0- and 1-based slice
readouts side by side, and each module carrying its own copy of the
slice-viewer markup and CSS. Lucas settled nine conventions
(`docs/dev/IMPLEMENTATION_PLAN.md` §Decisions); this ADR records the five
that define the shared viewer chrome and the per-module UI contract
(decisions 2–6). Decision 1 (accent colour) is ADR-005; decisions 7–9
(dead-component removal, merge junction, "What's new") are noted below
where they touch this contract.

## Decision

### Decision 2 — Toolbar sections are bordered cards with an h4 + help slot

Every slice-viewer toolbar section uses the annotation module's
bordered-card idiom: a `.section-card` (or `.sv-section-header` h4) with a
title and a help-icon slot, not the flat uppercase titles the newer
modules had grown. The card is the design system's existing container and
is the only one of the three looks with a place for the context-help icon.

### Decision 3 — The primary action lives in the navigation row's right slot

The job-running button — Apply, Compose, Generate, Start Training, Create
Annotation — sits in the step navigation row's right slot, rendered red
(`btn primary` with a `.btn-glyph` ►), with **Back** on the left and
Start/Cancel/Next in `.nav-actions`. It is never inside a card or a header
bar, and exactly one red button is enabled at a time, driven by one state
helper per module (e.g. seg `applyTrainingUIState`, dl
`uiStateHandler.setJobButtons`, the shared `setJobButtonVisible`).

### Decision 4 — Slice readouts are 1-based "n / N" everywhere

Every viewer shows the human-facing slice index as `n / N` starting at 1.
`SliceViewerChrome` owns the readout so this is uniform by construction.

### Decision 5 — One test-data rule → sample-data seeding (revised)

Original decision: raw image inputs always offer the built-in test stack;
mask/segmentation inputs offer it only where a test mask exists. This
shipped in Phase 3 (`FileSelector` `testDataKind`, `POST
/api/workspace/test-data`).

**Revised in the pre-release batch:** the per-selector test-data option
was removed entirely. Instead every new workspace is seeded with
`sample_raw.tif` + `sample_annotation.tif` (`WorkspaceManager.SAMPLE_FILES`),
so a sample is a normal workspace file every selector already lists.
Approval now gates *uploading* only, not trying a module. The Phase-3
test-data endpoints and `isTestData` branches were deleted.

### Decision 6 — Every module resets its state on leave

A module clears its working state in `deactivate()` so re-entry always
starts fresh. The sole exception is 3D Visualization, which persists by
design. Segmentation additionally clears its `modules.segmentation.*`
state keys; the mesh module deliberately keeps `modules.mesh.result` for
the hand-off to the viewer.

## Implementation

- **`core/components/SliceViewerChrome.js`** — the one slice viewer.
  Lifecycle `render() → mount(root) → area` (mount into `chrome.area`, the
  `.sv-canvas-host`; do not write to the container directly — some canvases
  wipe it). API: `setSlice / setSlices / setZoom / setStatus / setFooter /
  setHistory / destroy`. Options: `slices, slice, showPrevNext, showSlider,
  showZoom, showUndoRedo, headerExtra, footerLeft/Right, keyboard,
  isActive`, and callbacks `onSliceChange, onZoom{In,Out,Fit,Reset},
  onUndo/onRedo`. Destroy the chrome only in `deactivate()`.
- **`core/css/slice-viewer.css`** — all `.sv-*` chrome, imported once from
  `module-base.css`. Viewer height comes from the viewport
  (`--sv-height = max(460px, 100vh − --sv-offset)`); a module overrides
  `--sv-offset` on its root class when the chrome above the viewer differs
  (Image Viewer 405px, Annotation 335px, default 375px). Wrap width is
  capped at 1.5× height; the toolbar scrolls.
- **Dead components removed** (decision 7): `MetricCard.js`,
  `ProgressIndicator.js`, `LoadingOverlay.js`, `ComponentRegistry` /
  `getComponent` / `initGlobals`, `NavigationButtons.render()`,
  `StepNavigator.render()`, `BaseModule.renderNavigationButtons()`. The
  segmentation-only `modules/segmentation/visualization/` (nine files) went
  with the Phase-4 scoping pass.
- The template module + `template/README.md` "Module UI Contract" document
  the pattern; every module selector is scoped under its root class and
  carries no colour literals outside token definitions (ADR-005 / Phase 4).

## Verification

Each phase ended with a browser pass over the touched modules in light and
dark mode (`npm run dev`, `/workspace`), plus headless checks via
`docs/dev/tools/shots.js` for the viewer geometry and the resize behaviour.
Help changes ran `node scripts/validate-help-migration.js`. The full
consolidation (Phases 0–7 + the pre-release batch) merged to `main` and
shipped as **1.3.0** (`v1.3.0`).

## Follow-ups

- Segmentation `InferenceHandler.updateInferenceLoadingUI()` and
  `ImportHandler` still hand-write inline-styled progress / validation
  markup (fallback paths).
- Chart palettes are sampled at chart-creation time, so a theme toggle
  mid-chart keeps the old colours.
- Sidebar `FileBrowser.js` and the hub notification glyphs are still emoji
  (not module UI, out of ADR-005's scope).
