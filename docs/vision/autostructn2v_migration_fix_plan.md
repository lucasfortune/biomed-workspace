# autoStructN2V v2.0 Migration — Fix Plan

**Branch:** `migration/autostructn2v-v2.0`
**Code review date:** 2026-05-22
**Status:** ✅ All 15 findings resolved in [2026-05-26 fix pass session](../sessions/2026-05-26_autostructn2v_v2.0_fix_pass.md). End-to-end canary passing.

This plan tracks defects identified by a multi-angle code review of the
migration branch. Severity ranks reflect blast radius × likelihood:

- **Critical**: blocks the headline migration goal, or corrupts data silently.
- **High**: crash, OOM, visibly wrong output, or wrong persisted metric.
- **Medium**: silent disagreement between declared and actual behaviour;
  edge cases that produce subtly wrong output.
- **Low / Hardening**: latent footguns, readability, asymmetric resource
  cleanup that doesn't currently leak.

Findings are listed in **fix order**. Each entry follows the same shape:
**Symptom → Root cause → Fix → Files & lines → Verification**.

---

## Critical

### 1. Stage 2 mask-pool collapse + non-square-kernel crash

**Status:** Confirmed bug. **Reproduced by user** running autoStructN2V end-to-end on 2026-05-22; Stage 1 completed successfully, Stage 2 crashed at mask construction with this traceback:

```
ValueError: operands could not be broadcast together with shapes (7,9) (7,7)
  File "python/denoising/training.py", line 500, in run_training
    full_mask, prediction_kernel = create_full_mask(...)
  File "docs/autoStructN2V_2.5D/autoStructN2V/masking/utilities.py", line 95,
    in create_full_mask
    if np.any(single_masking_kernel & forbidden_local):
```

**Symptom:** Two failure modes collide here.

1. **Crash (user-observed):** `extract_mask` returned a `(7, 9)` rectangular structural kernel (anisotropic noise pattern). `create_full_mask` assumes a square kernel — `pattern_size = single_masking_kernel.shape[0]` and `forbidden_local = forbidden[i:i+ph, j:j+ph]` is always square — so the `np.any(kernel & forbidden_local)` reduction broadcasts `(7,9)` against `(7,7)` and raises.
2. **Mask-pool collapse (would manifest if (1) didn't crash first):** Even after fixing (1), the webapp would silently get a degenerate mask pool: `training.py:590,600` and `operations.py:436,448` pass `structured_mask=full_mask` (a `patch_size × patch_size` full mask), but the library now expects the *small* kernel — see `pipeline/data.py:230-231` (`single_kernel = structured_mask`) and `datasets/training.py:243-250` (which calls `create_full_mask(self.single_kernel, self.patch_size, ...)` per pool entry). With `pattern_size == patch_size`, `np.meshgrid(np.arange(1), ...)` yields a single position `(0,0)` → all 32 pool entries are identical → the A1 mask-diversity fix the migration was supposed to deliver is completely defeated.

**Root cause:** The webapp wrappers were written against the pre-migration library contract. Upstream `pipeline/runner.py:584-619` now passes the *small* `stage2_struct_kernel` (output of `extract_mask`/`extract_mask_3d`) directly to `create_dataloaders` and lets the dataset's `_build_mask_pool` build the per-patch full masks. The webapp instead pre-expands with `create_full_mask` and passes the wrong shape downstream.

**Fix:**
1. **Webapp wrappers** — `python/denoising/training.py` and `python/denoising/operations.py`:
   - Drop the `create_full_mask` / `create_full_mask_3d` calls (lines 483-505 in training.py; 301-313 in operations.py) — these used to produce both `full_mask` and `prediction_kernel`, but the library no longer accepts a pre-built full mask, and `prediction_kernel` is dead code in `pipeline/data.py:160` (declared, never consumed).
   - Pass `structured_mask=struct_mask` (the small kernel returned by `extract_mask`/`extract_mask_3d`) directly to `create_dataloaders`.
   - Remove `prediction_kernel=prediction_kernel` from the four `create_dataloaders` calls at training.py:590,600 and operations.py:436,448.
   - **Keep** the existing `np.save(struct_mask, …)` at training.py:485 and operations.py — this matches upstream's `stage2_mask.npy` (the small kernel) and the mask-visualization payload at training.py:506-540 already uses `struct_mask`, not `full_mask`.

2. **Library `create_full_mask`** — `docs/autoStructN2V_2.5D/autoStructN2V/masking/utilities.py:52-130`: even after the webapp stops pre-calling it, the library's own `_build_mask_pool` calls it internally per pool entry with whatever `struct_mask` the webapp passes. If that kernel is non-square (`(7, 9)` in the user's case), the same broadcast error fires inside the dataset. This is an upstream bug too. Two options:
   - **(a) Square-pad** the kernel inside `create_full_mask` before the validity check (cheapest, no upstream surgery): set `ph_h, ph_w = single_masking_kernel.shape` and use `forbidden[i:i+ph_h, j:j+ph_w]`.
   - **(b) Patch `extract_mask`** to always return square kernels (more invasive; changes the structural-pattern semantics).
   Pick (a). This becomes the **fourth webapp-local patch** to the vendored library; document it in `MIGRATION_NOTES.md` so the next sync cycle preserves it.

