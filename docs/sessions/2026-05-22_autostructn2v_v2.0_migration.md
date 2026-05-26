# autoStructN2V v2.0 Library Migration + End-to-End Wiring

**Date:** 2026-05-22
**Phase:** Library migration (`pub/ASN2V` v1.0-webapp → HEAD `fa915df`)
**Duration:** ~6 hours
**Status:** ⏳ In Progress — migration applied, wiring done, code review surfaced 15 issues to fix in a follow-up session
**Complexity:** Architectural

---

## 🎯 Goals

Apply the published autoStructN2V v2.0 migration and wire its new features
through the webapp's hand-rolled training/inference orchestration so the
publication's improvements (z-score normalization, overlap-tile patching,
N2V2 architectural fixes) actually take effect when users train through the
web UI.

**Primary Objectives:**
- [x] Apply the migration on a feature branch (15 files, +1920 / −746)
- [x] Re-apply the two pre-existing webapp-local patches (verbose schedulers, equalize_hist fallback)
- [x] Walk the §6 verification checklist from `MIGRATION_NOTES.md`
- [x] Wire the new library knobs through the webapp's Python wrappers (zscore + overlap-tile + N2V2 defaults)
- [x] Diagnose user-reported black borders + checkerboard artefacts after first N2V run
- [x] Code-review the full diff before committing

**Secondary Objectives:**
- [ ] Run autoStructN2V end-to-end as the canary (Stage 1 + mask + Stage 2 + inference) — **attempted, blocked by review-finding #1**
- [ ] Frontend UI exposure of the new knobs — deferred
- [ ] Commit + merge to main — deferred until follow-up fixes land

---

## 📝 Summary

**Accomplished:**
- ✅ Created branch `migration/autostructn2v-v2.0`, copied 15 files from upstream HEAD, re-applied both webapp patches (`verbose=True` on schedulers in `runner.py`; `try/except` around `equalize_hist` in `utils/image.py`)
- ✅ Verified the wrapper import chain still resolves through `python/denoising/__init__.py`'s `sys.path` injection; all consumed library symbols exist
- ✅ Wired `_norm_stats` computation, threading, and persistence through `training.py`, `operations.py`, `inference.py` — including 2D mean/std streaming that upstream `run_pipeline` explicitly doesn't support
- ✅ Wired `overlap_tile_pad`, `remove_top_skip`, `use_blurpool` defaults so the publication's improvements are on by default in the webapp
- ✅ Added `_stage_params_from_checkpoint` helper that reads architecture from `checkpoint['hparams'][stage]` so trained models reconstruct correctly at inference even though the frontend's `model_config` doesn't forward the new architecture fields
- ✅ Diagnosed black-border bug as a missed-update to `predictor.denoise_image` (upstream forgot to add overlap-tile pad to that path; the rest of the predictor got it). Patched as a **third** webapp-local divergence from upstream.
- ✅ Multi-angle code review (5 finder angles + 1 verifier + 1 sweep agent) produced 15 verified findings — saved to `docs/vision/autostructn2v_migration_fix_plan.md`

**Key Findings:**
- The webapp's Python wrappers **do not** use the library's `run_pipeline`; they hand-orchestrate training. Every new library feature requires manual wiring. The migration brought knobs, not behaviour.
- Two of the new library features are **forced on** at the webapp layer (`normalize_method='zscore'`, `overlap_tile_pad=4`) rather than exposed as UI choices — matches the user's directive that "all changes from the migration should be used in the web ui".
- Three webapp-local divergences from upstream now exist (the original two plus the `denoise_image` fix); the code review identified two more needed (`create_full_mask` square-pad, stride-fit padding clamp). These need to be documented in `MIGRATION_NOTES.md` before the next sync cycle.
- The library has a real bug: `create_full_mask` doesn't handle non-square structural kernels. The user's autoStructN2V end-to-end run hit this because `extract_mask` produced a `(7, 9)` rectangular kernel for their anisotropic noise pattern.

**Blockers Encountered:**
- ❌ autoStructN2V end-to-end run failed during Stage 2 mask construction with `ValueError: operands could not be broadcast together with shapes (7,9) (7,7)` — **deferred** to a follow-up fix session; the failure is now finding #1 in the fix plan.

---

## 📋 Detailed Log

### Task 1: Apply migration to branch ✅

