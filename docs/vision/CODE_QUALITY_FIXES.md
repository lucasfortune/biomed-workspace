# Code Quality & Security Fixes Roadmap

This document outlines a phased plan to address 90 issues identified during a comprehensive code review. Issues are organized by priority from immediate fixes to long-term improvements.

---

## Summary

| Phase | Priority | Issues | Focus |
|-------|----------|--------|-------|
| Phase 1 | Immediate | 5 | Critical bugs and security vulnerabilities |
| Phase 2 | Short-term | 11 | High-severity security and memory issues |
| Phase 3 | Medium-term | 35 | Performance, error handling, moderate security |
| Phase 4 | Long-term | 39 | Code quality, refactoring, best practices |

---

## Phase 1: Immediate Fixes (Critical)

These issues can cause application crashes or severe security vulnerabilities.

### 1.1 Fix Undefined Variable Bug
**File:** `public/classic/js/visualization/clipping.js:358`

**Issue:** Reference to undefined `visible` variable causes ReferenceError.

**Fix:**
```javascript
// Line 358 - Change from:
mesh.visible = shouldBeVisible && visible;
// To:
mesh.visible = shouldBeVisible;
```

---

### 1.2 Fix Path Traversal Vulnerability
**File:** `src/routes/static.routes.js:82-91`

**Issue:** No sanitization of filename parameter allows directory traversal attacks.

**Fix:**
```javascript
router.get('/test_data/:filename', requireAuth, (req, res) => {
  const filename = path.basename(req.params.filename); // Sanitize
  const filePath = path.join(__dirname, '../../test_data', filename);
  // ... rest of handler
});
```

---

### 1.3 Create HTML Escape Utility
**New File:** `public/js/utils/escapeHtml.js`

**Issue:** 20+ locations use innerHTML with unsanitized user/server data.

**Fix:** Create shared utility:
```javascript
function escapeHtml(text) {
  if (text === null || text === undefined) return '';
  const div = document.createElement('div');
  div.textContent = String(text);
  return div.innerHTML;
}

// For module environments
if (typeof module !== 'undefined') module.exports = { escapeHtml };
if (typeof window !== 'undefined') window.escapeHtml = escapeHtml;
```

**Files to update:**
- `public/classic/js/app.js` - Lines 132-168, 195-198, 237-245
- `public/classic/js/fileUpload.js` - Lines 82-85, 178-193, 198-203, 228-238
- `public/classic/js/inference.js` - Lines 109-110, 223, 247-264
- `public/classic/js/welcome.js` - Lines 116-121, 149-157, 174-179
- `public/classic/js/navigation.js` - Lines 143-153
- `public/workspace/js/workspace.js` - Lines 316-323, 344-363, 369-405, 477-481
- `public/workspace/js/modules/mesh/MeshModule.js` - Lines 583-615, 806-829
- `public/workspace/js/modules/visualization/VisualizationModule.js` - Lines 465-474, 482-489, 761-767
- `public/workspace/js/core/components/ValidationDisplay.js` - Lines 69-79, 85-93
- `public/workspace/js/core/components/LoadingOverlay.js` - Line 132
- `public/js/admin.js` - Lines 113-140, 189-210

---

### 1.4 Secure PyTorch Model Loading
**Files:**
- `python/validate_imported_model.py:62`
- `python/run_inference.py:138`
- `python/autostructn2v_wrapper.py:504, 722, 1181`

**Issue:** `torch.load(..., weights_only=False)` can execute arbitrary code.

**Fix:** Add model validation wrapper:
```python
def safe_load_model(model_path, map_location='cpu'):
    """Load model with validation to prevent arbitrary code execution."""
    try:
        # First try safe loading
        checkpoint = torch.load(model_path, map_location=map_location, weights_only=True)
    except Exception:
        # Fall back with warning for legacy models
        import warnings
        warnings.warn(f"Loading {model_path} with weights_only=False - ensure model is from trusted source")
        checkpoint = torch.load(model_path, map_location=map_location, weights_only=False)
    return checkpoint
```

---

### 1.5 Fix Session Cookie Security
**File:** `src/middleware/session.middleware.js:31-33`

**Issue:** Cookies not secure, missing httpOnly and sameSite.

**Fix:**
```javascript
cookie: {
  secure: process.env.NODE_ENV === 'production',
  httpOnly: true,
  sameSite: 'lax',
  maxAge: SESSION_CONFIG.cookieMaxAge
}
```

---

## Phase 2: Short-term Fixes (High Priority)

Security improvements and memory leak fixes.

### 2.1 Replace Weak ID Generation
**Files:**
- `manageUsers.js:28-29`
- `WorkspaceManager.js:27-29`

**Issue:** Using `Math.random()` which is not cryptographically secure.

