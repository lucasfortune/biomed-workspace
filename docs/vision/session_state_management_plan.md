# Session State Management for DL Denoising & Segmentation Modules

## Issue Summary
Both modules can include long-running training tasks. Users should be able to navigate the workspace freely during training and return to ongoing sessions. The session state system needs a comprehensive rework.

## Requirements (from user)
1. **Persistence**: Client-side only (localStorage) - survives navigate-away and page refresh
2. **Cancellation**: Add cancel button next to "Start Training" buttons on step 3
3. **Concurrency**: Only one training at a time across ALL modules
4. **Resume UX**: Prompt user to resume or start fresh (with proper cleanup if starting fresh)

---

## Implementation Status

| Phase | Description | Status |
|-------|-------------|--------|
| Phase 1 | Socket Listener Leak Fix | ✅ Complete |
| Phase 2 | Client-Side State Persistence | ✅ Complete |
| Phase 3 | Cancel Training Button & Backend | ✅ Complete |
| Phase 4 | Global Training Lock | ✅ Complete |
| Phase 5 | Resume Dialog & Cleanup | ✅ Complete |
| Bug Fixes | Chart history, epoch counter, API issues | ✅ Complete |

---

## Phase 1: Fix Socket Listener Leak (Critical Bug) ✅ COMPLETE

**Problem**: DL Denoising module doesn't clean up socket listeners on deactivate, causing memory leaks and duplicate events.

### Files Modified

| File | Change |
|------|--------|
| `public/workspace/js/modules/denoising-dl/DLDenoisingModule.js` | Added `this.progressHandler.disconnectSocket()` in `deactivate()` |
| `public/workspace/js/modules/denoising-dl/handlers/ProgressHandler.js` | Added explicit `socket.off()` for ALL event types in `disconnectSocket()` |

### Verification
- Socket listeners properly cleaned up on module deactivate
- No duplicate events on re-launch

---

## Phase 2: Client-Side State Persistence (localStorage) ✅ COMPLETE

**Goal**: Training sessions survive page refresh and navigate-away.

### Files Created

**`public/workspace/js/services/TrainingSessionPersistence.js`**
- `save(session)` - Save training session to localStorage
- `load()` - Load session from localStorage
- `clear()` - Remove from localStorage
- `clearAll()` - Clear both session and lock
- `isActive()` - Check if active training exists
- `getModuleType()` - Get which module has active training
- `acquireLock()` / `releaseLock()` - Global training lock
- `isLocked()` / `getLockOwner()` - Lock status checks

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

// Key: 'workspace_training_lock'
{
  moduleType: 'segmentation' | 'denoising-dl',
  trainingId: string,
  lockedAt: ISO timestamp
}
```

### Files Modified

| File | Change |
|------|--------|
| `public/workspace/js/modules/segmentation/SegmentationModule.js` | Save session on training start, clear on complete/error |
| `public/workspace/js/modules/denoising-dl/handlers/TrainingHandler.js` | Save session on training start, update stage on progress |
| `public/workspace/js/modules/denoising-dl/handlers/ProgressHandler.js` | Clear session on complete/error |

---

## Phase 3: Cancel Training Button & Backend ✅ COMPLETE

**Goal**: Add cancel button next to "Start Training" on step 3.

### Backend Changes

| File | Change |
|------|--------|
| `src/services/DenoisingService.js` | Added `activeProcesses` Map, `registerProcess()`, `cancelTraining()` methods |
| `src/services/TrainingService.js` | Added `activeProcesses` Map, `registerProcess()`, `cancelTraining()` methods |
| `src/routes/denoising.routes.js` | Added `POST /api/denoising/dl/cancel-training/:trainingId` endpoint |
| `src/routes/ml.routes.js` | Added `POST /cancel-training/:trainingId` endpoint |
| `src/helpers/pythonRunner.js` | Added process registration callback support |

### Frontend Changes

| File | Change |
|------|--------|
| `public/workspace/js/modules/segmentation/SegmentationModule.js` | Added cancel button, `cancelTraining()` method, API integration |
| `public/workspace/js/modules/denoising-dl/DLDenoisingModule.js` | Added cancel button in Step 3 UI |
| `public/workspace/js/modules/denoising-dl/handlers/ProgressHandler.js` | Added `cancelTraining()` method |
| `public/workspace/js/modules/segmentation/SegmentationAPI.js` | Added `cancelTraining(trainingId)` method |

---

## Phase 4: Global Training Lock ✅ COMPLETE

**Goal**: Only one training at a time across ALL modules.

### Implementation
- Lock acquisition/release integrated into TrainingSessionPersistence
- Both modules check lock before starting training
- Cross-tab sync via `window.addEventListener('storage', ...)`

### Files Modified

| File | Change |
|------|--------|
| `public/workspace/js/services/TrainingSessionPersistence.js` | Added lock methods |
| `public/workspace/js/modules/segmentation/SegmentationModule.js` | Check lock before training |
| `public/workspace/js/modules/denoising-dl/handlers/TrainingHandler.js` | Check lock before training |
| `public/workspace/js/workspace.js` | Added storage event listener for cross-tab sync |

---

## Phase 5: Resume Dialog & Cleanup ✅ COMPLETE

**Goal**: Prompt user to resume or start fresh when returning to module with active training.

### Files Created

**`public/workspace/js/core/components/ResumeDialog.js`**
- Modal dialog component
- Shows training session info (ID, start time, elapsed time)
- "Resume Training" and "Start Fresh" buttons
- Returns promise with user choice

### Resume Flow Implementation
```
Module activates
    ↓
