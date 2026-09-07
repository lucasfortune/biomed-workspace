# Data Model Consolidation Plan (target: v1.5.0)

Status: PLANNED (2026-09-07). Prerequisite for the workspace report (Section 5 will
describe the model this plan produces). Findings source: three code sweeps preserved
at `../../../workspace_report/sweeps/` (session/storage, file entity/metadata,
provenance/artifacts) and the synthesis `../../../workspace_report/data_model_workup.md`.
Register item codes (A1, B2, E3...) refer to the workup's inconsistency register.

Goal: the implicit data model that grew during development becomes an explicit,
consistent, documented one. Every register item is either FIXED, REMOVED, or
explicitly DOCUMENTED as a design decision. Closes with ADR-012 and a v1.5.0 bump.

Execution rules:
- Work through WPs in order; each WP ends with a commit and a smoke test.
- The canonical entity constructor (`WorkspaceManager.addFileToMetadata`) and
  `createLineage` are the law: producers conform to them, not vice versa.
- Backwards compatibility hook: workspaces only persist 12 h, BUT old ZIP backups can
  be restored any time -> all schema changes need a load-time normalization in
  `loadMetadata` (WP6.1), never a breaking read.
- Help articles are the user-facing contract: where behavior changes (WP2 names,
  WP3 recipes, WP7 retention), update `public/workspace/content/` in the same WP,
  then the docs site syncs on push.

---

## WP1 — Lineage conformance (the provenance DAG becomes sound)

1.1 Fix DL-inference lineage (A1): `DenoisingService._trackInferenceOutput`
    (DenoisingService.js:1038-1047) currently writes
    `{operation, inferenceId, timestamp, sourceFileId}`. Replace with
    `createLineage('denoising', [sourceFileId], inferenceId)`. Effect: DL-denoised
    stacks stop looking like original uploads; visualization overlay chain works.

1.2 Fix DL-training tracking (A2): `_trackOutputFiles` (DenoisingService.js:550-561)
    hand-rolls the record and omits `inputs` when inputFileId is null. Use
    `createLineage` throughout; never emit a lineage object without `inputs: []`.

1.3 Give ALL DL aux files lineage (B2b): routed_mask.npy, route_decision.json,
    config.json, results.json (DenoisingService.js:602-605) get the same
    `denoising-training` lineage as best_model.pth.

1.4 Segmentation training outputs get lineage (B2): in src/app.js:129-137, link
    best_model.pth/config.json/results.json to the raw + annotation input file ids
    via `createLineage('segmentation-training', [rawId, annotationId], trainingId)`.
    Requires plumbing the input file ids through the training start path
    (ml.routes.js holds session.uploadedFiles with the ids).

1.5 Record the model in inference lineage (B3): add optional field
    `lineage.modelFileId` (NOT inside `inputs` — `inputs` stays data-only so
    `findRootFiles`/`findOriginalDataFile` keep resolving to imaging data, not to
    training data through the model). Set it in segmentation inference
    (InferenceService.js:589 call site) and DL inference. Imported models without a
    tracked file id set it null.

1.6 Annotation conformance (A3): annotation.routes.js stops pushing raw objects into
    metadata.files; use `addFileToMetadata`. Extend the constructor whitelist with
    two now-official fields: `parentId` (sidecar link) and `lastModifiedAt`.
    Annotation lineage uses `createLineage('annotation', [sourceFileId])` + keeps
    `status` as a documented extension + gains the missing `processedAt` (comes free
    from createLineage). Delete the bespoke collision helper (annotation.routes.js:26-35)
    in favor of the shared one.

1.7 `deleteFile` handles `parentId`: deleting an annotation TIFF also removes (or at
    minimum de-orphans) its `_classes.json` sidecar row + file (register A3 tail).