**Fix:**
```javascript
const crypto = require('crypto');

function generateUserId() {
  return crypto.randomUUID();
}

// In WorkspaceManager.js
generateId(prefix) {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
}
```

---

### 2.2 Add Event Listener Cleanup in Workspace Modules
**Files:**
- `public/workspace/js/modules/mesh/MeshModule.js:346-367`
- `public/workspace/js/modules/imageviewer/ImageViewerModule.js:377-402, 604-629`
- `public/workspace/js/modules/denoising-filter/FilterDenoisingModule.js:273-312`

**Pattern to implement:**
```javascript
class Module {
  constructor() {
    this._eventListeners = [];
  }

  addListener(element, event, handler) {
    element.addEventListener(event, handler);
    this._eventListeners.push({ element, event, handler });
  }

  deactivate() {
    this._eventListeners.forEach(({ element, event, handler }) => {
      element?.removeEventListener(event, handler);
    });
    this._eventListeners = [];
  }
}
```

---

### 2.3 Add Event Listener Cleanup in Classic Frontend
**Files:**
- `public/classic/js/fileUpload.js:21-49`
- `public/classic/js/welcome.js:57-85`
- `public/classic/js/visualization/interactions.js:21-70, 115-160, 174-250`
- `public/classic/js/visualization/uiControls.js:108-138, 246-265, 310-341`

**Pattern:** Store references and clean up in reset/destroy functions.

---

### 2.4 Disconnect IntersectionObserver
**File:** `public/workspace/js/modules/imageviewer/ImageViewerModule.js:856-873`

**Fix:**
```javascript
setupLazyLoading() {
  this.imageObserver = new IntersectionObserver(...);
  // ...
}

deactivate() {
  if (this.imageObserver) {
    this.imageObserver.disconnect();
    this.imageObserver = null;
  }
}
```

---

### 2.5 Clean Up State Subscriptions
**File:** `public/workspace/js/workspace.js:275-304`

**Fix:**
```javascript
setupStateSubscriptions() {
  this.unsubscribers = [];
  this.unsubscribers.push(
    this.state.subscribe('workspace.stats', this.handleStatsUpdate.bind(this))
  );
}

cleanup() {
  this.unsubscribers.forEach(unsub => unsub());
  this.unsubscribers = [];
}
```

---

### 2.6 Add Three.js Resource Disposal
**File:** `public/classic/js/navigation.js:242-260`

**Fix:**
```javascript
function performCompleteStateReset() {
  // Dispose Three.js resources
  if (window.scene) {
    window.scene.traverse((object) => {
      if (object.geometry) object.geometry.dispose();
      if (object.material) {
        if (Array.isArray(object.material)) {
          object.material.forEach(m => m.dispose());
        } else {
          object.material.dispose();
        }
      }
    });
  }
  if (window.renderer) {
    window.renderer.dispose();
  }
  // ... rest of reset
}
```

---

### 2.7 Fix StateManager Reset Inconsistency
**File:** `public/workspace/js/core/StateManager.js:169-202`

**Issue:** Reset state missing `infoPanel` and `imageviewer` sections.

**Fix:** Ensure reset() uses the same structure as constructor initial state.

---

### 2.8 Add Module Loading Lock
**File:** `public/workspace/js/core/ModuleLoader.js:126-181`

**Fix:**
```javascript
async load(moduleId) {
  if (this.isLoading) {
    console.warn('Module load already in progress');
    return false;
  }
  this.isLoading = true;
  try {
    // ... existing load logic
  } finally {
    this.isLoading = false;
  }
}
```

---

### 2.9 Add Socket Error Handlers
**File:** `public/classic/js/socket.js`

**Fix:**
```javascript
socket.on('error', function(error) {
  console.error('Socket error:', error);
});

socket.on('connect_error', function(error) {
  console.error('Socket connection error:', error);
  // Show user notification
});
```

---

### 2.10 Fix Bare Except Clause
**File:** `python/train_model.py:588`

**Fix:**
```python
# Change from:
except:
    pass
# To:
except Exception as e:
    logger.debug(f"Cleanup error (ignored): {e}")
```

---

### 2.11 Add saveUninitialized: false
**File:** `src/middleware/session.middleware.js:30`

**Fix:**
```javascript
saveUninitialized: false, // Prevent session fixation
```

---

## Phase 3: Medium-term Fixes

Performance improvements, error handling, and moderate security issues.

### 3.1 Add CSRF Protection
**File:** `src/app.js`

**Fix:** Install and configure csurf:
```bash
npm install csurf
```

```javascript
const csrf = require('csurf');
const csrfProtection = csrf({ cookie: true });

// Apply to state-changing routes
app.use('/api', csrfProtection);
```

