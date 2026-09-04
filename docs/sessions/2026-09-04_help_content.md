# Help Content — Articles for the New Modules, Corrections for the Old Ones

**Date:** 2026-09-04
**Phase:** Phase 7 — Help content (C1–C15)
**Duration:** ~3 hrs
**Status:** ✅ Complete
**Complexity:** Medium

---

## 🎯 Goals

Bring the in-app help system up to date with the code: give the three
newest modules (preprocess, stitching, segcleanup) their first help
articles, correct every outdated article in the older modules, and fix the
manifest/glossary. Branch `docs/help-articles` from `main`.

---

## 📝 Summary

**Accomplished:**
- ✅ 21 new articles for preprocess (7), stitching (8), segcleanup (6),
  grounded in the module code and wired to in-app help icons (C1–C4, C15).
- ✅ Rewrote outdated articles across all older modules against the current
  code (C5–C13); created a Step-2 overview for segmentation, a Step-3
  results article for filter denoising, and a new "Workspace Basics" guide.
- ✅ Manifest + glossary maintenance (C14): +14 glossary terms, dropped the
  5 orphaned DL entries, de-duplicated Lineage/File Lineage, fixed the one
  dangling seeAlso.
- ✅ Retired 5 fixed-architecture DL articles (features, num-layers,
  resize-conv, upsampling-mode, masking-strategy).
- ✅ Replaced stitching's dominance `renderInfoTip` tooltip with a real help
  icon and removed the now-unused `.info-tip` method + CSS.
- ✅ `validate-help-migration` passes (103 articles, 137 glossary terms);
  help panel, search and glossary verified in-browser.

**Key Findings:**
- The tracker's C8 loss-curve colour note was stale: after the Phase 4
  token migration the DL loss chart uses train = `--module-primary` (red),
  val = `--module-info` (teal), not the audit's #4A90E2/#E24A4A. The article
  now follows the code.
- Several C7 (Image Viewer) audit details were out of date vs the code:
  zoom is 10–1000 % (not 25–400 %), pan works at any zoom (no >100 % gate),
  there is no "Change File" button, and ←/→ slice navigation *does* work
  through the shared `SliceViewerChrome`. Articles follow the code.
- `registry.js` already carried `helpArticleId` for the three new modules
  (added in Phase 3/4); only the articles and in-step icons were missing.

---

## 📋 Detailed Log

### Approach

The manifest (`public/workspace/content/manifest.json`) is the generated
index the info panel loads; the old JSON→markdown converter is dead (the
source JSON is gone), so the manifest is now derived from each article's
markdown frontmatter. A small resync script rebuilds every article entry
from frontmatter while preserving the hand-maintained glossary; it is
idempotent (verified: zero drift re-running it over the untouched corpus),
so the manifest diff is exactly the articles that changed. New-module
content was drafted by code-reading subagents (one per module), each
returning a claims table mapping every number/label to a `file:line`; the
integration (manifest, glossary, seeAlso graph, JS wiring) was done and
reviewed here.

### New modules (C1–C4, C15)

21 articles under `content/modules/{preprocess,stitching,segcleanup}/`,
registered in the manifest and the `modules` list. Help icons follow the
older modules' pattern: a `renderHelpIcon()` per module, `data-info-id`
on every step heading, toolbar section title and FileSelector. Stitching's
three-way "Overlapping sections keep" control (upper / lower / merge, from
Phase 6) is documented in `stitching.step2.dominance` (merge = images only,
`z_merge` in the recipe), and its old `?` tooltip became a real help icon.

### Corrections (C5–C13)

Every outdated claim in the DL denoising, filter, segmentation, annotation,
mesh, visualization, image-viewer and file-browser articles was checked
against code and fixed (defaults/ranges, removed controls, behaviour). Two
missing step articles were created (`segmentation.step2`,
`denoising-filter.step3`) and their step-header help icons wired; a new
top-level `workspace-basics` guide covers the hub, theme toggle, sidebar,
approval gate, logout and info-panel mechanics.

### Manifest / glossary (C14)

Resynced all article entries from frontmatter; deleted the 5 retired DL
entries; added 14 glossary terms (voxel size, MRC, stitch recipe, mosaic,
z-concatenation, working copy, quantification, tag, format conversion, PLY,
glTF/GLB, and the three new "… Module" names); removed the stray
"Lineage" → visualization duplicate (kept "File Lineage" → file-browser);
fixed `segmentation.step1`'s dangling `segmentation.training-data` seeAlso.

### Verification

`node scripts/validate-help-migration.js` → PASSED (103 articles = 103
markdown files, 0 errors; the lone warning matches the `${articleId}`
template literal in a `renderHelpIcon` definition). A dangling-reference
sweep (seeAlso + glossary articleIds) found none. Headless-browser check
(kit): loaded all three new modules (help icons render — preprocess 8,
stitching 11 with `.info-tip` count 0, segcleanup 8), clicking an icon
opens the panel with the correct article, the content service fetches every
new/changed article, search finds the new terms, and the glossary lists all
14 new terms. No console errors.

---

## 🗂️ Files Touched

- **New:** 21 module articles + `content/workspace-basics.md`,
  `content/modules/segmentation/step2.md`,
  `content/modules/denoising-filter/step3.md`.
- **Deleted:** 5 DL architecture articles.
- **Edited:** `manifest.json`; outdated articles across 8 modules; JS wiring
  in the three new modules plus `segmentation/templates/Templates.js`,
  `denoising-filter/FilterDenoisingModule.js`; removed the stitching
  `.info-tip` CSS.

## ⏭️ Deferred

- Sub-control help icons flagged in C6/C7 (visualization toolbar
  Reset/Expand and the Original Data panel; the image-viewer comparison
  section). The step-level icons already make all of that content reachable;
  these are polish.

---

## 🔗 Related

- Commits: `1bde997` (new modules), `19eb59d` (corrections + manifest).
- Tracker: C1–C15 CLOSED in `docs/dev/BUGS_ISSUES.md`.
- Next: Phase 8 (release — version bump 1.3.0 + tag, hub "What's new",
  MODULE_FRAMEWORK / FILE_STRUCTURE updates, ADR-011).
