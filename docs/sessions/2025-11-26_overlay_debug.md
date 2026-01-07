# Original Data Overlay Debug Logging - Phase 1 Complete

**Date:** 2025-11-26
**Issue:** Original data overlay toggle works but overlay doesn't appear visually
**WebGL Warning:** "texImage: Desired upload requires more bytes (4) than are available (0)"
**Status:** ✅ Phase 1 Diagnostic Logging Added

---

## Problem Analysis

### Symptoms
1. Overlay checkbox toggle fires events correctly (console output shows toggle)
2. Overlay planes don't appear in 3D visualization
3. WebGL texture upload warning indicates data is missing (0 bytes instead of 4)

### Suspected Root Cause
**UTIF.js Library Timing Issue:**
- SegmentationModule loads UTIF.js asynchronously via CDN
- 3D visualization may initialize before UTIF.js finishes loading
- When `parseTiffData()` tries to parse TIFF, UTIF.js isn't available yet
- Error silently caught, resulting in empty texture data

---

## Phase 1 Fixes Applied

### Fix #1: UTIF Availability Check (main.js)

**File:** `visualization/main.js` (lines 141-156)

**Added:**
- Check if `window.UTIF` is loaded before calling overlay function
- Wait 500ms if UTIF not immediately available
- Log warning and skip overlay if UTIF fails to load after wait
- Log success if UTIF becomes available

**Code Added:**
```javascript
// Ensure UTIF.js is available for TIFF parsing
if (!window.UTIF) {
    console.warn('[OriginalData] UTIF.js not loaded yet, waiting 500ms...');
    await new Promise(resolve => setTimeout(resolve, 500));

    if (!window.UTIF) {
        console.error('[OriginalData] UTIF.js failed to load, original data overlay unavailable');
        console.log('Visualization will continue without original data overlay');
        return; // Skip overlay loading
    } else {
        console.log('[OriginalData] UTIF.js loaded successfully after wait');
    }
} else {
    console.log('[OriginalData] UTIF.js available, proceeding with overlay load');
}
```

**Expected Logs:**
- ✅ `[OriginalData] UTIF.js available, proceeding with overlay load` (if already loaded)
- ⚠️ `[OriginalData] UTIF.js not loaded yet, waiting 500ms...` (if delayed)
- ✅ `[OriginalData] UTIF.js loaded successfully after wait` (if recovers)
- ❌ `[OriginalData] UTIF.js failed to load...` (if permanently unavailable)

---

### Fix #2: Fetch Logging (meshCreation.js)

**File:** `visualization/meshCreation.js` (lines 50-68)

**Added:**
- Log fetch URL before request
- Log response status and statusText
- Log ArrayBuffer size in bytes
- Enhanced 404 and error messages with `[OriginalData]` prefix

**Code Added:**
```javascript
const fetchUrl = `/results/${inferenceId}/original-data-web`;
console.log('[OriginalData] Fetching from:', fetchUrl);

const response = await fetch(fetchUrl);
console.log('[OriginalData] Fetch response status:', response.status, response.statusText);

// ... error handling ...

const arrayBuffer = await response.arrayBuffer();
console.log('[OriginalData] ArrayBuffer size:', arrayBuffer.byteLength, 'bytes');
```

**Expected Logs:**
- `[OriginalData] Fetching from: /results/{id}/original-data-web`
- `[OriginalData] Fetch response status: 200 OK` (success)
- `[OriginalData] ArrayBuffer size: XXXXX bytes` (data received)
- OR `[OriginalData] Fetch response status: 404 Not Found` (missing data)

---

### Fix #3: TIFF Parser Logging (meshCreation.js)

**File:** `visualization/meshCreation.js` (lines 104-117)

**Added:**
- Check and log UTIF availability with boolean status
- Log window.UTIF and window.Tiff values on error
- Log when UTIF decoding starts
- Log number of images decoded from TIFF

**Code Added:**
```javascript
console.log('[OriginalData] Checking TIFF parser - window.UTIF:', !!window.UTIF, 'window.Tiff:', !!window.Tiff);

if (!Tiff) {
    console.error('[OriginalData] TIFF parser library not loaded!');
    console.error('[OriginalData] window.UTIF:', window.UTIF);
    console.error('[OriginalData] window.Tiff:', window.Tiff);
    throw new Error('TIFF parser library not loaded');
}

console.log('[OriginalData] UTIF available, decoding TIFF...');

const ifds = Tiff.decode(arrayBuffer);
console.log('[OriginalData] Decoded', ifds.length, 'image(s) from TIFF');
```

**Expected Logs:**
- `[OriginalData] Checking TIFF parser - window.UTIF: true window.Tiff: false`
- `[OriginalData] UTIF available, decoding TIFF...`
- `[OriginalData] Decoded N image(s) from TIFF`
- OR `[OriginalData] TIFF parser library not loaded!` (if UTIF missing)

