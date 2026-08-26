# ADR-006: Migrate DL Denoising to Routed autoStructN2V v1.0

**Date:** 2026-08-26
**Status:** Accepted; Phases 1-3 implemented 2026-08-26 (Python adapter
headless-tested on the tryp test stack; local E2E of the webapp pending,
see Phase 4)
**Deciders:** Lucas Fortune
**Tags:** denoising, python, asn2v, migration, breaking-change

---

## Context

### Problem Statement

The DL denoising module embeds autoStructN2V 0.1.0 with the January 2026
"2.5D 2.0.0" update (`docs/autoStructN2V_2.5D/`, put on `sys.path` by
`python/denoising/__init__.py`). That version implements the *two-stage*
method: train Stage 1 N2V, denoise, extract the structural mask from Stage 1's
denoised patches, optionally pause for user approval (`pauseAfterMask`), then
train Stage 2 StructN2V.

The published method (github.com/lucasfortune/asn2v, tag v1.0; the ASN2V
manuscript) replaced this with a *routed single-training* pipeline:

1. Measure the noise autocorrelation on the **raw** stack via automatic
   background selection (`bg_side` is the one required user choice).
2. Take a calibrated routing decision **before any training**
   (directionality gate Dmax >= 0.012): StructN2V with the discovered
   spine mask, or plain N2V (same mechanism, 1x1 kernel).
3. Train exactly one model, predict.

The paper's experiments validated raw-stack extraction over denoised-stack
extraction (E8) and the router at 12/12 on benchmark volumes (E2). The webapp
must move to v1.0 so the public workspace runs the published method.

### Key consequence for UX

In the old flow the user waited through an entire Stage 1 training before
seeing the mask. In v1.0 the mask and the route decision are available in
seconds. The approval step therefore moves to the *front* of the run.

## Decisions

Three forks were decided 2026-08-26:

1. **Approval flow: pre-training pause.** Keep the existing
   pause/approve/regenerate state machine (`paused_at_mask`, socket events,
   resume logic), but the pause now happens seconds after Start Training,
   before any GPU time. "Skip Stage 2" is reframed as "Force plain N2V"
   (override the router).
2. **Legacy models: keep inference support.** Old two-stage checkpoints
   (2D and 2.5D, trained or imported) remain runnable. v1.0's predictor kept
   `mode='2.5d'`, its model factory kept the 3-channel legacy logic, and its
   default `norm_type='batch'` matches old checkpoints. The webapp's
   `run_inference` / `run_sequential_inference` paths are retargeted to v1.0
   imports; `CenterChannelWrapper` stays in the adapter. New *trainings* are
   2D routed only.
3. **Install method: vendor v1.0 in the repo** at
   `python/vendor/autoStructN2V/` (replacing `docs/autoStructN2V_2.5D/`).
   Deploy stays git pull + restart, no pip/network step. A
   `python/vendor/VENDORED_VERSION` file records the source tag. Upgrades are
   a fresh copy from the asn2v repo tag, verified by marker greps (the same
   snapshot-sync discipline as the workstation packages; stale snapshots have
   bitten twice before).

## Target architecture

### Python wrapper modes (autostructn2v_wrapper.py)

| Old mode | New mode | Behavior |
|---|---|---|
| `train` | `train` | Load raw stack, `resolve_route()` (seconds). Method `autostructn2v` always pauses: emit `DENOISING_RESULT stage:'paused'` with mask + route payload, exit 0. Method `n2v`: no pause, train center-mask branch directly to completion. |
| `train_stage2_only` | `continue_training` | The full single training with the approved mask: routed dataloaders, Web trainer subclass (epoch progress), predict full stack, finalize outputs. Accepts `override_branch:'n2v'` to force the center mask (the old skip semantics). |
| `finalize_stage1_only` | (deleted) | Nothing is trained before approval, so there is nothing to finalize on skip. Skip = `continue_training` with `override_branch:'n2v'`. |
| `extract_mask` | `extract_mask` | Re-run `AutoMaskExtractor.route()` on the **raw** input with adjusted extractor params. Still awaited synchronously over HTTP by regenerate-mask. |
| `inference` | `inference` | Unchanged contract. Detects checkpoint vintage from hparams: new checkpoints carry `hparams['n2v'|'structn2v']` (branch recipe), legacy carry `hparams['stage1'|'stage2']`. |
| `inference_sequential` | `inference_sequential` | Legacy imported stage1+stage2 pairs only. Retargeted to v1.0 imports. |

