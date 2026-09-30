# ADR-018: Workspace Layout, Naming and Upload Detection

**Release:** v1.11.0
**Status:** Accepted, implemented (2026-09-30)
**Context:** After the bioimage.io work (ADR-015 to ADR-017) Lucas reviewed
the workspace as a whole and raised five housekeeping items: folders and
files named after ids and timestamps, doubts whether the new file kinds
were integrated in the data model, the browser-native rename dialog, two
locations for annotations, and an upload flow that made the user choose
the kind of a file first. Four code audits (naming, data-model
integration, dialogs and upload, annotation storage) established the
facts below; all nine recommendations were accepted.

## What the audits found

- Nothing parses an id out of a folder or file name: lineage, sidecars,
  restore and most caches work by manifest id or stored path. Only the
  training folder relies on fixed inner names, and three caches hashed
  the path (annotation raw slices, DL slices, mesh previews; the mesh key
  covered only the first 24 bytes of the path and collided).
- The visible number noise came from three sources: uploads stored as
  `<epoch>-<name>`, run folders named by uuid or `<prefix>_<epoch>_<rand>`
  shown as-is in the tree, and producers that built display names from
  the physical name of their source (training outputs, annotations, the
  export name).
- Data model gaps: zoo model cards without lineage (shown as "Original
  Upload"), model ids inside `lineage.inputs` (ADR-016/017, against
  ADR-012), sidecars without `parentId` (deleting an output left its info
  and config files behind), created annotations filed as `uploads` with
  lineage in a root-level `annotations/` folder, work-in-progress
  annotations never promoted or removed, module selectors uploading
  annotations tagged `raw` and model uploads rejected by the upload
  filter, extension-gated actions that offered DL denoising models for
  export and fine-tuning, `/import-pretrained-model` breaking
  `name === basename(path)`, no migration for pre-1.8 model uploads, and
  preprocessed or stitched stacks that could neither be annotated nor
  trained on.
- Nine native `prompt`/`confirm`/`alert` calls remained; the other file
  actions each built their own copy of the same modal.
- Nothing inspected uploaded content; the probes needed for detection
  already existed.

## Decisions

1. **Run folders are `<prefix><n>`** with a per-workspace, per-prefix,
   monotonic counter stored in the manifest (`counters`, schema 1.3.0):
   `models/segmentation/train<n>`, `results/segmentation/seg<n>`,
   `results/denoising/filter<n>` and `dn<n>` (with `models/denoising/dn<n>`),
   `results/preprocess/prep<n>`, `results/stitching/stitch<n>`,
   `results/segcleanup/clean<n>`, `results/meshes/mesh<n>`,
   `results/annotation/annot<n>`, `models/bioimageio/export<n>`. Zoo cards
   live under `models/bioimageio/zoo/<id>/`, imported model files under
   `models/imported/`. Job ids (uuid, timestamp) stay the keys of the
   in-memory maps and socket rooms; `lineage.processId` keeps the job id;
   the label is only the folder name. `WorkspaceManager.allocateRun`
   allocates the label and creates the folders; a label whose folder
   already exists on disk (a restored backup without counters) is skipped.
2. **Files inside a run folder carry their display name** on disk
   (`trypB_seg.tif`, `trypB_seg_info.json`), sanitised by
   `toPhysicalName` and made unique per folder by `uniqueFileName`.
   Renaming still changes only the display name (ADR-012). Scripts that
   pick their own file names (inference, DL denoising, packaging) hand
   the file over with `adoptName`, and the tracker renames it before the
   row is written. Exceptions with conventional names: the training
   artifacts `best_model.pth`, `config.json`, `results.json` (read by
   fixed name in five places and the trainer) and the mesh files
   `mesh.obj`, `mesh.mtl`, `mesh.stl`, `mesh_data.json`, `metadata.json`
   (the .obj references the .mtl by name).
3. **Uploads keep their original file name** (`uploads/raw/trypB.tif`),
   `_2`, `_3` on collision; the display name stays the original name.
   The user-typed output name of preprocess, stitching and cleanup is the
   display name of the output (default `<source>_<token>`), and the file
   carries it.