1.8 Complete the human-label map (sweep2 #5): lineageHelpers.js:153-165 gains labels
    for denoising-gaussian, denoising-nlm, denoising-n2v,
    denoising-autostructn2v-stage1/-stage2, denoising-training,
    segmentation-training, plus the WP2 additions below.

1.9 Track DL inference_metadata.json (B4): register it as `['denoising','info']`
    like segmentation/mesh info files (DenoisingService.js:1055-1068).

1.10 Surface lineage errors (B8): `FileBrowser.fetchAndDisplayLineage`
    (FileBrowser.js:1444-1458) stops ignoring `hasErrors`; render missing-source
    steps as "(source deleted)" instead of pretending a clean chain.

Smoke: upload -> preprocess -> DL denoise (train + infer) -> annotate -> segment ->
mesh; check /api/workspace/lineage for the mesh resolves the original upload and the
info modal shows the full chain.

## WP2 — displayName completion (the naming chain never breaks)

2.1 Add OPERATION_TOKENS (namingHelpers.js:16-31): preprocess->prep,
    stitching->stitch, segcleanup->clean, convert->the target format (mrc/stl/ply/glb
    as qualifier instead?  decision: token 'conv' + format qualifier), duplicate->copy,
    split->part1/part2 via qualifier.

2.2 Set displayName in the six producers (B1): preprocess
    (preprocess.routes.js:263-272), stitching output + recipe
    (stitching.routes.js:267-288; recipe qualifier 'recipe'), segcleanup stack +
    reports (segcleanup.routes.js:121-130, :568-576; reports qualifier 'report'),
    duplicate/split/convert (files.routes.js:308-320, :526-554, :417-430). Derive
    from source displayName via existing `getSourceDisplayName`.

2.3 Rename collision check (C2): `WorkspaceManager.renameFile` (:628) applies
    `resolveDisplayNameCollision` before assignment, mirroring insert-time behavior.

2.4 Name invariant (C1): define `name === basename(path)` as the invariant. Fix the
    workspace upload route (workspace.routes.js:264-266) to store the on-disk name
    (timestamp-prefixed) as `name` and the original as `displayName` (upload
    currently gets no displayName at all — this gives uploads clean display names
    for free and removes the dual-name ambiguity). Tree view then stops overwriting
    name (FileBrowser.js:487 becomes redundant but harmless).

2.5 Server search parity (sweep2 #12): `searchFiles` (WorkspaceManager.js:940-942)
    matches displayName too.

Help articles: file-browser naming/rename articles updated accordingly.

## WP3 — Recipe robustness (B5)

3.1 Recipe schema v2: each stack entry stores `{path, fileId}` (id primary, path
    fallback + human-readable). Loader resolves id first, then path.
3.2 Missing stack: server returns 400 with a structured
    `{missing: [paths]}` payload instead of a 500; UI blocks compose while any slot
    is unresolved and says why.
3.3 Old recipes (path-only) keep working via the path fallback (no migration
    needed; recipes are files, not manifest rows).

## WP4 — Physical metadata completeness

4.1 Keep voxelSize on OBJ->STL/PLY/GLB conversion (B6): drop the `!isMesh` guard
    (files.routes.js:424); the value is informational and harmless on mesh entries.
4.2 Mesh Z Voxel Scale prefill (ADR-010 follow-up): when the selected source file
    has voxelSize with z, prefill the module's Z scale with z/x (user-overridable).
4.3 Preprocess run manifest (B7 part): stop deleting preprocess_config_<id>.json
    (preprocess.routes.js:235); track it as `['preprocess','info']` with the same
    lineage, so applied ops (crop/flip/rotate/downscale/gamma) are preserved like
    every other module's info file.
4.4 cropInfo reader (B7/ADR-007 promise): implement the stitching crop-origin
    prefill OR strike the promise from ADR-007 with a note. Recommendation: strike
    for now (low value, placement UX has moved on); keep cropInfo as recorded data.

## WP5 — Dead code removal & consolidation

5.1 Load-time normalization (D1 + migration hook): `loadMetadata` runs a single
    `normalizeManifest()` pass: normalizeCategory/normalizeTags applied (finally
    invoked), legacy lineage shapes (pre-WP1 records incl. the old DL-inference
    shape: map operation/sourceFileId -> processType/inputs) rewritten to canonical,
    missing `name`/basename mismatches tolerated. This makes ANY old ZIP restore
    land in the v1.5.0 model. Afterwards the legacy fallback branches in
    FileSelector.js:89-96 and lineageHelpers.js:195-199 can go.
5.2 Remove: GET /api/mesh/sources + MeshAPI.getSources (D6), src/config/
    session.config.js + its export (D6 refactor trap), POST /reset-session (D4;
    replaced by nothing — logout+login is the reset), legacy project-root dirs in
    ensureDirectories (constants.js:119-133) and their unauth static mounts
    (static.routes.js:87-97) (also E4).
5.3 Virtual folders (D6): REMOVE the folders CRUD + getFileTree; keep `folders: []`
    and `folderId` fields in the schema (writers keep null) so old manifests load
    untouched. Document as reserved.
5.4 Consolidate tracking (D3): delete the src/app.js:167-277 copy; single
    implementation in FileService.
5.5 DenoisingService session map (D2): keep the rich map as the service's internal
    state but ensure every job is ALSO registered in SessionTracker for the
    active-process cleanup guard (verify + test, or refactor to one map with a
    tracker facade).
5.6 Shared cache-dir constant (D5): one exported CACHE_DIRS list used by both the
    ZIP exclude (WorkspaceService.js:334) and clearWorkspace preserve
    (WorkspaceManager.js:1075).

## WP6 — Lifecycle & security hardening

6.1 Ownership checks (E2): job status/cancel endpoints verify
    `job.sessionId === req.session.id` (404 otherwise, don't leak existence);
    attach express-session middleware to Socket.IO (io.engine.use or wrapper) and
    make every join-* handler verify the job belongs to the socket's session
    (jobs in the per-service maps carry sessionId already). Preprocess/stitching/
    segcleanup rooms: include sessionId at room-creation registration so joins can
    be checked uniformly (introduce a minimal shared job registry entry for the
    three unregistered kinds — also fixes their invisibility to the cleanup guard).
6.2 Restore hardening (E3): (a) sanitize ZIP entry paths (reject absolute paths and
    `..` components) before extraction; (b) switch restore upload from
    memoryStorage to disk storage (temp file in the workspace's parent tmp dir),
    stream-extract, delete temp.
6.3 Retention alignment (E1): make the cleanup grace period a named config value
    with ONE documented policy. DECISION NEEDED (see bottom); then update
    getting-started/backup help articles to state the real policy.
6.4 Cache invalidation on in-place rewrite (C4): the three known rewrite sites
    (training validation normalization, annotation label remap, annotation re-save)
    call a new `invalidateFileCaches(fileId/path)` that deletes the file's
    thumbnail + slice-cache variants (reuse the deleteFile cleanup helpers).
    Immutability (P4) then holds as "any rewrite invalidates caches".

## WP7 — Documentation & release

7.1 ADR-012 "Workspace data model consolidation": records the canonical model
    (entities, tag grammar, lineage schema incl. modelFileId/parentId/status
    extensions, invariants) and the decisions from this plan. Source material: the
    workup document.
7.2 Refresh stale architecture docs (E5): FILE_STRUCTURE.md, AUTHENTICATION.md,
    STATE_ARCHITECTURE.md, DUAL_VERSION_DESIGN.md — live `workspaces/<sid>/` layout,
    real session config, real admin endpoints, seeding instead of test-data
    checkbox; delete descriptions of removed surfaces (reset-session, folders).
7.3 Help-article pass for user-visible changes (naming, recipes, retention);
    validate with scripts/validate-help-migration.js; push syncs the docs site.
7.4 Version bump 1.4.0 -> 1.5.0; session log in docs/sessions/.

## Explicitly NOT changed (documented as design in ADR-012)

- Jobs remain in-memory / restart-lossy (P1) — acknowledged trade-off.
- `uploadedAt` semantics kept (C5): with WP1 complete, every derived file has
  `lineage.processedAt` as its creation time; document the pair.
- Restore keeps file ids verbatim (C6): ids are workspace-scoped by design; noted.
- Path-dedup returning existing entries (sweep3 #12): document; run dirs are
  id-unique so collisions require deliberate same-path writes.
- No disk quota: deployment-level concern, noted in ADR + report limitations.
- Empty-tags-match-all selector rule: intentional escape hatch, documented.

## Decisions (settled by Lucas, 2026-09-07)

1. Retention policy (6.3): 48 h cleanup grace + honest wording in UI/docs; session
   cookie shortened to match. Rationale: small user base, storage affordable;
   revisit only if the platform grows into storage pressure.
2. Virtual folders (5.3): REMOVE (keep schema fields as reserved).
3. ADR-007 crop-prefill (4.4): STRIKE the promise from ADR-007 with a note;
   cropInfo stays as recorded data.
4. Convert display-name token (2.1): `<base>_conv.<ext>` style (e.g.
   `stack_conv.stl`).

## Suggested commit granularity

One commit per WP (WP1 may split into 1.1-1.5 / 1.6-1.10). Trailers as usual.
After WP7: push (syncs help content to the docs site), then the report project
resumes with Section 5 drafted against the consolidated model.