**Files:**
- `python/denoising/training.py:481-509, 588-602`
- `python/denoising/operations.py:286-318, 432-454`
- `docs/autoStructN2V_2.5D/autoStructN2V/masking/utilities.py:52-130` (square-pad patch)

**Verification:**
- Re-run the same autoStructN2V end-to-end job that crashed. Stage 2 mask construction should complete without the broadcast error.
- Check stdout for the verbose dataloader log: `"Single kernel shape: (7, 9)"` (i.e. non-square accepted) followed by `mask_pool_size=32` distinct masks. If `np.all(self._mask_pool[0] == self._mask_pool[1])` returns True, the pool is still collapsed — go back to the diagnosis.

---

## High

### 2. Stride-fit padding underflows when `h ≤ patch_size`

**Symptom:** Inference crashes with `"patch_size cannot be larger than image dimensions"` on any TIFF whose H or W is `≤ patch_size`.

**Root cause:** `predictor.py:240, 301, 348` compute
```python
pad_h_fit = (self.stride - (h - self.patch_size) % self.stride) % self.stride
```
For `h=32, patch_size=64, stride=32`, Python floor-modulo gives `(-32) % 32 == 0` → `pad_h_fit = 0`. Padded height = `outer + h + outer + 0 = 40`, but `extract_size = patch_size + 2*outer = 72`. `image_to_patches` rejects.

**Fix:** In `predictor.py`, clamp `pad_h_fit` so that `h + 2*outer + pad_h_fit ≥ extract_size`:
```python
pad_h_fit = max(pad_h_fit, self.extract_size - (h + 2 * self.overlap_tile_pad))
pad_w_fit = max(pad_w_fit, self.extract_size - (w + 2 * self.overlap_tile_pad))
```
Apply at all three sites: `denoise_image`, `_predict_2d`, `_predict_2_5d`.

**Files:** `docs/autoStructN2V_2.5D/autoStructN2V/inference/predictor.py:94-95, 240-241, 301-302`

**Verification:** Run inference on a 32×32 single-slice TIFF with the default `patch_size=64, overlap_tile_pad=4`. Should complete and return a 32×32 denoised slice (with whatever quality the small support allows, but no crash).

---

### 3. EarlyStopping predicate mutates state every epoch; `early_stopped` is wrong when disabled

**Symptom:** `results.json` reports `early_stopped: true` for runs that completed all epochs without the loop ever breaking — specifically whenever the last `patience` epochs didn't improve, regardless of whether early stopping was actually enabled.

