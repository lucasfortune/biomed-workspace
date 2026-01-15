# Bug Fix Plan: DL Denoising Step 4 Model Not Found

**Bug ID:** DL Denoising Step 4 Model Path Error
**Priority:** 4
**Estimated Complexity:** 2 (confirmed)
**Date:** 2026-01-15

---

## Bug Description

When using the DL Denoising module, after completing Step 3 (training), Step 4 (inference/additional processing) fails with the error:

> "stage1 model not found. Training may not be complete."

This occurs because the inference endpoint looks for the model path in the wrong location.

---

## Root Cause Analysis

### The Problem

The stage1 model path is stored in **two different locations** depending on the training flow:

1. **N2V completion:** `session.stage1.modelPath` (nested)
2. **autoStructN2V paused (mask approval):** `session.stage1ModelPath` (root level)

The Step 4 inference endpoint at `src/routes/denoising.routes.js:955` only checks the nested location:

```javascript
// Current (broken)
const modelPath = useStage === 'stage2' ? trainSession.stage2?.modelPath : trainSession.stage1?.modelPath;
```

This misses the root-level storage used during autoStructN2V's paused state.

### Storage Patterns (from DenoisingService.js)

| Event | Storage Location |
|-------|-----------------|
| N2V stage1 complete | `session.stage1.modelPath` (line 578) |
| autoStructN2V paused for mask | `session.stage1ModelPath` (line 593) |
| autoStructN2V stage2 complete | `session.stage2.modelPath` (line 589) |

---

## Implementation Plan

### Phase 1: Fix Model Path Lookup

**File:** `src/routes/denoising.routes.js`
**Location:** Lines 954-955

**Current Code:**
```javascript
const useStage = stage || (trainSession.method === 'autostructn2v' && trainSession.stage2?.modelPath ? 'stage2' : 'stage1');
const modelPath = useStage === 'stage2' ? trainSession.stage2?.modelPath : trainSession.stage1?.modelPath;
```

**Fixed Code:**
```javascript
const useStage = stage || (trainSession.method === 'autostructn2v' && trainSession.stage2?.modelPath ? 'stage2' : 'stage1');
// Check both possible locations for stage1 model path (nested and root level)
const modelPath = useStage === 'stage2'
  ? trainSession.stage2?.modelPath
  : (trainSession.stage1?.modelPath || trainSession.stage1ModelPath);
```

**Rationale:** This checks both possible storage locations for stage1 model path:
- `trainSession.stage1?.modelPath` - for completed N2V training
- `trainSession.stage1ModelPath` - for autoStructN2V paused at mask approval

---

## Manual Testing Steps

After implementing the fix:

### Test 1: N2V Method (Stage 1 only)

1. Launch DL Denoising module
2. Select **N2V** method
3. Complete Step 1 (file selection) and Step 2 (validation)
4. Complete Step 3 (training) - wait for training to finish
5. Go to Step 4 (Processing)
6. Select a file and click "Process Data"
7. **Expected:** Inference should start successfully (no model path error)

### Test 2: autoStructN2V Method (Stage 1 + Mask Approval + Stage 2)

1. Launch DL Denoising module
2. Select **autoStructN2V** method
3. Complete Step 1, Step 2, Step 3 (Stage 1 training)
4. When mask extraction completes, approve the mask
5. Wait for Stage 2 training to complete
6. Go to Step 4 (Processing)
7. Select a file and click "Process Data"
8. **Expected:** Inference should start successfully using Stage 2 model

### Test 3: autoStructN2V Method (Stage 1 only - Skip Stage 2)

1. Launch DL Denoising module
2. Select **autoStructN2V** method
3. Complete Step 1, Step 2, Step 3 (Stage 1 training)
4. When mask extraction completes, click "Skip Stage 2"
5. Go to Step 4 (Processing)
6. Select a file and click "Process Data"
7. **Expected:** Inference should start successfully using Stage 1 model

---

## Affected Files

- `src/routes/denoising.routes.js` (1 change)

---

## Risks and Considerations

- **Low risk:** Single line change with fallback logic
- **No breaking changes:** The fix adds a fallback, doesn't change existing working paths
- **Backward compatible:** Stage2 path lookup remains unchanged
