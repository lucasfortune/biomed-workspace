# ADR-015: bioimage.io Model Import and Tiled Inference

**Release:** v1.8.0
**Status:** Accepted, implemented and browser-tested by Lucas (2026-09-30)
**Context:** The Segmentation module could only run models trained in the
workspace (or their exported `.pth` + config). The bioimage.io model zoo
publishes reviewed models for common EM structures (mitochondria, membranes,
nuclei) with machine-readable descriptions of inputs, outputs and
preprocessing. Running them gives users a first segmentation without
training, and a prediction to correct and retrain on (ADR-014). The
library `bioimageio.core` also provides tiled inference with halos, which
the workspace U-Net path lacks. Plan: `docs/vision/bioimageio_plan.md`;
this is phase 1 (import and run). Export (phase 2) and fine-tuning
(phase 3) are separate decisions.

## Decisions

1. **A zoo result is a segmentation result (R1).** The new script writes
   a uint8 class map and a metadata JSON and prints the same
   `FINAL_RESULT` as `run_inference.py`. Tracking, lineage, Step 4
   buttons, Correct in Annotation, Cleanup and training masks are
   unchanged.
2. **Conversion to a class map (R2).** Channel names in zoo descriptions
   are generic, so the rule is user-chosen: "one class per channel"
   (threshold each channel, channel k becomes class k+1, later channels
   override) or "argmax" (class id = channel index, channel 0 is
   background). Default: argmax when the model declares `softmax`,
   otherwise one class per channel; single-channel models threshold.
   The rule, threshold and class table are recorded in the metadata
   JSON. Probabilities are not saved.
3. **Tiling (R3).** Parametrised models tile with a block edge near 512 px
   (`ns` from min and step), never larger than the image; fixed-size
   models tile at their fixed size. Format 0.4 descriptions are loaded
   with `format_version="latest"` (the library cannot tile 0.4). Fixed
   output space axes are patched to a `SizeReference` on the input,
   because the library otherwise returns only the first block (verified
   on the BiaPy family). No tiling control in the UI.
4. **2D and 3D models (R4).** 2D models run slice by slice (progress per
   slice); 3D models take the whole stack as one sample (progress per
   block, `unit: "blocks"`). 3D runs above 1.5 G voxels are refused.
5. **Weights (R5).** `torchscript` preferred, else `pytorch_state_dict`;
   models with neither are not listed. ONNX/TensorFlow/Keras are out of
   scope (extra runtimes). A `pytorch_state_dict` architecture file is
   read at selection and its top-level imports checked against the
   server's Python; missing packages refuse the model with their names
   (found by Lucas with the Empanada MitoNet model, which imports `cv2`,
   `empanada` and `yaml`). The library would otherwise fail after the
   weights download with a bare "Failed to import infer_2d.py". The same
   check runs at list time for every state-dict-only zoo model
   (`check-imports`, results cached in `architecture_checks.json` in the
   shared cache), and models with missing packages are never listed; the
   list reports how many were left out.
6. **Two sources (R6).** Zoo models by id, downloaded by the server into
   a shared cache (`DATA_DIR/bioimageio_cache`, `BIOIMAGEIO_CACHE_PATH`
   set once in `server.js`), open to every account because the zoo is
   curated. Uploaded packages (`.zip`) through the file browser's Model
   Files category, approved accounts only (a `pytorch_state_dict`
   package executes its architecture code on the server, the same
   exposure as the existing `.pth` import).
7. **Lineage (R7).** Selecting a zoo model writes
   `models/bioimageio/<id>/model_card.json` (tags `bioimageio` + `info`)
   whose file id becomes `modelFileId` of every result. For an uploaded
   package the zip is the model file.
8. **Zoo list filter (R8).** One hub request (`hypha.aicell.io` children
   of `bioimage.io`, type model) cached for an hour; listed when the
   weights are runnable, there is exactly one single-channel input with
   2 or 3 space axes, and (unless "show all") no tag among denoising,
   restoration, super-resolution, classification, in-silico-labeling.
9. **No U-Net pre-flight for zoo models (R9).** The 2^layers check in
   Step 4 is skipped; the inference stack validator still runs.
10. **Model uploads land in `models`.** `/api/workspace/upload` with
    category `imported_models` now stores files under category `models`
    (`.zip` → `bioimageio` + `weights`, `.pth` → `unspecified` +
    `weights`, `.json` → `unspecified` + `config`); before, they were
    tagged as raw uploads and never appeared in a model selector.

## Implementation

