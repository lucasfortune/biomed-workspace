# Remaining Code Items — Hand-offs, Validation Rules, Dead Code and Docs

**Date:** 2026-09-03
**Phase:** Workspace consolidation — Phase 5 (remaining code items)
**Duration:** ~2.5 hours
**Status:** ✅ Complete
**Complexity:** Medium

---

## 🎯 Goals

Close the code-review findings left open after Phases 0–4 (tracker D3, D4, D5, D11–D16, D19) and
apply decision 7 (delete the unused core components, bring the framework docs and the template
module up to the current patterns).

**Primary Objectives:**
- [x] D3 stitching accepts annotation masks as label-map stacks
- [x] D4 "Open in Image Viewer" works without a file id (path fallback) or says why not
- [x] D5 segcleanup quantification dirs pruned on supersede and swept on leave
- [x] D11 file-browser search matches tags (and synonyms), tooltip + article updated
- [x] D12 Gaussian kernel size actually limits the kernel
- [x] D13 stale "Stage 2" copy in the DL mask review
- [x] D14 mesh leftovers, D15 brush-size clamp
- [x] D19 one validation container component everywhere, `ParameterValidator` rules for the four
      ad-hoc parameter forms
- [x] D16 / decision 7: unused components deleted, `MODULE_FRAMEWORK.md`, `MODULE_CREATION.md`,
      `CLAUDE.md` and the template module aligned with the code

---

## 📝 Summary

**Accomplished:**
- ✅ **D3** `StitchingModule.fileMode()` treats uploads tagged `annotation` like `segmentation`
  results (`labels` mode), so annotation masks appear in the stack picker, fix the stitch mode and
  are respected by `detectRecipeMode()`. Copy now says "label maps (segmentations, annotations)".
- ✅ **D4** `ImageViewerModule` accepts a `workspace.viewerFile` hand-off that carries a path but no
  `fileId`: the hand-off keys are cleared first (no stale state on failure), the file is resolved by
  its workspace-relative path through `/api/workspace/files`, and an unknown path drops the
  selection with a warning notification instead of silently opening step 1.
- ✅ **D5** `segcleanup.routes.js` gained `sweepJobDirs()`: a successful `/quantify` removes every
  other `quant_*` dir, a successful `/apply` removes all `quant_*` dirs, and the new
  `POST /api/segcleanup/sweep` drops all `work_*`/`quant_*` dirs; the module calls it from
  `deactivate()` and `startNewRun()`. Preview cache files are untouched.
- ✅ **D11** `FileBrowser.filterFiles()` matches filename, category, every tag and a per-tag synonym
  list (`tagKeywords`); the legacy `categoryKeywords` map is gone; placeholder, tooltip and
  `file-browser/search.md` describe tag search (closes C12 as a side effect).
- ✅ **D12** `filter_denoising.py` maps the kernel size to scipy's `truncate` (radius = (k−1)/2,
  truncate = radius/σ), so the Gaussian is evaluated in exactly a k×k window; UI hint and
  `step2-gaussian.md` explain the interaction with sigma.
- ✅ **D13** Mask review copy: "masked when training continues with this mask", button
  "Continue with plain N2V instead"; doc comments in module, handler and API follow.
- ✅ **D14** Mesh header comment states the fixed outputs (JSON for the viewer, OBJ; conversions via
  the file browser). The listener and icon entry were already gone.
- ✅ **D15** `AnnotationModule.setBrushSize()` clamps to the slider range (1–50) before the engine.
- ✅ **D19** `ValidationDisplay.renderContainer()` renders the validation slot in every module
  (segmentation and DL templates, filter, mesh, visualization, annotation, template, image viewer);
  DL import validation goes through the component (compact `.validation-*` overrides deleted).
  `FormValidationController` takes a `fieldSelector` (default `.form-field`; `.sv-row` and
  `[data-field-group]` get the same `.has-error` / `.field-error` styling) and `ParameterValidator`
  rules guard mesh Z voxel scale (0.05–20, job button disabled), filter sigma (0.5–5) and h (1–30)
  for the visible method (Next disabled), preprocess crop x/y/w/h (whole numbers inside the stack,
  Apply disabled, crop unchanged while invalid) and segcleanup min size (whole number ≥ 0, Apply
  cleanup disabled). Gamma is a bounded slider and needs no rule.
