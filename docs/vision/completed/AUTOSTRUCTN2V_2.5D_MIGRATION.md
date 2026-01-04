# Implementation Plan: autoStructN2V 2.5D Migration

**Date**: 2026-01-03
**Status**: Planning Complete - Ready for Implementation

## Overview

Add 2.5D mode support to the DL denoising module, allowing volumetric processing with 3-slice triplet context for improved denoising of TIFF stacks.

## Workflow

**Approach**: Implement one phase at a time with manual testing verification after each phase.

- [ ] Phase 1: Python Wrapper Update
- [ ] Phase 2: Backend Routes & Services
- [ ] Phase 3: Frontend Mode Toggle
- [ ] Phase 4: Mask Visualization with Tabs
- [ ] Phase 5: Help Article & Polish

## Key Decisions

| Decision | Choice |
|----------|--------|
| Mode toggle location | Top-right of method selection section |
| Mask visualization | Tabbed slices (Z-1, Z center, Z+1) |
| Input handling | Pass TIFF stacks directly (no extraction) |
| Backward compatibility | Refactor both modes to use new unified API |
| Minimum stack depth | 20 slices |

## Technical Context

### 2D vs 2.5D Mode Differences

| Aspect | 2D Mode | 2.5D Mode |
|--------|---------|-----------|
| Input | Directory of 2D images | Single TIFF stack directly |
| Model channels | 1 → 1 | 3 → 1 (triplet → center) |
| Mask shape | (H, W) | (3, H, W) |
| Training | Patches from individual slices | Triplet patches (z-1, z, z+1) |
| Inference | Per-slice | Sliding window with triplets |
| Boundary slices | N/A | Copied from original |
| Stage 1 output | 1 channel (if N2V only) or 3 channels (if Stage 2 follows) | Same logic applies |
| Stage 2 output | Always 1 channel (center slice) | Always 1 channel (final result) |

---

## Files to Modify

### Python Backend

1. **`python/autostructn2v_wrapper.py`** (~1865 lines)
   - Update library import path to new 2.5D codebase
   - Add `mode` parameter handling throughout
   - Modify `prepare_input_directory()` to pass stack directly for 2.5D
   - Update `run_training()` to use mode-aware API
   - Update `run_inference()` for triplet-based inference in 2.5D
   - Update `extract_mask()` to use 3D mask extraction for 2.5D
   - Update `run_sequential_inference()` for 2.5D

### Node.js Backend

2. **`src/routes/denoising.routes.js`** (~1642 lines)
   - Add `mode` to configuration mapping in `/dl/start-training`
   - Pass mode through to Python wrapper config
   - Update mask result handling for 3D masks

3. **`src/services/DenoisingService.js`** (~1387 lines)
   - Pass mode through session creation and config
   - Handle 3D mask data in mask-related methods

### Frontend - Core Module

4. **`public/workspace/js/modules/denoising-dl/DLDenoisingModule.js`** (~831 lines)
   - Add `selectedMode` state variable ('2d' | '2.5d')
   - Add `onModeChange()` handler
   - Update `reset()` to reset mode
   - Update config to include mode

5. **`public/workspace/js/modules/denoising-dl/templates/Templates.js`** (~583 lines)
   - Add 2D/2.5D toggle switch in method selection section (top-right)
   - Add help icon for mode toggle

### Frontend - Handlers

6. **`public/workspace/js/modules/denoising-dl/handlers/FileHandler.js`**
   - Add stack depth validation for 2.5D mode (minimum 20 slices)
   - Update `onModeChange()` to re-validate if file already selected

7. **`public/workspace/js/modules/denoising-dl/handlers/ConfigHandler.js`**
   - Include mode in training configuration
   - Pass mode to backend API calls

8. **`public/workspace/js/modules/denoising-dl/handlers/MaskHandler.js`**
   - Update mask data handling for 3D masks
   - Update mask visualization update calls

9. **`public/workspace/js/modules/denoising-dl/handlers/TrainingHandler.js`**
   - Include mode in start training request

### Frontend - Components

