# Testing Guide

**Guide Type:** Testing Strategies & Procedures
**Difficulty:** Beginner to Intermediate
**Time Required:** Varies by test scope
**Last Updated:** 2025-11-27

---

## Overview

This guide covers testing strategies for the Biomedical Image Processing Workspace. Currently, testing is primarily manual, with recommendations for future automated testing.

**What You'll Learn:**
- Manual testing procedures for all features
- End-to-end workflow testing
- Performance testing strategies
- Security testing basics
- Browser compatibility testing
- Test data management
- Common test scenarios and edge cases

**Current Testing Status:**
- ✅ Manual testing procedures defined
- ✅ Test data available (`test_data/`)
- ⏳ Automated testing (planned for Phase 3+)
- ⏳ CI/CD integration (planned for Phase 4+)

---

## Table of Contents

1. [Testing Philosophy](#testing-philosophy)
2. [Test Data](#test-data)
3. [Manual Testing](#manual-testing)
4. [Feature Testing Checklists](#feature-testing-checklists)
5. [End-to-End Workflows](#end-to-end-workflows)
6. [Performance Testing](#performance-testing)
7. [Security Testing](#security-testing)
8. [Browser Compatibility](#browser-compatibility)
9. [Regression Testing](#regression-testing)
10. [Automated Testing (Future)](#automated-testing-future)
11. [Common Test Scenarios](#common-test-scenarios)
12. [Troubleshooting Tests](#troubleshooting-tests)

---

## Testing Philosophy

### Test Pyramid

```
        /\
       /  \      E2E Tests (Manual, Critical Paths)
      /____\
     /      \    Integration Tests (Future: API + Python)
    /________\
   /          \  Unit Tests (Future: Core functions)
  /____________\
```

**Current Focus:** Manual E2E testing of critical workflows
**Future:** Unit and integration tests for core functionality

### Testing Priorities

1. **Critical Path Testing** (Highest Priority)
   - User registration and login
   - File upload and validation
   - Training workflow
   - Inference workflow
   - 3D visualization

2. **Security Testing**
   - Authentication and authorization
   - File isolation (session-based)
   - Input validation
   - XSS/SQL injection prevention

3. **Performance Testing**
   - Large file uploads (500 MB TIFF)
   - Training progress updates
   - 3D visualization rendering
   - Concurrent user sessions

4. **Edge Cases**
   - Invalid file formats
   - Network interruptions
   - Session expiry
   - Browser compatibility

---

## Test Data

### Built-in Test Data

Two sample stacks in `test_data/` are copied into every new workspace:

| File | Appears in the workspace as | Details |
|------|-----------------------------|---------|
| `trypB_testData_training.tif` | `sample_raw.tif` | 23 slices, 256x256, 8-bit |
| `trypB_testData_annotations.tif` | `sample_annotation.tif` | 23 slices, 256x256, 8-bit, 3 classes |

**Usage:**
- Available to all users (including pending approval)
- Selected like any other workspace file in the module file selectors
- Validates entire pipeline without custom uploads

### Custom Test Data

**Creating Custom Test Data:**

```python
# Generate test TIFF stack
import numpy as np
from PIL import Image
import os

def create_test_tiff(filename, slices=100, size=(512, 512), classes=3):
    """Create test TIFF stack with random data"""
    images = []

    for i in range(slices):
        # Create random image
        if classes > 1:
            # Annotation (class labels)
            img = np.random.randint(0, classes, size, dtype=np.uint8)
        else:
            # Grayscale image
            img = np.random.randint(0, 256, size, dtype=np.uint8)

        images.append(Image.fromarray(img))

    # Save as multi-page TIFF
    images[0].save(filename, save_all=True, append_images=images[1:])
    print(f"Created {filename}: {slices} slices, {size}, {classes} classes")

# Generate test files
create_test_tiff('test_training.tif', slices=50, classes=1)
create_test_tiff('test_annotation.tif', slices=50, classes=3)
create_test_tiff('test_inference.tif', slices=50, classes=1)
```

**Test File Requirements:**
- Format: Multi-page TIFF
- Bit depth: 8-bit or 16-bit (16-bit annotations auto-converted)
- Dimensions: Should match across training/annotation files
- Classes: Annotation must have 2-10 unique class values

---

## Manual Testing

### Test Environment Setup

**1. Local Development:**
```bash
# Start application in development mode
npm run dev

# Open browser
http://localhost:3000
```

**2. Staging Environment:**
```bash
# Deploy to staging server
# Follow deployment guide for staging setup
https://staging.yourdomain.com
```

**3. Production Environment:**
```bash
# Test production environment
https://yourdomain.com

# Use separate test account (not admin)
```

### Test Account Setup

**Create Test Accounts:**

```bash
# Admin account (for testing admin features)
node manageUsers.js add-admin testadmin password123 "Test Admin" admin@test.com "Test Org"

# Regular user (pending approval)
# Register via /register page

# Approved user
node manageUsers.js add-user testuser password123 "Test User" user@test.com "Test Org"
node manageUsers.js approve testuser
```

### Testing Tools

**Browser DevTools:**
- Network tab: Monitor API requests, file uploads
- Console: Check for JavaScript errors
- Application tab: Inspect cookies, session storage
- Performance tab: Profile page load, rendering

**Extensions:**
- [Pesticide](https://chrome.google.com/webstore/detail/pesticide-for-chrome/bblbgcheenepgnnajgfpiicnbbdmmooh) - CSS debugging
- [Lighthouse](https://developers.google.com/web/tools/lighthouse) - Performance auditing
- [WAVE](https://wave.webaim.org/extension/) - Accessibility testing

**Command Line:**
```bash
# Monitor server logs
pm2 logs biomedapp --lines 50

# Monitor activity log
tail -f logs/activity.log

# Monitor Python processes
ps aux | grep python

# Check Redis sessions
redis-cli
> KEYS sess:*
> GET sess:your-session-id
```

---

## Feature Testing Checklists

### 1. Authentication & Authorization

**User Registration:**
- [ ] Navigate to `/register`
- [ ] Fill in all required fields
- [ ] Submit form
- [ ] Verify success message: "Registration request submitted"
- [ ] Check `users.json`: User exists with `status: 'pending'`
- [ ] Verify user cannot login yet (pending approval)
- [ ] Check activity log for registration event

**User Login (Approved User):**
- [ ] Navigate to `/login`
- [ ] Enter valid credentials
- [ ] Submit form
- [ ] Redirected to version selection page (`/`)
- [ ] Session cookie set (`connect.sid`)
- [ ] User info in session (check DevTools > Application > Cookies)

**Login Validation:**
- [ ] Try invalid username → Error message
- [ ] Try invalid password → Error message
- [ ] Try pending user → "Account pending approval" message
- [ ] Try rejected user → "Access denied" message

**Admin Features:**
- [ ] Login as admin
- [ ] Navigate to `/admin`
- [ ] View pending users list
- [ ] Approve a pending user → Success message
- [ ] Reject a pending user → Success message
- [ ] Verify user status updated in `users.json`
- [ ] Check activity log for approval/rejection

**Session Persistence:**
- [ ] Login
- [ ] Close browser
- [ ] Reopen browser, navigate to `/workspace`
- [ ] Verify still logged in (no redirect to login)
- [ ] Session expires after 7 days (test with modified TTL)

### 2. File Upload & Validation

**Workspace Upload (Segmentation Module):**
- [ ] Navigate to `/workspace`
- [ ] Launch the "U-Net Segmentation" module
- [ ] Expand "Train from Scratch"
- [ ] Upload training TIFF (8-bit, 100 slices) via the "Raw Images" file selector
- [ ] Upload annotation TIFF (8-bit, 3 classes, same dimensions) via the "Annotations" file selector
- [ ] Verify progress indicator
- [ ] Verify validation success message
- [ ] Check session storage: Uploaded file paths stored
- [ ] Verify files in `workspaces/<sessionId>/uploads/`

**Test Data Upload:**
- [ ] Click "Use Test Data" button
- [ ] Verify instant upload (no file selection needed)
- [ ] Verify validation success
- [ ] Check that files copied from `test_data/` to session directory

**Upload Validation - Dimension Mismatch:**
- [ ] Upload training: 512x512x100
- [ ] Upload annotation: 256x256x100 (different dimensions)
- [ ] Verify error: "Dimension mismatch"

**Upload Validation - Class Count:**
- [ ] Upload annotation with 1 class → Error: "Must have 2-10 classes"
- [ ] Upload annotation with 11 classes → Error: "Must have 2-10 classes"
- [ ] Upload annotation with 0-255 random values → Error or auto-detection

**Upload Validation - 16-bit Annotation:**
- [ ] Upload 16-bit annotation TIFF
- [ ] Verify auto-conversion to 8-bit
- [ ] Verify warning message: "Auto-converted to 8-bit"

**Large File Upload (500 MB):**
- [ ] Create or use 500 MB TIFF
- [ ] Upload via a Workspace file selector
- [ ] Monitor progress bar (should update during upload)
- [ ] Verify upload completes successfully
- [ ] Check nginx access log for 200 status

**Pending User Upload Restriction:**
- [ ] Login as pending user
- [ ] Try to upload custom data → Error: "Account approval required"
- [ ] Verify "Use Test Data" button still works

### 3. Training Workflow

**Training Configuration:**
- [ ] Navigate to training configuration section
- [ ] Verify default values loaded
- [ ] Modify parameters:
  - Patch size: 64, 128, 256
  - Learning rate: 0.0001 to 0.01
  - Epochs: 1 to 100
  - Batch size: 1, 2, 4, 8
- [ ] Click "Start Training"
- [ ] Verify training ID generated
- [ ] Verify Socket.IO connection established

**Training Progress (Real-time):**
- [ ] Monitor progress bar (0% → 100%)
- [ ] Verify epoch updates (Epoch 1/10, 2/10, ...)
- [ ] Verify metrics update (loss, accuracy)
- [ ] Verify progress chart updates live
- [ ] Check Socket.IO messages in Network tab
- [ ] Monitor server logs: `pm2 logs` shows Python output

**Training Completion:**
- [ ] Wait for training to complete
- [ ] Verify success message: "Training complete"
- [ ] Verify model files created:
  - `workspaces/<sessionId>/models/segmentation/<trainingId>/best_model.pth`
  - `workspaces/<sessionId>/models/segmentation/<trainingId>/config.json`
  - `workspaces/<sessionId>/models/segmentation/<trainingId>/results.json`
- [ ] Verify final metrics displayed
- [ ] Verify "Run Inference" button enabled

**Training Interruption:**
- [ ] Start training
- [ ] Close browser tab mid-training
- [ ] Verify Python process still runs (check `ps aux | grep python`)
- [ ] Reopen browser, navigate back
- [ ] Verify training continues (progress updates resume)

**Concurrent Training Sessions:**
- [ ] Start training in browser tab 1
- [ ] Open browser tab 2 (same session)
- [ ] Try to start second training → Error: "Training already in progress"

**Training with Different Configurations:**
- [ ] Train with small patch size (64) → Fast training
- [ ] Train with large patch size (256) → Slower training
- [ ] Train with 1 epoch → Quick test
- [ ] Train with 50 epochs → Long training (monitor resources)

### 4. Inference Workflow

**Inference with Trained Model:**
- [ ] Complete training workflow first
- [ ] Upload inference data (or use test data)
- [ ] Click "Run Inference"
- [ ] Verify inference ID generated
- [ ] Monitor progress bar and slice count
- [ ] Verify Socket.IO updates

**Inference Completion:**
- [ ] Wait for inference to complete
- [ ] Verify success message
- [ ] Verify result files created:
  - `workspaces/<sessionId>/results/segmentation/inference_<inferenceId>/segmented.tif`
  - `workspaces/<sessionId>/results/segmentation/inference_<inferenceId>/metadata.json`
  - `workspaces/<sessionId>/results/segmentation/inference_<inferenceId>/visualization.json`
- [ ] Verify "View 3D Visualization" button enabled

**Inference with Imported Model:**
- [ ] Click "Import Pretrained Model"
- [ ] Upload `.pth` file and matching `config.json`
- [ ] Verify validation success
- [ ] Upload inference data
- [ ] Run inference
- [ ] Verify inference completes with imported model

**Import Model Validation:**
- [ ] Try uploading `.pth` without `config.json` → Error
- [ ] Try uploading mismatched `config.json` → Error
- [ ] Try uploading non-PyTorch file → Error

### 5. 3D Visualization

**Visualization Loading:**
- [ ] Complete inference workflow
- [ ] Click "View 3D Visualization"
- [ ] Verify loading indicator
- [ ] Verify Three.js scene renders
- [ ] Verify point cloud appears (colored by class)

**Visualization Controls:**
- [ ] Mouse drag → Rotate camera (orbit controls)
- [ ] Mouse wheel → Zoom in/out
- [ ] Right-click drag → Pan camera
- [ ] Verify camera moves smoothly (60 FPS)

**Original Data Overlay:**
- [ ] Click "Toggle Original Data"
- [ ] Verify original data loads
- [ ] Verify overlay appears
- [ ] Toggle off → Overlay disappears

**Class Filtering:**
- [ ] Click class filter checkboxes
- [ ] Verify point cloud updates (classes hidden/shown)
- [ ] Verify legend updates

**Performance:**
- [ ] Load large dataset (500k+ points)
- [ ] Verify rendering performance (check FPS in stats.js)
- [ ] Verify no lag during rotation
- [ ] Check browser memory usage (DevTools > Memory)

### 6. Session Management

**Session Reset:**
- [ ] Complete full workflow (upload, train, inference)
- [ ] Click "Reset Session"
- [ ] Confirm reset
- [ ] Verify success message
- [ ] Verify all UI sections reset to initial state
- [ ] Verify session files deleted:
  - `workspaces/<sessionId>/uploads/` → Deleted
  - `workspaces/<sessionId>/models/` → Deleted
- [ ] Check `trainingSessions` and `inferenceSessions` maps cleared

**Session Expiry:**
- [ ] Login
- [ ] Wait 7 days (or modify TTL to 1 minute for testing)
- [ ] Try to access `/workspace` → Redirected to `/login`
- [ ] Verify session cookie deleted

**Multiple Sessions (Different Browsers):**
- [ ] Login in Chrome → Session A
- [ ] Login in Firefox → Session B
- [ ] Upload file in Chrome → Verify file in `uploads/<sessionA>/`
- [ ] Upload file in Firefox → Verify file in `uploads/<sessionB>/`
- [ ] Verify sessions isolated (no cross-contamination)

### 7. Workspace Version

**Module System:**
- [ ] Navigate to `/workspace`
- [ ] Verify welcome hub loads
- [ ] Verify module cards displayed (Segmentation, Denoising, etc.)
- [ ] Click "Launch" on Segmentation module
- [ ] Verify module loads (view switches to module UI)
- [ ] Verify "Back to Hub" button appears
- [ ] Click "Back to Hub" → Return to welcome view

**State Management:**
- [ ] Open browser console
- [ ] Type `workspace.state.logState()` → Verify state object logged
- [ ] Upload file → Check `workspace.files` updates
- [ ] Start training → Check `modules.segmentation.currentTask` updates

**Module Switching:**
- [ ] Launch Segmentation module
- [ ] Start training
- [ ] Click "Back to Hub" mid-training
- [ ] Verify training continues (backend)
- [ ] Launch module again → Verify state persisted

**File Browser (Phase 3):**
- [ ] Navigate to sidebar file browser
- [ ] Currently shows placeholder → Future: List uploaded files

---

## End-to-End Workflows

### E2E Test 1: Complete Segmentation (Test Data)

**Duration:** 15-20 minutes

1. **Setup:**
   - [ ] Clear browser cache
   - [ ] Open incognito window
   - [ ] Navigate to application

2. **Login:**
   - [ ] Navigate to `/login`
   - [ ] Login as approved user
   - [ ] Verify redirected to `/workspace`

3. **Open Segmentation Module:**
   - [ ] Click "Launch Module" on the "U-Net Segmentation" card
   - [ ] Verify the segmentation module UI loads

4. **Select Test Data:**
   - [ ] Expand "Train from Scratch"
   - [ ] Select the built-in sample training and annotation files (seeded into every workspace) in the "Raw Images" and "Annotations" selectors
   - [ ] Verify validation success
   - [ ] Verify training/annotation file info displayed

5. **Configure Training:**
   - [ ] Set epochs: 5
   - [ ] Set patch size: 128
   - [ ] Click "Start Training"

6. **Monitor Training:**
   - [ ] Verify progress bar updates
   - [ ] Verify epoch count updates
   - [ ] Wait for completion (~5 minutes)
   - [ ] Verify success message

7. **Select Inference Data:**
   - [ ] Select the sample inference file in the "Inference Data" selector
   - [ ] Verify no compatibility warnings

8. **Run Inference:**
   - [ ] Click "Run Segmentation"
   - [ ] Monitor progress (~2 minutes)
   - [ ] Verify completion

9. **View Results:**
   - [ ] Click "Open in Image Viewer"
   - [ ] Verify the segmentation result displays
   - [ ] Optionally open the result in the "3D Visualization" module and test camera controls (rotate, zoom, pan)

10. **Cleanup:**
    - [ ] Click "Start New Run"
    - [ ] Verify the module returns to step 1
    - [ ] Logout

**Expected Result:** Entire workflow completes without errors in ~15 minutes.

### E2E Test 2: Custom Data Upload (Approved User)

**Duration:** 20-30 minutes

1. **Prepare Custom Data:**
   - [ ] Create or download custom TIFF files
   - [ ] Training: 512x512x50, 8-bit
   - [ ] Annotation: 512x512x50, 8-bit, 3 classes
   - [ ] Inference: 512x512x50, 8-bit

2. **Login:**
   - [ ] Login as approved user

3. **Upload Custom Training Data:**
   - [ ] Navigate to `/workspace` and launch the "U-Net Segmentation" module
   - [ ] Expand "Train from Scratch"
   - [ ] Upload custom files via the "Raw Images" and "Annotations" file selectors
   - [ ] Monitor upload progress (large files)
   - [ ] Verify validation success

4. **Train Model:**
   - [ ] Configure training (10 epochs, patch size 128)
   - [ ] Start training
   - [ ] Monitor progress (~10 minutes)
   - [ ] Verify completion

5. **Upload Custom Inference Data:**
   - [ ] Upload custom inference TIFF
   - [ ] Verify validation

6. **Run Inference:**
   - [ ] Run inference with trained model
   - [ ] Monitor progress
   - [ ] Verify completion

7. **View Results:**
   - [ ] View 3D visualization
   - [ ] Test all controls
   - [ ] Download segmented result (future feature)

8. **Cleanup:**
   - [ ] Reset session
   - [ ] Verify files deleted from server

**Expected Result:** Custom data workflow completes successfully.

### E2E Test 3: Model Import Workflow

**Duration:** 10-15 minutes

1. **Prepare Model Files:**
   - [ ] Obtain pretrained `model.pth` and `config.json`
   - [ ] Ensure config matches model architecture

2. **Login:**
   - [ ] Login as approved user
   - [ ] Navigate to `/workspace` and launch the "U-Net Segmentation" module

3. **Import Model:**
   - [ ] Expand "Use Pretrained Model"
   - [ ] Upload `.pth` and `.json` files
   - [ ] Monitor validation
   - [ ] Verify success message

4. **Upload Inference Data:**
   - [ ] Use test data or upload custom
   - [ ] Verify validation

5. **Run Inference:**
   - [ ] Run inference with imported model
   - [ ] Monitor progress
   - [ ] Verify completion

6. **View Results:**
   - [ ] View 3D visualization
   - [ ] Verify segmentation quality

**Expected Result:** Imported model performs inference successfully.

---

## Performance Testing

### Load Testing

**Single User Performance:**
```bash
# Measure page load time
# Open DevTools > Network tab
# Navigate to /workspace
# Check: DOMContentLoaded < 2s, Load < 5s

# Measure API response time
# Upload file, check Network tab
# /upload-data should complete < 30s for 100 MB file
```

**File Upload Performance:**
```bash
# Test various file sizes
- 10 MB → Should complete < 5s
- 100 MB → Should complete < 30s
- 500 MB → Should complete < 120s

# Monitor with:
# Network tab: Check upload progress
# Server: tail -f logs/activity.log
```

**Training Performance:**
```bash
# Benchmark training time
- 50 slices, 5 epochs, patch 128 → ~5 min
- 100 slices, 10 epochs, patch 128 → ~15 min
- 100 slices, 50 epochs, patch 256 → ~60 min

# Monitor resources:
# htop (CPU usage should be 80-100% during training)
# free -h (memory usage)
```

**Inference Performance:**
```bash
# Benchmark inference time
- 50 slices → ~1-2 min
- 100 slices → ~3-5 min
- 500 slices → ~15-20 min

# Monitor:
# Progress updates should stream smoothly (every 1-2 seconds)
```

**3D Visualization Performance:**
```bash
# Measure rendering FPS
# Open visualization
# Check browser console: stats.js shows FPS
# Expected: 60 FPS for <100k points, 30+ FPS for <500k points

# Test with large dataset (500k points):
- Rotation should be smooth (no lag)
- Zoom should respond instantly
- Class filtering should update < 1s
```

### Concurrent User Testing

**Manual Concurrent Test:**
```bash
# Open 5 browser windows (different sessions)
# In each window:
1. Login as different user
2. Upload test data
3. Start training (all 5 simultaneously)

# Monitor server:
- CPU usage (should be high but not 100%)
- Memory usage (should not exceed 80%)
- pm2 monit (check all instances healthy)
- No crashes or errors

# Verify:
- All 5 trainings complete successfully
- No session cross-contamination
- Files isolated in separate session directories
```

**Load Testing Tool (Future):**
```bash
# Use Apache Bench or Artillery
# npm install -g artillery

# Create test scenario
artillery quick --count 10 --num 50 https://yourdomain.com/

# Analyze results:
- Response time p95 < 1000ms
- Error rate < 1%
- Successful requests > 99%
```

### Memory Leak Testing

```bash
# Long-running session test
1. Login
2. Upload → Train → Inference → Visualize → Reset
3. Repeat 10 times
4. Monitor memory in DevTools > Memory > Take Heap Snapshot
5. Compare snapshots: Memory should not grow significantly

# Server memory:
pm2 monit
# Check memory usage after each iteration
# Should stabilize, not grow unbounded
```

---

## Security Testing

### Authentication Security

**Session Hijacking Prevention:**
- [ ] Verify `httpOnly: true` on session cookie (cannot access via JavaScript)
- [ ] Verify `secure: true` in production (HTTPS only)
- [ ] Try copying session cookie to different browser → Should not work

**Brute Force Protection:**
- [ ] Try 10 failed login attempts
- [ ] Verify rate limiting (if implemented)
- [ ] Check fail2ban logs (production)

**Password Strength:**
- [ ] Try registering with weak password ("123456") → Should be rejected (if validation added)
- [ ] Verify passwords hashed in `users.json` (bcrypt hashes visible)

### Authorization Testing

**Pending User Restrictions:**
- [ ] Login as pending user
- [ ] Try accessing `/admin` → 403 Forbidden
- [ ] Try uploading custom data → Error message
- [ ] Verify test data access still works

**Admin-Only Features:**
- [ ] Login as non-admin
- [ ] Try accessing `/admin` → 403 Forbidden
- [ ] Try API call `POST /api/admin/approve-user` → 403 Forbidden

**Session-Based File Isolation:**
- [ ] Login as User A → Upload file → Note session ID in cookie
- [ ] Login as User B (different browser) → Try to access User A's file path
- [ ] Expected: Cannot access (session ID different)

### Input Validation

**XSS Prevention:**
- [ ] Try entering `<script>alert('XSS')</script>` in:
  - Username field
  - Full name field
  - Email field
  - Training configuration fields
- [ ] Verify: Input sanitized or escaped (no script execution)

**Path Traversal Prevention:**
- [ ] Try uploading file with malicious name: `../../etc/passwd.tif`
- [ ] Verify: Filename sanitized, file saved safely

**File Type Validation:**
- [ ] Try uploading non-TIFF file (e.g., `.exe`, `.sh`)
- [ ] Verify: Rejected with error message

**SQL Injection Prevention:**
- [ ] (Not applicable - no SQL database currently)
- [ ] Future: If adding SQL, test with `' OR '1'='1`

### HTTPS/TLS Testing

**SSL Certificate:**
```bash
# Check certificate validity
openssl s_client -connect yourdomain.com:443

# Check for mixed content warnings
# Open DevTools > Console
# Should see no warnings about insecure content (HTTP on HTTPS page)
```

**Security Headers:**
```bash
# Check security headers
curl -I https://yourdomain.com

# Expected headers:
# Strict-Transport-Security: max-age=63072000
# X-Frame-Options: SAMEORIGIN
# X-Content-Type-Options: nosniff
# X-XSS-Protection: 1; mode=block
```

---

## Browser Compatibility

### Supported Browsers

| Browser | Version | Status | Notes |
|---------|---------|--------|-------|
| **Chrome** | 90+ | ✅ Fully supported | Primary development browser |
| **Firefox** | 88+ | ✅ Fully supported | Tested regularly |
| **Safari** | 14+ | ⚠️ Mostly supported | WebGL performance may vary |
| **Edge** | 90+ | ✅ Fully supported | Chromium-based |
| **Opera** | 76+ | ✅ Likely supported | Not extensively tested |
| **IE 11** | N/A | ❌ Not supported | ES6+ features required |

### Browser-Specific Tests

**Chrome:**
- [ ] Full workflow (upload, train, inference, visualize)
- [ ] DevTools: No console errors
- [ ] WebGL: Visualization renders smoothly
- [ ] File upload: Works for large files (500 MB)

**Firefox:**
- [ ] Full workflow
- [ ] Socket.IO: Real-time updates work
- [ ] WebGL: Check point cloud rendering
- [ ] File upload: Progress bar updates

**Safari:**
- [ ] Full workflow
- [ ] Check for CSS inconsistencies
- [ ] WebGL: May have performance differences
- [ ] File upload: Test with 100 MB+ files

**Mobile Browsers (Limited Support):**
- [ ] UI renders on mobile (responsive design check)
- [ ] File upload may not work (mobile file system limitations)
- [ ] 3D visualization may have performance issues
- [ ] Not officially supported for production use

### Feature Detection

```javascript
// Check for required features
const browserSupport = {
  webgl: !!document.createElement('canvas').getContext('webgl'),
  websocket: 'WebSocket' in window,
  fileAPI: 'FileReader' in window,
  es6: typeof Symbol !== 'undefined',
  fetch: 'fetch' in window
};

console.log('Browser Support:', browserSupport);
// All should be true for full functionality
```

---

## Regression Testing

### When to Run Regression Tests

- After code changes (pull requests)
- Before deployment
- After dependency updates
- Weekly for production environment

### Regression Test Suite

**Quick Smoke Test (10 minutes):**
1. Login
2. Upload test data
3. Start training (1 epoch)
4. Run inference
5. View visualization
6. Logout

**Full Regression Test (30 minutes):**
1. All authentication tests
2. All upload validation tests
3. Training workflow (5 epochs)
4. Inference workflow
5. Model import workflow
6. Session reset
7. Admin features (if admin account)

**Automated Regression (Future):**
```bash
# Run automated test suite
npm test

# Expected output:
# ✓ Authentication tests (5/5 passed)
# ✓ Upload validation tests (8/8 passed)
# ✓ Training workflow tests (3/3 passed)
# ✓ Inference workflow tests (3/3 passed)
# Total: 19/19 passed
```

---

## Automated Testing (Future)

### Unit Testing

**Framework:** Jest + Testing Library

**Example Unit Test:**

```javascript
// __tests__/StateManager.test.js
import StateManager from '../public/workspace/js/core/StateManager.js';

describe('StateManager', () => {
  let state;

  beforeEach(() => {
    state = new StateManager();
  });

  test('should initialize with default state', () => {
    expect(state.get('workspace.initialized')).toBe(false);
  });

  test('should update nested state', () => {
    state.update('workspace.files', ['file1.tif']);
    expect(state.get('workspace.files')).toEqual(['file1.tif']);
  });

  test('should emit change events', (done) => {
    state.subscribe('workspace.files', (files) => {
      expect(files).toEqual(['file1.tif']);
      done();
    });

    state.update('workspace.files', ['file1.tif']);
  });
});
```

### Integration Testing

**Framework:** Supertest + Jest

**Example API Test:**

```javascript
// __tests__/api.test.js
import request from 'supertest';
import app from '../server.js';

describe('API Endpoints', () => {
  let sessionCookie;

  beforeAll(async () => {
    // Login to get session
    const res = await request(app)
      .post('/login')
      .send({ username: 'testuser', password: 'password123' });

    sessionCookie = res.headers['set-cookie'];
  });

  test('GET /api/workspace/status should return workspace info', async () => {
    const res = await request(app)
      .get('/api/workspace/status')
      .set('Cookie', sessionCookie)
      .expect(200);

    expect(res.body).toHaveProperty('sessionId');
    expect(res.body).toHaveProperty('initialized');
  });

  test('POST /upload-data should validate TIFF files', async () => {
    const res = await request(app)
      .post('/upload-data')
      .set('Cookie', sessionCookie)
      .attach('training', 'test_data/trypB_testData_training.tif')
      .attach('annotation', 'test_data/trypB_testData_annotations.tif')
      .expect(200);

    expect(res.body.success).toBe(true);
  });
});
```

### E2E Testing

**Framework:** Playwright or Cypress

**Example E2E Test:**

```javascript
// e2e/segmentation.spec.js
const { test, expect } = require('@playwright/test');

test('complete segmentation workflow', async ({ page }) => {
  // Login (the welcome page at / hosts the login form)
  await page.goto('http://localhost:3000/');
  await page.fill('#loginUsername', 'testuser');
  await page.fill('#loginPassword', 'password123');
  await page.click('#loginForm button[type="submit"]');
  await page.waitForURL('**/workspace');

  // Launch the U-Net Segmentation module from the hub
  await page.click('[data-module-id="segmentation"] .btn-launch');

  // Step 1: Train from Scratch with raw images + annotations
  await page.click('.workflow-header[data-workflow="train"]');
  // ...select files in the "Raw Images" and "Annotations" selectors
  await expect(page.locator('#step1Next')).toBeEnabled();
  await page.click('#step1Next');

  // Step 2: keep the default configuration
  await page.click('#step2Next');

  // Step 3: train and wait for completion (with timeout)
  await page.click('#startTrainingBtn');
  await expect(page.locator('#trainingNextBtn')).toBeEnabled({ timeout: 600000 });
  await page.click('#trainingNextBtn');

  // Step 4: select inference data and run segmentation
  // ...select a file in the "Inference Data" selector
  await page.click('#runInferenceBtn');
  await expect(page.locator('#inferenceCompletionSection')).toBeVisible({ timeout: 300000 });
});
```

---

## Common Test Scenarios

### Scenario 1: Network Interruption During Upload

**Setup:**
1. Start uploading large file (500 MB)
2. Mid-upload, disable network (DevTools > Network > Offline)

**Expected:**
- Upload progress stops
- Error message displayed
- Retry mechanism (future feature)

**Current Behavior:**
- Upload fails
- User must retry manually

### Scenario 2: Browser Closed During Training

**Setup:**
1. Start training (10 epochs)
2. After 2 epochs, close browser

**Expected:**
- Training continues on server (Python process keeps running)
- Reopen browser, navigate back → Cannot resume progress display

**Current Behavior:**
- Training completes on server
- Files saved to `models/` directory
- User must check server logs to verify completion

### Scenario 3: Session Expiry Mid-Workflow

**Setup:**
1. Login
2. Wait for session to expire (7 days, or modify TTL)
3. Try to start training

**Expected:**
- Redirected to login page
- Error message: "Session expired"

**Test:**
```bash
# Modify session TTL to 1 minute for testing
# In server.js:
cookie: { maxAge: 60000 } // 1 minute

# Login, wait 1 minute, try action
```

### Scenario 4: Concurrent Training Attempts

**Setup:**
1. Start training in Tab 1
2. Open Tab 2 (same session)
3. Try to start training in Tab 2

**Expected:**
- Error message: "Training already in progress"
- Session state prevents concurrent training

### Scenario 5: Large File Upload (500 MB)

**Setup:**
1. Create or download 500 MB TIFF
2. Upload via a Workspace file selector
3. Monitor progress

**Expected:**
- Upload completes in < 2 minutes (depends on network)
- Progress bar updates smoothly
- No timeout errors
- Server accepts file (nginx `client_max_body_size` set correctly)

---

## Troubleshooting Tests

### Test Failures

**"Cannot connect to server"**
- Check server is running: `pm2 status`
- Check port is correct (3000 by default)
- Check firewall rules

**"Session cookie not set"**
- Check `httpOnly` and `secure` settings
- Check browser allows cookies (not in incognito with strict settings)
- Check session store (Redis or file-based) is working

**"File upload validation fails"**
- Check TIFF file format (must be multi-page TIFF)
- Check file dimensions match (training vs annotation)
- Check annotation has 2-10 classes
- Check file not corrupted

**"Training fails to start"**
- Check Python virtual environment activated
- Check PyTorch installed: `python -c "import torch"`
- Check Python script has execute permissions
- Check disk space available

**"Socket.IO not connecting"**
- Check Socket.IO server running (part of server.js)
- Check nginx proxying `/socket.io/` correctly
- Check HTTPS/WSS (not HTTP/WS on HTTPS page)
- Check browser console for connection errors

**"3D visualization not rendering"**
- Check WebGL support: Visit https://get.webgl.org/
- Check browser console for Three.js errors
- Check visualization data file exists and is valid JSON
- Check canvas element present in DOM

---

## Related Documentation

- [Module Creation Guide](MODULE_CREATION.md) - Testing new modules
- [Deployment Guide](DEPLOYMENT.md) - Production testing
- [Troubleshooting Guide](TROUBLESHOOTING.md) - Debugging failed tests
- [API Endpoints Reference](../reference/API_ENDPOINTS.md) - API testing reference

---

## Future Enhancements

### Planned Testing Improvements

**Phase 3:**
- [ ] Add unit tests for StateManager, ModuleLoader
- [ ] Add integration tests for API endpoints
- [ ] Set up CI/CD with automated testing

**Phase 4:**
- [ ] Add E2E tests with Playwright
- [ ] Add performance regression tests
- [ ] Set up automated browser testing (BrowserStack/Sauce Labs)
- [ ] Add code coverage reporting (target: 80%+)

**Phase 5:**
- [ ] Add load testing in CI/CD
- [ ] Add security scanning (npm audit, Snyk)
- [ ] Add accessibility testing (WCAG 2.1 AA)
- [ ] Add visual regression testing

---

**Last Updated:** 2025-11-27
**Testing Guide Version:** 1.0
**Application Version:** Phase 2 Complete

---

**Navigation:** [← Deployment](DEPLOYMENT.md) | [Documentation Index](../INDEX.md) | [Troubleshooting →](TROUBLESHOOTING.md)