- ✅ **D16 / decision 7** (agent, Opus): see "Task 3" below.

**Key Findings:**
- The stitching picker already hides incompatible stacks once the first one fixed the mode, so the
  "cannot be mixed" message is only reachable through recipes; it was reworded anyway.
- Two workspaces existed on disk during verification (one from Lucas's own session); cleanup and the
  D5 check must target the test session's workspace only.
- scipy's `gaussian_filter` renormalises a truncated kernel, so a 17×17 window at σ = 2 reproduces
  the untruncated default bit for bit while 3×3 is visibly sharper.

**Blockers Encountered:**
- ❌ The first D16 agent died on an API overload error before touching anything (resolved: relaunched).

---

## 📋 Detailed Log

### Task 1: Small items D3, D4, D5, D11–D15 ✅
Content-based replacements in `StitchingModule.js`, `ImageViewerModule.js`, `segcleanup.routes.js`
+ `SegcleanupModule.js`, `FileBrowser.js` + `search.md`, `filter_denoising.py` +
`FilterDenoisingModule.js` + `step2-gaussian.md`, `MaskVisualization.js` (+ comments in
`DLDenoisingModule.js`, `MaskHandler.js`, `DLDenoisingAPI.js`), `MeshModule.js`, `AnnotationModule.js`.

### Task 2: D19 validation ✅
`FormValidationController.fieldSelector`; `module-base.css` field-level validation rules extended to
`.sv-row` and `[data-field-group]` (message on its own line in flex rows), `.validation-container`
gets the container margin; `_initParamValidation()` in filter, mesh, preprocess and segcleanup
(destroyed in `deactivate()`, re-validated on reset); preprocess crop inputs wrapped in
`data-field-group` spans; DL `FileHandler` import displays through `ValidationDisplay`; templates
import `ValidationDisplay` for `renderContainer()`.

### Task 3: D16 / decision 7 ✅ (agent)
`git rm` of `MetricCard.js`, `ProgressIndicator.js`, `LoadingOverlay.js` (only the two index files
referenced them; `BaseModule` and 3D Visualization own their overlays). `components/index.js` and
`core/index.js` export exactly StepNavigator, NavigationButtons, ValidationDisplay, FileSelector,
SliceViewerChrome (`ComponentRegistry`, `getComponent`, `initGlobals` deleted). Dead methods
removed: `NavigationButtons.render()`, `StepNavigator.render()` (modules call `init()`; the markup
comes from `BaseModule.renderStepNav()`), `BaseModule.renderNavigationButtons()`, the `subtitle`
parameter of `renderHeader()`; the three `.card` rules in `module-base.css`. Template module:
`ValidationDisplay.renderContainer()`, `renderHelpIcon()` + `helpIconHtml`, delegated `data-action`
documented, header lists `canNavigate`; README registry snippet fixed (SVG icon, no `color`), new
sections on step gating and help icons. Docs rewritten against the code: `MODULE_FRAMEWORK.md`
(component set, `unloadCSS`, FileSelector option table, SliceViewerChrome, `renderContainer()`,
tokens/baselines/icons/scoping/container query), `MODULE_CREATION.md` (five components, BaseModule
example replaces the legacy hand-rolled one, routes in `src/routes/`, reset-on-leave practice),
`CLAUDE.md` core component list, `docs/architecture/MODULE_ARCHITECTURE.md` (invented FileSelector
options replaced by the real API). `FileSelector` JSDoc now says the icon is a name from
`core/icons.js`. Kept: `.metric-card` CSS (segmentation and DL templates hand-write that markup);
`docs/vision/completed/*` left as history.

### Verification
- `docs/dev/tools/gen_scenario_p5.py` → `scenario_p5.json` (16 scenarios) + `scenario_p5_dl.json`:
  path-only hand-off opens step 2 and clears the state, bogus path → step 1 + warning; annotation
  mask added to a stitch → "Mode: label maps", raw stacks no longer offered; search 'mask' / 'label'
  / 'annotation' → the mask, 'raw' / 'image' → the raw stacks, 'xyz' → nothing; fifteen `]`
  presses → 50/50 in slider, label and engine; sigma 9 → field error + Next disabled, hidden NLM
  field ignored, 1.5 → clean; Z scale 50 → error + job button disabled; crop x 99999 → error, Apply
  disabled, crop unchanged, valid rectangle → applied; min size −3 → error, Apply cleanup disabled,
  ops unchanged; every module's `#validationResult` is a hidden `.validation-container`; DL import
  containers render success / error through the component. No console errors.
- D5 over HTTP: two `/quantify` calls leave one `quant_*` dir; `/sweep` leaves none.
- D12 numerically (`venv/bin/python`): 3×3 vs 11×11 differ (mean 8.5 grey levels at σ = 2), 17×17
  equals scipy's default exactly.
- `token_grep.sh` clean (only the known chart fallbacks, ResumeDialog scrim and preprocess canvas).
- Regression: `scenario_p3.json` (23), `scenario_p3_template.json` (2), `scenario_p4.json` (23),
  `scenario_p2b.json` (10) all pass; the only console errors are the three known "Module 'template'
  not found" lines of the legacy Phase 3 template scenario (the template is not in the registry), and
  the Phase 4 style probe shows only the allowed remainders (prose arrows, play glyph, class-colour
  swatches, viewport background).

---

## 💻 Code Changes Summary

### New Files (0)

### Deleted (3)
`core/components/MetricCard.js`, `ProgressIndicator.js`, `LoadingOverlay.js`

### Modified Files
- Core: `BaseModule.js`, `core/index.js`, `components/index.js`, `NavigationButtons.js`,
  `StepNavigator.js`, `FileSelector.js` (JSDoc), `utils/FormValidationController.js`,
  `css/module-base.css`
- Modules: annotation, denoising-dl (module, API, `MaskVisualization`, `FileHandler`, `MaskHandler`,
  templates, CSS), denoising-filter, imageviewer, mesh, preprocess, segcleanup, segmentation
  templates, stitching, template (module + README), visualization; `components/FileBrowser.js`
- Backend / Python: `src/routes/segcleanup.routes.js`, `python/filter_denoising.py`
- Content / docs: `content/modules/denoising-filter/step2-gaussian.md`,
  `content/modules/file-browser/search.md`, `docs/guides/MODULE_FRAMEWORK.md`,
  `docs/guides/MODULE_CREATION.md`, `docs/architecture/MODULE_ARCHITECTURE.md`, `CLAUDE.md`

---

## 🔄 Next Steps

**Immediate Follow-up:**
- Phase 6: stitching "merge" junction (A1, decision 8).

**Deferred:**
- Segmentation `ImportHandler` still renders its compact `.import-validation-*` chips itself (not
  part of D19's scope; the DL counterpart now uses the component).
- The stitching "cannot be mixed" notification is unreachable through the picker (the picker
  filters incompatible stacks); keep it as a guard.

---

## 🔗 Related Documentation

**Related Sessions:**
- [2026-09-03 Palette, dark mode, scoping, typography, icons](2026-09-03_palette_scoping.md) (Phase 4)
- [2026-09-03 Step chrome, hub, module behaviour](2026-09-03_step_chrome.md) (Phase 3)

---

## 📊 Metrics

- Tracker items closed: D3, D4, D5, D11, D12, D13, D14, D15, D16, D19 (+ C12 by D11)
- Browser scenarios: 17 (all pass), HTTP check for D5, numeric check for D12

**Session Type:** Fix / Refactor
**Phase Status After Session:** Phases 0–5 done; Phase 6 next
