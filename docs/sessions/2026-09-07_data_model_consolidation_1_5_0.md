# Data Model Consolidation (Release 1.5.0)

**Date:** 2026-09-07
**Phase:** Phase 8 — consolidation release
**Duration:** ~1 session (plan prepared in a prior session)
**Status:** ✅ Complete
**Complexity:** Architectural

---

## 🎯 Goals

Execute `docs/vision/data_model_consolidation_plan.md` (WP1–WP7): turn the
implicit data model that grew during development into an explicit,
consistent, documented one. Findings source: a full reverse-engineering
workup (three code sweeps, ~30-item inconsistency register). Every register
item ends FIXED, REMOVED, or documented as a design decision in ADR-012.

---

## 📝 Summary (one commit per work package)

### WP1 — Lineage conformance
Every producer now emits canonical lineage records via `createLineage`
(`{processType, processedAt, inputs[], processId?}`); no record ships
without an `inputs` array. DL-inference outputs stop looking like original
uploads; DL training aux artifacts, segmentation training outputs (raw +
annotation input ids plumbed through the session) and DL
`inference_metadata.json` all get lineage; the new optional
`lineage.modelFileId` records the model an inference ran with without
polluting data-only `inputs`; annotation entries go through
`addFileToMetadata` (whitelist gains `parentId`, `lastModifiedAt`);
`deleteFile` removes sidecars; the lineage label map is complete; broken
chains render as "(source deleted) → …".

### WP2 — displayName completion
`OPERATION_TOKENS` gains prep/stitch/clean/conv/copy/split; the six missing
producers (preprocess, stitching output + recipe, segcleanup stack +
reports, duplicate/convert/split) set chained display names; rename applies
collision resolution; upload invariant `name === basename(path)` with the
original filename as displayName; search matches display names.

### WP3 — Recipe robustness
Stitch recipe schema v2: each stack slot stores `{path, fileId}` (id
primary, path fallback — old recipes keep working). Missing stacks return
a structured 400 `{missing: [...]}`; the UI blocks compose while any slot
is unresolved and says why.

### WP4 — Physical metadata
voxelSize survives OBJ→STL/PLY/GLB conversion; the mesh Z Voxel Scale
prefills from the file's recorded voxel size (z/x, overridable); the
preprocess run manifest (`preprocess_config_<id>.json`) is kept and tracked
as `['preprocess','info']`; the ADR-007 crop-prefill promise is struck.

### WP5 — Dead code removal + load-time migration
`normalizeManifest()` in `loadMetadata` upgrades any manifest (old ZIP
backups included) to the canonical model once and persists it (schema
1.2.0). Removed: `/api/mesh/sources`, `session.config.js`,
`/reset-session`, legacy project-root data dirs + their unauthenticated
static mounts, virtual folders (schema fields reserved). Consolidated:
one tracking implementation (FileService), one shared `CACHE_DIRS` list.

### WP6 — Lifecycle & security hardening
Generic job registry in SessionTracker (preprocess/stitching/segcleanup/
DL-inference/filter jobs; also visible to the cleanup guard); shared
session middleware on Socket.IO + a single ownership gate on every job-room
join; ownership checks on job status/cancel/download endpoints; restore
streams from a temp file with zip-slip sanitization (no more 5 GB memory
buffering); ONE retention policy (`RETENTION_HOURS = 48`) driving both
cleanup grace and session cookie, stated honestly in help articles;
`invalidateFileCaches` on in-place rewrites.

### WP7 — Documentation & release
ADR-012 records the canonical model and decisions; FILE_STRUCTURE /
AUTHENTICATION / STATE_ARCHITECTURE / DUAL_VERSION_DESIGN refreshed to the
live system; help-article pass (naming, recipes, retention) validated;
version 1.5.0.

---

## ✅ Verification

- Per-WP smoke tests: 16-check lineage/constructor exercise, naming/rename/
  search checks, 12-check normalizeManifest migration (idempotent,
  persisted, root resolution through migrated records), 10-check socket
  ownership gate, zip-slip extraction test with a crafted archive.
- Server boot + endpoint probes after every WP; help-migration validation
  green throughout.

## 📌 Decisions (Lucas, 2026-09-07)

48 h retention with honest wording; virtual folders removed; ADR-007
crop-prefill struck; convert naming `<base>_conv.<ext>`. Not-changed list
(in-memory jobs, uploadedAt semantics, restore id replay, path-dedup, no
quota, empty-tags-match-all) documented in ADR-012.