**Root cause:** `python/denoising/trainer.py:167` evaluates the predicate as the *left* operand of `and`:
```python
if early_stopping(val_loss) and stage_config.get('early_stopping', ...):
```
Python short-circuits left-to-right, so the predicate is called every epoch and mutates `counter`. Line 185 then reports `early_stopped = (counter >= patience)` regardless of whether the loop broke.

**Fix:** Swap the order:
```python
if stage_config.get('early_stopping', ...) and early_stopping(val_loss):
```
This way the predicate is only called when early stopping is active. Also fix the metric: track a local `did_break` flag set inside the break path, and report `early_stopped = did_break` instead of inferring from `counter`.

**Files:** `python/denoising/trainer.py:167, 183-189`

**Verification:** Train a short run with `early_stopping: false` and validation loss artificially climbing. Persisted `early_stopped` must be `false`. Train a short run with `early_stopping: true` and a guaranteed plateau; persisted `early_stopped` must be `true` and `epochs_completed < total_epochs`.

---

### 4. Inference progress UI: key-case mismatch + frozen bar

**Symptom:** Plain `run_inference` and `run_sequential_inference` show 0% progress for the entire wall-time, then jump to 50% / 100%.

**Root cause:** Two bugs stack:
1. **Key-case mismatch (run_inference only).** `inference.py:237-239` emits `currentSlice`, `totalSlices`, `progressPercent` (camelCase). `public/workspace/js/modules/denoising-dl/handlers/InferenceHandler.js:381-384` reads `data.progress_percent`, `data.current_slice`, `data.total_slices` (snake_case). `DenoisingService.js:1100` forwards JSON verbatim. Percent falls through to `0`.
2. **Single-event collapse (both functions).** The per-slice loops were replaced with whole-stack `predictor._predict_2d` / `_predict_2_5d` calls. Even with correct keys, only 1–2 events fire across the entire prediction wall-time. The bar is frozen until completion.

**Fix:**
1. Emit snake_case keys at `inference.py:237-239`.
2. Restore per-slice progress by wrapping the predictor's slice loop with a callback, or by chunking the input stack and running the predictor per chunk with an `emit_progress` after each chunk. The predictor's internal `tqdm` is stdout-only and can't be piped through Socket.IO.

**Files:**
- `python/denoising/inference.py:237-239` (key-case)
- `python/denoising/inference.py:175-241, 380-455` (progress granularity refactor)
- Optionally: add a `progress_callback` parameter to `AutoStructN2VPredictor._predict_2d/_predict_2_5d` in `docs/autoStructN2V_2.5D/autoStructN2V/inference/predictor.py` — would be a fifth webapp-local patch.

**Verification:** Run inference on a 50-slice stack. Progress bar should advance smoothly, not jump.

---

### 5. GPU memory bloat in `run_sequential_inference`

**Symptom:** OOM during sequential autoStructN2V inference on small-VRAM GPUs (8–12 GB) where it previously worked.

**Root cause:** `inference.py:333-334` loads both checkpoints up front. No `del`/`empty_cache` between stages. By the time Stage 2's model is allocated (~line 422), GPU holds `stage1_ckpt + stage1_model + stage1_predictor + stage2_ckpt + stage2_model` simultaneously. Compare `training.py:436-438` which explicitly does `del stage1_model, stage1_trainer, optimizer, scheduler; torch.cuda.empty_cache()`.

**Fix:** Between Stage 1 completion and Stage 2 model allocation (after `inference.py:411` `tifffile.imwrite(stage1_output_path, ...)`), insert:
```python
del stage1_checkpoint, stage1_model, stage1_inference_model, stage1_predictor
if torch.cuda.is_available():
    torch.cuda.empty_cache()
```

**Files:** `python/denoising/inference.py:333-411`

**Verification:** Profile peak GPU memory (`torch.cuda.max_memory_allocated()`) of a sequential run on a 256×256×100 stack. Should be roughly `max(stage1_peak, stage2_peak)`, not `stage1_peak + stage2_peak`.

---

### 6. Legacy non-zscore inference uses per-stack min-max instead of per-slice

