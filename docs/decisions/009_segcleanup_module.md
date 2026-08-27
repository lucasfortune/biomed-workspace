# ADR-009: Segmentation Cleanup & Quantification Module

**Status:** Accepted, MVP implemented + API-verified (2026-08-27)
**Context:** Module roadmap (see ADR-008 header). Lucas: "if the
segmentation is not great, the user has no way to fix this on-platform
right now" - and he explicitly asked for a MANUAL editing option, not
only automated ops.

## Decision

One module (`segcleanup`) with three workflows, chosen in step 1
(the stitching module's workflow-radio pattern). Steps: **Select ->
Edit -> Result & Report**; the quantify-only workflow skips Edit.

### Workflow A: Automated cleanup

Operation pipeline, fixed order, each optional:

1. **Merge / relabel classes** - per-class action: keep, merge into
   another class, or remove (-> background 0)
2. **Fill holes** - off / 2D per-slice / 3D; per class, fills only
   pixels that are currently background (never overwrites other classes)
3. **Remove small components** - 3D connected components per class
   (connectivity 1), components below a voxel threshold -> 0
4. **Smooth boundaries** - per-class majority (median) filter with a
   radius, 2D per slice (chosen over morphological open+close, which
   misses single-pixel spikes attached to flat edges); pixels removed
   by smoothing become 0, pixels gained only claim background; classes
   processed in ascending label order (deterministic)

**Preview** on the current slice: server renders a colored PNG of the
ops applied in 2D approximation (3D fill/components approximated
per-slice - labeled as approximate in the UI), optional grayscale
underlay found via lineage. Debounced like the preprocess module.

Apply runs the full volume **in memory** (precedent: mesh generation
already loads full segmentations) and finishes with quantification, so
step 3 shows metrics immediately.

### Workflow B: Manual touch-up

Reuses the annotation module's painting stack **unchanged**:
`AnnotationCanvas` (layered viewport, zoom/pan, full-res slice loading
via `/api/annotation/raw-slice` - works for any workspace file) +
`BrushEngine` (brush/eraser, per-slice Uint8Array class maps,
`setAnnotationData` for loading existing labels) + `HistoryManager`
(undo/redo). New in this module: a **flood-fill tool** (module-side:
BrushEngine listeners detached while fill is active; fill replaces the
clicked connected region with the active class, pushes history).

- Classes are seeded from the detected label values (class id = label
  value) with a distinct generated palette.
- Underlay = the grayscale origin of the segmentation, found via the
  lineage chain; falls back to the segmentation itself.
- Label slices load lazily as L-mode PNGs (lossless raw values) via
  `/api/segcleanup/label-slice`; the client decodes the R channel.
- Save sends only EDITED slices, using the annotation system's existing
  encodings (sparse 5-byte x/y/class tuples, dense base64 fallback);
  the server streams the original TIFF and swaps in edited slices.

### Workflow C: Quantify only

Runs quantification on the selected segmentation without changes.

### Quantification

Per class: voxel count, physical volume (voxelSize from file metadata,
ADR-008; voxels only when unset), 3D component count, component size
min/median/mean/max, surface area (`marching_cubes` with spacing +
`mesh_surface_area`). Written to the job dir as `metrics.json`,
`report.csv` (per-class summary) and `objects.csv` (per-object rows).
**"Save report"** registers the CSVs in the file browser (tags
`['segcleanup', 'report']`) so they can be downloaded.

### Outputs

Cleaned / touched-up stacks: `results/segcleanup/<id>/`, tags
`['segcleanup', 'segmentation', 'data']` (accepted by the mesh and
stitching pickers), lineage `processType: 'segcleanup'`, voxelSize
inherited from the input.

## Architecture

- **Python** `python/segcleanup.py` - modes `info` (classes + counts),
  `preview` (single-slice colored PNG), `apply` (pipeline + quantify),
  `quantify`, `label-slice` (L-mode PNG), `edit-save` (original +
  edited-slice config -> new TIFF). stdout protocol
  `SEGCLEANUP_INFO/PROGRESS/RESULT/ERROR:`. scipy.ndimage +
  skimage only (already dependencies).
- **Node** `src/routes/segcleanup.routes.js` at `/api/segcleanup`:
  GET `/info`, POST `/preview` (PNG), GET `/label-slice` (PNG,
  cacheable), POST `/apply` (async, room `segcleanup-<id>`), POST
  `/quantify` (async, same room scheme), POST `/save-edits` (async;
  edits JSON written to disk, not passed on argv), POST `/report`
  (register CSVs). Socket handlers `join-/leave-segcleanup`.
- **Frontend** `public/workspace/js/modules/segcleanup/` - FileSelector
  (uploads with `annotation` tag + results with segmentation data) in
  step 1 with the workflow radio; wide Edit step in both editing
  workflows (viewer left, 290px toolbar right); annotation utils
  imported directly from `modules/annotation/utils/`.

## Verification (2026-08-27, headless)

- Synthetic 3-class volume with a 3D hole, a 1-voxel speck, a merge
  candidate, an edge spike and a notch: merge + 3D fill + remove-small
  produce the exact expected volume; majority smoothing removes the
  spike and fills the notch with the interior intact (this test is what
  motivated the median-filter choice - open+close left the spike).
- Quantification matches hand-computed voxel counts, physical volumes
  (0.5x0.5x2.0 um voxels) and component counts; report.csv/objects.csv
  written and well-formed.
- edit-save round trip with one sparse and one dense edited slice:
  edited slices exact, untouched slices bit-identical.
- Full API round trip through the dev server (upload as annotation ->
  info -> preview PNG -> label-slice PNG lossless -> apply with tracked
  output/tags/lineage -> quantify -> save-edits -> report registration).
- Browser E2E: pending (Lucas). Note: express JSON limit is 100 MB -
  a save with many fully-dense large slices could exceed it; sparse
  encoding covers typical edits.

## Follow-ups

- Help articles (with preprocess + stitching backlog).
- Possible later: size-distribution histogram chart in step 3;
  2D-connectivity option for remove-small; interpolation-aware
  smoothing for anisotropic stacks.
