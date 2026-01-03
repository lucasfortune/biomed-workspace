# autoStructN2V 2.5D Mode Implementation

**Date:** 2026-01-04
**Phase:** Phase 4 - Module Enhancement
**Duration:** ~6 hours (continued from previous session)
**Status:** ✅ Complete
**Complexity:** High

---

## 🎯 Goals

Add 2.5D volumetric processing mode to the DL denoising module, enabling triplet-based (z-1, z, z+1) denoising for TIFF stacks with inter-slice context.

**Primary Objectives:**
- [x] Update Python wrapper for 2.5D mode support
- [x] Add backend route handling for mode parameter
- [x] Create frontend 2D/2.5D toggle switch
- [x] Implement tabbed 3D mask visualization for autoStructN2V
- [x] Create comprehensive help article for 2.5D mode

**Secondary Objectives:**
- [x] Fix all 2.5D-specific bugs discovered during testing
- [x] Ensure backward compatibility with 2D mode
- [x] Update cross-links in existing help articles

---

## 📝 Summary

**Accomplished:**
- ✅ Full 2.5D mode support in autoStructN2V and N2V methods
- ✅ 2D/2.5D toggle switch in method selection section
- ✅ Tabbed mask visualization for 3D masks (Z-1, Z center, Z+1)
- ✅ Minimum stack depth validation (20 slices for 2.5D)
- ✅ Comprehensive help article with glossary terms
- ✅ Fixed 14 bugs discovered during testing

**Key Technical Decisions:**
- 2.5D uses triplet input (3 channels) to predict center slice (1 channel)
- Stage 1 with run_stage2=True outputs 3 channels for autocorrelation analysis
- 3D mask shape is (3, H, W) with tabs for each slice
- Boundary slices (first/last) are copied from original (no triplet context)
- Original bit depth preserved in output (8-bit or 16-bit)

**Blockers Encountered:**
- ❌ Stack normalization issues - Fixed dtype handling
- ❌ Stage 2 shape mismatch (1ch vs 3ch) - Fixed loss calculation
- ❌ Model loading wrong channels - Fixed with create_model_from_config
- ❌ 2D mode regression in Stage 2 - Fixed input_dir validation
- ❌ N2V 2.5D log_test_images error - Extended skip logic

---

## 📋 Detailed Log

### Phase 1: Python Wrapper Update ✅

**Changes to `python/autostructn2v_wrapper.py`:**

1. **Import path update** - Changed from `autoStructN2V` to `autoStructN2V_2.5D/autoStructN2V`

2. **Mode-aware model creation**
   - Uses `create_model_from_config()` for proper channel handling
   - 2.5D: 3 input channels, 1 or 3 output channels depending on stage

3. **Stack normalization**
   - Added `convert_to_original_dtype()` helper function
   - Stores `original_stack_dtype` when loading
   - Preserves 8-bit/16-bit in output

4. **2.5D-specific training**
   - `calculate_loss()` override extracts center slice from 3-channel target
   - Skip `log_test_images` for channel mismatches

5. **2.5D inference**
   - Uses `_predict_2_5d()` with sliding window triplets
   - Boundary slices copied from original

---

### Phase 2: Backend Routes & Services ✅

**Changes to `src/routes/denoising.routes.js`:**
- Extract mode from request body in `/dl/start-training`
- Pass mode through to Python wrapper config
- Handle 3D mask arrays in mask result parsing
- Track `inputFileId` for lineage

**Changes to `src/services/DenoisingService.js`:**
- Store mode and inputFileId in session
- Updated `_trackOutputFiles` with proper lineage format

---

### Phase 3: Frontend Mode Toggle ✅

**Changes to Templates.js:**
```html
<div class="mode-toggle-container">
  <span class="mode-label mode-label-left active">2D</span>
  <label class="mode-toggle-switch">
    <input type="checkbox" id="mode-toggle">
    <span class="mode-toggle-slider"></span>
  </label>
  <span class="mode-label mode-label-right">2.5D</span>
  ${this.renderHelpIcon('denoising-dl.step1.mode')}
</div>
```

**Changes to DLDenoisingModule.js:**
- Added `selectedMode` state ('2d' | '2.5d')
- `onModeChange()` handler with visual feedback
- Reset mode on module reset

**Changes to FileHandler.js:**
- Minimum 20 slices validation for 2.5D
- Re-validation on mode change

---

### Phase 4: Mask Visualization with Tabs ✅

**Changes to MaskVisualization.js:**
- Detect 3D mask (array of 3 2D arrays)
- Added `_renderTabs()` for Z-1/Z center/Z+1 navigation
- `switchSlice()` method for tab switching
- Active tab styling

**Changes to MaskHandler.js:**
- Handle 3D mask data conversion
- Call `switchMaskSlice()` from global scope

---

### Phase 5: Help Article & Cross-Links ✅

**New Article (`denoising-dl.step1.mode`):**
- Full explanation of 2D vs 2.5D modes
- Requirements (minimum 20 slices)
- How triplet processing works
- autoStructN2V 3D mask handling

**Updated Cross-Links:**
- Main `denoising-dl` article
- `denoising-dl.step1.method`
- `denoising-dl.autostructn2v-detail`
- `denoising-dl.step1.input`
- `denoising-dl.step3.n2v`
- `denoising-dl.step3.autostructn2v`

