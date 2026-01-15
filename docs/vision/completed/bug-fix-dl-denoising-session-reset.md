# Bug Fix Plan: DL Denoising "Start New Analysis" Session Reset

**Bug:** After completing N2V training, clicking "start new analysis" → step 3 shows "cancel training" button instead of "start training" button.

**Priority:** 3 | **Complexity:** 2

---

## Root Cause

`ResultsHandler.startNewAnalysis()` resets module state and some UI sections, but does NOT reset the training button visibility state. When step 3 is re-entered, the buttons retain their "training in progress" state from the previous session.

**Bug sequence:**
1. Training completes → `showTrainingComplete()` sets UI to complete state
2. User clicks "Start New Analysis"
3. `startNewAnalysis()` resets charts, socket, state - but NOT button visibility
4. User navigates back to step 3
5. Buttons still show "Cancel Training" instead of "Start Denoising"

---

## Fix

Add explicit call to `showTrainingReady()` in `startNewAnalysis()` to reset button visibility.

### File: `public/workspace/js/modules/denoising-dl/handlers/ResultsHandler.js`

**Location:** `startNewAnalysis()` method (~line 242, before `this.module.reset()`)

**Add:**
```javascript
// Reset training button visibility to ready state
this.module.showTrainingReady();
```

This ensures:
- `startTrainingBtn` is visible (`display: inline-flex`)
- `cancelTrainingBtn` is hidden (`display: none`)

---

## Verification

### Test Steps:
1. Launch DL Denoising module
2. Select **N2V** method
3. Complete Steps 1-3 (run training to completion)
4. After training completes, click **"Start New Analysis"**
5. Navigate back to **Step 3**
6. **Expected:** "Start Denoising" button should be visible (not "Cancel Training")

### Additional Test:
- Repeat with **autoStructN2V** method to ensure it works for both methods

---

## Files Modified

- `public/workspace/js/modules/denoising-dl/handlers/ResultsHandler.js` (1 line addition)
