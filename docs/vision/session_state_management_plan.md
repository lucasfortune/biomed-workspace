# Session State Management for DL Denoising & Segmentation Modules

## Issue Summary
Both modules can include long-running training tasks. Users should be able to navigate the workspace freely during training and return to ongoing sessions. The session state system needs a comprehensive rework.

## Requirements (from user)
1. **Persistence**: Client-side only (localStorage) - survives navigate-away and page refresh
2. **Cancellation**: Add cancel button next to "Start Training" buttons on step 3
3. **Concurrency**: Only one training at a time across ALL modules
4. **Resume UX**: Prompt user to resume or start fresh (with proper cleanup if starting fresh)

---

## Phase 1: Fix Socket Listener Leak (Critical Bug)

**Problem**: DL Denoising module doesn't clean up socket listeners on deactivate, causing memory leaks and duplicate events.

### Files to Modify

| File | Change |
|------|--------|
| `public/workspace/js/modules/denoising-dl/DLDenoisingModule.js` | Add `this.progressHandler.disconnectSocket()` in `deactivate()` |
| `public/workspace/js/modules/denoising-dl/handlers/ProgressHandler.js` | Add explicit `socket.off()` for ALL event types in `disconnectSocket()` |

### Testing Steps
1. Launch DL Denoising module, start training
2. Click "Back to Hub" while training
3. Re-launch DL Denoising module
4. Check DevTools Console - should NOT see duplicate socket events

---

## Phase 2: Client-Side State Persistence (localStorage)

**Goal**: Training sessions survive page refresh and navigate-away.

### New File to Create

**`public/workspace/js/services/TrainingSessionPersistence.js`**
```javascript
class TrainingSessionPersistence {
  static STORAGE_KEY = 'workspace_active_training';

  static save(session) { /* save to localStorage */ }
  static load() { /* load from localStorage */ }
  static clear() { /* remove from localStorage */ }
  static isActive() { /* check if active training exists */ }
  static getModuleType() { /* get which module has active training */ }
}
```

### localStorage Data Structure
```javascript
// Key: 'workspace_active_training'
{
  moduleType: 'segmentation' | 'denoising-dl',
  trainingId: string,
  startedAt: ISO timestamp,
  stage: 'training' | 'paused_at_mask' | 'stage2',
  config: { ... },
  status: 'running' | 'paused',
  lastProgressAt: ISO timestamp
}
```

### Files to Modify

| File | Change |
|------|--------|
| `public/workspace/js/modules/segmentation/SegmentationModule.js` | Save session on training start, clear on complete/error |
| `public/workspace/js/modules/denoising-dl/handlers/TrainingHandler.js` | Save session on training start, update stage on progress |
| `public/workspace/js/modules/denoising-dl/handlers/ProgressHandler.js` | Clear session on complete/error |

### Testing Steps
1. Start training in Segmentation module
2. While training, refresh page (F5)
3. Module should detect active training via localStorage
4. Let training complete - verify localStorage cleared

---

## Phase 3: Cancel Training Button & Backend

**Goal**: Add cancel button next to "Start Training" on step 3.

### Backend Changes

| File | Change |
|------|--------|
| `src/services/DenoisingService.js` | Add `activeProcesses` Map, store process refs, add `cancelTraining()` method |
| `src/services/TrainingService.js` | Same pattern - track processes, add cancel method |
| `src/routes/denoising.routes.js` | Add `POST /api/denoising/dl/cancel-training/:trainingId` |
| `src/routes/ml.routes.js` | Add `POST /api/ml/cancel-training/:trainingId` |

### Frontend Changes

| File | Change |
|------|--------|
| `public/workspace/js/modules/segmentation/SegmentationModule.js` | Add cancel button HTML, wire up API call, clear localStorage |
| `public/workspace/js/modules/denoising-dl/DLDenoisingModule.js` | Add cancel button in Step 3 UI |
| `public/workspace/js/modules/denoising-dl/handlers/ProgressHandler.js` | Add `cancelTraining()` method |

### UI Layout (Step 3)
```html
<div class="training-actions">
  <button id="startTrainingBtn" class="btn btn-primary">Start Training</button>
  <button id="cancelTrainingBtn" class="btn btn-danger" style="display: none;">Cancel Training</button>
</div>
```

