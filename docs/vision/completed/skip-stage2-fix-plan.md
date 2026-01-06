# Implementation Plan: DL Denoising Skip Stage 2 Feature

**Issue:** DL denoising module: skipping stage 2 does not work yet
**Priority:** 3 | **Complexity:** 2
**Date:** 2026-01-06

---

## Problem Summary

The "Skip Stage 2" button exists in the frontend but only updates UI state. No backend processing occurs, leaving the training session stuck in `paused_at_mask` status. This means:
- Stage 1 model is not tracked in workspace metadata
- No result files (denoised images) are registered
- Temp files are not cleaned up
- User cannot proceed to Step 4 (Inference)

---

## Implementation Phases

### Phase 1: Backend Endpoint & Service Method

**Files to modify:**
- `/src/routes/denoising.routes.js` - Add new endpoint
- `/src/services/DenoisingService.js` - Add skip logic

**1.1 Add `POST /api/denoising/dl/skip-stage2` endpoint**

Location: After `/continue-training` endpoint (~line 1170)

```javascript
router.post('/dl/skip-stage2', requireAuth, async (req, res) => {
  const { trainingId } = req.body;

  // Validate trainingId
  // Get session, verify status === 'paused_at_mask'
  // Call denoisingService.skipStage2Training()
  // Log activity
  // Return success response
});
```

**1.2 Add `skipStage2Training()` method to DenoisingService**

Location: After `continueTraining()` method (~line 345)

```javascript
async skipStage2Training(params, io) {
  // 1. Update session status to 'completed'
  // 2. Set stage2.status = 'skipped'
  // 3. Track Stage 1 output files (model + denoised stack)
  // 4. Create lineage for tracked files
  // 5. Emit 'denoising-training-complete' event
  // 6. Clean up temp config files if any
}
```

**Testing after Phase 1:**
- Start autoStructN2V training
- Wait for mask extraction pause
- Use browser console to call: `fetch('/api/denoising/dl/skip-stage2', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({trainingId:'YOUR_ID'})})`
- Verify session status changes to 'completed'
- Check workspace metadata includes Stage 1 files

---

### Phase 2: Frontend Integration

**Files to modify:**
- `/public/workspace/js/modules/denoising-dl/DLDenoisingAPI.js` - Add API method
- `/public/workspace/js/modules/denoising-dl/handlers/MaskHandler.js` - Update skipStage2()

**2.1 Add `skipStage2()` API method**

Location: After `continueTraining()` method

```javascript
async skipStage2(trainingId) {
  const response = await fetch(`${this.baseUrl}/skip-stage2`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trainingId })
  });
  return response.json();
}
```

**2.2 Update `MaskHandler.skipStage2()` to call backend**

Replace current implementation with:
```javascript
async skipStage2() {
  // 1. Hide mask actions
  // 2. Update stage2 status to 'skipped'
  // 3. Call API: await this.module.api.skipStage2(trainingId)
  // 4. Handle success/error
  // 5. Disable mask parameter controls
  // 6. Show notification
}
```

**Testing after Phase 2:**
- Start autoStructN2V training
- Wait for mask extraction
- Click "Skip Stage 2" button
- Verify UI updates correctly
- Check workspace file browser shows Stage 1 files

---

### Phase 3: Completion Event Handling & Step 4 Navigation

**Files to modify:**
- `/public/workspace/js/modules/denoising-dl/handlers/ProgressHandler.js` - Handle skip completion
- `/public/workspace/js/modules/denoising-dl/handlers/NavigationHandler.js` - Enable Step 4

**3.1 Update `handleTrainingComplete()` for skip scenario**

The existing handler should work, but verify it:
- Correctly handles `stage2.status === 'skipped'`
- Shows appropriate completion message
- Enables navigation to Step 4

**3.2 Ensure Step 4 works with Stage 1 only**

Verify inference flow:
- Backend already falls back to Stage 1 model if Stage 2 doesn't exist
- Frontend should show "N2V (Stage 1)" in inference options

**Testing after Phase 3:**
- Complete full skip-stage2 flow
- Navigate to Step 4
- Run inference with Stage 1 model
- Verify denoised output is created

---

### Phase 4: File Tracking & Lineage

**Files to modify:**
- `/src/services/DenoisingService.js` - Ensure file tracking in skip flow

**4.1 Track these files when skipping:**
1. Stage 1 model: `models/denoising/{trainingId}/stage1/model/stage1_model.pth`
2. Stage 1 denoised stack: `models/denoising/{trainingId}/data/stage1_denoised/stage1_denoised_stack.tif`

**4.2 Create lineage:**
- Input: Original training data file
- Transformation: "N2V Denoising (Stage 1 only)"
- Output: Denoised stack

**Testing after Phase 4:**
- Skip Stage 2
- Open workspace file browser
- Verify denoised image appears in results
- Click on file, verify lineage shows correctly

---

## Critical Files

| File | Purpose |
|------|---------|
| `/src/routes/denoising.routes.js` | Add `/skip-stage2` endpoint |
| `/src/services/DenoisingService.js` | Add `skipStage2Training()` method |
| `/public/workspace/js/modules/denoising-dl/DLDenoisingAPI.js` | Add `skipStage2()` API method |
| `/public/workspace/js/modules/denoising-dl/handlers/MaskHandler.js` | Update `skipStage2()` to call backend |
| `/public/workspace/js/modules/denoising-dl/handlers/ProgressHandler.js` | Verify completion handling |

---

## Session State Transitions

```
Current Flow (broken):
  running → paused_at_mask → [user clicks skip] → STUCK

Fixed Flow:
  running → paused_at_mask → [user clicks skip] → completed (stage2.status='skipped')
```

---

## Socket.IO Events

Use existing event: `'denoising-training-complete'`

Payload for skip:
```javascript
{
  success: true,
  trainingId: '...',
  method: 'autostructn2v',
  stage2Skipped: true,  // NEW: indicate skip
  experimentDir: '...'
}
```

---

## Acceptance Criteria

1. "Skip Stage 2" button triggers backend endpoint
2. Session status transitions to 'completed' with stage2.status = 'skipped'
3. Stage 1 model tracked in workspace metadata
4. Stage 1 denoised stack tracked in workspace metadata with lineage
5. Step 4 (Inference) enabled after skipping
6. Inference uses Stage 1 model only
7. Temp files cleaned up appropriately
8. User receives clear notification of completion