4. **No physical migration of old workspaces.** `normalizeManifest`
   tolerates any path; counters are bootstrapped from the highest label
   in use; old uuid folders stay where they are. The three path-hashed
   caches became id-keyed (legacy keys are still cleaned up), so a
   cleared workspace that restarts its counters cannot serve stale
   slices.
5. **Annotations: one run folder per annotation, category results.**
   Save Progress creates `results/annotation/annot<n>/` with the label
   TIFF and the classes sidecar (tags `annotation, wip`; sidecar
   `annotation, info` with `parentId` and lineage); Create on that
   annotation promotes it in place (tags `annotation, data`, lineage
   status `complete`, sidecar status), so no orphaned copies remain. A
   finished annotation is never overwritten; Create or Save on it starts
   a new annotation. Uploaded masks stay in `uploads/annotations/`.
   Consumers select label masks by tags through
   `FileSelector.isLabelMask` (annotation or segmentation data, never
   `wip`/`info`), whatever the category. The display name comes from the
   source's display name on the server; the voxel size is inherited.
6. **Lineage and sidecar rules.** Models never appear in
   `lineage.inputs`: exports record the sample as input and the `.pth` as
   `modelFileId`; fine-tuning records the pairs as inputs and the parent
   (`.pth`, zip or card) as `modelFileId`; the file info modal shows a
   "Model" line. Zoo cards carry `bioimageio-import` lineage (label
   "bioimage.io Model", `processId` = zoo id) and the type tag `card`.
   Every module-written info/config/recipe/metadata file has `parentId`
   to its main output and deletes with it (training config and results
   hang off the model, or off the fine-tuned package of a package run,
   with the package's naming root). Export and the Step 2 checkpoint
   selector are gated by tags (no `denoising` models); the U-Net import
   selectors accept `unspecified` uploads and never denoising files.
   Results tagged `raw` (preprocess, stitching) and denoised stacks count
   as image data for annotation, training and inference
   (`FileSelector.isImageStack`). Migration rules on read: created
   annotations to results, pre-1.8 model uploads to models, model ids
   from inputs to `modelFileId`, cards get lineage and the `card` tag,
   sidecars are linked to the main output of the same folder and run.
7. **Upload without a kind chooser.** Every upload lands in the scratch
   folder; `uploadKind.detectKind` decides: a zip with `metadata.json` at
   the root is a workspace backup (parked in the session as
   `pendingRestore`, the client shows the restore confirmation and calls
   `/restore` with `pendingRestoreId`), a zip with `rdf.yaml` or
   `bioimageio.yaml` is a package, `.pth`/`.pt` are weights, `.json` a
   config, and a TIFF/MRC is probed by `probe_upload.py`: integer data
   with at most 100 distinct values on a slice sample is an annotation,
   everything else raw image data. A module selector passes its expected
   kind as a hint that wins for images. The per-kind size limits apply
   after detection (200 MB images, 2 GB models, 5 GB backups). `PATCH
   /api/workspace/file/:id/kind` and the context-menu entries "Mark as
   annotation" / "Mark as raw image" correct a wrong guess. The legacy
   routes (`/upload-data`, `/upload-inference`, `/import-pretrained-model`)
   place their files the same way, which also restores the
   `name === basename(path)` invariant for imported models.
8. **One dialog helper.** `core/components/Dialog.js` (`Dialog.confirm`,
   `Dialog.prompt`, `Dialog.error`, promise-based, on the existing
   `.workspace-confirm-*` styles) replaces the nine native dialogs; the
   rename dialog validates the extension inline; delete confirmations
   list the companion files that go with the file.
9. **Safety net.** `scripts/check-manifest.js` validates a workspace
   against the model (name/path invariant, files on disk, categories,
   method and type tags, unique display names, lineage inputs data-only,
   parentId on module-written sidecars, counters covering every label,
   untracked files) and `scripts/harness-producers.js` boots the app
   in-process with a fake session and runs every producer once (uploads
   with detection, training, inference, fine-tuning, export, package
   inference, filter and DL denoising, preprocess, stitching, cleanup,
   mesh, annotation save/promote, file operations, backup/restore and a
   legacy-manifest restore), checking the manifest after each step.

## Implementation

- `WorkspaceManager.js`: `MANIFEST_VERSION` 1.3.0, `counters`,
  `normalizeManifest130`, `allocateRun`, `physicalNameFor`,
  `adoptDisplayName`, id-keyed cache cleanup, `imported_models` legacy
  category, `card` type tag.
- `src/helpers/namingHelpers.js`: `toPhysicalName`, `uniqueFileName`,
  tokens for the remaining process types. `src/helpers/uploadKind.js`
  (new), `python/probe_upload.py` (new).
- `src/middleware/upload.middleware.js`: scratch-folder storage, one
  extension filter, transport limit = backup limit.
- Producers: `ml.routes` (train/seg folders, legacy uploads placed,
  `rawFileId`/`parentFileId` on the training record), `app.js`
  (display names from the raw's display name, parentId on config and
  results, modelFileId), `FileService` (`adoptName`, `parentId`,
  `voxelSize`, sidecar linking in `trackInferenceResults`),
  `denoising.routes` + `DenoisingService` + `python/denoising/output.py`
  (`results_dir`/`models_dir`, adopt names, sidecars, launch config
  removed, tracked ids for downloads), `preprocess.routes`,
  `stitching.routes`, `segcleanup.routes`, `mesh.routes` (tracked ids in
  the completion payload), `BioimageioService` (zoo cards, export run
  folder, lineage), `bioimageio.routes` (tag gating, fine-tune training
  id, default name), `files.routes` (physical names, `PATCH kind`),
  `annotation.routes` (rewritten save/create), `workspace.routes`
  (unified upload, pending restore, lineage `modelFile`).
- Frontend: `FileBrowser` (upload panel without chooser, detection
  notices, pending restore, Mark as kind, display-name sort, model line),
  `FileSelector` (`isLabelMask`, `isImageStack`, kind hint), `Dialog.js`
  (new), `WorkspaceAPI`, module selectors (segmentation, mesh, cleanup,
  annotation, stitching, preprocess, filter and DL denoising), default
  output names from display names, mesh hand-off by tracked id, DL
  downloads by tracked id.
- Removed: `src/config/multer.config.js`, `TrainingService.trackTrainingOutputs`,
  dead lineage labels, `DIRECTORIES.unfinishedAnnotations`.
- Help: file-browser articles rewritten (categories, tree, upload,
  search, file operations, backup, module); "Model Files" wording fixed
  in the segmentation articles.

## Verification

- `probe_upload.py` classifies the sample annotation (3 values) and the
  sample raw stack (119 grey levels on a 256 px crop) correctly; the
  latter shows why the override exists.
- `node scripts/check-manifest.js` on Lucas's live workspace before the
  change reported exactly the audited gaps (21 errors); after the
  migration rules it reports none.
- `node scripts/harness-producers.js --legacy <old workspace>` (2026-09-30):
  every producer passed (uploads with detection and the kind override,
  training, inference, fine-tuning, export, package inference, filter
  and DL denoising, preprocess with typed and default names, stitching,
  cleanup, mesh, annotation save/rewrite/promote/new, duplicate, convert,
  split, rename, delete cascade, batch delete, backup round trip with
  counters preserved, restore of a 1.2.0 workspace migrated to 1.3.0 and
  a first run labelled `filter1`), with zero checker errors after each
  step once the migration rules for copied uploads and old class sidecars
  were corrected.

## Consequences

- A backup of a workspace now reads like the tree: `results/segmentation/seg3/trypB_seg.tif`.
- The manifest is the only thing a consumer needs; folders are cosmetic
  and stable, counters make them predictable.
- Deleting a main output takes its companions with it; the info modal
  names the model that produced a file.
- Old backups keep working through the load-time migration; their old
  folders remain until the files are deleted.
- Deferred: renaming physical files when a display name changes, a
  category-grouped tree view, path handling when `DATA_DIR` differs from
  the project root, containment checks on routes that accept absolute
  paths.