The `python/denoising/` package keeps its structure (utils/emit protocol,
`_dtype_normalize`, dtype round-trip, `WebTrainer` subclass pattern) but
`training.py` and `operations.py` are rewritten around
`resolve_route` / `create_routed_dataloaders` / `AutoStructN2VTrainer` /
`AutoStructN2VPredictor` from v1.0. `models.py` keeps only
`CenterChannelWrapper` (legacy inference); `extract_triplet_patches` is
deleted with the 2.5D training path.

### stdout / Socket.IO protocol

`DENOISING_PROGRESS:` / `DENOISING_RESULT:` / `DENOISING_ERROR:` stay. Node's
dynamic event naming (`denoising-${stage}-progress|complete`) stays. Stage
strings change:

- Single training emits stage **`train`** -> `denoising-train-progress` /
  `denoising-train-complete`. Do NOT name the stage `training`: Node already
  emits a process-exit event called `denoising-training-complete` and the two
  must not collide.
- `paused` result payload (new shape, emitted before any training):
  `maskPath`, `maskArray`, `kernelHeight/Width`, `activePixels`, `pattern`,
  plus route fields: `branch` ('structn2v'|'n2v'), `routeReason`,
  `dmax`, `dmaxThreshold`, `maskRho2`. No `stage1ModelPath` /
  `stage1DenoisedDir` (nothing exists yet); Node's continue gating changes
  accordingly (require `maskPath` only).
- `complete` result `outputFiles` keys change:
  `denoised_stack`, `model`, `routed_mask`, `route_decision`, `config`,
  `results` (replacing `stage1_stack`/`stage2_stack`/`stage1_model`/
  `stage2_model`/`structural_mask`/`mask_info`).

### Node changes (denoising.routes.js, DenoisingService.js)

- `start-training`: build the **routed v1.0 config schema** directly:
  `{input_data, output_dir, workspace_dir, mask:{source:'extractor',
  extractor:{bg_side, ...}}, recipes:{n2v:..., structn2v:...}}`. Presets'
  `stage1`->`recipes.n2v`, `stage2`->`recipes.structn2v` (presets already
  carry the publication values: features 32, N2V2 fixes, zscore,
  overlap_tile_pad 16). Add per-recipe `norm_type` (n2v: 'batch',
  structn2v: 'group' + num_groups 8; this asymmetry is deliberate, see
  PARAMETER_REFERENCE.md in the asn2v repo). Old `mapExtractorConfig` (14
  keys, obsolete algorithm) is replaced by the new extractor param set.
- `continue-training`: gate on `paused_at_mask` + `maskPath` existing
  (drop the `stage1ModelPath` requirement); pass `override_branch` when the
  user forces N2V. `skip-stage2` route is kept as an alias endpoint that sets
  `override_branch:'n2v'` (or renamed; frontend updates either way).
- `regenerate-mask`: input is always the session's raw `input_data`; delete
  the denoised-stack and saved-patches probing.
- `_trackOutputFiles`: re-key to the new `outputFiles` names, same metadata
  categories (denoised stack -> results/['denoising','data']; model/config/
  results.json -> models/...; also track `routed_mask.npy` +
  `route_decision.json` under models/['info','denoising'] so results display
  can show them).
