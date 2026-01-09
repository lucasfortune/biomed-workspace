# SegmentationModule.js Refactoring Plan

**Issue:** Segmentation module file is too large (2893 lines, 105KB)
**Goal:** Split into smaller, manageable files matching DL denoising module pattern
**Approach:** Create handlers/ and templates/ directories, convert to ES6 class pattern

---

## Current State

**SegmentationModule.js:** 2893 lines
**Existing helpers (global function pattern):**
- training.js (238 lines) - Training flow
- inference.js (389 lines) - Inference flow
- navigation.js (435 lines) - Step navigation
- charts.js (65 lines) - Chart utilities
- utils.js (180 lines) - Helper functions

**Total:** ~4200 lines across 6 files

---

## Target Structure

```
modules/segmentation/
├── SegmentationModule.js    (~400-500 lines - core lifecycle only)
├── SegmentationAPI.js       (existing - no change)
├── handlers/
│   ├── TrainingHandler.js   (from training.js, converted to class)
│   ├── InferenceHandler.js  (from inference.js, converted to class)
│   ├── NavigationHandler.js (from navigation.js, converted to class)
│   ├── ChartHandler.js      (from charts.js, converted to class)
│   ├── FileHandler.js       (extracted from SegmentationModule.js)
│   ├── ImportHandler.js     (extracted from SegmentationModule.js)
│   ├── StateHandler.js      (extracted from SegmentationModule.js)
│   └── utils.js             (from utils.js, keep as utility functions)
├── templates/
│   └── Templates.js         (extracted render() HTML)
├── components/              (existing - no change)
└── css/                     (existing - no change)
```

---

## Implementation Phases

### Phase 1: Create Directory Structure & Move Existing Files
**Files changed:** File moves only, no code changes yet

1. Create `handlers/` directory
2. Create `templates/` directory
3. Move existing files to handlers/ (keep originals temporarily):
   - training.js → handlers/TrainingHandler.js
   - inference.js → handlers/InferenceHandler.js
   - navigation.js → handlers/NavigationHandler.js
   - charts.js → handlers/ChartHandler.js
   - utils.js → handlers/utils.js

**Testing:** App should still work (files just copied, originals intact)

### Phase 2: Extract Templates
**Files changed:** templates/Templates.js (new), SegmentationModule.js (modified)

1. Create `templates/Templates.js` with render methods
2. Extract `renderHelpIcon()` method
3. Extract main HTML from `render()` method (~280 lines)
4. Update SegmentationModule.js to import and use Templates

**Testing:**
- Launch segmentation module
- Verify all 4 steps render correctly
- Verify help icons work

### Phase 3: Convert TrainingHandler to Class
**Files changed:** handlers/TrainingHandler.js

1. Convert global functions to ES6 class:
   - `startTraining()` → class method
   - `updateTrainingProgress()` → class method
   - `onTrainingComplete()` → class method
   - `startTrainingPolling()` → class method
   - `validateConfiguration()` → class method
2. Replace `window.segmentationModule` with `this.module`
3. Update SegmentationModule.js to instantiate handler

**Testing:**
- Start training with test data (2 epochs)
- Verify progress updates
- Verify completion badge updates
- Verify charts update

### Phase 4: Convert InferenceHandler to Class
**Files changed:** handlers/InferenceHandler.js

1. Convert global functions to ES6 class:
   - `runInference()` → class method
   - `updateInferenceProgress()` → class method
   - `onInferenceComplete()` → class method
2. Replace `window.segmentationModule` with `this.module`
3. Update SegmentationModule.js to instantiate handler

**Testing:**
- Complete training or import model
- Run inference on test data
- Verify progress updates
- Verify results display

### Phase 5: Convert NavigationHandler to Class
**Files changed:** handlers/NavigationHandler.js

1. Convert global functions to ES6 class:
   - `goToStep()` → class method (if not in module)
   - `updateNavigationButtons()` → class method
   - `markStepCompleted()` → class method
   - `updateStepStates()` → class method
2. Update SegmentationModule.js to use handler

