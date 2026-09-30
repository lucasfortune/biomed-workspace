# ADR-017: Training from a Starting Point (Workspace Checkpoints and bioimage.io Models)

**Release:** v1.10.0
**Status:** Accepted, implemented and browser-tested by Lucas (2026-09-30)
**Context:** ADR-015 runs bioimage.io models, ADR-016 exports workspace
U-Nets as packages. Every training run still started from random weights:
the correct-and-retrain loop (ADR-014) rebuilt a model from scratch after
each correction, and a zoo model that almost fits a dataset could only be
run, not adapted. This is phase 3 of `docs/vision/bioimageio_plan.md`
(plan: `docs/vision/bioimageio_plan_phase3.md`): a run may start from an
existing model. Lucas took all six recommendations (D1 to D6).

## Decisions

1. **The starting point is a Step 2 setting.** The Train workflow keeps
   its pairs in Step 1. Step 2 gains a "Starting point" group with three
   choices: a new model, a workspace checkpoint (`.pth` selector), or a
   bioimage.io model (package selector for zips in the workspace, plus
   the zoo list filtered to fine-tunable models). The pairs are validated
   before the choice, so the class check runs at selection time and the
   form locks what the parent fixes. A fourth Step 1 workflow was
   rejected: it would pick the model before the data it must match.
2. **Which models qualify (rule F2).** 2D, one input channel,
   `pytorch_state_dict` weights whose architecture imports are installed,
   output space axes equal to the input, and a head of one of three
   kinds: `softmax` over C channels, one channel with `sigmoid` declared,
   or one channel without a declared activation whose test output lies
   in 0..1 (the network applies the sigmoid itself). Foreground-plus-
   boundary models, 3D models and torchscript-only weights are refused
   with a sentence that names the reason. The zoo list carries a
   `finetunable` flag and the class count (`finetuneClasses`) derived
   from the manifest (format 0.4 reference shapes included), and Step 2
   lists only models whose class count matches the validated pairs; the
   definitive check is the Python `describe` at selection
   (`summary.finetune`). At the time of writing the zoo holds 32
   fine-tunable 2D models, all single-channel (two classes).
3. **Classes map to channels by index (rule F3).** A softmax head needs
   exactly C annotation classes (background included, class k = channel
   k); a single sigmoid channel needs two classes. Workspace checkpoints
   follow the same rule. A mismatch is refused with both numbers.
   Re-initialising the output layer was rejected: architecture specific.
4. **Preprocessing follows the parent (rule F4).** A package's own
   preprocessing (applied through `bioimageio.core`'s processing ops on
   whole slices, exactly as inference does) runs before the slices are
   cut into patches, for training and validation alike, so the weights
   stay consistent with the description shipped with them. Checkpoints
   keep the workspace's slice / max.
5. **Loss and metric per head (rule F5).** Cross-entropy on logits for
   softmax; binary cross-entropy with logits for a declared sigmoid;
   binary cross-entropy on clamped probabilities for a probability
   output. Validation Dice by argmax or by a 0.5 threshold, foreground
   classes only; best epoch by validation Dice, as before.
6. **Output form = parent form (rule F6).** A checkpoint start writes
   `best_model.pth`, `config.json` and `results.json` as any run (with
   `fine_tuned_from` recorded). A bioimage.io start writes a fine-tuned
   package: the parent description with new `weights.pt`, test tensors
   regenerated the way the self-test reproduces them, torchscript
   re-traced when the parent had it and the trace matches eager mode
   (dropped with a note otherwise), name `<parent> fine-tuned` (64 chars),
   no id or version, `parent = LinkedModel` for zoo parents, a README
   that states parent, data, epochs and Dice and appends the parent's
   documentation, `config.biomed_workspace.fine_tuned_from`. The package
   is self-tested before it is tracked; a failing test fails the run.
7. **Test output the way the self-test makes it.** `test_model` predicts
   the test input with `skip_input_padding=True, skip_output_cropping=True`.
   A test output made with the default call (halo padding and cropping)
   differs at the borders by up to 0.51 for a model with a halo and fails
   the self-test; the packager uses the same call as the test.
8. **Tracking and lineage (rule F7).** Outputs land in
   `models/segmentation/<trainingId>/`. Lineage processType
   `segmentation-finetune` (label "Fine-tuning") with inputs = every raw
   and annotation file of the pairs plus the parent model file (the
   `.pth`, the zip, or the zoo model card written as in ADR-015).
   Display names use the `ft` token: `<raw>_ft_model.pth`,
   `<parent>_ft.zip`. The zip is tracked in `models` with tags
   `bioimageio`, `weights`, `segmentation`.
9. **Step 4 after a package fine-tune (rule F8).** The training record
   carries `outputPackage` once the script reports it; on completion the
   frontend selects that zip through the existing
   `POST /api/bioimageio/select`, so Step 4 shows the conversion controls
   and runs tiled with lineage to the new package. No second inference
   path.
