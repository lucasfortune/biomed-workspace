# Loss Spike Investigation & Gradient Clipping Fix

**Date:** 2026-03-03
**Branch:** `directional_segmentation`
**Commit:** `ad4a0d3`
**Status:** ✅ Complete
**Complexity:** Medium

---

## Goals

**Primary Objectives:**
- [x] Investigate random loss spikes during segmentation training
- [x] Identify root causes
- [x] Implement a fix that reduces spikes without degrading model quality

---

## Summary

**Accomplished:**
- Thorough investigation of loss spike causes across all training modes
- Added gradient clipping (max_norm=5.0) — reduces spike severity
- Tested and rejected class weighting (both full and sqrt inverse-frequency caused overfitting)
- Fixed chart handler bug exposed by session persistence removal

**Key Findings:**
- Loss spikes are caused by unbounded gradients from outlier batches (random patches with unusual class distributions)
- Gradient clipping mitigates but doesn't eliminate spikes — Adam optimizer already recovers quickly
- Class weighting (inverse-frequency and sqrt inverse-frequency) caused severe overfitting: training metrics were excellent but validation loss/dice diverged completely
- The `directionDatasetsEnabled` flag in ChartHandler wasn't being reset when charts were destroyed, causing "datasets[2] is undefined" errors on subsequent training runs

---

## Detailed Log

### Task 1: Loss Spike Investigation

**Problem:**
Loss values during segmentation training would randomly spike from ~0.1 to ~25 (10x-100x) for a single epoch, then drop back immediately. Occurred across all training modes (2D, 2.5D, direction-aware).

**Investigation:**
Analysis of `train_model.py` identified 5 potential causes ranked by likelihood:

1. **No gradient clipping** (all modes) — training loop had no `clip_grad_norm_` between `loss.backward()` and `optimizer.step()`. Single outlier batches could produce enormous weight updates.
2. **Class imbalance** (all modes) — `nn.CrossEntropyLoss()` used without class weights. Background-heavy patches produce different gradient magnitudes than balanced ones.
3. **Data augmentation randomness** — certain augmentation combinations could create patches where model predictions are very poor.
4. **Direction-specific issues** (direction-aware mode) — unnormalized direction volumes, direction head initialization with Kaiming (wrong for L2-normalized output), empty filament batches returning disconnected tensors.
5. **No learning rate scheduling** — constant learning rate means same step size on steep early landscape and flat late landscape.

**Why spikes recover immediately:** Adam optimizer maintains exponential moving averages of gradients and squared gradients. A single spike gets dampened by the momentum from previous smooth batches.

### Task 2: Gradient Clipping Fix

**Solution:**
Added `torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=5.0)` between `loss.backward()` and `optimizer.step()` in the shared training loop.

**Result:** Spikes reduced in severity. Still present but manageable. Model quality unaffected since normal gradient norms are well below 5.0.

### Task 3: Class Weighting (Attempted & Reverted)

**Attempted:** Full inverse-frequency class weights (`1/count`) passed to `nn.CrossEntropyLoss(weight=...)` across all three modes.

**Result:** Severe overfitting — training loss and dice were excellent, but validation loss diverged completely. The aggressive weighting caused the model to over-predict rare classes.

**Second attempt:** Sqrt inverse-frequency (`1/sqrt(count)`) for moderate balancing.

**Result:** Still overfitting, though less severe. Validation scores still failed to converge.

**Decision:** Reverted class weighting entirely. Gradient clipping alone provides sufficient improvement without degrading model quality.

### Task 4: Chart Handler Bug Fix

**Problem:**
After session persistence removal, the segmentation charts threw `TypeError: can't access property "data", lossChart.data.datasets[2] is undefined` on every epoch.

**Root cause:** `ChartHandler.directionDatasetsEnabled` flag persisted as `true` across module deactivate/reactivate cycles (module instance is cached by ModuleLoader). Fresh charts had only 2 datasets, but the stale flag told `updateCharts()` to skip `enableDirectionDatasets()` and directly access `datasets[2]`.

**Fix:** Reset `chartHandler.directionDatasetsEnabled = false` in both `deactivate()` and `resetWorkflow()` when charts are destroyed.

---

## Code Changes Summary

### Modified Files (2)
- `python/train_model.py` — Added gradient clipping (`clip_grad_norm_`, max_norm=5.0) to training loop
- `public/workspace/js/modules/segmentation/SegmentationModule.js` — Reset `chartHandler.directionDatasetsEnabled` in `deactivate()` and `resetWorkflow()`

---

## Testing Performed

**Manual Testing:**
- [x] Training with gradient clipping — spikes reduced, model quality preserved
- [x] Training with full inverse-frequency weights — overfitting, reverted
- [x] Training with sqrt inverse-frequency weights — still overfitting, reverted
- [x] Chart updates during training — no more "datasets[2] is undefined" errors
- [x] Module deactivate/reactivate — charts initialize correctly on subsequent runs

---

## Lessons Learned

### Technical Insights
1. **Class weighting is dangerous with patch-based training** — random patches already have variable class distributions. Adding inverse-frequency weights amplifies this variance, causing the model to overfit on the training patches' specific distributions rather than learning generalizable features.
2. **Gradient clipping is a safe universal improvement** — doesn't change training dynamics under normal conditions, only caps extreme cases. Should be default in all training scripts.
3. **Cached module instances require careful state management** — when ModuleLoader reuses instances across activations, any handler state that depends on DOM elements (like chart datasets) must be explicitly reset.

### Design Decisions
1. **Gradient clipping max_norm=5.0** — standard default that's conservative enough to not interfere with normal training. Could be made configurable if needed.
2. **No class weighting** — for this biomedical segmentation task, the standard unweighted CrossEntropyLoss with random patch sampling provides sufficient class exposure. The natural imbalance in patches acts as implicit data augmentation.

---

## Related Documentation

**Related Sessions:**
- [Remove Session Persistence](2026-03-03_remove_session_persistence.md) — Chart handler bug was exposed by this refactor

---

## Metrics

| Metric | Value |
|--------|-------|
| Files Changed | 2 |
| Lines Added | +9 |
| Lines Removed | -1 |
| Commits | 1 |

---

**Navigation:**
← [Session Index](INDEX.md) | [Documentation Index](../INDEX.md) →

---

**Session Type:** Investigation / Bug Fix