---

### Fix #4: Enhanced Error Logging (meshCreation.js)

**File:** `visualization/meshCreation.js` (lines 90-93)

**Added:**
- Log full error object with `[OriginalData]` prefix
- Log error message separately
- Log error stack trace for debugging

**Code Added:**
```javascript
} catch (error) {
    console.error('[OriginalData] Failed to load original data overlay:', error);
    console.error('[OriginalData] Error message:', error.message);
    console.error('[OriginalData] Error stack:', error.stack);
    return null;
}
```

**Expected Logs:**
- Detailed error information showing exactly where the failure occurred
- Stack trace for debugging

---

## Testing Instructions - Phase 2

### Step 1: Run Full Workflow
1. Navigate to `http://localhost:3000/workspace`
2. Launch Segmentation Module
3. Complete Steps 1-4 with test data
4. Advance to Step 5 (3D Visualization)

### Step 2: Monitor Console Logs

**Open browser DevTools console and look for:**

#### Scenario A: UTIF Loads Successfully
```
[OriginalData] UTIF.js available, proceeding with overlay load
[OriginalData] Fetching from: /results/{id}/original-data-web
[OriginalData] Fetch response status: 200 OK
[OriginalData] ArrayBuffer size: XXXXX bytes
[OriginalData] Checking TIFF parser - window.UTIF: true window.Tiff: false
[OriginalData] UTIF available, decoding TIFF...
[OriginalData] Decoded N image(s) from TIFF
```
**✅ If you see this:** UTIF and fetch working, issue is in texture creation

#### Scenario B: UTIF Delayed But Recovers
```
[OriginalData] UTIF.js not loaded yet, waiting 500ms...
[OriginalData] UTIF.js loaded successfully after wait
[OriginalData] Fetching from: /results/{id}/original-data-web
...
```
**✅ If you see this:** Timing issue confirmed but mitigated by wait

#### Scenario C: UTIF Never Loads
```
[OriginalData] UTIF.js not loaded yet, waiting 500ms...
[OriginalData] UTIF.js failed to load, original data overlay unavailable
```
**❌ If you see this:** UTIF loading is broken, check SegmentationModule.js

#### Scenario D: Backend Returns 404
```
[OriginalData] Fetching from: /results/{id}/original-data-web
[OriginalData] Fetch response status: 404 Not Found
[OriginalData] Data not available (404) - expected for imported models or missing data
```
**❌ If you see this:** Backend not generating original data, Python script issue

#### Scenario E: ArrayBuffer is Empty
```
[OriginalData] ArrayBuffer size: 0 bytes
```
**❌ If you see this:** Fetch succeeds but returns no data, backend issue

#### Scenario F: TIFF Parser Missing
```
[OriginalData] Checking TIFF parser - window.UTIF: false window.Tiff: false
[OriginalData] TIFF parser library not loaded!
[OriginalData] Failed to load original data overlay: Error: TIFF parser library not loaded
```
**❌ If you see this:** UTIF availability check didn't catch it, deeper timing issue

### Step 3: Toggle Overlay

1. Find "Original Data Overlay" checkbox in visualization controls
2. Check the box
3. Note any additional console messages
4. Observe if overlay appears visually

### Step 4: Report Findings

Please report which scenario you observed and:
- Screenshot of console logs
- Whether overlay appeared after toggle
- Any additional errors or warnings

---

## Files Modified

### visualization/main.js
- **Lines changed:** +17 lines (lines 141-156)
- **Impact:** Ensures UTIF is loaded before attempting overlay

### visualization/meshCreation.js
- **Lines changed:** +18 lines
  - Fetch logging: +4 lines (around line 50-68)
  - UTIF check logging: +11 lines (around line 104-117)
  - Error logging: +3 lines (around line 90-93)
- **Impact:** Comprehensive diagnostic logging throughout data flow

---

## Next Steps Based on Results

### If Scenario A (Success Path)
- Check texture creation code in `createTexturedPlanes()`
- Verify THREE.DataTexture parameters
- Check if planes are added to scene correctly

### If Scenario B (Timing Issue)
- Increase wait time from 500ms to 1000ms
- OR ensure UTIF loads before visualization initializes
- Add UTIF.js to static HTML instead of dynamic loading

### If Scenario C (UTIF Fails)
- Check SegmentationModule.js loadDependencies() method
- Verify CDN URL for UTIF.js is accessible
- Check browser network tab for 404s

### If Scenario D (Backend 404)
- Check if Python inference script generates `original_data_web` in metadata
- Verify `python/run_inference.py` creates downsampled TIFF
- Check server endpoint `/results/:inferenceId/original-data-web` implementation

### If Scenario E (Empty Data)
- Backend issue - Python script not writing TIFF properly
- Check file permissions on results directory
- Verify metadata.json contains correct path

