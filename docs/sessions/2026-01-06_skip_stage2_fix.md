# DL Denoising: Skip Stage 2 Fix

**Date:** 2026-01-06
**Phase:** Bug Fix
**Duration:** ~1.5 hours
**Status:** ✅ Complete
**Complexity:** Medium

---

## 🎯 Goals

**Primary Objectives:**
- [x] Fix "Skip Stage 2" button to properly finalize training
- [x] Implement proper file cleanup when skipping Stage 2
- [x] Track Stage 1 output files in workspace metadata
- [x] Enable Step 4 (Inference) after skipping Stage 2

---

## 📝 Summary

**Accomplished:**
- ✅ Created backend endpoint `POST /api/denoising/dl/skip-stage2`
- ✅ Added `skipStage2Training()` method to DenoisingService
- ✅ Added `finalize_stage1_only` mode to Python wrapper
- ✅ Updated frontend MaskHandler to call backend API
- ✅ Files properly moved to final locations and intermediate files deleted
- ✅ Workspace metadata updated with Stage 1 files and lineage

**Key Findings:**
- The "Skip Stage 2" button previously only updated UI state without backend processing
- File cleanup/finalization happens in `finalize_training_output()` in Python, which never ran when skipping
- Solution: Spawn Python with new `finalize_stage1_only` mode to reuse existing finalization logic

---

## 📋 Detailed Log

### Task 1: Backend Endpoint & Service Method ✅

**Problem:**
No backend endpoint existed for skipping Stage 2. The frontend button only updated UI state, leaving the training session stuck in `paused_at_mask` status.

**Solution:**
1. Added `POST /api/denoising/dl/skip-stage2` endpoint in `denoising.routes.js`
2. Added `skipStage2Training()` method to `DenoisingService.js` that:
   - Creates config with experiment paths
   - Spawns Python with `--mode finalize_stage1_only`
   - Handles output via existing Socket.IO handlers

**Files Changed:**
- `src/routes/denoising.routes.js` - Added skip-stage2 endpoint (~90 lines)
- `src/services/DenoisingService.js` - Added skipStage2Training method (~125 lines)

---

### Task 2: Python Finalization Mode ✅

**Problem:**
File cleanup/finalization normally happens at the end of training via `finalize_training_output()`. When skipping Stage 2, this function never ran, leaving files in intermediate locations.

**Solution:**
Added `finalize_stage1_only` mode to Python wrapper that:
- Reuses existing `finalize_training_output()` function
- Moves Stage 1 model to `models/denoising/DL_<ID>/stage1_best_model.pth`
- Creates denoised stack in `results/denoising/DL_<ID>/asn2v_stage1_denoised_<ID>.tif`
- Copies config to `models/denoising/DL_<ID>/config.json`
- Deletes all intermediate files (experiment directory, extracted_images)
- Emits `DENOISING_RESULT:complete` with `stage2Skipped: true`

**Files Changed:**
- `python/autostructn2v_wrapper.py` - Added `finalize_stage1_only()` function (~120 lines)

---

### Task 3: Frontend Integration ✅

**Problem:**
Frontend `skipStage2()` method only updated UI without calling backend.

**Solution:**
1. Added `skipStage2()` method to `DLDenoisingAPI.js`
2. Updated `MaskHandler.skipStage2()` to call backend API
3. Updated `UIStateHandler.showAutoStructComplete()` to handle `stage2Skipped` flag

**Files Changed:**
- `public/workspace/js/modules/denoising-dl/DLDenoisingAPI.js` - Added API method
- `public/workspace/js/modules/denoising-dl/handlers/MaskHandler.js` - Updated to call backend
- `public/workspace/js/modules/denoising-dl/handlers/UIStateHandler.js` - Handle skip status

---

## 💻 Code Changes Summary

### Modified Files (6 files, +423 lines)

| File | Changes |
|------|---------|
| `src/routes/denoising.routes.js` | Added `/skip-stage2` endpoint |
| `src/services/DenoisingService.js` | Added `skipStage2Training()` method |
| `python/autostructn2v_wrapper.py` | Added `finalize_stage1_only` mode |
| `public/.../DLDenoisingAPI.js` | Added `skipStage2()` API method |
| `public/.../MaskHandler.js` | Updated `skipStage2()` to call backend |
| `public/.../UIStateHandler.js` | Handle `stage2Skipped` in completion |

---

## 🧪 Testing Performed

**Manual Testing:**
- [x] Start autoStructN2V training - ✅ Passed
- [x] Wait for mask extraction - ✅ Passed
- [x] Click "Skip Stage 2" - ✅ Passed
- [x] Verify finalization progress - ✅ Passed
- [x] Check file browser for output files - ✅ Passed
- [x] Verify intermediate files deleted - ✅ Passed
- [x] Navigate to Step 4 (Inference) - ✅ Passed

---

## 🔄 Final Directory Structure After Skip

```
workspace/
├── models/denoising/DL_<trainingId>/
│   ├── stage1_best_model.pth     ← Stage 1 model
│   └── config.json               ← Training config
│
├── results/denoising/DL_<trainingId>/
│   └── asn2v_stage1_denoised_<trainingId>.tif  ← Denoised stack
│
└── [DELETED: All intermediate experiment files]
```

---

## 🚧 Issues Resolved

- **Skip Stage 2 not working** - ✅ Fixed with proper backend finalization

---

## 📊 Metrics

| Metric | Value |
|--------|-------|
| Time Spent | ~1.5 hours |
| Files Changed | 6 files |
| Lines Added | +423 |
| Lines Removed | -14 |
| Commits | 1 |
| Issues Closed | 1 |

---

**Navigation:**
← [Session Index](INDEX.md) | [Documentation Index](../INDEX.md) →

---

**Session Type:** Bug Fix
