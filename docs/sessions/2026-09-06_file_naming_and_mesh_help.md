# File Naming System (Port) + Mesh Z Voxel Scale Help Article

**Date:** 2026-09-06
**Phase:** Phase 8 — post-1.3.0 maintenance / UX
**Duration:** ~1 session
**Status:** ✅ Complete
**Complexity:** Architectural (port) + Simple (help)

---

## 🎯 Goals

Two features that had been developed on a separate machine (on a pre-1.3.0 branch) but were
never carried into the 1.3.0 consolidation release. Re-apply them on top of 1.3.0:

1. **Consistent file naming system (display names)** — self-documenting, unique, provenance-
   chained user-facing names for workspace outputs.
2. **Mesh Z Voxel Scale help article** — a dedicated help article for the (already-editable)
   Z Voxel Scale control, split out of "Output Options".

**Primary Objectives:**
- [x] Port `namingHelpers.js` + all backend/frontend call sites onto 1.3.0
- [x] Re-create the dedicated Z Voxel Scale help article + wire its help icon
- [x] Version bump 1.3.0 → 1.4.0 (footer + "What's new" block)

---

## 📝 Summary

### File naming system (ported)

The original feature (pre-1.3.0 `feat/file-naming-system`) could not be cherry-picked: 1.3.0
had rewritten most of the ~18 touched files (denoising v2.0, shared FileSelector/FileBrowser,
module UIs). It was re-applied by hand onto the 1.3.0 structure.

- ✅ `src/helpers/namingHelpers.js` copied verbatim (self-contained: token vocabulary, chained
  name builder, case-insensitive collision resolver, length cap).
- ✅ `WorkspaceManager.addFileToMetadata` resolves a unique `displayName`; new
  `getSourceDisplayName()`; rename reworked to **display-name-only** (never touches the
  physical file/path).
- ✅ Backend call sites wired for the 1.3.0 shapes:
  - `FileService.trackModuleOutput` + `src/app.js` local `trackModuleOutput` — lineage-driven
    display names (inference, generic outputs) + chained segmentation training model names.
  - `DenoisingService` — adapted to the **routed v1.0** `track()` helper (single
    `denoised_stack` + model/aux files) instead of the old two-stage structure; both the
    training-output and inference-output paths.
  - `denoising.routes.js` (filter), `mesh.routes.js` (outputs + clean mesh download name),
    `annotation.routes.js` (wip/final tiff + sidecar), `files.routes.js` (single download +
    de-duped ZIP entry names).
- ✅ Frontend reads `displayName || name` in the file browser (list/results/search/info modal),
  both file selectors + preview, the image viewer header, and every module source/result panel
  (mesh, visualization, filter-denoise, template, annotation, segmentation FileHandler).
- ✅ FileBrowser gained `getDisplayName(file)`; rename prompt is display-name-only.

### Mesh Z Voxel Scale help article (redone)

- ✅ Re-created `modules/mesh/step2-z-voxel-scale.md` (What It Does / Values / How To Choose /
  Where It Applies, incl. the `z-step ÷ in-plane pixel size` formula).
- ✅ Trimmed the Z Voxel Scale section out of `step2-output-options.md`, leaving a pointer.
- ✅ Added a dedicated help icon on the Z Voxel Scale control in `MeshModule.js` (1.3.0's help
  refactor had left the control with no icon of its own).
- ✅ `manifest.json`: new article entry, "Z Voxel Scale" glossary term (Z), reciprocal
  `seeAlsoManual` cross-links from the mesh overview and Output Options.

---

## ✅ Verification

- All 22 changed JS files pass `node -c`.
- `manifest.json` parses; `scripts/validate-help-migration.js` → **0 errors** (104 articles,
  137 glossary terms). The single warning (`Help icon references unknown article: ${articleId}`)
  is pre-existing — the validator statically reads the `renderHelpIcon` helper's own template.
- Naming core unit test: chain, qualifiers, asn2v/asn2v2 tokens, case-insensitive collisions,
  unknown-op fallback — all pass.
- Server boots cleanly on a test port.

---

## 💻 Code Changes Summary

### New Files (+3)
- ✨ `src/helpers/namingHelpers.js`
- ✨ `public/workspace/content/modules/mesh/step2-z-voxel-scale.md`
- ✨ this session log

### Modified Files (20)
- Backend: `WorkspaceManager.js`, `src/app.js`, `src/services/{FileService,DenoisingService,
  WorkspaceService}.js`, `src/routes/{mesh,annotation,denoising,files}.routes.js`
- Frontend: `public/workspace/js/components/FileBrowser.js`,
  `js/core/components/FileSelector.js`, and the module files
  (annotation, denoising-filter, imageviewer, mesh, segmentation/handlers/FileHandler,
  template, visualization)
- Help: `content/manifest.json`, `content/modules/mesh/step2-output-options.md`
- `public/workspace/index.html` — version 1.3.0 → 1.4.0 + "What's new" block

---

## 💡 Notes

- **Port, not cherry-pick.** The pre-1.3.0 branch was preserved as `backup/main-features`
  before resetting local `main` to `origin/main`; the two features were the only work on it
  not superseded by 1.3.0. (The third item on that branch — a `changelog.json` modal overlay —
  was intentionally dropped: 1.3.0 already ships an inline `<details class="whats-new">`
  changelog.)
- **DenoisingService divergence.** The old feature named per-stage outputs (`asn2v` /
  `asn2v2`); the 1.3.0 routed v1.0 output emits a single denoised stack, so the port uses one
  method-based token (`asn2v` / `n2v`) with qualifiers for the aux files.

---

**Navigation:**
← [Session Index](INDEX.md) | [Documentation Index](../INDEX.md) →

---

**Session Type:** Feature (port) + Documentation
**Version After Session:** 1.4.0