**Problem:** The webapp's vendored copy of autoStructN2V at
`docs/autoStructN2V_2.5D/autoStructN2V/` was last synced at upstream commit
`8689bf8` (v1.0-webapp baseline). All subsequent improvements in the
publication repo had accumulated locally — closing the N2V reimplementation
quality gap, adding 2.5D mode hardening, overlap-tile training,
N2V2 architectural fixes, z-score normalization.

**Solution:** Followed `MIGRATION_NOTES.md`'s recommended file-by-file
replacement strategy (Option A). Copied 15 files from
`pub/ASN2V/autoStructN2V/autoStructN2V/` to the webapp tree on the new
branch. Re-applied both webapp-local patches:
1. `runner.py`: `verbose=True` on both `ReduceLROnPlateau` constructors
   (the upstream version has a refactored Stage 2 scheduler with
   `factor=0.1, patience=20, min_lr=1e-6`; the patch was appended verbatim).
2. `utils/image.py`: try/except around `exposure.equalize_hist` with a
   min-max fallback for narrow-range edge cases.

**Result:** Diff stat matches the migration notes exactly: 15 files,
+1920/−746. All 15 files compile under `py_compile`. The wrapper's actual
import chain (`denoising → autoStructN2V.{trainers,models,inference,...}`)
resolves cleanly through the `sys.path` injection at
`python/denoising/__init__.py:12`.

**Files Changed:**
- 15 files under `docs/autoStructN2V_2.5D/autoStructN2V/` (full upstream-HEAD content)

---

### Task 2: Wire z-score normalization + overlap-tile + N2V2 defaults ✅

**Problem:** The migration brought a new `normalize_method='zscore'` knob
that, per upstream `runner.py:348-353`, computes train-derived `_norm_stats`
and threads them through the dataset, trainer, and predictor. The webapp's
`python/denoising/*.py` doesn't go through `runner.py`, so none of this
machinery is exercised. The same was true for `overlap_tile_pad`,
`remove_top_skip`, `use_blurpool`. After the user confirmed "z-score is a
crucial change and should definitely be used", the wiring became mandatory.

**Investigation:** Audited the webapp config-flow by spawning an Explore
agent over `python/denoising/`, `src/services/DenoisingService.js`, and
`public/workspace/js/modules/denoising-dl/`. The report identified six
predictor-construction sites and the trainer site in `training.py` /
`operations.py` / `inference.py` where the new params were missing.

**Solution:**

1. **Webapp defaults flipped before `validate_config`:**
   ```python
   config.setdefault('normalize_method', 'zscore')
   for _stage in ('stage1', 'stage2'):
       config.setdefault(_stage, {})
       config[_stage].setdefault('overlap_tile_pad', 4)
       config[_stage].setdefault('remove_top_skip', True)
       config[_stage].setdefault('use_blurpool', True)
   ```
   This matches the user's directive without diverging from upstream's
   library defaults — anyone using the library directly is unaffected.

2. **`_norm_stats` computation** in both 2.5D (stack slice mean/std) and 2D
   (streaming over training images via `load_and_normalize_image`) paths.
   Upstream's `run_pipeline` raises `NotImplementedError` for zscore in 2D
   path mode; the webapp now supports it. Stats are stashed in
   `config['_norm_stats']` before `create_dataloaders` (which reads them at
   `data.py:279`) and persist with the model because the trainer saves
   `hparams=config`.

3. **Threading at 6 predictor sites + 4 trainer sites** to pass
   `norm_stats=config.get('_norm_stats')` and
   `overlap_tile_pad=config[stage].get('overlap_tile_pad', 0)`.