- `python/bioimageio_utils.py`: `load_ready` (latest format, single
  input checks, weight pick, fixed-output patch), `summarise`,
  `choose_ns`, `to_class_map`; CLI `describe --source` printing
  `BIOIMAGEIO_RESULT:`.
- `python/run_bioimageio_inference.py`: `--model --input --output
  --inference_id --conversion --threshold`; `INFERENCE_PROGRESS` with
  `type: init`, `type: download`, then slice or block counts;
  `FINAL_RESULT` as `run_inference.py`; `TQDM_DISABLE` set.
- `requirements.txt`: `bioimageio.core>=0.11.0` (plain, no extras: the
  `[pytorch]` extra pulls keras 3).
- `src/services/BioimageioService.js`: hub list + filter + cache,
  `describe`, `writeModelCard`. `src/routes/bioimageio.routes.js`:
  `GET /api/bioimageio/models[?all=1]`, `GET/POST/DELETE
  /api/bioimageio/select[ed]`. `src/routes/ml.routes.js`:
  `/run-inference` branch on `req.session.bioimageioModel` with
  `conversion`/`threshold`, output dir `results/segmentation/bioimageio_<ts>`;
  `/upload-data` and `/start-training` clear the selection.
  `src/helpers/pythonRunner.js`: `script`/`extraArgs` options,
  `inference.phase`/`progressUnit`. `src/config/constants.js`:
  `DATA_PATHS.bioimageioCache`, script paths.
- `src/app.js`: Content Security Policy `img-src` allows
  `https://hypha.aicell.io` for the zoo covers.
- Uploads: `.zip` accepted by the model filters and the file browser;
  `WorkspaceManager` tag inference knows `bioimageio` and `.zip`.
- Segmentation module: `handlers/BioimageioHandler.js` (zoo picker,
  package selector, model card, Step 4 conversion controls), third
  workflow section in `Templates.js`, `workflowMode: 'bioimageio'`,
  `hasImportedModel` reused to skip steps 2 and 3, state persistence,
  progress wording for downloads and blocks. `InferenceHandler` now
  derives "imported model" from `module.hasImportedModel` (the old
  `window.importedModelInfo` flag was never set).
- Help: new `step1-bioimageio.md`, `step1-bioimageio-package.md`,
  `step4-output-conversion.md`; updated workflow choice, Step 1, Step 4,
  module overview, model file. 111 articles.

## Verification

- Python: 300x280 synthetic stack through `shivering-raccoon` (2D,
  parametrised, halo 8, two channels), `territorial-cricket` (2D, fixed
  256, one channel, patched) and a 40x120x136 stack through
  `kind-seashell` (3D, eight blocks with progress): outputs match the
  input shape, class ids as expected, metadata records rule and tiling.
  `describe` on a denoiser loads (filtered at list level), on a bad id
  fails with a clear message.
- Tile seams (Lucas saw tile edges on unsuitable test data): on a 1024 px
  mosaic of the bundled EM sample, `shivering-raccoon` tiled at 512 px
  with its declared 8 px halo agrees with the whole-image prediction to
  0.0006 mean absolute probability difference in a 7-row band around the
  seams (0.0016 elsewhere); raising the halo to 32, 64, 96 or 128 px did
  not improve this. Normalisation is computed on the whole slice, not per
  tile (library result identical to manual whole-image normalisation).
  The BiaPy fixed-size model shows no boundary jumps at all. Seams become
  visible only when outputs sit near the threshold everywhere, i.e. on
  data the model cannot segment; 96 px tiles (far below the 512 px the
  workspace uses) do produce real seams, which is why the tile target is
  large. No halo override was added.
- Output conversion controls are greyed out, never hidden, when they do
  not apply (single-channel model, argmax rule), so the block matches the
  guide for every model (Lucas, browser test).
- Route harness (mocked hub from a saved collection, mocked file
  tracking, real Python): 102 models listed (116 with all), zoo select
  writes the card and session, bad id and missing upload refused, a
  220 MB package zip selected as upload, `/run-inference` with the zoo
  model emits `download` then four slice updates, completes, lineage
  carries the card id and the input id, metadata has `argmax` at 0.3,
  `/upload-data` clears the selection.

## Consequences

- First use of a model needs outbound HTTPS from the server to
  `hypha.aicell.io` and the file hosts; downloads are shared per server.
- Zoo results on unlike data can be poor; the help points to the
  correction loop.
- 3D models hold the whole stack as float32 in memory (size guard).
- Deferred: export of workspace U-Nets as packages (would also give them
  tiled inference), fine-tuning, probability outputs, z-chunking.