10. **`public/workspace/js/modules/denoising-dl/components/MaskVisualization.js`** (~212 lines)
    - Add tabbed interface for 3 slices (Z-1, Z center, Z+1)
    - Update `setMaskData()` to detect 2D vs 3D mask
    - Add `_renderTabs()` method for slice navigation
    - Update `_renderGrid()` to render active slice
    - Add CSS for tabs

### Frontend - CSS

11. **`public/workspace/js/modules/denoising-dl/css/dl-denoising.css`**
    - Add styles for mode toggle switch
    - Add styles for mask visualization tabs
    - Add active tab styling

### Frontend - API

12. **`public/workspace/js/modules/denoising-dl/DLDenoisingAPI.js`**
    - Update method signatures to include mode parameter

### Help System

13. **`public/workspace/content/modules/denoising-dl/` (new article)**
    - Create help article explaining 2D vs 2.5D mode
    - When to use each mode
    - Benefits of 2.5D for volumetric data

---

## Implementation Phases

### Phase 1: Python Wrapper Update

**Goal**: Update the Python wrapper to use the new autoStructN2V 2.5D API

1. Update import path from `docs/autoStructN2V/codebase` to `docs/autoStructN2V_2.5D/autoStructN2V`

2. Update `run_training()`:
   ```python
   # Add mode to config
   mode = config.get('mode', '2d')

   # For 2.5D: Pass TIFF stack directly
   if mode == '2.5d':
       config['input_data'] = config.pop('input_dir')  # Stack file path

   # Use create_model_from_config for mode-aware model creation
   from autoStructN2V.models import create_model_from_config
   stage1_model = create_model_from_config(config, stage='stage1')
   ```

3. Update mask extraction for 2.5D:
   ```python
   if mode == '2.5d':
       from autoStructN2V.masking import create_full_mask_3d
       mask_3d, autocorr = extractor.extract_mask_3d(triplet_patches)
       # Return 3D mask array (3, H, W) instead of 2D
   ```

4. Update inference for 2.5D:
   ```python
   if mode == '2.5d':
       predictor = AutoStructN2VPredictor(model, patch_size, mode='2.5d')
       output = predictor.denoise_stack(input_path, output_path)
   ```

**Phase 1 Testing Steps:**

1. **Test 2D mode still works** (regression):
   ```bash
   # Run wrapper directly with 2D config
   python python/autostructn2v_wrapper.py --config test_2d_config.json --mode train
   ```
   - Verify training completes without errors
   - Check output files are created correctly

2. **Test 2.5D mode basics**:
   ```bash
   # Run wrapper with 2.5D config (use test TIFF stack)
   python python/autostructn2v_wrapper.py --config test_2.5d_config.json --mode train
   ```
   - Verify `mode: 2.5d` is recognized
   - Check TIFF stack is passed directly (no extraction to directory)
   - Verify model has correct channels (3 input for 2.5D)

3. **Test 2.5D mask extraction**:
   - Verify mask output is 3D array (3, H, W) in 2.5D mode
   - Verify mask output is 2D array (H, W) in 2D mode

4. **Test inference**:
   - Run inference in 2.5D mode and verify sliding window behavior
   - Check boundary slices (first and last) are handled correctly

### Phase 2: Backend Routes & Services

**Goal**: Pass mode parameter through the backend

1. Update `denoising.routes.js`:
   - Extract mode from request body in `/dl/start-training`
   - Add to config passed to Python wrapper
   - Handle 3D mask arrays in mask result parsing

2. Update `DenoisingService.js`:
   - Add mode to session creation
   - Pass mode through all relevant methods

**Phase 2 Testing Steps:**

1. **Test API endpoint accepts mode**:
   - Use browser DevTools or curl to call `/api/denoising/dl/start-training` with `mode: '2.5d'`
   - Verify mode is included in config passed to Python wrapper (check server logs)

2. **Test session stores mode**:
   - Start a training session and check session data includes mode
   - Verify mode persists across session requests

3. **End-to-end backend test**:
   - Start server: `npm run dev`
   - Make API call with mode parameter
   - Check Python wrapper receives correct mode value in config

### Phase 3: Frontend Mode Toggle

**Goal**: Add 2D/2.5D toggle UI