- `run-inference`: keep both paths; `model_config` fallback stays but
  checkpoint hparams remain authoritative (already the adapter's behavior).
- 2.5D validation on `start-training` is removed (training is 2D only);
  `mode` remains accepted on inference for legacy checkpoints.

### Extractor parameters (UI-facing)

The old panel (adaptive_thresholding, base_percentile, percentile_decay,
max_masked_pixels) describes an algorithm that no longer exists. New set:

- **`bg_side`** (required, radio: 'light' for dense EM / 'dark' for
  fluorescence-like / 'off' flat-only) - the one required user input.
- Advanced: **`rho_floor`** (slider 0 to 0.15, default 0.05; effect-size
  floor: drop mask lags with |rho| below it), **`z_thresh`** (default 8,
  certainty threshold for the spine extraction), mask radius cap.
- Everything else ships at package defaults (mask_style='spine' etc.).

### Frontend (DLDenoisingModule)

- Step 1 (Data): method radios reframed: "autoStructN2V (auto-routed)" and
  "N2V (force plain)". 2.5D toggle removed from the train workflow, kept in
  the import workflow for legacy checkpoint pairs. `bg_side` choice added
  here or in Step 2.
- Step 2 (Configure): presets unchanged in spirit; extractor section replaced
  with the new params above.
- Step 3 (Training): single training section (reuse the N2V single-stage
  layout for both methods). Mask approval panel gains a **route decision
  card**: chosen branch, reason, Dmax vs threshold, mask_rho2 ("share of
  center-pixel noise variance the mask plugs"). MaskVisualization grid is
  reused as-is (handles rectangular kernels); triplet tabs become
  legacy-display-only. MaskParameterPanel sliders replaced by the new
  extractor params. Auto-approve toggle stays. When the router picks N2V
  (no usable directional structure), show that as an informative outcome,
  not an error, with Approve continuing as plain N2V.
- Step 4 (Inference): unchanged flow; stage picker only shown for legacy
  imports.
- Help content: 13+ articles in `content/modules/denoising-dl/` reference
  two-stage/2.5D concepts or the old extractor knobs; rewrite around the
  routed method (router, ACF measurement, bg_side, spine masks, rho_floor,
  mask_rho2) and update `autostructn2v-detail.md` to cite the paper and the
  asn2v repo. Regenerate `manifest.json` via the help scripts.

## Consequences

Positive: the public workspace runs the published method; approval happens
before GPU time is spent; one training instead of two (roughly halves
wall-clock for autoStructN2V runs); router prevents structured masking where
it does not help; old models keep working for inference.

Negative / accepted: new trainings are 2D per-slice only (2.5D retired with
the method); vendored copy requires the snapshot-sync discipline on upgrades;
help content rewrite is a real chunk of work.

## Implementation phases

- **Phase 0 - baseline:** run the current app locally (npm run dev + venv,
  test_data/trypB_testData_denoising.tif) as the behavioral reference.
- **Phase 1 - Python:** vendor v1.0 at `python/vendor/autoStructN2V/`
  (+ LICENSE + VENDORED_VERSION), rewrite `python/denoising/`, delete
  `docs/autoStructN2V_2.5D/` (archive the migration guide to
  `docs/archive/`). Headless tests: every wrapper mode via CLI configs on
  the test stack (CPU, tiny epochs), plus legacy-checkpoint inference if an
  old .pth is available.
- **Phase 2 - Node:** routes/service/state machine, config mapping, presets,
  output tracking.
- **Phase 3 - Frontend:** module UI, route decision card, extractor panel,
  help articles.
- **Phase 4 - Local validation:** full local E2E of the webapp (both
  methods, approval/regenerate/force-N2V paths, legacy-checkpoint
  inference, resume/cancel). Deployment does NOT follow immediately:
  further non-denoising feature work is planned on top of this state
  before the public instance is updated.
- **Phase 5 - Deploy (later, after the feature work):** verify server
  torch/CUDA first; staged rollout on the de.NBI server with a rollback
  tag (public instance; never edit live).

## References

- ASN2V v1.0: https://github.com/lucasfortune/asn2v (paper: ASN2V
  manuscript, 2026; benchmark data DOI 10.5281/zenodo.22084921)
- Contract map of the pre-migration integration: session notes 2026-08-26
  (endpoints, stdout protocol, socket events, file conventions)
- ADR-002 (dual version), ADR-004 (module system)