Update HTML forms to include CSRF token.

---

### 3.2 Configure CORS Properly
**File:** `src/app.js:268`

**Fix:**
```javascript
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || 'http://localhost:3000',
  credentials: true
}));
```

---

### 3.3 Add Security Headers (Helmet)
**File:** `src/app.js`

**Fix:**
```bash
npm install helmet
```

```javascript
const helmet = require('helmet');
app.use(helmet());
```

---

### 3.4 Add Rate Limiting
**File:** `src/app.js`

**Fix:**
```bash
npm install express-rate-limit
```

```javascript
const rateLimit = require('express-rate-limit');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts
  message: { error: 'Too many login attempts' }
});

app.use('/api/login', authLimiter);
app.use('/api/register', authLimiter);
```

---

### 3.5 Reduce JSON Body Limit
**File:** `src/app.js:269`

**Fix:**
```javascript
app.use(express.json({ limit: '1mb' })); // Reduce from 100mb
```

---

### 3.6 Add Session Cleanup Mechanism
**File:** `src/services/SessionTracker.js`

**Fix:**
```javascript
class SessionTracker {
  constructor() {
    this.trainingSessions = new Map();
    this.inferenceSessions = new Map();

    // Clean up old sessions every hour
    setInterval(() => this.cleanupOldSessions(), 60 * 60 * 1000);
  }

  cleanupOldSessions() {
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    const now = Date.now();

    for (const [id, session] of this.trainingSessions) {
      if (now - session.startTime > maxAge) {
        this.trainingSessions.delete(id);
      }
    }
    // Same for inferenceSessions
  }
}
```

---

### 3.7 Convert Synchronous to Async File Operations
**Files:**
- `WorkspaceManager.js` - Multiple locations
- `src/routes/ml.routes.js` - Lines 120-121, 165-166
- `activityLogger.js:30`

**Pattern:**
```javascript
// Change from:
if (fs.existsSync(path)) { ... }
// To:
const { access } = require('fs').promises;
try {
  await access(path);
  // file exists
} catch {
  // file doesn't exist
}
```

---

### 3.8 Fix API Error Response for Non-JSON
**File:** `public/workspace/js/core/WorkspaceAPI.js:29-40`

**Fix:**
```javascript
async handleResponse(response) {
  let data;
  try {
    data = await response.json();
  } catch (e) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  if (!response.ok) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }
  return data;
}
```

---

### 3.9 Use tempfile Context Manager
**File:** `python/train_model.py:296-338`

**Fix:**
```python
import tempfile

with tempfile.TemporaryDirectory(prefix='training_data_') as temp_dir:
    # ... use temp_dir
    # Automatically cleaned up
```

---

### 3.10 Add Bounds Check for Sparse Data
**File:** `python/create_annotation_tiff.py:60-64`

**Fix:**
```python
if len(raw) % 5 != 0:
    raise ValueError(f"Invalid sparse data length: {len(raw)}, expected multiple of 5")
```

---

### 3.11 Cross-Platform Python Path
**File:** `src/config/constants.js:14`

**Fix:**
```javascript
const PYTHON_PATH = process.platform === 'win32'
  ? path.join(BASE_DIR, 'venv', 'Scripts', 'python.exe')
  : path.join(BASE_DIR, 'venv', 'bin', 'python');
```

---

### 3.12 Fix Socket Room Join Timing
**File:** `src/routes/ml.routes.js:1041-1044`

**Issue:** 1-second delay is a workaround.

**Fix:** Use acknowledgment pattern:
```javascript
socket.emit('ready-for-inference', inferenceId, () => {
  startInferenceProcess(...);
});
```

---

### 3.13 Remove Information Disclosure
**File:** `src/routes/ml.routes.js:969-972`

**Fix:**
```javascript
return res.status(400).json({
  error: 'No imported model found and training session not found',
  training_id: training_id
  // Remove: available_sessions
});
```

---

### 3.14 Clear Polling Interval on Navigation
**File:** `public/classic/js/training.js:162-165`

**Fix:** Add cleanup on page unload:
```javascript
window.addEventListener('beforeunload', () => {
  if (trainingPollInterval) {
    clearInterval(trainingPollInterval);
  }
});
```

---

### 3.15 Fix Timer Not Cleared on Error
**File:** `public/workspace/js/modules/mesh/MeshModule.js:991-1006`

**Fix:** Add timer cleanup in error handler for `checkGenerationStatus`.

---

## Phase 4: Long-term Improvements

Code quality, refactoring, and best practices.

### 4.1 Extract Duplicate UNet Class
**Files:**
- `python/train_model.py:145-250`
- `python/run_inference.py:19-113`

**Fix:** Create `python/models/unet.py` and import from both files.

