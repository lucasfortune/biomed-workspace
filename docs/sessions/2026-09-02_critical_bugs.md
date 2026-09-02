# Critical Bugs — Annotation Resume, Patch Size, MRC Upload, DL Viewer/Validation, Segcleanup Save

**Date:** 2026-09-02
**Phase:** Workspace consolidation — Phase 1 (critical bugs)
**Duration:** ~1.5 hours
**Status:** ✅ Complete
**Complexity:** Medium

---

## 🎯 Goals

Second phase of the consolidation plan: the seven code-review findings that break a user-facing
workflow outright (tracker D1, D2, D6, D7, D8, D9, D10).

**Primary Objectives:**
- [x] D6 — Annotation: "Resume unfinished" and "Edit existing annotation" reachable again
- [x] D7 — Segmentation: patch sizes 32 and 48 accepted by the server
- [x] D8 — File browser: `.mrc` uploads accepted client-side (backend conversion already existed, ADR-010)
- [x] D9 — DL Denoising: "Open in Viewer" after inference opens the Image Viewer
- [x] D10 — DL Denoising: import validation messages render
- [x] D1 — Segcleanup: "Create report" works after Save
- [x] D2 — Segcleanup: second Save without changes shows an info message instead of a 400

---

## 📝 Summary

**Accomplished:**
- ✅ The annotation step 1 selector has two new groups, "Unfinished annotations (resume)" and
  "Existing annotations (edit)"; the mode is decided from the file tags, the source image is resolved
  through lineage, and masks without lineage (uploaded masks) get a source-image picker with a
  dimension check.
- ✅ Editing a finished annotation never overwrites it: "Save Progress" creates a new WIP file and
  "Create Annotation" a new final file. Resuming a WIP file keeps updating that file.
- ✅ Uploaded masks without a class list get their classes derived from the label values present.
- ✅ One training-config validator (`src/helpers/validation.js`) — `src/app.js` had its own copy with
  the old minimum, which is why lowering the constant alone did not help. Minimum is 32, and the size
  must be a multiple of 16 (four pooling levels).
- ✅ DL inference results are handed to the viewer as tracked workspace files (the server now returns
  the tracked `fileId`); untracked outputs fall back to the path-based viewer hand-off.
- ✅ Segcleanup keeps the working copy's `metrics.json` / `report.csv` / `objects.csv` next to the saved
  file, so the report can still be created after saving; a `dirtySinceSave` flag stops the pointless
  second Save.

**Key Findings:**
- `src/app.js` still carried an inline `validateTrainingConfig` shadowing the helper; the route used the
  inline one. Removed, the helper is injected instead.
- The `FileSelector` category/tag filters cannot express "also list WIP results", so it gained an
  `extraGroups` option (label + filter over the full listing) that any module can use.

**Blockers Encountered:**
- none

---

## 📋 Detailed Log

### Task 1: D6 annotation resume/edit ✅

**Problem:** `onFileSelected` branched on the legacy categories `unfinished_annotations`/`annotations`,
which the metadata system maps to `results`/`uploads`; the selector never listed WIP files or masks.
Save Progress therefore produced files nobody could reopen.

**Solution:** `FileSelector.extraGroups`; module-level helpers `isRawImageFile`, `isImageResultFile`,
`isUnfinishedAnnotation`, `isFinishedAnnotation`; `handleExistingAnnotation(file, mode)` reads the
annotation's TIFF info, resolves the source via `lineage.inputs[0]`, otherwise renders
`#annotationSourcePicker` (raw uploads + image results; dimensions and slice count must match).
`loadExistingAnnotation` prefers the step-1 source, and sets `currentAnnotationId` only in resume mode.
`restoreAnnotation` derives classes when the sidecar has none.

**Files Changed:** `core/components/FileSelector.js`, `annotation/AnnotationModule.js`.

### Task 2: D7 patch size ✅

**Solution:** `TRAINING_CONFIG_RANGES.patchSize = { min: 32, max: 1024, multipleOf: 16 }`; helper
checks the multiple; `src/app.js` inline validator deleted in favour of the helper.
Help article `config-patch-size.md` still says 64 minimum — tracked under C10.

### Task 3: D8 MRC upload ✅

**Solution:** `FileBrowser.updateFileInputAccept()` sets `.tif,.tiff,.mrc` for image categories and
`validateFiles()` accepts `mrc`. Verified end to end with an 8-slice MRC generated from the test
stack: the backend converted it to TIFF and the viewer opened it. Module FileSelectors still accept
TIFF only (their upload path is the same endpoint; can be widened later).

