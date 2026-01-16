# Implementation Plan: Workspace Restore Progress Bar

**Issue:** File browser restore workspace upload progress bar doesn't represent actual restoration time
**Priority:** 3 | **Complexity:** 1
**Date:** 2026-01-16

---

## Problem Analysis

**Current Behavior:**
- Progress bar only tracks file upload (XHR bytes)
- Upload is fast, bar fills to 100% quickly
- Backend processing (clear, extract, update) takes longer but has no progress feedback
- User sees 100% but waits without knowing what's happening

**Desired Behavior:**
- Progress bar should reflect the entire restoration process
- Show distinct phases: Uploading → Validating → Clearing → Extracting → Updating metadata
- User always knows what's happening

---

## Solution: Socket.IO-based Progress Tracking

Use existing Socket.IO infrastructure to emit real-time progress events from backend during restoration.

### Architecture

```
Frontend                          Backend
   |                                 |
   |-- Upload ZIP via XHR ---------->|
   |   (track upload progress 0-50%) |
   |                                 |
   |<-- join room: restore-{id} -----|
   |                                 |
   |<-- restore-progress (phase 1) --|  validate
   |<-- restore-progress (phase 2) --|  clear
   |<-- restore-progress (phase 3) --|  extract
   |<-- restore-progress (phase 4) --|  metadata
   |                                 |
   |<-- restore-complete ------------|
   |                                 |
   |-- leave room: restore-{id} -----|
```

---

## Implementation Phases

### Phase 1: Backend - Add Socket.IO Progress Emission

**Files to modify:**
- `src/routes/workspace.routes.js` - Pass io instance, emit events
- `src/services/WorkspaceService.js` - Accept progressCallback, call during phases

**Changes:**

1. **workspace.routes.js** - Modify `/api/workspace/restore` endpoint (lines 268-329):
   - Accept `restoreId` from request body or generate one
   - Create progress callback that emits to Socket.IO room
   - Pass callback to `workspaceService.restoreWorkspace()`

```javascript
// In restore endpoint
const restoreId = req.body.restoreId || `restore_${Date.now()}`;
const roomName = `restore-${restoreId}`;

const emitProgress = (phase, progress, message) => {
  io.to(roomName).emit('restore-progress', {
    phase,
    progress,
    message,
    restoreId
  });
};

const result = await workspaceService.restoreWorkspace(
  sessionId,
  zipBuffer,
  fileService,
  username,
  emitProgress  // NEW: progress callback
);
```

2. **WorkspaceService.js** - Modify `restoreWorkspace()` (lines 400-479):
   - Accept optional `progressCallback` parameter
   - Call callback before each major phase

```javascript
async restoreWorkspace(sessionId, zipBuffer, fileService, username, progressCallback = null) {
  const emit = progressCallback || (() => {});

  // Phase 1: Validate
  emit('validating', 55, 'Validating workspace archive...');
  const hasMetadata = await this.validateWorkspaceZip(zipBuffer);

  // Phase 2: Clear
  emit('clearing', 65, 'Clearing existing workspace...');
  const clearResult = this.workspaceManager.clearWorkspace(sessionId);

  // Phase 3: Extract
  emit('extracting', 75, 'Extracting files...');
  await new Promise((resolve, reject) => { /* unzip */ });

  // Phase 4: Update metadata
  emit('updating', 90, 'Updating metadata...');
  const updatedMetadata = this.workspaceManager.updateMetadataSessionId(...);

  // Phase 5: Complete
  emit('complete', 100, 'Workspace restored successfully');

  return result;
}
```

---

### Phase 2: Frontend - Socket.IO Listener & UI Updates

**Files to modify:**
- `public/workspace/js/components/FileBrowser.js` - Add Socket.IO handling in `handleWorkspaceRestore()`

**Changes:**

1. **Generate restoreId** before starting upload
2. **Join Socket.IO room** using existing socket connection
3. **Listen for progress events** and update UI
4. **Modify progress tracking** to show phases:
   - Upload phase: 0-50% (XHR upload)
   - Backend phases: 55-100% (Socket.IO events)