4. **`_stage_params_from_checkpoint` helper** in `inference.py` that reads
   architecture knobs from `checkpoint['hparams'][stage]` (with the
   frontend's `model_config` and library defaults as fallbacks). The
   frontend currently forwards only 4 of the 7+ architecture fields;
   without this helper, a model trained with `remove_top_skip=True` would
   silently rebuild without the top-skip removal at inference time and fail
   to load the state_dict.

**Result:** End-to-end smoke test (synthesizing a checkpoint, running it
through `_extract_training_hparams` and `_stage_params_from_checkpoint`)
confirmed both new and legacy checkpoints work. The dataset's
`__getitem__` actually applies the z-score transform (sample patch range
goes from `[0.0, 1.0]` to `[-2.8, 1.8]` with mean ≈ 0 and std ≈ 0.8).

**Files Changed:**
- `python/denoising/training.py` (+56 lines)
- `python/denoising/operations.py` (+22 lines)
- `python/denoising/inference.py` (+347 / −104 lines, including refactors)

---

### Task 3: Diagnose black borders + checkerboard artefacts after first N2V run ✅

**Problem:** User reported two distinct symptoms after the first N2V
training:
1. A wide completely black border around every denoised slice.
2. Intense checkerboard patterns inside the slices — exactly the artefacts
   the migration's N2V2 architectural fixes were supposed to suppress.

**Investigation:**

Bug 1 (border): Traced `predictor._predict_2d` (correct overlap-tile
handling) versus `predictor.denoise_image` (still on the pre-migration
padding formula). `denoise_image` is called by `process_directory`, which
the webapp's 2D training-time inference path uses (`training.py:425`).
The bug: `denoise_image` doesn't add the outer `overlap_tile_pad` band
before patch extraction, but `denoise_tensor` (which it calls) activates
the central-region `valid_size` weighting when `overlap_tile_pad > 0`. The
outer `pad`-wide band of every output gets `0 / eps = 0` from
`patches_to_image` (no patch's valid region covers it) → uniform black
border of exactly `overlap_tile_pad = 4` pixels.

Bug 2 (checkerboard): The N2V2 architectural fixes (`remove_top_skip`,
`use_blurpool`) default to `False` in the library; the webapp never set
them; the migration's checkerboard fix was **dormant**.

**Solution:**

1. **Patched `predictor.denoise_image`** to mirror `_predict_2d`: pad with
   `(outer, outer + pad_h_fit)`, apply z-score if `norm_stats is set`,
   strip `outer` and `[:h, :w]` after. This is the **third** webapp-local
   patch to the vendored library.

2. **Refactored both 2D loops in `inference.py`** to call
   `predictor._predict_2d` / `_predict_2_5d` on the whole stack instead of
   looping `denoise_tensor` per slice — the internal methods already
   handle padding correctly. Cost: per-slice Socket.IO progress is now
   coarser (start/end only); the predictor's `tqdm` still streams to
   stdout for operator logs.

3. **Flipped `remove_top_skip=True`, `use_blurpool=True`** as webapp
   training defaults (covered in Task 2's defaults block).

4. **Added `_stage_params_from_checkpoint`** so inference reconstructs the
   model with the actual training-time architecture from the checkpoint's
   `hparams` rather than the frontend's stripped `model_config`.

**Result:** User re-ran N2V on the same dataset — "results look much
better". No black border. Checkerboard intensity dropped substantially.
Confirmed working.

**Files Changed:**
- `docs/autoStructN2V_2.5D/autoStructN2V/inference/predictor.py:65-110, 121-126` (third webapp-local patch — `denoise_image` overlap-tile + zscore handling)
- `python/denoising/inference.py:175-241, 380-462` (refactor)
- `python/denoising/training.py:138-147` (defaults block)
- `python/denoising/operations.py:269-279` (defaults block)

---

### Task 4: Multi-angle code review ✅

**Problem:** The combined diff is ~2200 LOC across 18 files (15 upstream
replacements + 3 webapp wrappers). Before committing, the user asked for a
code review.

**Solution:** Ran the `/code-review` skill at extra-high effort:
- 5 finder angles spawned in parallel (line-by-line, removed-behavior,
  cross-file, language-pitfalls, wrapper-correctness). Each surfaced up to
  8 candidate findings.
- Dedup + batched verifier pass — 15 candidates retained after merge.
- Phase 3 sweep added 8 more candidates, of which 6 were genuinely new
  (the other 2 duplicated angle output).
- Final compilation: 15 findings ranked by severity (1 critical, 6 high,
  6 medium, 2 plausible).

**Result:** Findings saved to
`docs/vision/autostructn2v_migration_fix_plan.md` for the follow-up fix
session. Most-severe finding (Stage 2 mask-pool collapse + non-square-
kernel crash) matches the user-observed crash from the attempted
autoStructN2V end-to-end run earlier in the session.

**Files Changed:**
- `docs/vision/autostructn2v_migration_fix_plan.md` (new, ~15 KB)

---

### Task 5: autoStructN2V end-to-end canary ⏳

**Status:** In Progress / Blocked.

**Reason for deferral:** User ran the canary after the Task 3 fixes
landed. Stage 1 completed successfully; Stage 2 mask construction crashed
with:
```
ValueError: operands could not be broadcast together with shapes (7,9) (7,7)
  File "python/denoising/training.py", line 500, in run_training
    full_mask, prediction_kernel = create_full_mask(...)
  File "docs/autoStructN2V_2.5D/autoStructN2V/masking/utilities.py", line 95,
    in create_full_mask
    if np.any(single_masking_kernel & forbidden_local):
```

The autocorrelation extractor produced a rectangular `(7, 9)` kernel for
the user's anisotropic noise pattern. `create_full_mask` assumes square
kernels (`pattern_size = single_masking_kernel.shape[0]` and
`forbidden_local = forbidden[i:i+ph, j:j+ph]`). Two compounding bugs:

1. **Library**: `create_full_mask` doesn't handle non-square kernels.
2. **Webapp**: shouldn't be calling `create_full_mask` at all — upstream's
   contract is for the dataset's internal `_build_mask_pool` to call it
   per pool entry. The webapp pre-expanding it both crashes here (when
   the kernel is non-square) and would silently collapse the mask pool to
   a single placement if the kernel were square.

Both are documented as finding #1 in the fix plan.

**Next Steps:** Fix #1 in the follow-up session, then re-run the canary
as the first regression check.

---

## 💻 Code Changes Summary

### New Files (+2)
- ✨ `docs/vision/autostructn2v_migration_fix_plan.md` (~15 KB) — Findings from code review with per-issue fix recipes, execution order, and verification steps.
- ✨ `docs/sessions/2026-05-22_autostructn2v_v2.0_migration.md` (this file).

### Modified Files (18 changes)
- 📝 15 files under `docs/autoStructN2V_2.5D/autoStructN2V/` (full upstream-HEAD content via file-by-file replacement)
- 📝 `docs/autoStructN2V_2.5D/autoStructN2V/inference/predictor.py` — Additionally patched (third webapp-local divergence) to fix `denoise_image` overlap-tile + zscore handling
- 📝 `docs/autoStructN2V_2.5D/autoStructN2V/pipeline/runner.py` — Re-applied `verbose=True` patch (existing webapp-local divergence)
- 📝 `docs/autoStructN2V_2.5D/autoStructN2V/utils/image.py` — Re-applied `equalize_hist` fallback patch (existing webapp-local divergence)
- 📝 `python/denoising/training.py` — `_norm_stats` computation, zscore + N2V2 defaults, threading to trainer & predictor
- 📝 `python/denoising/operations.py` — Same defaults block, threading to Stage 2 trainer & predictor
- 📝 `python/denoising/inference.py` — New helpers `_extract_training_hparams`, `_stage_params_from_checkpoint`, `_dtype_normalize`; refactored 2D inference to call `_predict_2d` / `_predict_2_5d` directly; checkpoint-derived architecture reconstruction

Total: +2234 / −912 lines vs `main`.

### Deleted Files (0)

---

## 🧪 Testing Performed

**Manual Testing:**
- [x] Sanity-compile all 15 migrated files (`py_compile`) — ✅ Passed
- [x] Full webapp import chain through `denoising/__init__.py` `sys.path` injection — ✅ Resolves cleanly
- [x] `validate_config({})` smoke — ✅ New defaults accepted, all old defaults preserved
- [x] End-to-end `_norm_stats` computation with the bundled test stack — ✅ `mean=0.607, std=0.215` on dtype-normalized [0,1] data; dataset's `__getitem__` applies z-score (sample range `[-2.83, 1.83]`)
- [x] Checkpoint round-trip — synthesized a new-style checkpoint with `hparams._norm_stats`, ran it through `safe_load_checkpoint` + `_extract_training_hparams` — ✅ Extracts correctly; legacy checkpoints fall back to library defaults
- [x] Identity-model end-to-end through `denoise_image` (with `overlap_tile_pad=4`) — ✅ No black border; output ≈ input
- [x] Identity-model end-to-end through `_predict_2d` with `norm_stats` set — ✅ zscore + denorm round-trip preserves input
- [x] Real N2V training run via web UI — ✅ "Results look much better" (user-confirmed); no black borders; checkerboard greatly reduced
- [x] Real autoStructN2V training run via web UI — ❌ Stage 2 mask construction crashed (finding #1 in fix plan)

**Automated Testing:**
- No new automated tests added. Existing `denoising/__init__.py` import smoke is the closest thing to a regression test.

---

## 💡 Lessons Learned

### Technical Insights

1. **The webapp's hand-rolled orchestration means library upgrades don't
   "just work."** Anything in upstream `pipeline/runner.py` is invisible
   to the webapp. Every new knob needs explicit threading through the
   webapp's `python/denoising/{training,operations,inference}.py`.
   Migration verification must include a *feature-reachability audit*,
   not just an import-check.

2. **Library defaults are conservative; webapp defaults must reflect
   intent.** Upstream's `normalize_method='unit'`, `overlap_tile_pad=0`,
   `remove_top_skip=False`, `use_blurpool=False` exist to preserve old
   behaviour for library consumers. The webapp is a *single curated
   product* whose users want the publication's recommended config by
   default. `config.setdefault(...)` *before* `validate_config` is the
   right hook for that policy.

3. **The frontend `model_config` is a leaky abstraction.** It only
   forwards a handful of architecture fields, but the library now has
   architecture-changing knobs (`remove_top_skip`, `use_blurpool`,
   `activation`) that must travel with the checkpoint. Reading from
   `checkpoint['hparams'][stage]` is the only reliable source for these
   at inference time. The pattern (`_stage_params_from_checkpoint` with
   checkpoint > model_config > library-default precedence) generalises
   to any future architecture-changing knob.

4. **Multi-angle review at high effort finds bugs single-pass review
   misses.** Five independent angles + a sweep found two issues that none
   of the angles found alone (the EarlyStopping predicate side-effect,
   and the `_dtype_normalize` partial-float-range gap). The 1-vote
   verifier kept recall high without much false-positive cost (0/15
   verdicts came back REFUTED).

### Design Decisions

1. **Default `normalize_method='zscore'` for both 2D and 2.5D modes** —
   user directive: "should definitely be used in the web ui". Library
   raises `NotImplementedError` for zscore in 2D path mode, but the
   underlying mechanism (compute mean/std on training data, pass to
   dataset & predictor) generalises trivially. The webapp implements the
   2D stats streaming itself.
   - **Alternatives considered:** Make it a UI toggle. Match library
     (zscore for 2.5D only).
   - **Trade-offs:** Webapp behaviour now diverges from `run_pipeline`.
     Future library upgrades that change the zscore semantics will need
     a parallel webapp change.

2. **Refactor 2D inference loops to use `_predict_2d` / `_predict_2_5d`
   on the whole stack** — preserves correctness (the per-slice
   `denoise_tensor` loop bypassed overlap-tile padding) at the cost of
   per-slice Socket.IO progress. UI now shows start/end only.
   - **Alternatives considered:** Inline the padding logic in the loop;
     thread a `progress_callback` through the predictor.
   - **Why chosen:** Correctness is non-negotiable; UI degradation is
     reversible (finding #4 in the fix plan addresses it properly).

3. **Three new webapp-local divergences from upstream** (so far) — the
   `denoise_image` fix landed in this session; two more queued in the
   fix plan (`create_full_mask` square-pad; stride-fit clamp). The
   alternative was workarounds in the webapp wrappers, but the bugs are
   real in upstream too and the webapp's vendored copy is the natural
   place to fix them while we wait for upstream patches.

### Best Practices Identified

- For every library knob added by a migration, run a 4-layer audit
  *before* declaring the migration done: (1) compute site, (2) thread to
  consumers, (3) persist in checkpoint/config, (4) read back at the
  matching consumer downstream.
- When refactoring a per-element loop to a vectorised operation, audit
  every per-element side effect (progress events, logging, metadata
  emission) and decide whether each is intentional or accidental loss.
- Multi-angle reviews are worth the token cost on large migrations —
  parallel finders catch class-of-bug overlap that single-pass reviewers
  miss.

---

## 🚧 Known Issues

### Issues Created

- **15 verified findings from the code review** — see
  `docs/vision/autostructn2v_migration_fix_plan.md` for the full list.
  Highlights:
  - **Critical (1):** Stage 2 mask-pool collapse + non-square-kernel
    crash — blocks the autoStructN2V end-to-end canary.
  - **High (6):** Small-image padding underflow; `early_stopped` metric
    wrong when disabled; progress UI key-case + frozen bar; GPU memory
    leak in sequential inference; per-slice → per-stack normalization
    regression on legacy models; uint8/uint16 denorm wraparound.
  - **Medium (6):** Stage 2-only normalize_method declaration without
    `_norm_stats` recomputation; `patch_size` routed from frontend
    instead of checkpoint; `load_tiff_stack` clip removal exposes legacy
    float-TIFF inference; NaN propagation in `_norm_stats`; `std==0`
    edge case; sequential vs single-stage dtype divergence.
  - **Plausible (2):** `extract_size` divisibility validation;
    `_dtype_normalize` partial-range float skip.

### Issues Resolved

- **Black border around every denoised slice** — ✅ Fixed by patching
  `denoise_image` to mirror `_predict_2d`'s padding logic.
- **Checkerboard artefacts in N2V output** — ✅ Fixed by flipping
  `remove_top_skip=True` and `use_blurpool=True` as webapp defaults.
- **Z-score normalization completely dormant** — ✅ Fixed by adding
  `_norm_stats` computation in `training.py` and threading
  `norm_stats=` through the trainer and predictor.
- **Overlap-tile patching dormant** — ✅ Fixed by adding
  `overlap_tile_pad=4` to webapp defaults and threading
  `overlap_tile_pad=` through the predictor.

---

## 🔄 Next Steps

**Immediate Follow-up (next session):**
1. [ ] Fix finding #1 (Stage 2 mask) — unblocks the canary.
2. [ ] Fix findings #2–#8 (the rest of the High-severity items) — most are
   independent and small.
3. [ ] Re-run the autoStructN2V end-to-end canary after #1 lands.
4. [ ] Document the new webapp-local patches (3rd through 5th) in
   `pub/ASN2V/.../webapp_migration/MIGRATION_NOTES.md §1` before tagging
   `v2.0-webapp` upstream.

**Future Work:**
1. [ ] Frontend UI exposure of `normalize_method`, `overlap_tile_pad`,
   `remove_top_skip`, `use_blurpool`, `activation` so power users can
   override the webapp defaults.
2. [ ] Upstream PRs against `pub/ASN2V` for the genuinely-buggy items
   (`create_full_mask` square-pad, `denoise_image` overlap-tile, stride
   underflow) so divergence shrinks over time.
3. [ ] Consider exposing `masking_strategy=4` (CAREamics-style UPS) in the
   UI dropdown — currently form only shows 0–2.

**Deferred:**
1. [ ] Medium / plausible findings (#9–#15) — non-blocking, can land in
   follow-up commits on the same branch.
2. [ ] Hardening items flagged in the review (off-by-one slicing idiom,
   `weights_only=True` dead-code path, log_dir collision on rapid resume)
   — backlog.

---

## 🔗 Related Documentation

**Created/Updated:**
- [autoStructN2V Migration Fix Plan](../vision/autostructn2v_migration_fix_plan.md) — Created (15 findings from code review)

**Referenced Upstream:**
- `pub/ASN2V/autoStructN2V/publication/webapp_migration/MIGRATION_NOTES.md` — Migration baseline and recommended strategy
- `pub/ASN2V/autoStructN2V/publication/webapp_migration/webapp_only_patches/` — The two original webapp-local patches

**Related Sessions:**
- (None — this is the first sync of the v2.0 migration to the webapp.)

---

## 📊 Metrics

| Metric | Value |
|--------|-------|
| Time Spent | ~6 hours |
| Files Changed | 18 (15 migrated + 3 webapp wrappers) |
| Lines Added | +2234 |
| Lines Removed | −912 |
| Commits | 0 (uncommitted, on branch `migration/autostructn2v-v2.0`) |
| Issues Closed | 4 (black border, checkerboard, dormant zscore, dormant overlap-tile) |
| Issues Created | 15 (in fix plan, follow-up session) |
| Sub-agents Spawned | ~10 (Explore, 5 review angles, verifier, sweep, plus a few one-shot greps) |

---

## 🗒️ Notes

- **Branch state**: working tree is clean except for the migration changes
  and the two new docs from this session. The `n2v_parameter_recommendations.md`
  file that appeared in `git status` as untracked is unrelated to this
  session.
- **The user did *not* request a commit yet** — explicitly deferred to a
  follow-up session after the fix plan lands. Do not commit on this
  branch until the user signs off.
- **`fix_three_open_issues_plan.md` style** (Problem / Fix / File per
  issue) was the template for the findings doc. Adapted to add severity
  ranks, execution order, and a section listing items deferred as
  out-of-scope hardening.
- **Identity-model unit tests** used in this session (synthetic
  `IdentityModel` forwarded through the predictor to validate
  overlap-tile + zscore round-trips) are not checked in. Worth promoting
  to a `tests/` file in a future session — they're fast and catch the
  exact bugs that bit us this round.

---

**Navigation:**
← [Session Index](INDEX.md) | [Documentation Index](../INDEX.md) →

---

**Session Type:** Migration + Bug Fix + Investigation
**Phase Status After Session:** Migration applied + wired; one critical
follow-up before commit. End-to-end canary blocked on finding #1.