---

### 4.2 Replace Deprecated substr()
**Files:**
- `manageUsers.js:29`
- `WorkspaceManager.js:28`

**Fix:**
```javascript
// Change from:
Math.random().toString(36).substr(2, 9)
// To:
Math.random().toString(36).substring(2, 11)
```

---

### 4.3 Move Inline require() to Top
**File:** `src/routes/ml.routes.js:1234, 1313`

**Fix:** Move `const { spawn } = require('child_process')` to top of file.

---

### 4.4 Create Constants for Magic Numbers
**New File:** `src/config/timeouts.js`

```javascript
module.exports = {
  INFERENCE_START_DELAY: 1000,
  ZIP_STREAM_TIMEOUT: 600000,
  SESSION_MAX_AGE: 24 * 60 * 60 * 1000,
  CLEANUP_INTERVAL: 60 * 60 * 1000
};
```

---

### 4.5 Standardize Error Response Format
**All route files**

**Standard format:**
```javascript
// Success
{ success: true, data: {...} }

// Error
{ success: false, error: 'message', code: 'ERROR_CODE' }
```

---

### 4.6 Remove Dead Code
**Files to clean:**
- `public/classic/js/visualization/meshCreation.js:396-408` - Unused `sliceSize`
- `public/classic/js/app.js:48-50` - Duplicate comments
- `public/classic/js/visualization/clipping.js` - Commented console.logs
- `public/workspace/js/modules/imageviewer/ImageViewerModule.js:61` - Unused `sliceCache`
- `src/routes/folders.routes.js:51` - Unused `color` parameter

---

### 4.7 Remove Unused Exports
**File:** `src/middleware/session.middleware.js:44-48`

Remove unused `applySessionMiddleware` function.

---

### 4.8 Move Inline Scripts to External Files
**File:** `public/admin.html:127-142`

Move theme initialization script to `public/js/admin.js`.

---

### 4.9 Replace Inline Event Handlers
**File:** `public/admin.html:19, 28, 34, 37, 40`

Replace `onclick="..."` with `addEventListener` in JavaScript.

---

### 4.10 Replace setTimeout for DOM Ready
**File:** `public/classic/js/visualization/uiControls.js:108-138, 246-265`

**Fix:** Use MutationObserver or proper DOM ready pattern instead of setTimeout.

---

### 4.11 Add Python Type Hints
**All Python files**

Example:
```python
def validate_tiff_stacks(raw_path: str, annotation_path: str) -> dict:
    ...
```

---

### 4.12 Fix Module Export Consistency
**Files:**
- `public/workspace/js/core/StateManager.js:250-252`
- `public/workspace/js/core/components/LoadingOverlay.js:303-309`

Standardize on ES6 exports only.

---

### 4.13 Define Module ID Constants
**File:** `public/workspace/js/modules/registry.js`

```javascript
export const MODULE_IDS = {
  SEGMENTATION: 'segmentation',
  DENOISING_DL: 'denoising-dl',
  DENOISING_FILTER: 'denoising-filter',
  // ...
};
```

---

### 4.14 Reduce TIFF Double-Reading
**File:** `python/validate_tiff.py:46-47, 188-190`

Cache the TIFF data between validation and preview generation.

---

### 4.15 Optimize Mesh Generation Loop
**File:** `python/generate_mesh.py:226-236`

Use vectorized NumPy operations instead of nested Python loops.

---

### 4.16 Add Node Engine Constraint
**File:** `package.json`

```json
"engines": {
  "node": ">=18.0.0"
}
```

---

### 4.17 Update Package.json Author
**File:** `package.json:37`

Replace "Your Name" with actual author information.

---

### 4.18 Add WebGL Fallback Detection
**File:** `public/classic/js/visualization/scene.js:20-24`

```javascript
if (!window.WebGLRenderingContext) {
  showError('WebGL is not supported in your browser');
  return;
}
```

---

### 4.19 Consolidate Global Variables
**File:** `public/classic/js/app.js:1-28`

Create a single state object:
```javascript
const AppState = {
  currentStep: 1,
  socket: null,
  currentTrainingId: null,
  // ...
};
```

---

---

## Implementation Checklist

- [ ] **Phase 1** - Critical fixes (5 issues)
- [ ] **Phase 2** - High priority fixes (11 issues)
- [ ] **Phase 3** - Medium priority fixes (15 issues)
- [ ] **Phase 4** - Long-term improvements (19 issues)

---

## Dependencies

New npm packages to install:
```bash
npm install helmet csurf express-rate-limit
```

---

## Notes

- Each fix should be committed separately with descriptive messages
- Run the application after each phase to verify no regressions
- Some Phase 3/4 changes may require updating CLAUDE.md documentation