**Testing:**
- Navigate between all 4 steps
- Verify step completion states
- Verify navigation buttons enable/disable correctly

### Phase 6: Convert ChartHandler to Class
**Files changed:** handlers/ChartHandler.js

1. Convert to ES6 class:
   - `initializeCharts()` → class method
   - Chart update utilities
2. Update SegmentationModule.js to use handler

**Testing:**
- Verify charts initialize on step 3
- Verify chart updates during training

### Phase 7: Extract FileHandler
**Files changed:** handlers/FileHandler.js (new), SegmentationModule.js (reduced)

Extract from SegmentationModule.js (~400 lines):
- `initializeFileSelectors()` (~65 lines)
- `onFileSelected()` (~40 lines)
- `onFileUploaded()` (~55 lines)
- `loadTestData()` (~50 lines)
- `validateUploadedFiles()` (~70 lines)
- `loadTestInferenceData()` (~50 lines)
- `validateInferenceFile()` (~55 lines)
- `displayValidationResults()` (~35 lines)
- `displayValidationError()` (~25 lines)

**Testing:**
- Upload custom training data
- Use test data
- Verify validation messages
- Upload inference data

### Phase 8: Extract ImportHandler
**Files changed:** handlers/ImportHandler.js (new), SegmentationModule.js (reduced)

Extract from SegmentationModule.js (~260 lines):
- `initializeImportSelectors()` (~70 lines)
- `renderImportSectionContent()` (~10 lines)
- `filterRecentResultsForConfig()` (~10 lines)
- `filterRecentResultsForModel()` (~10 lines)
- `onImportFileSelected()` (~50 lines)
- `updateImportValidationDisplay()` (~25 lines)
- `checkOverallImportValidation()` (~40 lines)
- `storeImportedModelInSession()` (~30 lines)

**Testing:**
- Import model workflow
- Verify file selection
- Verify validation
- Proceed to inference with imported model

### Phase 9: Extract StateHandler
**Files changed:** handlers/StateHandler.js (new), SegmentationModule.js (reduced)

Extract from SegmentationModule.js (~160 lines):
- `saveState()` (~50 lines)
- `checkForResume()` (~100 lines)
- `restoreStep1UI()` (~30 lines)
- `restoreTrainingUI()` (~40 lines)
- `restoreInferenceUI()` (~20 lines)

**Testing:**
- Start training, navigate away, return
- Verify state restoration
- Verify resume dialog

### Phase 10: Cleanup & Final Testing
**Files changed:** Remove old files, update all imports

1. Delete original helper files (training.js, inference.js, etc.)
2. Final review of SegmentationModule.js (target: ~400-500 lines)
3. Update any remaining imports

**Full Testing Checklist:**
- [ ] Launch module from hub
- [ ] Upload training data (custom)
- [ ] Use test data
- [ ] Configure training
- [ ] Run training (2 epochs)
- [ ] Verify charts and progress
- [ ] Run inference
- [ ] Import model workflow
- [ ] Navigate between steps
- [ ] State persistence (navigate away and back)
- [ ] Resume dialog
- [ ] Cancel training
- [ ] Reset workflow

---

## Handler Class Pattern

Each handler follows this pattern (matching DL denoising):

```javascript
/**
 * HandlerName.js - Description
 */

class HandlerName {
  /**
   * @param {SegmentationModule} module - Reference to parent module
   */
  constructor(module) {
    this.module = module;
  }

  // Methods converted from global functions
  async someMethod() {
    // Use this.module instead of window.segmentationModule
    const files = this.module.uploadedFiles;
    this.module.state.notify('info', 'Message');
  }
}

export default HandlerName;
```

---

## Risk Mitigation

1. **Keep backups:** Original files preserved until phase 10
2. **Incremental testing:** Test after each phase
3. **No functionality changes:** Pure refactoring only
4. **Rollback path:** Git commits after each phase

---

## Success Criteria

- [ ] SegmentationModule.js reduced to ~400-500 lines
- [ ] All handlers follow ES6 class pattern
- [ ] Templates extracted to separate file
- [ ] All existing functionality preserved
- [ ] Manual testing checklist passes