checkForActiveSession() - Check localStorage
    ↓
If found → ResumeDialog.show()
    ↓
User chooses "Resume" → Reconnect Socket.IO, restore UI, fetch history
User chooses "Start Fresh" → Cancel training API, clear localStorage, reset UI
```

### Files Modified

| File | Change |
|------|--------|
| `public/workspace/js/modules/segmentation/SegmentationModule.js` | Added `checkForActiveSession()`, integrated ResumeDialog |
| `public/workspace/js/modules/denoising-dl/DLDenoisingModule.js` | Added `checkForActiveSession()`, integrated ResumeDialog |

---

## Additional Bug Fixes ✅ COMPLETE

### 1. Epoch 0 Chart Data Issue
**Problem**: Charts showed epoch 0 with trainLoss=0/valLoss=0 on training start.

**Files Modified**:
- `public/workspace/js/modules/segmentation/charts.js` - Added `epoch > 0` validation
- `public/workspace/js/modules/denoising-dl/handlers/ChartHandler.js` - Added `epoch > 0` validation
- `python/denoising/trainer.py` - Removed epoch 0 emission, only emit after real training

### 2. Epoch Counter Hidden on Resume
**Problem**: When status was 'unknown', `showTrainingCompleteUI()` was called which hid the epoch counter.

**Fix**: Modified 'unknown' status handling to:
- Show epoch counter with "Reconnecting..." state
- Start polling fallback
- Wait 5 seconds before determining if training is actually complete

### 3. Chart History Not Restored
**Problem**: `this.api` was undefined in SegmentationModule, causing API calls to fail.

**Fix**:
- Added `import SegmentationAPI from './SegmentationAPI.js';`
- Added `this.api = new SegmentationAPI();` in constructor
- Added `export default SegmentationAPI;` to SegmentationAPI.js

### 4. Server Restart Detection
**Problem**: After server restart, training sessions in memory are lost but localStorage still has session data.

**Fix**:
- Added server startup banner with timestamp
- Training status endpoint returns 'unknown' status for missing sessions
- Frontend handles 'unknown' status gracefully with polling fallback

---

## Critical Files Summary

### Frontend (New)
- `public/workspace/js/services/TrainingSessionPersistence.js` - localStorage persistence
- `public/workspace/js/core/components/ResumeDialog.js` - Resume/fresh dialog

### Frontend (Modified)
- `public/workspace/js/modules/denoising-dl/DLDenoisingModule.js`
- `public/workspace/js/modules/denoising-dl/handlers/ProgressHandler.js`
- `public/workspace/js/modules/denoising-dl/handlers/TrainingHandler.js`
- `public/workspace/js/modules/denoising-dl/handlers/ChartHandler.js`
- `public/workspace/js/modules/denoising-dl/handlers/UIStateHandler.js`
- `public/workspace/js/modules/denoising-dl/templates/Templates.js`
- `public/workspace/js/modules/segmentation/SegmentationModule.js`
- `public/workspace/js/modules/segmentation/SegmentationAPI.js`
- `public/workspace/js/modules/segmentation/charts.js`
- `public/workspace/js/workspace.js`

### Backend (Modified)
- `src/services/DenoisingService.js` - Process tracking, cancel method
- `src/services/TrainingService.js` - Process tracking, cancel method
- `src/routes/denoising.routes.js` - Cancel endpoint
- `src/routes/ml.routes.js` - Cancel endpoint, training status endpoint
- `src/helpers/pythonRunner.js` - Process registration callback
- `server.js` - Startup banner

### Python (Modified)
- `python/denoising/trainer.py` - Removed epoch 0 emission

---

## Known Remaining Issues

1. **DL Denoising Resume**: May need additional testing for mask pause state and stage2 resume
2. **Stale Session Detection**: No automatic cleanup of sessions with no progress for extended periods
3. **Multi-Tab Edge Cases**: Storage events work but UI sync could be improved

---

## Testing Checklist

### Segmentation Module
- [x] Start training, click "Back to Hub", resume - charts show history
- [x] Epoch counter visible during resume
- [x] Cancel button works during training
- [x] Start fresh clears localStorage and cancels backend process
- [x] Charts don't show epoch 0 data

### DL Denoising Module
- [x] Start training, click "Back to Hub", resume
- [x] Cancel button works during training
- [ ] Mask pause state resume (needs testing)
- [ ] Stage 2 resume (needs testing)

### Cross-Module
- [x] Cannot start training in one module while another is training
- [x] Lock released on training complete/cancel
- [ ] Multi-tab sync (needs testing)