1. Update `Templates.js` - Add toggle in method selection:
   ```html
   <div class="method-selector">
     <div class="section-header">
       <h4>1. Select Denoising Method</h4>
       ${this.renderHelpIcon('denoising-dl.step1.method')}
       <div class="mode-toggle">
         <label class="toggle-switch">
           <input type="checkbox" id="mode-toggle" />
           <span class="toggle-slider"></span>
         </label>
         <span class="mode-label">2.5D</span>
         ${this.renderHelpIcon('denoising-dl.step1.mode')}
       </div>
     </div>
     <!-- existing method options -->
   </div>
   ```

2. Update `DLDenoisingModule.js`:
   - Add `selectedMode = '2d'` state
   - Add event listener for mode toggle
   - Update handlers

3. Update `FileHandler.js`:
   - Add validation for minimum 20 slices in 2.5D mode
   - Show warning/error if stack too shallow

4. Add CSS for toggle:
   ```css
   .mode-toggle {
     display: flex;
     align-items: center;
     gap: 8px;
     margin-left: auto;
   }
   .toggle-switch { /* standard toggle switch styles */ }
   ```

**Phase 3 Testing Steps:**

1. **Test toggle appears correctly**:
   - Navigate to `/workspace` → DL Denoising module
   - Verify toggle appears in top-right of method selection section
   - Verify help icon appears next to toggle

2. **Test toggle functionality**:
   - Click toggle to switch between 2D and 2.5D
   - Verify state changes (check via console: `dlDenoisingModule.selectedMode`)
   - Toggle back and verify it switches correctly

3. **Test stack depth validation** (2.5D mode):
   - Enable 2.5D mode
   - Upload/select a TIFF stack with <20 slices
   - Verify warning/error message appears
   - Upload/select a TIFF stack with ≥20 slices
   - Verify validation passes

4. **Test mode persists through workflow**:
   - Select a method (N2V or autoStructN2V)
   - Enable 2.5D mode
   - Proceed to Step 2 (Configure)
   - Verify mode is still 2.5D
   - Go back to Step 1, verify mode is still set

5. **Test 2D mode still works** (regression):
   - Keep toggle in 2D mode (default)
   - Complete full workflow (just Step 1 validation)
   - Verify no errors introduced

### Phase 4: Mask Visualization with Tabs

**Goal**: Display 3-slice mask with tabbed navigation

1. Update `MaskVisualization.js`:

   ```javascript
   class MaskVisualization {
     constructor(options) {
       // ... existing
       this.is3D = false;
       this.activeSlice = 1;  // Center slice by default
       this.sliceLabels = ['Z-1 (above)', 'Z (center)', 'Z+1 (below)'];
     }

     setMaskData(data) {
       // Detect 3D mask (array of 3 2D arrays)
       if (Array.isArray(data.mask) && data.mask.length === 3
           && Array.isArray(data.mask[0])) {
         this.is3D = true;
         this.maskData3D = data.mask;
         this.maskData = data.mask[1];  // Show center by default
       } else {
         this.is3D = false;
         this.maskData = data.mask;
       }
       // ... rest of existing logic
     }

     _renderTabs() {
       if (!this.is3D) return '';

       return `
         <div class="mask-tabs">
           ${this.sliceLabels.map((label, i) => `
             <button class="mask-tab ${i === this.activeSlice ? 'active' : ''}"
                     onclick="window.dlDenoisingModule?.maskHandler.switchMaskSlice(${i})">
               ${label}
             </button>
           `).join('')}
         </div>
       `;
     }

     switchSlice(sliceIndex) {
       this.activeSlice = sliceIndex;
       this.maskData = this.maskData3D[sliceIndex];
       this.refresh();
     }

     render() {
       // Add tabs above grid
       return `
         <div class="mask-visualization" id="${this.containerId}">
           <!-- existing header -->
           ${this._renderTabs()}
           <div class="mask-content">
             <!-- existing grid and stats -->
           </div>
         </div>
       `;
     }
   }
   ```