**Symptom:** Pre-migration models produce visibly worse output on stacks with strong inter-slice brightness variation (deeper slices in fluorescence z-stacks, etc.).

**Root cause:** The 2D-loop replacement in `inference.py:222-226` (and the equivalent `:380-385` in `run_sequential_inference`) now computes `input_min, input_max = input_stack.min(), input_stack.max()` once and rescales every slice with the same constants. The deleted loop did per-slice min-max. Dim slices get compressed into a tiny fraction of [0,1] before being fed to a model that was trained on per-slice-normalized data.

**Fix:** When `norm_stats is None`, keep the deleted per-slice normalization. Two options:
- **(a)** Restore the per-slice loop for the `norm_stats is None` path (verbose but preserves UI progress per slice for free).
- **(b)** Implement a `predictor._predict_2d_per_slice_norm()` variant that does per-slice scaling internally. More invasive.

Pick (a). The per-slice progress need from finding #4 means we want a loop in this code path anyway.

**Files:** `python/denoising/inference.py:213-241, 380-405`

**Verification:** Take a stack with `slice[0].max() = 65000` and `slice[-1].max() = 5000`, run inference with a legacy (no `_norm_stats`) checkpoint, confirm visual quality matches pre-migration behaviour on the dim end of the stack.

---

### 7. uint8/uint16 denorm wraps without `np.clip`

**Symptom:** Isolated bright pixels render as black (or vice versa) in denoised TIFFs saved as uint8/uint16.

**Root cause:** `inference.py:92, 95` define
```python
def denorm(arr): return (arr * 255.0).astype(np.uint8)
def denorm(arr): return (arr * 65535.0).astype(np.uint16)
```
No clip. Z-score denormalization at `predictor.py:272` (`prediction * (s + eps) + m`) is unbounded — `1.02 * 65535 = 66846` → wraps to `1311` in uint16 cast. `python/denoising/utils.py:55` (`convert_to_original_dtype`) already does the right thing by clipping first; this helper should match.

**Fix:** Add `np.clip(arr, 0.0, 1.0)` before the cast in all three branches of `_dtype_normalize`:
```python
def denorm(arr): return (np.clip(arr, 0.0, 1.0) * 255.0).astype(np.uint8)
```

**Files:** `python/denoising/inference.py:86-103`

**Verification:** Train any short Stage 1 model with `normalize_method='zscore'`, run inference, assert `output_stack.dtype == input_stack.dtype` and `output_stack.max() == iinfo(dtype).max` only when the model legitimately predicted ≥ 1.0 (no wrap-around artefacts visible in a histogram).

---

### 8. Sequential inference saves float32 instead of input dtype

**Symptom:** `asn2v_denoised_<id>.tif` from sequential inference appears nearly black in viewers calibrated for uint16 (values in `[0, 1]` rendered against `[0, 65535]`).

