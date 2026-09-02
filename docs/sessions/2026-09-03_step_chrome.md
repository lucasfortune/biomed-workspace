# Step Chrome, Hub and Module Behaviour — One Nav Row, One Result Card, One Reset Rule

**Date:** 2026-09-03
**Phase:** Workspace consolidation — Phase 3 (step chrome, hub, module behaviour)
**Duration:** ~3 hours
**Status:** ✅ Complete
**Complexity:** Medium-High

---

## 🎯 Goals

After Phases 0–2 the step *contents* still differed from module to module: two modules used
`<h2>Step N: …</h2>` headings outside `.step-inner`, the primary job button lived in a card, in a
section header or in the nav row depending on the module, result blocks and their labels came in
six variants, the job progress fill reused the step-nav's `.progress-bar` class, five modules kept
their selection after leaving, thirty-odd inline `onclick=` handlers depended on `window.*`
free functions, the hub listed modules in implementation order, and test data was offered per
module instead of per input type. Tracker B3, B11, B12, B15, B17, B18, D17, D18; consolidation
decisions 3 (job button in the nav-row right slot), 5 (test data by input type) and 6 (reset on
leave, only 3D Visualization persists).

**Primary Objectives:**
- [x] Every module inside `.module-container > .step-contents > .step-inner`, `<h3>` titles without "Step N:", back label "Back"
- [x] Job button in the nav-row right slot everywhere (`btn primary` + play glyph); Start ↔ Cancel ↔ Next share the slot with one enabled red button at a time
- [x] One result block (`.section-card.success-card`) with the labels "Open in Image Viewer" and "Start New Run"; job fill class `.job-progress-fill`
- [x] Hub order = pipeline order; descriptions ≤ 14 words; typo fixed; card colours from `--card-*` tokens; help ids for the three new modules
- [x] Stitching pickers on the shared `FileSelector` (new list mode)
- [x] Test data per input type through one backend route; reset on leave in every module except 3D Visualization
- [x] No inline `onclick=`/`oninput=`/`onchange=` and no `window.nextStep`-style free functions
- [x] Verified in headless Chrome, light and dark, plus the Phase 2 regression probes

---

## 📝 Summary

**Accomplished:**
- ✅ **Shared pieces:** `POST /api/workspace/test-data` (`kind: raw | inference | denoising |
  annotations`) copies a built-in stack into the workspace and registers it like an upload
  (idempotent, thumbnail queued). `FileSelector` gained `testDataKind` (the test option imports the
  stack and then behaves exactly like a picked workspace file), `mode: 'list'` + `onAdd` + `addLabel`
  (dropdown with an Add button; upload and test import add directly), `showUpload`, `repopulate()`
  (re-filter without refetching) and `applyFilters()`. `module-base.css` gained `.nav-actions`,
  `.progress-bar-container` + `.job-progress-fill` and `.file-select-row`. `workspace.css` defines
  nine `--card-*` tokens (light + dark).
- ✅ **Hub:** registry reordered (Image Viewer, Preprocessing, Denoising, Annotation, Segmentation,
  Segmentation Cleanup, Stack Stitching, Mesh, 3D Visualization), every description ≤ 14 words,
  "U-Net annotation algorithm" typo gone, colours via tokens, `helpArticleId` for preprocess /
  segcleanup / stitching (articles follow in Phase 7).
- ✅ **Step chrome:** Segmentation and Image Viewer moved into the shared wrappers with `<h3>`
  titles; every viewer step now has a heading (Image Viewer "View Image", 3D Viewer "3D Viewer");
  "Previous", "← Back to Selection" and the Image Viewer's toolbar "← Change File" became a nav-row
  "Back".
- ✅ **Job buttons:** Mesh (Generate Mesh), Filter Denoising (Start Denoising), Template (Start
  Processing), Segmentation (Start Training with Cancel/Next in a `.nav-actions` group; Run
  Segmentation), DL Denoising (Start Denoising + Cancel + Next; Process Data + Done) and Annotation
  (Create Annotation; Save Progress stays in the header) now sit in the nav row. Each module has one
  helper that drives idle / running / finished / failed states of those buttons.