10. **Defaults (rule F10).** Choosing a starting point sets learning rate
    1e-4 and 30 epochs unless the user edited those fields; "new model"
    restores 1e-3 and 100. No layer freezing.
11. **Constraints in the form.** A checkpoint locks features and layers
    to its values; a package disables the architecture group; the patch
    size list only offers sizes the parent's input rule accepts (fixed
    size, or min + n * step). The server enforces the same in
    `/configure-training` and again in the trainer.
12. **Progress.** The trainer emits `PROGRESS:{"type":"stage"}` lines
    (`loading`, `packaging`, `testing`) that Step 3 shows in the status
    line, and a `{"type":"output"}` line with the package once written.
13. **One zoo list component.** The Step 1 zoo picker was extracted into
    `ZooModelList` (search, rows, selection, optional show-all and
    filter) and is used by Step 1 and Step 2.

## Implementation

- `python/bioimageio_utils.py`: `finetune_info(descr)`,
  `allowed_patch_sizes`, `preprocessing_callable(descr)`,
  `build_finetuned_package(parent, state_dict, out_dir, meta)`,
  `describe` now returns `summary.finetune`, CLI `describe-checkpoint`.
- `python/train_model.py`: `--init_from <pth>`, `--bioimageio <zip|id>`,
  `--meta`; `Head` (softmax / sigmoid_logits / sigmoid_probs),
  `resolve_start_model`, `Imagedataset(normalise=False)` for preprocessed
  slices, `prepare_pairs(preprocess=)`, stage and output progress lines,
  packaging after training for bioimage.io parents.
- `src/routes/ml.routes.js`: `POST /api/segmentation/start-model`;
  `/configure-training` patch-size and architecture enforcement;
  `/start-training` passes the flags, writes `training_meta.json`,
  records `startModel` and the parent in `inputFileIds`; `/upload-data`
  clears the choice.
- `src/helpers/pythonRunner.js`: extra spawn args, `stage` and `output`
  lines; `src/app.js`: bioimage.io service created before the ML routes,
  `onComplete` tracks the package and uses the fine-tune lineage and
  names; `src/services/BioimageioService.js`: `finetunable`,
  `describeCheckpoint`, `runUtils`; `TrainingService` cancel cleanup
  removes packages; `lineageHelpers` label; `namingHelpers` token.
- Frontend: `handlers/StartModelHandler.js` (new), `handlers/ZooModelList.js`
  (new), `BioimageioHandler` uses it, Step 2 markup in `Templates.js`,
  `TrainingHandler` stage text and `adoptOutputPackage`, `StateHandler`
  persists `startModel`, `SegmentationModule` patch-size rule and reset,
  CSS.
- Help: new `segmentation/config-starting-point.md`; updated `step2.md`,
  `step3.md`, `step1-workflow-choice.md`, `step1-bioimageio.md`,
  `step1-bioimageio-package.md`, `_module.md`,
  `file-browser/bioimageio-export.md`. 113 articles.

## Verification

- Library facts (scratch scripts): the package module trains (forward and
  backward) for the workspace UNet and the BiaPy `U_Net` and
  `Attention_U_Net`; six steps at lr 1e-4 lower the loss monotonically;
  one step at batch 8, 256 px, takes 2.9 s (own) and 0.8 s (BiaPy) on
  the laptop CPU; the library's preprocessing callables reproduce the
  pipeline's preprocessing exactly.
- `train_model.py` on the trypB pair: from scratch (unchanged), from the
  on-disk checkpoint (features and layers taken from it), from the
  exported package (softmax, package self-test passes, torchscript
  re-traced), from `territorial-cricket` on a binarised annotation
  (sigmoid logits, self-test passes, parent link kept). Refused with a
  clear message: three classes on a one-channel model, a boundary model
  (`educated-water-buffalo`), a patch size the model does not accept,
  two classes on a three-class checkpoint.
- Route harness (mocked workspace, real Python): see the run log in the
  session; the checks cover refusals (wrong file type, class mismatch,
  boundary model), acceptance with locked architecture and patch sizes,
  the three run kinds end to end with stage lines, `outputPackage` on
  the status, tracking with tags and `segmentation-finetune` lineage to
  pairs and parent (zoo parent via its model card), the fine-tuned zip
  describing as fine-tunable again, an unchanged scratch run, and cancel
  cleanup of a package run.
- Server boots; the new route answers 401 unauthenticated; help
  validation passes; site build green.
- Lucas's first browser round found the Step 2 file selectors empty (a
  per-file predicate passed where the selector expects a list filter);
  fixed, and the zoo list now prefilters by the pairs' class count.

## Consequences

- The correction loop can continue a model instead of retraining it, and
  a zoo model can be adapted to a dataset and shared again as a package
  with a parent link.
- A fine-tuned package inherits its parent's preprocessing and axes;
  the workspace's own min-max versus slice-maximum note (ADR-016) applies
  unchanged to exported parents.
- Deferred: boundary-style models (need a boundary target), 3D models,
  layer freezing, ignore-index training, uploading to the zoo.