**Root cause:** `inference.py:410` and `:460` save outputs via `.astype(np.float32)` with no `denorm` call. The single-stage `run_inference` at line 233 calls `denorm(output_stack)` so dtype matches input. The sequential path discards the denorm closure (`_, denorm` is overwritten or `_dtype_normalize`'s return is unpacked to `input_normalized, _`) and never reapplies it.

**Fix:** After Stage 2 prediction completes, apply the same `denorm` used at input normalization. Same for the Stage 1 intermediate, unless float32 intermediates are intentional — in that case, document it and rename the file with a `_float32` suffix.

**Files:** `python/denoising/inference.py:380-411, 449-462`

**Verification:** Sequential run on a uint16 input. Final `asn2v_*.tif` should be uint16 with sensible intensity range; opening in ImageJ should look like a denoised version of the input, not pitch-black.

---

## Medium

### 9. `run_stage2_only` declares zscore without recomputing `_norm_stats`

**Symptom:** Stage 2 checkpoint's `hparams` claims `normalize_method='zscore'` but `_norm_stats` is `None`. Inference reads `_extract_training_hparams → (None, 4)` and silently skips zscore — the declaration is a lie.

**Root cause:** `operations.py:270-275` does `setdefault('normalize_method', 'zscore')` AFTER the shallow merge of saved Stage 1 `config.json` at lines 242-244. If the saved config predates the migration (no `_norm_stats`), the merge fills missing keys but adds nothing for `_norm_stats`; the setdefault flips the declaration without recomputation.

**Fix:** Inside `run_stage2_only`, after the merge but before the setdefault block, check `if config.get('normalize_method') == 'zscore' and '_norm_stats' not in config:` and either recompute stats from the loaded stack (mirroring the new logic in `training.py:226-243`) or raise a clear error pointing the user at the missing field.

**Files:** `python/denoising/operations.py:240-275`

**Verification:** Synthesize a pre-migration-style `config.json` (no `_norm_stats`) and run `run_stage2_only`. Should either fail loudly or compute stats inline; the resulting checkpoint must satisfy `('normalize_method' == 'zscore') ⇔ ('_norm_stats' is not None)`.

---

### 10. `patch_size` routed from frontend instead of checkpoint

**Symptom:** Inference predictor's tiling geometry doesn't match what the model was trained on; valid-region / edge-band split is offset.

**Root cause:** `inference.py:182, 371, 432` pass `patch_size = model_config.get('patch_size', 64)` (frontend value) to `AutoStructN2VPredictor`. `_stage_params_from_checkpoint` at line 76 already extracts the checkpoint-trained `patch_size` — but only into `stage_params` for the model factory. The predictor gets the frontend's value.

**Fix:** Use the same `_stage_params_from_checkpoint` output for predictor construction:
```python
patch_size = stage_params['patch_size']
```

**Files:** `python/denoising/inference.py:175-185, 365-375, 425-435`

**Verification:** Train at `patch_size=128`, then call inference with a frontend payload setting `patch_size=64`. Confirm the predictor extracts 128-pixel patches (check log output of `_predict_2d`/`_predict_2_5d`).

---

### 11. `load_tiff_stack`/`load_and_normalize_image` no longer clip float TIFFs

**Symptom:** Pre-migration models (no `_norm_stats` in their checkpoint) running inference on float-typed TIFFs receive arbitrary-range inputs → garbage output.

**Root cause:** `docs/autoStructN2V_2.5D/autoStructN2V/utils/image.py:299-306` and the matching float branch in `load_and_normalize_image` no longer clip to [0,1]; the new comment defers clipping to "callers that need a [0, 1] range". `predictor.denoise_image:84` and `denoise_stack` call these loaders and pass raw values straight into the model. The webapp's 2.5D `run_training` path normalizes manually so it's unaffected; the 2D path via `process_directory` → `denoise_image` is exposed.

**Fix:** Either:
- **(a)** Add an explicit clip in `denoise_image`/`denoise_stack` before the tensor cast when `self.norm_stats is None`.
- **(b)** Re-add the `np.clip(slice_data, 0, 1)` in `load_tiff_stack`'s float branch (reverts that part of the upstream change for the webapp's vendored copy). Becomes another webapp-local patch.

Pick (a). Keeps the upstream change intact and pushes the policy decision to the right layer.

**Files:** `docs/autoStructN2V_2.5D/autoStructN2V/inference/predictor.py:65-110, 159-195`

**Verification:** Create a float TIFF with values in `[0, 5]`, run inference with a legacy checkpoint. Should not produce values outside `iinfo(dtype).max` when saved as uint16.

---

### 12. NaN propagation in `_norm_stats` computation

**Symptom:** Every output slice from a trained model is NaN.