- ✅ **Results:** success cards in mesh, filter, template, segmentation (inference), DL (training
  and inference); Segmentation Cleanup gained "Start New Run"; six reset labels and three viewer
  labels collapsed to two. Job fills renamed in stitching, preprocess, DL (training and inference),
  mesh, template; the module copies of the progress-bar CSS and their "scoped because the step nav
  also renders .progress-bar" comments are gone.
- ✅ **Stitching pickers:** stack list = `FileSelector` in list mode (upload, recent results, test
  stack, mode filter via `filterFiles`/`repopulate()`); recipe picker = `FileSelector` with
  `accept: '.json'`, `filterTags: ['recipe', 'stitching']`, no upload. Stack-list and junction
  buttons use `data-action`/`data-index` with delegated listeners.
- ✅ **Test data (decision 5):** raw inputs in Image Viewer, Preprocessing, Annotation, Stitching and
  Template offer the training stack; the mask inputs of Mesh and Segmentation Cleanup offer the test
  mask; 3D Visualization and the recipe picker offer none. Filter, DL and Segmentation keep their
  existing `isTestData` flows.
- ✅ **Reset on leave (decision 6):** `deactivate()` resets mesh, filter, DL, segmentation and
  template (selection, config defaults, result ids, step 1); segmentation also clears its
  `modules.segmentation.*` state keys so `checkForResume()` no longer restores step 4, while the
  localStorage-based training resume dialog still works. 3D Visualization persists by design.
- ✅ **Globals (D18):** all 28 inline `onclick=` plus the 10 `oninput=`/`onchange=` in the 3D class
  panel and the DL mask panel replaced by `addEventListener` or delegated `data-action` handlers;
  `window.nextStep/previousStep/startGeneration/…` removed from mesh, template and visualization;
  annotation registers `window.annotationModule`. The template module and its README teach the
  current pattern.

**Key Findings:**
- `--card-color` was set on every hub card but never consumed by any CSS rule, so the raw hex
  values had no visible effect; the token set keeps the palette in one place for Phase 4.
- The segmentation module's `activate()` restores its last step from the StateManager, so a reset in
  `deactivate()` must clear those keys too, not just the instance fields.
- The template module's constructor overwrote `this.config` (BaseModule's config) with `null`;
  renamed to `processingConfig`.
- The DL module's "Process Data" button was toggled through its wrapper's `display`; with the button
  in the nav row the handler now toggles the button itself (same for mesh `generationOptions`, filter
  `processingAction`, segmentation `trainingActionContent`).

**Blockers Encountered:**
- none

---

## 📋 Detailed Log

### Task 1: Shared groundwork ✅

`src/routes/workspace.routes.js` `POST /test-data`; `FileSelector.js` list mode, test import,
`repopulate()`; `module-base.css` nav-actions / job progress bar / list row; `workspace.css`
`--card-*`; `registry.js` rewritten.

### Task 2: Segmentation + Image Viewer ✅

`Templates.js` wrappers, headings, nav rows, success card, section-card inference progress;
`SegmentationModule.js` `applyTrainingUIState()`, `addEventListener` wiring, full reset in
`deactivate()`; `TrainingHandler`/`StateHandler` use the state helper. Image Viewer: wrappers,
"View Image" heading, nav-row Back, delegated comparison list, `testDataKind: 'raw'`.

### Task 3: Mesh, Template, 3D Visualization, Filter Denoising ✅

Job buttons to the nav row with `setJobButtonVisible()`, success cards, job fills, no globals,
`reset()` reused from `deactivate()`; template README "Module UI Contract"; visualization loses the
two free functions and its inline class-panel handlers (delegated `_onControlEvent`), gains the
"3D Viewer" heading.

### Task 4: DL Denoising ✅

Start/Cancel/Next and Process Data/Done in `.nav-actions`, `UIStateHandler.setJobButtons()`,
`#trainSuccessSection` success card, one delegated `_onActionClick` for 13 actions and
`_onParamInput` for the mask sliders, `resetForLeave()`.

### Task 5: Stitching, Annotation, Segmentation Cleanup, Preprocessing ✅

Stitching pickers ported; annotation nav row + `window.annotationModule`; segcleanup "Start New Run"
+ test mask; preprocess labels, job fill, test stack.