2. Add CSS for tabs:
   ```css
   .mask-tabs {
     display: flex;
     gap: 4px;
     margin-bottom: 12px;
   }
   .mask-tab {
     padding: 8px 16px;
     border: 1px solid var(--border-color);
     background: var(--bg-secondary);
     border-radius: 4px 4px 0 0;
     cursor: pointer;
   }
   .mask-tab.active {
     background: var(--bg-primary);
     border-bottom-color: var(--bg-primary);
   }
   ```

**Phase 4 Testing Steps:**

1. **Test 2D mask (regression)**:
   - Run autoStructN2V training in 2D mode
   - Verify mask visualization shows single grid (no tabs)
   - Verify existing mask functionality unchanged

2. **Test 3D mask with tabs**:
   - Run autoStructN2V training in 2.5D mode
   - After Stage 1 completes, verify mask section shows 3 tabs
   - Tabs should be labeled: "Z-1 (above)", "Z (center)", "Z+1 (below)"
   - Center tab (Z) should be active by default

3. **Test tab switching**:
   - Click each tab and verify grid updates
   - Verify different slices show different patterns (if mask data differs per slice)
   - Verify active tab styling changes appropriately

4. **Test mask statistics for 3D**:
   - Verify stats show correct values for the active slice
   - Check kernel size, active pixels, pattern type update when switching tabs

5. **Test approve/regenerate with 3D mask**:
   - Modify mask parameters and regenerate
   - Verify all 3 slices update
   - Approve mask and continue to Stage 2
   - Verify Stage 2 training starts correctly

### Phase 5: Help Article & Polish

**Goal**: Create documentation and finalize

1. Create help article `public/workspace/content/modules/denoising-dl/mode.md`:
   - Explain 2D vs 2.5D processing
   - When to use 2.5D (volumetric data with inter-slice correlation)
   - Minimum stack requirements (20 slices)
   - Performance considerations

2. Update handlers/ConfigHandler to pass mode

3. Test full workflow in both modes

**Phase 5 Testing Steps:**

1. **Test help article displays**:
   - Click help icon next to 2D/2.5D toggle
   - Verify help panel opens with mode explanation article
   - Verify content explains when to use each mode

2. **Full 2D end-to-end test** (regression):
   - Complete entire workflow in 2D mode:
     - Upload test data
     - Configure training
     - Run N2V or autoStructN2V training
     - View results
   - Verify identical behavior to before migration

3. **Full 2.5D end-to-end test**:
   - Complete entire workflow in 2.5D mode:
     - Upload test TIFF stack (≥20 slices)
     - Enable 2.5D toggle
     - Select method and configure
     - Run training (watch for correct triplet processing)
     - Verify 3D mask display (if autoStructN2V)
     - View denoised results
   - Verify output quality is reasonable

4. **Test dark/light mode compatibility**:
   - Switch between dark and light mode
   - Verify toggle and mask tabs look correct in both themes

5. **Cross-browser test** (optional):
   - Test in Chrome, Firefox, Safari (if available)
   - Verify toggle and tabs work in each

---

## Testing Strategy

1. **Unit Tests**: Verify mode parameter flows through all layers
2. **2D Mode Regression**: Ensure existing 2D workflow unchanged
3. **2.5D Mode E2E**: Test complete workflow with test data
4. **Mask Visualization**: Verify tabs work correctly for 3D masks
5. **Edge Cases**: Stack with exactly 20 slices, very deep stacks

## Risk Mitigation

- Keep 2D as default mode (backward compatible)
- Validate stack depth before allowing 2.5D selection
- Clear error messages for insufficient stack depth
- Graceful fallback if 2.5D library import fails

---

## Estimated Scope

| Component | Files | Complexity |
|-----------|-------|------------|
| Python wrapper | 1 | High |
| Backend routes/services | 2 | Medium |
| Frontend module/handlers | 6 | Medium |
| Mask visualization | 1 | Medium |
| CSS/styling | 1 | Low |
| Help article | 1 | Low |
| **Total** | **12 files** | |

---

## Related Documentation

- Migration Guide: `docs/autoStructN2V_2.5D/MIGRATION_GUIDE_2.5D.md`
- Module Documentation: `docs/autoStructN2V_2.5D/docs/`
- New Codebase: `docs/autoStructN2V_2.5D/autoStructN2V/`
