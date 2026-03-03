# Session: Remove Session Persistence from DL Modules

**Date:** 2026-03-03
**Branch:** `directional_segmentation`
**Commit:** `5b7c2de`

## Summary

Removed unreliable session persistence from both the Segmentation and DL Denoising modules. Replaced with exit warning dialogs, graceful shutdown, and fresh-start behavior.

## Changes

### New File
- **`ExitWarningDialog.js`** — Static utility class showing a styled modal ("Training in Progress") with Stay/Leave buttons. Returns `Promise<boolean>`. Uses design system colors (green Stay button, red Leave button).

### Infrastructure (Phase 1)
- **`ModuleLoader.js`** — Added `beforeDeactivate()` lifecycle hook. Modules can return `false` to block navigation. Checked in `load()`, `deactivate()`, and `returnToHub()`.
- **`workspace.js`** — Removed `loadGlobalServices()` method (loaded TrainingSessionPersistence/ResumeDialog). Added one-time localStorage cleanup for stale keys.

### Segmentation Module (Phase 2)
- **`SegmentationModule.js`** — Removed `checkForActiveSession()`, `resumeTrainingSession()`, `restoreChartsFromHistory()`, `showTrainingCompleteUI()`, `cleanupAndStartFresh()`. Added `beforeDeactivate()`, `_addBeforeUnloadHandler()`, `_removeBeforeUnloadHandler()`. Enhanced `deactivate()` to fully reset state.
- **`StateHandler.js`** — Gutted to empty shell (constructor only). All persistence methods removed.
- **`TrainingHandler.js`** — Removed lock checks and TrainingSessionPersistence import.
- **`FileHandler.js`** / **`ImportHandler.js`** — Removed all `stateHandler.saveState()` calls.

### DL Denoising Module (Phase 3)
- **`DLDenoisingModule.js`** — Same pattern as segmentation: removed resume methods, added `beforeDeactivate()` and beforeunload handlers, enhanced `deactivate()`.
- **`TrainingHandler.js`** — Removed lock checks, persistence calls. Now triggers beforeunload handler on training start.
- **`ProgressHandler.js`** — Removed all `TrainingSessionPersistence` calls (updateProgress, updateStage, clearAll). Replaced with beforeunload handler removal on completion/error/cancel.

### Cleanup (Phase 4)
- **Deleted** `TrainingSessionPersistence.js` and `ResumeDialog.js`
- Verified zero remaining references to deleted code

### Bug Fix
- **`validate_tiff.py`** — Redirected diagnostic print statements from stdout to stderr (was corrupting JSON output)
- **`pythonRunner.js`** — Added fallback JSON extraction for resilience against stdout pollution

## Architecture

### Before
Three layers of persistence:
1. `localStorage` via `TrainingSessionPersistence.js` (survived browser restart)
2. `StateManager` in-memory (survived module switch)
3. `ResumeDialog` UI (prompted user to resume or start fresh)

### After
- **Exit warning**: `ExitWarningDialog` shown when leaving during active training
- **Graceful shutdown**: Training cancelled if user confirms exit
- **Tab protection**: `beforeunload` event prevents accidental tab close
- **Fresh start**: Every module activation begins at step 1 with clean state

## Stats
- **15 files changed**, 410 insertions, 1,690 deletions (net -1,280 lines)
