# ADR-014: Training Data: Partial Annotations, Multiple Pairs, Correction Loop

**Release:** v1.7.0
**Status:** Accepted, implemented and browser-tested by Lucas (2026-09-30)
**Context:** After ADR-013 the Annotation module produces partially annotated
stacks (interpolation, classifier suggestions) as the normal case, but the
U-Net training took one raw/annotation pair, split it by slice index
(70/15/15) and treated every slice as fully labelled: an unlabelled slice
became a training example saying "all background". Several annotated
stacks could only be combined by stitching. The correct-and-retrain loop
did not exist: an inference result opened in the Annotation module as the
image to paint on, not as labels. Plan: `docs/vision/training_data_plan.md`.

## Decisions

1. **Labelled slice (R1).** A slice takes part in training only if its
   annotation has at least one non-zero pixel. Unlabelled slices are
   skipped per pair. A deliberately all-background slice cannot be told
   apart from an unlabelled one; the help documents this instead of
   detecting it.
2. **Unlabelled pixel on a labelled slice = background (R2).** The
   workspace convention (background is never a label) stands. An
   ignore-index for sparse strokes was rejected: it would need an
   "unlabelled" marker in the annotation format.
3. **Validation split (R3).** User-set fraction (5% to 40%, default 15%),
   applied per pair to that pair's labelled slices as a contiguous block
   at the END of the labelled slices (neighbouring EM slices are near
   duplicates, so an interleaved split would leak). A pair with two or
   more labelled slices contributes at least one validation slice. The
   test split is removed; `results.json` keeps `test_loss`/`test_dice` as
   `null` and `best_val_dice` as the reported number.
4. **Global class map (R4).** `validate_tiff.py --pairs` maps the union of
   label values over all pairs to sequential ids once and rewrites the
   annotation files in place where values change (as the single-pair path
   always did). A class missing from a stack keeps its id; differing
   class sets produce a warning, not an error. This also fixes the
   single-pair case `{0, 2}` that used to crash one-hot encoding.
5. **Pairs may differ in width and height** (patch mode). The configure
   route refuses a patch size larger than the smallest slice over all
   pairs (`min_dimension` from validation).
6. **Lineage.** Training outputs record every raw and annotation file id
   of all pairs as inputs.
7. **Segmentation results are labels in the Annotation module (R7).**
   Inference results and cleanup outputs (`results` + `segmentation` +
   `data`) open in edit mode ("Segmentation results (correct)" group);
   saving creates a new annotation. The source stack is resolved by
   walking the lineage chain until a raw or denoised stack. The
   segmentation module's Step 4 hands a result over via
   `modules.segmentation.correctionFile` ("Correct in Annotation").
8. **Segmentation results as training masks.** The Step 1 annotations
   selector lists segmentation results under Recent Results; they pass
   the same validator.

## Implementation

- `python/train_model.py`: `--pairs <json>` (legacy `--raw_images` /
  `--annotations` still accepted as a one-pair list), `prepare_pairs`,
  `split_labelled_slices`, `apply_label_map`, `PROGRESS:{"type":"data"}`
  with per-pair counts, no test loader.
- `python/validate_tiff.py`: `validate_pairs` (`--pairs <json>`), per-pair
  facts (`labelled_slices`, `labelled_indices`, `slice_dimensions`),
  `class_map`, `num_classes`, `min_dimension`, `warnings`, `totals`.
- `src/routes/ml.routes.js`: `/upload-data` with `skipUpload` takes
  `pairs` (JSON) or the legacy two fields; session stores
  `uploadedFiles.pairs` plus the legacy first-pair keys; paths are
  confined to the workspace; `/configure-training` validates
  `val_fraction` and the patch size against `min_dimension`;
  `/start-training` writes `training_pairs.json` into the model folder,
  passes `pairs_file`, lineage from all pairs.
- `src/helpers/pythonRunner.js`: `validateTrainingPairs`, `--pairs` spawn,
  `training.dataSummary` from the `data` progress line (also returned by
  `/training-status`).
- Segmentation module: pair list with "Add pair" (Step 1), validation
  display per pair, `valFraction` field (Step 2), "Training on X labelled
  slices" line (Step 3), "Correct in Annotation" (Step 4); state persists
  `uploadedFiles.pairs` and `trainingData`.
- Annotation module: `isSegmentationResult`, lineage walk in
  `resolveAnnotationSource`, `consumeCorrectionHandoff`.
- Help: new `step1-training-pairs.md`, `config-validation-split.md`;
  updated Step 1 annotations/raw images, Step 2, 3, 4, module overview,
  annotation source image.

## Verification

- Synthetic pairs (12 slices 96x96 with 8 labelled, 6 slices 128x112 with
  3 labelled and one class missing): validator maps classes globally,
  warns, skips empty slices; training splits 6+2 and 2+1, emits the data
  line, completes; label remap `{0,50,200}` rewrites files; error cases
  (no labelled slices, shape mismatch, one labelled slice) refused.
- Route harness: two pairs validated with ids and cache invalidation,
  path traversal refused, legacy single pair accepted, patch too large
  and bad `val_fraction` refused, training run with lineage to all four
  inputs, `dataSummary` on the session, `training-complete`.

## Consequences

- Partially annotated stacks train correctly; a user must still label
  included slices completely (documented in three help articles).
- Old sessions that stored a single pair keep working (legacy keys).
- The 15% test split no longer consumes labels; there is no held-out
  test number any more.
- Out of scope: ignore-index training, class names carried into the
  model, per-class loss weights, tiled inference (bioimage.io work).