### Testing Steps
1. Start training in Segmentation module
2. Click "Cancel Training" button
3. Verify Python process killed (`ps aux | grep python`)
4. Verify UI resets, localStorage cleared
5. Repeat for DL Denoising module

---

## Phase 4: Global Training Lock

**Goal**: Only one training at a time across ALL modules.

### localStorage Lock Structure
```javascript
// Key: 'workspace_training_lock'
{
  moduleType: 'segmentation' | 'denoising-dl',
  trainingId: string,
  lockedAt: ISO timestamp
}
```

### Files to Modify

| File | Change |
|------|--------|
| `public/workspace/js/services/TrainingSessionPersistence.js` | Add `acquireLock()`, `releaseLock()`, `isLocked()`, `getLockOwner()` methods |
| `public/workspace/js/modules/segmentation/SegmentationModule.js` | Check lock before training, show error if locked by another module |
| `public/workspace/js/modules/denoising-dl/handlers/TrainingHandler.js` | Same lock checking |

### Cross-Tab Sync
Add `window.addEventListener('storage', ...)` for multi-tab awareness.

### Testing Steps
1. Start training in Segmentation module
2. Switch to DL Denoising module
3. Try to start training - should show error "Training already in progress in Segmentation"
4. Cancel Segmentation training
5. DL Denoising training should now work
6. Test with multiple browser tabs

---

## Phase 5: Resume Dialog & Cleanup

**Goal**: Prompt user to resume or start fresh when returning to module with active training.

### New File to Create

**`public/workspace/js/core/components/ResumeDialog.js`**
```javascript
class ResumeDialog {
  static show(options) {
    // options: { moduleType, trainingId, startedAt, onResume, onStartFresh }
    // Returns promise: 'resume' | 'fresh'
  }
}
```

### Files to Modify

| File | Change |
|------|--------|
| `public/workspace/js/modules/segmentation/SegmentationModule.js` | In `checkForResume()`, show dialog, handle resume/fresh choice |
| `public/workspace/js/modules/denoising-dl/handlers/NavigationHandler.js` | In `checkTrainingStatus()`, integrate dialog, handle mask pause state |

### Resume Flow
```
Module activates
    ↓
Check localStorage for active training
    ↓
If found → Show ResumeDialog
    ↓
User chooses "Resume" → Reconnect to Socket.IO, restore UI
User chooses "Start Fresh" → Cancel training API, clear localStorage, reset UI
```

### Edge Cases
- **Browser close**: Check backend status on next visit
- **Multiple tabs**: Use storage events for sync
- **Stale sessions**: Detect no progress for 10+ minutes, offer force reset

### Testing Steps
1. Start training, close browser tab
2. Open new tab, go to workspace
3. Launch same module
4. Verify Resume dialog appears
5. Test "Resume" - verify reconnection works
6. Test "Start Fresh" - verify cleanup (process killed, localStorage cleared)

---

## Implementation Order

```
Phase 1 (Socket Leak Fix) ─── Independent, do first
         │
         ▼
Phase 2 (localStorage) ────── Foundation for phases 3-5
         │
         ▼
Phase 3 (Cancel Button) ───── Requires Phase 2
         │
         ▼
Phase 4 (Global Lock) ─────── Builds on Phase 2
         │
         ▼
Phase 5 (Resume Dialog) ───── Requires all previous
```

---

## Critical Files Summary

### Frontend
- `public/workspace/js/modules/denoising-dl/DLDenoisingModule.js`
- `public/workspace/js/modules/denoising-dl/handlers/ProgressHandler.js`
- `public/workspace/js/modules/denoising-dl/handlers/TrainingHandler.js`
- `public/workspace/js/modules/denoising-dl/handlers/NavigationHandler.js`
- `public/workspace/js/modules/segmentation/SegmentationModule.js`
- `public/workspace/js/services/TrainingSessionPersistence.js` (new)
- `public/workspace/js/core/components/ResumeDialog.js` (new)

### Backend
- `src/services/DenoisingService.js`
- `src/services/TrainingService.js`
- `src/routes/denoising.routes.js`
- `src/routes/ml.routes.js`