**New Glossary Terms:**
- 2.5D Processing
- Triplet (2.5D)

---

## 🐛 Bug Fixes (14 total)

### Critical Bugs Fixed

| Bug | Root Cause | Fix |
|-----|------------|-----|
| Stack normalization | Float64 data passed without normalization | Added proper 0-1 range normalization |
| denoise_stack path | Using stack_path instead of predictor path | Fixed path reference |
| split_ratio parsing | JSON string "(0.7, 0.15, 0.15)" not tuple | Used `ast.literal_eval()` |
| Stage 2 shape mismatch | pred [B,1,H,W] vs target [B,3,H,W] | Override `calculate_loss()` to extract center |
| Stage 2 model loading | `create_model()` defaulted to 1 input | Use `create_model_from_config()` |
| 2.5D result tracking | Files not saved/tracked | Updated `finalize_training_output` for stacks |
| stage1_denoised_stack_path | Missing from results dict | Added to `run_stage2_only` |
| Processing history | Showed "original upload" | Updated lineage format with `inputs` array |
| Output bit depth | 32-bit float instead of 8-bit | Added `convert_to_original_dtype()` |
| 2D Stage 2 input_dir | Pointed to file instead of directory | Set to data directory |
| N2V 2.5D log_test_images | Channel mismatch (3→1) | Extended skip logic |

---

## 💻 Code Changes Summary

### Files Modified (8)

| File | Changes |
|------|---------|
| `python/autostructn2v_wrapper.py` | ~500 lines - Mode support, 2.5D training/inference, bug fixes |
| `src/routes/denoising.routes.js` | Mode parameter handling, inputFileId tracking |
| `src/services/DenoisingService.js` | Session mode storage, lineage format |
| `public/.../templates/Templates.js` | Mode toggle HTML |
| `public/.../DLDenoisingModule.js` | Mode state and handlers |
| `public/.../handlers/FileHandler.js` | Stack depth validation |
| `public/.../handlers/MaskHandler.js` | 3D mask handling |
| `public/.../components/MaskVisualization.js` | Tabbed 3D mask display |
| `public/.../css/dl-denoising.css` | Toggle and tab styles |
| `public/.../content/modules/denoising-dl.json` | 2.5D help article |

### Commits Made (4)

1. `feat: Add 2.5D mode support to DL denoising module (Phases 1-3)`
2. `fix: Resolve multiple 2.5D mode bugs in DL denoising module`
3. `fix: Resolve 2D/2.5D mode regressions in DL denoising Stage 2`
4. `docs: Add 2.5D mode help article and update cross-links`

---

## 🧪 Testing Performed

**Manual Testing:**
- [x] 2D N2V training - ✅ Passed
- [x] 2D autoStructN2V training - ✅ Passed
- [x] 2.5D N2V training - ✅ Passed
- [x] 2.5D autoStructN2V training - ✅ Passed
- [x] Mode toggle UI - ✅ Passed
- [x] Stack depth validation - ✅ Passed
- [x] 3D mask visualization tabs - ✅ Passed
- [x] Mask regeneration in 2.5D - ✅ Passed
- [x] Result file tracking - ✅ Passed
- [x] Output bit depth preservation - ✅ Passed
- [x] Help icon linking - ✅ Passed

---

## 📊 Metrics

| Metric | Value |
|--------|-------|
| Time Spent | ~6 hours |
| Files Changed | 10 files |
| Lines Added | ~800+ |
| Lines Removed | ~50 |
| Commits | 4 |
| Bugs Fixed | 14 |
| Help Articles Added | 1 |
| Glossary Terms Added | 2 |

---

## 🔗 Related Documentation

**Plan File:**
- `/home/lucas/.claude/plans/floating-sparking-crab.md`

**Library Documentation:**
- `docs/autoStructN2V_2.5D/autoStructN2V/CLAUDE.md` - 2.5D mode implementation details

**Related Sessions:**
- [2025-12-25_filter_denoising_module.md](2025-12-25_filter_denoising_module.md) - Filter denoising
- [2026-01-01_info_panel_implementation.md](2026-01-01_info_panel_implementation.md) - Help system

---

## 🗒️ Notes

### Key Technical Details

1. **Model Channel Configuration (2.5D):**
   - Stage 1 with run_stage2=True: 3 in → 3 out (for autocorrelation)
   - Stage 1 with run_stage2=False (N2V): 3 in → 1 out
   - Stage 2: 3 in → 1 out

2. **3D Mask Structure:**
   - Shape: (3, H, W) for Z-1, Z center, Z+1
   - Full mask has True pixels in all 3 slices
   - Prediction kernel has True only in center slice

3. **Boundary Handling:**
   - First and last slices copied from original
   - No triplet context available at boundaries

4. **Lineage Tracking Format:**
   ```javascript
   {
     processType: 'dl-denoising',
     inputs: [inputFileId],
     processedAt: timestamp,
     processId: trainingId
   }
   ```

---

**Navigation:**
← [Session Index](INDEX.md) | [Documentation Index](../INDEX.md) →

---

**Session Type:** Feature + Bug Fix
**Phase Status After Session:** Complete