### Verification

Headless Chrome (`docs/dev/tools/scenario_p3.json`, `scenario_p3_extra.json`,
`scenario_p3_template.json`, `scenario_p2b.json` = the Phase 2 probes with the new stitching picker
ids): hub card order, description word counts (10–13), help icon on all nine cards; for every module
the root class, `.step-inner` on the active step, the `<h3>` text, zero `<h2>`, the nav-row buttons
(text, classes, disabled/hidden), zero `[onclick]` elements and `typeof window.nextStep ===
'undefined'`; success-card action labels via DOM probes for the steps a run cannot reach; test-data
import in Image Viewer, Preprocessing and Segmentation Cleanup (dropdown value becomes the workspace
path, Next enabled); reset on leave for mesh, filter, DL and template (dropdown empty, step 1 after
returning); stitching list mode add / move / remove / repopulate; DL step 4 nav row; the Phase 2
readout / arrow-key / zoom probes for all five viewers in both themes. Only console errors: the
starter template module is not in the registry (registered ad hoc in its own scenario). Temporary
user, workspace and session removed afterwards.

---

## 💻 Code Changes Summary

### Modified Files (36)
- 📝 `src/routes/workspace.routes.js` — test-data route
- 📝 `core/components/FileSelector.js`, `core/css/module-base.css`, `css/workspace.css`, `modules/registry.js`
- 📝 segmentation: `templates/Templates.js`, `SegmentationModule.js`, `handlers/StateHandler.js`, `handlers/TrainingHandler.js`, `css/segmentation-modern.css`
- 📝 imageviewer: `ImageViewerModule.js`, `css/imageviewer.css`
- 📝 mesh: `MeshModule.js`, `css/mesh.css`
- 📝 template: `TemplateModule.js`, `css/template.css`, `README.md`
- 📝 visualization: `VisualizationModule.js`
- 📝 denoising-filter: `FilterDenoisingModule.js`, `css/filter-denoising.css`
- 📝 denoising-dl: `DLDenoisingModule.js`, `templates/Templates.js`, `handlers/InferenceHandler.js`, `handlers/UIStateHandler.js`, `components/MaskParameterPanel.js`, `components/MaskVisualization.js`, `components/ResultsDisplay.js`, `components/TrainingProgress.js`, `css/dl-denoising.css`
- 📝 stitching: `StitchingModule.js`, `css/stitching.css`
- 📝 annotation: `AnnotationModule.js`
- 📝 segcleanup: `SegcleanupModule.js`, `css/segcleanup.css`
- 📝 preprocess: `PreprocessModule.js`, `css/preprocess.css`

---

## 🔄 Next Steps

**Immediate Follow-up:**
1. [ ] Phase 4 — palette, dark mode, scoping, typography, icons (B7, B9, B10, B13, B14, B16) on `fix/palette-scoping`

**Deferred:**
1. [ ] Segmentation `InferenceHandler.updateInferenceLoadingUI()` still injects an inline-styled progress block into the loading overlay (fallback path only)
2. [ ] Filter Denoising's configuration summary now stays visible while the job runs (it was hidden together with the old button wrapper); decide whether that is wanted
3. [ ] Help articles for preprocess / segcleanup / stitching so the new hub help icons resolve (C1, C15, Phase 7)

---

## 🔗 Related Documentation

**Architecture Decisions:**
- [ADR-005](../decisions/005_design_system_color_scheme.md) — design tokens

**Related Sessions:**
- [Shared Slice-Viewer Chrome](2026-09-02_slice_viewer_chrome.md) — Phase 2
- [CSS Foundation](2026-09-02_css_foundation.md) — Phase 0 (`.btn`, `.section-card`, `.success-card`)

---

## 📊 Metrics

| Metric | Value |
|--------|-------|
| Files Changed | 36 |
| Lines Added | +1,906 |
| Lines Removed | −1,055 |
| Commits | 1 |
| Tracker items closed | B3, B11, B12, B15, B17, B18, D17, D18 |

---

**Navigation:**
← [Session Index](INDEX.md) | [Documentation Index](../INDEX.md) →

---

**Session Type:** Refactor
**Phase Status After Session:** On Track
