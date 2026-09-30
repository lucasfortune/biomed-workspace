# ADR-016: Export of Workspace U-Nets as bioimage.io Packages

**Release:** v1.9.0
**Status:** Accepted, implemented (2026-09-30); browser test by Lucas pending
**Context:** ADR-015 lets the Segmentation module run bioimage.io models,
including uploaded packages, with tiled inference. Models trained in the
workspace were still locked into the workspace's own `.pth` + config
format: they could not be shared with other tools or the model zoo, and
their inference path has no tiling (whole slices, sizes restricted to
multiples of 2^layers). This is phase 2 of the plan in
`docs/vision/bioimageio_plan.md`: one action turns a workspace checkpoint
into a bioimage.io package. Phase 3 (fine-tuning) is a separate decision.

## Decisions

1. **A file action, not a module step.** Export lives in the file
   browser's context menu of `.pth` model files ("Export as bioimage.io
   package..."), next to the format conversions of image and mesh files.
   The dialog asks for a package name, a license and a sample image, and
   shows the export stages. Lucas chose this placement over a Step 4 card:
   a model file action belongs with the model file.
2. **Package layout (format 0.5).** `rdf.yaml`, `unet.py` (the
   architecture, imports only torch), `weights.pt` (plain state dict),
   `weights_torchscript.pt` (traced, `parent: pytorch_state_dict`),
   `test_input.npy` / `test_output.npy` (a centre crop of the sample image
   and the model's output), `cover.png` (input beside the class map) and a
   generated `README.md`.
3. **Tensors.** Input `raw`: batch, channel `raw`, y, x with
   `ParameterizedSize(min=M, step=2^L)` where L is the number of levels
   and M the smallest multiple of 2^L that is at least 64. Preprocessing
   `ensure_dtype float32` then `scale_range` over y,x with percentiles 0
   and 100. Output `probabilities`: batch, channel (`background`,
   `class_1`, ...), y, x as `SizeReference` to `raw` with a halo,
   postprocessing `softmax` over the channel axis. Because the output
   declares softmax, the phase-1 conversion default is argmax, which
   reproduces the workspace's own class map.
4. **Halo = 4 * 2^L.** Measured on the exported test model (L = 2, halo
   16) against a whole-image prediction of a 512 px EM mosaic with 128 px
   and 192 px tiles: mean probability difference in a 7 px band around
   the seams 0.0002 (halo 8: 0.005, halo 0: 0.07), class disagreement
   2e-5. Halo 32 gains nothing worth doubling the overlap. The rule is a
   constant in the exporter, not a per-model setting.
5. **Normalisation.** The workspace divides each slice by its maximum;
   the spec has no such step. `scale_range` 0 to 100 percent computes
   `(x - min) / (max - min)`, identical when the slice minimum is 0 and
   off by a constant otherwise. On the bundled test stack (minimum 0) the
   package run and `run_inference.py` agree on 99.96 % of the pixels (the
   rest is tiling and tracing). The package README states the deviation.
   Changing the workspace's own normalisation was rejected: existing
   models would no longer match their training.
6. **TorchScript by tracing.** `torch.jit.script` fails on Python 3.14
   with torch 2.9.1 (`'UNet' object has no attribute '__annotations__'`).
   Tracing works and generalises to any size the package declares, since
   the reflect-padding branch of the decoder is only taken for sizes that
   are not multiples of 2^L, which the parametrised axes exclude. The
   exporter checks the traced module against eager mode on a second size
   before packaging.
7. **Self-test before tracking.** The exporter runs
   `bioimageio.core.test_model` on the written zip for both weight
   formats. A failing test deletes the zip and reports the summary; only
   a passing package is added to the workspace.
8. **One architecture file.** `python/unet_arch.py` now holds the
   workspace U-Net; `train_model.py` and `run_inference.py` import it
   (state-dict keys unchanged, verified against an existing checkpoint)
   and the exporter copies it into the package. The previous two copies
   of the class were identical apart from comments.
9. **Safe checkpoint loading.** The exporter loads with
   `weights_only=True` and allows exactly the two extra globals workspace
   checkpoints contain (a numpy scalar for the validation Dice and
   `TorchVersion`). Other `.pth` files are refused; no fallback to
   unpickling arbitrary objects. The route therefore needs `requireAuth`,
   not `requireApproved`.
10. **Storage and lineage.** The zip lands in
    `models/bioimageio/exports/<slug>_<timestamp>/<slug>.zip`, tracked in
    `models` with tags `bioimageio`, `weights`, `segmentation`, display
    name `<package name>.zip`, lineage `bioimageio-export` with inputs
    [model file, sample image] and the export id as process id. It is
    listed by the Step 1 package selector at once, which gives the model
    tiled inference and lifts the 2^layers size rule.
11. **Metadata.** Name (default `<model display name> segmentation
    U-Net`), license from a fixed list (CC-BY-4.0 default, MIT,
    BSD-3-Clause, CC0-1.0), author = the account's full name, tags
    `segmentation, unet, 2d, electron-microscopy, biomed-workspace`,
    `config.biomed_workspace` with training id, model and training config,
    validation Dice and workspace version. No zoo id (assigned on upload
    to the zoo) and no citation.
12. **Polled job.** `POST /api/bioimageio/export` returns an export id;
    `GET /api/bioimageio/export/:id` reports the stage (loading, tracing,
    packaging, testing), the result or the error. Tracing plus two
    self-tests take about six seconds for a small model on this laptop,
    but a synchronous request would sit inside a proxy timeout on a
    slower server.

## Implementation

- `python/unet_arch.py` (new, canonical U-Net); `python/train_model.py`,
  `python/run_inference.py` import it.
- `python/export_bioimageio.py` (new): `--model --sample --output_dir
  --name --license --author --meta --sample_name`; prints
  `BIOIMAGEIO_PROGRESS:{stage}` and `BIOIMAGEIO_RESULT:{zip_path, name,
  slug, size, model_config, class_names, halo, min_size, step, tests,
  ...}` or `BIOIMAGEIO_ERROR:{message}`.
- `src/services/BioimageioService.js`: `startExport(job)`,
  `exportStatus(id, sessionId)`, `pruneExports()`, `EXPORT_LICENSES`.
- `src/routes/bioimageio.routes.js`: `GET /export-options/:fileId`,
  `POST /export`, `GET /export/:exportId` (path confinement, `.pth` and
  TIFF checks, license list).
- `src/helpers/lineageHelpers.js`: label `bioimage.io Export`;
  `src/config/constants.js`: `PYTHON_SCRIPTS.exportBioimageio`.
- `public/workspace/js/components/FileBrowser.js`: context-menu entry for
  `.pth` files, `showBioimageioExportDialog`, `pollBioimageioExport`;
  styles in `workspace.css` (`.bio-export-*`).
- Help: new `file-browser/bioimageio-export.md`; `file-operations.md`
  and `segmentation/step1-bioimageio-package.md` updated. 112 articles.

## Verification

- Exporter on the checkpoint of a workspace training run (64 features,
  2 levels, 3 classes): both self-tests pass; the zip holds the eight
  files above; the phase-1 `describe` reports 2D, torchscript, halo 16,
  channel names, default conversion argmax.
- Class-map agreement with `run_inference.py` on the 100-slice test
  stack: 99.96 % of pixels (IoU 0.999 for background and class 1).
- Halo measurement as in decision 4.
- A 203 x 157 stack (not a multiple of 4, smaller than the test crop)
  runs through the package path and returns its own shape.
- Route harness (mocked workspace, real Python): export options prefer
  the training raw image from the model's lineage; wrong file type,
  unknown license and missing sample are refused; another session cannot
  read the job; the job passes through starting, tracing, packaging,
  testing; the zip is tracked with the expected tags and lineage and the
  build directory is removed; the exported zip is selectable through
  `/select` as an upload source; a `.pth` that is not a checkpoint fails
  with a clear message and leaves no directory behind.

## Consequences

- A model exported and re-selected as a package runs tiled with a halo
  and without the 2^layers restriction, at the cost of the min-max
  normalisation difference described in decision 5.
- The package README and `config.biomed_workspace` make the export
  self-describing for the zoo review; uploading to the zoo stays a manual
  step on bioimage.io.
- Deferred: fine-tuning a package on workspace annotations (phase 3),
  exporting from the Segmentation module itself, ONNX weights.