### Task 4: D9 DL "Open in Viewer" ✅

**Solution:** `DenoisingService._trackInferenceOutput` attaches `fileId`, `relativePath`, `fileName`
of the tracked output to the result before it is emitted. `InferenceHandler.openInViewer()` uses
`workspace.viewerFile` (file id) when available, else `modules.denoising-dl.viewerFile` (path), and
loads `imageviewer` (the registered id).

### Task 5: D10 DL import validation ✅

**Solution:** The import templates now render `#importConfigValidation`, `#importStage1Validation`
(and `#importStage2Validation` for autoStructN2V) — the ids the handler writes to — instead of the
unused `#importValidationResult`.

### Task 6: D1 + D2 segcleanup ✅

**Solution:** `/save-edits` copies `metrics.json`, `report.csv`, `objects.csv` from the superseded
working copy into the tracked output directory before deleting the working copy and returns
`reportDir`; the client adopts it when its `reportDir` pointed into the deleted working copy.
`dirtySinceSave` is set on Apply cleanup and on paint edits, cleared on save; the client guard uses it.

### Verification

Headless Chrome (DevTools protocol) against a temporary admin workspace with the built-in test
stacks plus a WIP annotation created through the API:
- Resume: WIP file listed under "Unfinished annotations", loads with its two classes and source image,
  `currentAnnotationId` set.
- Edit: uploaded mask listed under "Existing annotations", picker shown, mismatching stack rejected
  ("256 × 256, 8 slices" vs 23), matching stack accepted, loads with derived classes, id `null`.
- Patch size via `/configure-training`: 32 ✓, 40 ✗ ("multiple of 16"), 64 ✓.
- File browser: accept attribute `.tif,.tiff,.mrc`; `a.mrc` valid, `a.png` rejected; MRC upload converted.
- DL: viewer opened on the tracked file; import config validation error rendered in the new container.
- Segcleanup: Apply → Save → Create report → "Report saved (report.csv, objects.csv)"; second Save →
  "No changes to save yet."
No console errors. Temporary user, session and workspace removed afterwards.

---

## 💻 Code Changes Summary

### Modified Files (11)
- 📝 `public/workspace/js/core/components/FileSelector.js` — `extraGroups` option
- 📝 `public/workspace/js/modules/annotation/AnnotationModule.js` — resume/edit flow, source picker, class derivation
- 📝 `public/workspace/js/components/FileBrowser.js` — MRC accept + validation
- 📝 `public/workspace/js/modules/denoising-dl/handlers/InferenceHandler.js` — viewer hand-off
- 📝 `public/workspace/js/modules/denoising-dl/templates/Templates.js` — validation containers
- 📝 `public/workspace/js/modules/segcleanup/SegcleanupModule.js` — `dirtySinceSave`, report dir follow
- 📝 `src/app.js` — inline validator removed
- 📝 `src/config/constants.js`, `src/helpers/validation.js` — patch size range
- 📝 `src/routes/segcleanup.routes.js` — keep report files on save
- 📝 `src/services/DenoisingService.js` — tracked file id in inference result

---

## 🔄 Next Steps

**Immediate Follow-up:**
1. [ ] Phase 2 — shared slice-viewer chrome (B2/B5, 1-based readouts) on `fix/slice-viewer-chrome`

**Deferred:**
1. [ ] C10 / C11 / C12 help articles (patch size minimum, annotation resume/edit, MRC import)
2. [ ] Module FileSelectors: accept `.mrc` for raw-image inputs

---

## 🔗 Related Documentation

**Architecture Decisions:**
- [ADR-009](../decisions/009_segcleanup_module.md) — segmentation cleanup module
- [ADR-010](../decisions/010_format_conversion.md) — MRC import / format conversion

**Related Sessions:**
- [CSS Foundation](2026-09-02_css_foundation.md) — Phase 0 of the same plan

---

## 📊 Metrics

| Metric | Value |
|--------|-------|
| Files Changed | 11 |
| Commits | 1 |
| Tracker items closed | D1, D2, D6, D7, D8, D9, D10 |

---

**Navigation:**
← [Session Index](INDEX.md) | [Documentation Index](../INDEX.md) →

---

**Session Type:** Bug Fix
**Phase Status After Session:** On Track