```javascript
async handleWorkspaceRestore(zipFile) {
  // ... confirmation dialog ...

  const restoreId = `restore_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const socket = io(); // or use existing workspace socket

  // Join restore room
  socket.emit('join-restore', restoreId);

  // Listen for backend progress
  socket.on('restore-progress', (data) => {
    if (data.restoreId === restoreId) {
      progressFill.style.width = `${data.progress}%`;
      progressText.textContent = data.message;
    }
  });

  // Upload with XHR progress (0-50% range)
  const result = await this.api.restoreWorkspace(zipFile, (uploadProgress) => {
    const scaledProgress = Math.round(uploadProgress * 0.5); // 0-50%
    progressFill.style.width = `${scaledProgress}%`;
    progressText.textContent = `Uploading... ${uploadProgress}%`;
  }, restoreId);

  // Cleanup
  socket.off('restore-progress');
  socket.emit('leave-restore', restoreId);

  // ... rest of handler ...
}
```

2. **WorkspaceAPI.js** - Modify `restoreWorkspace()` to accept and send restoreId:

```javascript
async restoreWorkspace(zipFile, onProgress = null, restoreId = null) {
  // Add restoreId to FormData
  const formData = new FormData();
  formData.append('workspace', zipFile);
  if (restoreId) {
    formData.append('restoreId', restoreId);
  }
  // ... rest of method ...
}
```

---

### Phase 3: Backend Socket.IO Room Handlers

**Files to modify:**
- `src/sockets/index.js` - Add join/leave room handlers for restore

**Changes:**

```javascript
// In socket connection handler
socket.on('join-restore', (restoreId) => {
  socket.join(`restore-${restoreId}`);
});

socket.on('leave-restore', (restoreId) => {
  socket.leave(`restore-${restoreId}`);
});
```

---

## Progress Distribution

| Phase | Progress Range | Message |
|-------|----------------|---------|
| Uploading | 0-50% | "Uploading... X%" |
| Validating | 55% | "Validating workspace archive..." |
| Clearing | 65% | "Clearing existing workspace..." |
| Extracting | 75-85% | "Extracting files..." |
| Updating | 90% | "Updating metadata..." |
| Complete | 100% | "Workspace restored successfully" |

---

## Manual Testing Steps

After implementation, verify:

1. **Start restore with small ZIP (~1MB)**
   - Progress should show upload quickly (0-50%)
   - Then cycle through backend phases (55-100%)
   - Each phase message should be visible briefly

2. **Start restore with larger ZIP (~50MB)**
   - Upload progress should be visible and accurate (0-50%)
   - Backend phases should still cycle through (55-100%)

3. **Network interruption during upload**
   - Should show error notification
   - Progress bar should reset

4. **Cancel/navigate away during restore**
   - Socket should be cleaned up properly
   - No orphaned listeners

5. **Verify all phases display correctly**
   - "Uploading... X%"
   - "Validating workspace archive..."
   - "Clearing existing workspace..."
   - "Extracting files..."
   - "Updating metadata..."
   - Success notification

---

## Files Summary

| File | Changes |
|------|---------|
| `src/routes/workspace.routes.js` | Add restoreId, create emit callback, pass io |
| `src/services/WorkspaceService.js` | Accept progressCallback, emit during phases |
| `src/sockets/index.js` | Add join-restore/leave-restore handlers |
| `public/workspace/js/core/WorkspaceAPI.js` | Accept/send restoreId parameter |
| `public/workspace/js/components/FileBrowser.js` | Socket.IO room join, progress listeners |

---

## Estimated Changes

- ~30 lines in workspace.routes.js
- ~15 lines in WorkspaceService.js
- ~10 lines in sockets/index.js
- ~10 lines in WorkspaceAPI.js
- ~40 lines in FileBrowser.js

**Total: ~105 lines of code**
