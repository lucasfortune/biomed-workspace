# Pre-Release Batch — Lucas's Fix Lists (General + Per-Module)

**Date:** 2026-09-04 (batch spanned 2026-09-02 → 2026-09-04)
**Phase:** Workspace consolidation — Pre-release batch (after Phase 7, before the 1.3.0 release)
**Duration:** ~3 sessions
**Status:** ✅ Complete
**Complexity:** Medium–High

---

## 🎯 Goals

Work through Lucas's own pre-release punch list — a "general" list plus per-module lists — on a
single branch `fix/pre-release` off `main` (`cf8d3a4`). These are polish and consistency fixes on
top of the merged consolidation (Phases 0–7), to be released together as 1.3.0.

**Primary Objectives:**
- [x] General list — seed sample data, retire the test-data selector option; stop slice viewers squashing on resize
- [x] Per-module batch 1 — segcleanup toolbar/name, mesh downloads, empty hub IO line, stitching help split
- [x] Per-module batch 2 — preprocess 2-step + zoom, image-viewer fit, rename annotation
- [x] Help-article audit — one article per link point across the whole library
- [x] Viewer fixes + stitching 3→2 — preprocess wheel/drag, image-viewer fit-on-open, stitching two-step

---

## 📝 Summary

Delivered as six commits on `fix/pre-release`, tracked as E-GEN / E-MOD1–4 in the (gitignored)
`docs/dev/BUGS_ISSUES.md`.

### General list — `49fa846`
- ✅ **Sample data everywhere; test-data option retired.** Every new workspace is seeded with
  `sample_raw.tif` + `sample_annotation.tif` (`WorkspaceManager.SAMPLE_FILES`). The per-selector
  "test data" option and the Phase-3 test-data machinery/endpoints were deleted; approval now gates
  *uploading custom files* only, not using the app.
- ✅ **Slice viewers no longer squash on resize.** Wired `SliceViewerChrome`'s `onResize`
  (ResizeObserver on the canvas host) in preprocess and stitching, plus a container observer in 3D
  visualization, so shrinking the window / opening the help panel re-fits the drawn slice.

### Per-module batch 1 — `56fa9c8` (E-MOD1)
- ✅ **Segcleanup:** merged the "Tool" and "Active class" toolbar sections into one "Tool & class"
  section (both help icons pointed at the same article); default save name is now
  `{original}_clnd` instead of `cleaned`.
- ✅ **Mesh:** removed the separate per-format download buttons after generation (downloads are done
  from the file browser).
- ✅ **Hub cards:** hide an empty Inputs/Outputs line at the render level (3D Visualization outputs
  nothing, so its "Outputs:" line is gone) — covers any zero-IO module.
- ✅ **Stitching help:** split the tangled step-2 help into one icon per article — "The Overlay
  Viewer" (color/overlay, pan/zoom) at the step header, "Aligning a Junction" (move slice, auto
  align & confidence, per-junction buttons) at the Transform section.

### Per-module batch 2 — `0178d43` (E-MOD2)
- ✅ **Preprocess:** collapsed 3 steps → 2 (segcleanup model): the file name moved into the step-2
  "Output" toolbar section, the nav-row button is "Save as New File", a success banner + progress
  bar live in step 2; default name `{original}_ppd`; "Crop" + "Z range" merged into one section;
  zoom/pan added to the preview viewer.
- ✅ **Image Viewer:** "Fit to view" now truly fits (it had been identical to 1:1 because zoom 1
  only shrank oversized images).
- ✅ **Annotation:** module renamed "Quick Annotation Tool" → "Annotation" everywhere (registry,
  module, CSS, help `_module.md`, manifest; redundant glossary term dropped).

### Help-article audit — `8c08338` (E-MOD3)
Whole-library pass toward "one article per concept, linked from exactly one point, content matching
that point." Audited all 84 icon link points against the article library (four read-only Opus
subagents). 14 fixes: removed 5 redundant second icons; standardized file-selection steps to
one icon on the FileSelector (preprocess/segcleanup/stitching, matching annotation); split
`stitching.step1.workflow` and added a new `stitching.step1.recipe`; reframed `segmentation.step1`
as a step overview; deleted dead `preprocess.step3.apply` (folded into `preprocess.step2.output`);
gave two good-but-unlinked articles a home (`denoising-dl.step2.overview` → Configure Training,
`routing-decision` → Noise Analysis & Mask); `file-browser` overview now lists all 7 children.
Manifest + glossary kept in sync; 0 duplicate links remain; the project's `validate-help-migration.js`
passes.

### Viewer fixes + stitching 3→2 — `78914f3` + `0e1266c` + `e0ec656` (E-MOD4)
- ✅ **Preprocess viewer wheel/drag** did nothing (buttons worked). `setupCanvasEvents` captured
  `this.viewer` at init, but `resetState()` (on file select) replaces it — the handlers mutated a
  dead object and the wheel guard `if (!v.img) return` always bailed. Fixed by reading `this.viewer`
  fresh per handler; added `touch-action: none` + grab cursor to `#ppCanvas`.
- ✅ **Image Viewer fit-on-open:** opens each stack fitted to the box (was 1:1, tiny for small
  stacks) via a one-shot `_fitOnLoad` flag; user zoom/pan preserved afterwards.
- ✅ **Stitching 3 steps → 2:** Select Stacks → Align & Compose. The step-2 toolbar gains an Output
  section (Match intensities, Crop to common area, name, progress); the nav button is "Compose";
  recipe workflow (no alignment) shows compose-only via `applyComposeLayout()` (viewer + align
  sections hidden, toolbar full width). Follow-up `e0ec656`: capped the two Output labels and made
  the default name `{stack1}_{stack2}_stchd`.

---

## ✅ Testing / Verification

Verified in headless Google Chrome via `docs/dev/tools/shots.js` against a `PORT=3055` server on the
seeded sample: general (2-step preprocess, merged sections, zoom), image-viewer fit vs 1:1,
annotation rename; help audit confirmed statically (0 duplicate links, all seeAlso/glossary resolve,
`node --check` clean, validator passed) and over HTTP; preprocess wheel null→1.97 / drag panX 0→60;
image viewer opens at 1.35×; stitching 2-step with a real compose run to completion (256×256, 45
slices, recipe saved) and the recipe compose-only layout toggle; stitching default name
`{stack1}_{stack2}_stchd`. No console errors. Throwaway test user/session/workspace torn down after
each run; the developer's own workspace/session assets left intact.

**Gotcha recorded:** `shots.js` uses a scenario's `url` as `BASE + url`, so it must be a path
(`/workspace`), never a full URL — a full URL fails to navigate silently (stays about:blank →
`window.workspace` undefined).

---

## 🔗 Related

- Plan & tracker: `docs/dev/IMPLEMENTATION_PLAN.md`, `docs/dev/BUGS_ISSUES.md` (Category E: E-GEN,
  E-MOD1–4), `docs/dev/HANDOFF.md`.
- Next: **Phase 8 — Release 1.3.0** (version bump, hub "What's new", tag `v1.3.0`,
  MODULE_FRAMEWORK/FILE_STRUCTURE updates, ADR-011).