**Root cause:** `training.py:235-244` does `running_sum += float(img.sum())`. `load_and_normalize_image` (per finding #11) passes float TIFFs through unchanged. A single NaN pixel poisons `running_sum`, then `mean=NaN`, `std=NaN`, saved `_norm_stats={'mean': NaN, 'std': NaN}`, predictor's `(x − NaN) / (NaN + eps) = NaN` for every pixel.

**Fix:** Either use `np.nansum`/`np.nanmean` semantics (silently ignore NaN — surprising behaviour) or scan each loaded image with `np.isnan(img).any()` and raise a clear error pointing at the bad file. Prefer the second — silent NaN-dropping in input data is risky for a denoising pipeline.

**Files:** `python/denoising/training.py:226-243`

**Verification:** Synthesize a training image where one pixel is `np.nan`, run training. Expected: clear error message naming the file. Not: silent NaN output.

---

### 13. `std == 0` collapses zscore math

**Symptom:** Model trained on a constant-intensity stack produces a near-constant output and astronomical gradients during training.

**Root cause:** `training.py:241, 250` compute `std = float(np.sqrt(var))`. For `var=0`, `std=0`. `_norm_stats={'mean': c, 'std': 0.0, 'eps': 1e-6}`. The dataset's zscore is `(patch - c) / (0 + 1e-6)` — multiplies by 1e6. Predictor's denorm collapses output to near-constant `c`.

**Fix:** Guard with a sentinel floor or raise:
```python
if std < 1e-8:
    raise ValueError(
        "Training stack has near-zero standard deviation; cannot z-score "
        "normalize. Use normalize_method='unit' or check the input data."
    )
```

**Files:** `python/denoising/training.py:240-243, 249-252`

**Verification:** Train on a constant stack. Expect a clear ValueError before training starts, not silent garbage output.

---

### 14. `extract_size` divisibility not validated against `2^num_layers`

**Symptom:** `RuntimeError: Sizes of tensors must match` during the first forward pass of the U-Net, deep inside the decoder skip-concat.

**Root cause:** `training.py:141` sets `overlap_tile_pad=4` for both stages, but nothing validates that `extract_size = patch_size + 2*overlap_tile_pad` is divisible by `2^num_layers`. Pre-migration users with `patch_size=64, num_layers=4` had `64 % 16 == 0` (fine); now `extract_size=72, 72 % 16 = 8` (broken).

**Status:** **PLAUSIBLE.** The mechanism is real but the user's current `num_layers` may not hit it. Worth fixing defensively.

**Fix:** Validate at the top of `training.py::run_training` after `validate_config`:
```python
for stage in ('stage1', 'stage2'):
    extract_sz = config[stage]['patch_size'] + 2 * config[stage].get('overlap_tile_pad', 0)
    divisor = 2 ** config[stage]['num_layers']
    if extract_sz % divisor != 0:
        raise ValueError(
            f"{stage} extract_size={extract_sz} not divisible by 2^num_layers={divisor}. "
            f"Adjust patch_size, overlap_tile_pad, or num_layers."
        )
```

**Files:** `python/denoising/training.py:124-150`

**Verification:** Set `num_layers=4, patch_size=64` in the UI, start training. Expect a pre-flight error pointing at the right knob, not a cryptic decoder shape mismatch on epoch 0.

---

### 15. `_dtype_normalize` float branch leaves `[0, X<1]` unrescaled

**Symptom:** A legitimate float TIFF with values in `[0, 0.4]` (output of an upstream denoiser, downsampled visualization, etc.) is fed to the predictor unrescaled. The predictor's z-score uses train-time stats fit to `[0, 1]`-scale data → input falls in the far-negative regime → garbage output.

**Root cause:** `inference.py:98-103` only rescales floats when `max > 1.0 or min < 0.0`. Inputs that happen to be in `[0, sub-1]` skip rescaling.

**Status:** **PLAUSIBLE.** Depends on the user feeding such a float TIFF.

**Fix:** Always rescale float inputs to `[0, 1]` via min-max when `norm_stats is set`. When `norm_stats is None`, the legacy min-max already handles it.

**Files:** `python/denoising/inference.py:80-103`

**Verification:** Run inference on a synthetic float TIFF in `[0, 0.4]` with a zscore-trained checkpoint. Output should be in the input's intensity range, not collapsed.

---

## Out of scope for this fix pass

The following items were flagged by the review but are deferred — either
hardening (no active bug) or pre-existing behaviour the migration didn't touch.

- `[outer:-outer or None]` slicing idiom is fragile — works today because of
  the `if outer:` guard, but a future contributor dropping the guard would
  silently produce wrong slices. Replace with explicit arithmetic when
  convenient.
- `safe_load_checkpoint` always falls back to `weights_only=False` for the
  new hparams shape — the first attempt is dead code. Either extend the
  safe-globals list or remove the first attempt. Low-priority security
  hardening.
- `inference_config['stage1']` and `['stage2']` are aliased to the same dict
  in `run_inference` — latent footgun, not currently triggered.
- TensorBoard log_dir uses `datetime.now().strftime("%Y%m%d-%H%M%S")` — two
  rapid resumes of the same paused training within a second would collide.
- `operations.py` writes Stage-1 hparams (via `setdefault`) into the Stage-2
  checkpoint's `hparams` dict. Doesn't affect current code paths but corrupts
  the Stage-2 checkpoint's provenance record.
- Predictor's `_predict_2d`/`_predict_2_5d` aren't wrapped in
  `torch.no_grad()` at the outermost level — fine today because the heavy
  work happens inside `denoise_tensor` which is wrapped, but a future torch
  op inserted outside would allocate gradients.

---

## Suggested execution order

The order minimises rework — earlier fixes don't depend on later ones, but
later fixes do build on the earlier groundwork.

1. **#1 (Stage 2 mask)** — unblocks the user's end-to-end test. Includes the
   library `create_full_mask` square-pad patch.
2. **#2 (small-image padding)** — independent, crash-fix.
3. **#3 (EarlyStopping)** — independent, corrupts persisted metric data.
4. **#7 (uint denorm wrap)** — independent, two-line fix; visible artefacts.
5. **#8 (sequential dtype)** — independent, two-line fix; user-visible "black output".
6. **#5 (GPU mem leak)** — independent, four-line fix.
7. **#10 (patch_size routing)** — depends on no other fix.
8. **#11 (clip removal)** — independent.
9. **#12, #13 (NaN/zero std guards)** — independent error checks; can land together.
10. **#14 (extract_size divisibility)** — pre-flight check.
11. **#9 (run_stage2_only zscore recompute)** — touches the same defaults block
    as several earlier fixes; do after the operations.py work in #1 settles.
12. **#15 (float branch in `_dtype_normalize`)** — minor; do last.
13. **#6 (per-slice norm regression)** + **#4 (progress UI)** — couple these
    since both want a per-slice loop in the inference path; do them in one go.

After fix #1 lands, **re-run the autoStructN2V end-to-end job** as the
canary. After fixes #2-#15, sweep with the existing identity-model tests
in `python/denoising/` to confirm no regressions.

---

## Document the third (and fourth, and fifth) webapp-local patch

The migration originally tracked two webapp-local patches in
`pub/ASN2V/autoStructN2V/publication/webapp_migration/`:
- `runner_verbose.patch` — `verbose=True` on ReduceLROnPlateau.
- `image_equalize_hist_fallback.patch` — try/except around `equalize_hist`.

This fix pass adds:
- **Third patch** (already landed): `denoise_image` overlap-tile + norm_stats
  fix in `inference/predictor.py`.
- **Fourth patch** (this plan, finding #1): `create_full_mask` square-pad for
  non-square structural kernels in `masking/utilities.py`.
- **Fifth patch** (this plan, finding #2): stride-fit padding clamp for
  small images in `predictor.py`.
- Possibly a **sixth** if #4 adds a predictor `progress_callback` parameter.

Before committing the fixes, append these to `MIGRATION_NOTES.md §1` so the
next migration sync cycle doesn't silently lose them. Consider also opening
upstream PRs against `pub/ASN2V` for the genuinely-buggy ones (#1, #2) so the
divergence shrinks over time.