### If Scenario F (UTIF Missing After Wait)
- Increase wait time
- Load UTIF synchronously in HTML
- Add retry logic with exponential backoff

---

## Phase 3: Root Cause Found & Fixed ✅

**Date:** 2025-11-26 (continued)

### User Testing Results - Phase 2

User reported:
```
[OriginalData] Slice 0: 0 RGBA values, 0 bytes, type: Uint8Array
[OriginalData] Decoded 1 image(s) from TIFF
```

**Key observations:**
- Only 1 image decoded instead of 20 (expected for test data stack)
- ArrayBuffer size: 1078 bytes (way too small for image data)
- RGBA conversion producing 0 bytes

### Investigation & Root Cause

**Discovery Process:**
1. Checked older working inference: found proper structure with 20-slice TIFF (84K)
2. Compared file structures:
   - **Old (working)**: `results/{id}/inference_result_original_web.tif` (84K, 20 slices)
   - **New (broken)**: `results/{id}` (1.1K metadata file, no TIFF!)
3. Found metadata showing wrong path: `"path": "results/{id}"` instead of `"path": "results/{id}/inference_result_original_web.tif"`

**Root Cause Identified:**
Server.js line 1145 was passing incomplete path to Python script:

```javascript
// BEFORE (BUG):
actualOutputPath = path.join('results', training_id);
// Resulted in: results/5350f49a-4b37-4287-a30e-2b2ab0a26f64

// Python script expected:
downsampled_path = output_path.replace('.tif', '_original_web.tif')
// With no .tif in path, replace() did nothing!
// Downsampled file was never created at correct location
```

**Impact Chain:**
1. Server passes path without `.tif`: `results/{id}`
2. Python saves segmented result to: `results/{id}` (no extension)
3. Python tries to create downsampled path: `output_path.replace('.tif', '_original_web.tif')`
4. Replace fails (no `.tif` to replace), downsampled path = `results/{id}` (same as metadata)
5. Downsampling succeeds but file goes to wrong location
6. Metadata stores wrong path
7. Server serves wrong file (metadata JSON instead of TIFF)
8. Frontend gets 1078 bytes of JSON instead of 80K+ of TIFF data
9. UTIF decodes metadata JSON as TIFF → 0 bytes of image data

### Fix Applied

**File:** `server.js` (lines 1142, 1145, 1148)

**Changes:**
```javascript
// Line 1142 - Imported models:
actualOutputPath = path.join('results', `imported_model_${timestamp}`, 'inference_result.tif');

// Line 1145 - Trained models:
actualOutputPath = path.join('results', training_id, 'inference_result.tif');

// Line 1148 - Fallback:
actualOutputPath = path.join('results', `inference_${inferenceId}`, 'inference_result.tif');
```

**What This Fixes:**
- Creates proper directory structure: `results/{id}/`
- Saves segmented result as: `results/{id}/inference_result.tif`
- Metadata saved as: `results/{id}/inference_result_metadata.json`
- Downsampled overlay saved as: `results/{id}/inference_result_original_web.tif`
- Python script's `.replace('.tif', '_original_web.tif')` now works correctly

### Result

✅ **Server restarted with fix**
✅ **Output paths now include directory and filename with .tif extension**
✅ **Python downsampling script will now create files in correct locations**
✅ **Metadata will reference correct downsampled TIFF path**

---

## Server Status

✅ **Server running on http://localhost:3000**
✅ **All diagnostic logging active**
✅ **Root cause fixed**
✅ **Ready for Phase 3 testing**

---

## Summary

**Phase 1 Complete:** Diagnostic logging infrastructure in place

**Phase 2 Complete:** User testing identified the issue

**Phase 3 Complete:** Root cause found and fixed

**What We Found:**
- Server was passing incomplete paths to Python inference script
- Missing `.tif` extension caused downsampling path generation to fail
- Files were being saved to wrong locations
- Frontend was fetching metadata JSON instead of TIFF data

**What We Fixed:**
- Updated server.js to include full path with directory and filename
- All three path generation cases now create proper structure
- Python script can now correctly generate downsampled overlay paths

**Next Action:**
👉 **User to run new inference and verify overlay appears correctly**

### Testing Instructions - Phase 3

1. Navigate to `http://localhost:3000/workspace`
2. Launch Segmentation Module
3. **Run a NEW inference** (Steps 1-4 with test data)
4. Advance to Step 5 (3D Visualization)
5. Toggle "Original Data Overlay" checkbox

**Expected Results:**
- Console should show: `[OriginalData] Decoded 20 image(s) from TIFF`
- Console should show: `[OriginalData] Slice 0: 262144 RGBA values, 1048576 bytes`
- Overlay planes should appear visually in 3D scene
- No WebGL texture errors
