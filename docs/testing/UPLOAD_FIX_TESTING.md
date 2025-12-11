# Upload Fix Testing Guide

**Date:** 2025-12-05
**Issue Fixed:** Files uploaded via Segmentation Module now stored in workspace and tracked in metadata

---

## 🎯 What Was Fixed

### **Problem:**
- Files uploaded through Segmentation Module were stored in `uploads/{sessionId}/`
- These files were NOT tracked in workspace `metadata.json`
- File browser showed NO files because they weren't in metadata

### **Solution:**
1. Modified `/upload-data` endpoint to store files in `workspaces/{sessionId}/uploads/raw/`
2. Added automatic metadata tracking for uploaded files
3. Files now appear in file browser immediately after upload

---

## 🚀 Quick Test (5 minutes)

### Step 1: Restart Server

```bash
# Stop server (Ctrl+C if running)
# Start fresh
cd /home/lucas/Documents/phd/RKI_laue/viz_app
npm start
```

### Step 2: Upload Test Data

1. Navigate to `http://localhost:3000/workspace`
2. Click "Launch Module" on Segmentation card
3. **Click "Use Test Data"** button
4. Wait for "Files validated successfully" message

### Step 3: Check Files in Browser Console

Open DevTools (F12) → Console tab:

```javascript
// Helper function
async function api(method, url, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  return await res.json();
}

// Check workspace files
const status = await api('GET', '/api/workspace/status');
console.log('📊 Files in workspace:', status.workspace?.files?.length || 0);
if (status.workspace?.files) {
  console.table(status.workspace.files);
} else {
  console.error('❌ No files found!', status);
}
```

### Step 4: Expected Result

**You should see:**
```
📊 Files in workspace: 2

┌─────────┬──────────────────────────────────────────┬───────────────────────────┬────────────────┬─────────┐
│ (index) │ id                                       │ name                      │ category       │ size    │
├─────────┼──────────────────────────────────────────┼───────────────────────────┼────────────────┼─────────┤
│ 0       │ 'file_1733397123456_abc123def'           │ 'trypB_testData_train...' │ 'raw_images'   │ 5242880 │
│ 1       │ 'file_1733397123457_def456ghi'           │ 'trypB_testData_annot...' │ 'annotations'  │ 1048576 │
└─────────┴──────────────────────────────────────────┴───────────────────────────┴────────────────┴─────────┘
```

---

## ✅ Success Criteria

- [ ] **2 files** appear in workspace status
- [ ] Files have categories: `raw_images` and `annotations`
- [ ] Each file has unique ID starting with `file_`
- [ ] Files stored in `workspaces/{sessionId}/uploads/raw/`
- [ ] `metadata.json` contains file entries

---

## 🔍 Detailed Verification

### Check Metadata File

```bash
# Replace {sessionId} with your actual session ID
# To find session ID, run in console: fetch('/api/workspace/status').then(r=>r.json()).then(d=>console.log(d.sessionId))

cat workspaces/{sessionId}/metadata.json | jq '.files'
```

**Expected output:**
```json
[
  {
    "id": "file_1733397123456_abc123def",
    "name": "trypB_testData_training.tif",
    "path": "uploads/raw/trypB_testData_training.tif",
    "category": "raw_images",
    "size": 5242880,
    "uploadedAt": "2025-12-05T10:30:45.123Z",
    "folderId": null,
    "thumbnailPath": null
  },
  {
    "id": "file_1733397123457_def456ghi",
    "name": "trypB_testData_annotations.tif",
    "path": "uploads/raw/trypB_testData_annotations.tif",
    "category": "annotations",
    "size": 1048576,
    "uploadedAt": "2025-12-05T10:30:45.456Z",
    "folderId": null,
    "thumbnailPath": null
  }
]
```

### Check Filesystem

```bash
# Check workspace structure
ls -la workspaces/{sessionId}/

# Should show:
# drwxr-xr-x  uploads/
# -rw-r--r--  metadata.json

# Check files exist
ls -la workspaces/{sessionId}/uploads/raw/

# Should show:
# -rw-r--r--  trypB_testData_training.tif
# -rw-r--r--  trypB_testData_annotations.tif
```

---

## 🧪 Full Backend Test

Now you can run the automated test successfully:

```bash
node test_phase3_backend.js
```

**Expected:** All tests pass ✅

---

## 🎨 Testing File Browser Features

Once files are in metadata, test all the Phase 3.1 endpoints:

### 1. Search Files

```javascript
const results = await api('GET', '/api/workspace/files/search?q=test');
console.log('🔍 Search results:', results.files.length);
// Should return 2 files (both have "test" in name)
```

### 2. Filter by Category

```javascript
const rawFiles = await api('GET', '/api/workspace/files/category/raw_images');
console.log('🗂️ Raw images:', rawFiles.files.length);
// Should return 1 file

const annFiles = await api('GET', '/api/workspace/files/category/annotations');
console.log('🗂️ Annotations:', annFiles.files.length);
// Should return 1 file
```

### 3. Create Folder

```javascript
const folder = await api('POST', '/api/workspace/folders', {
  name: 'My Project',
  parentId: null,
  color: '#4A90E2'
});
console.log('📂 Created folder:', folder.folder.id);
```

### 4. Move File to Folder

```javascript
// Get first file ID
const files = (await api('GET', '/api/workspace/status')).files;
const fileId = files[0].id;

// Move to folder
const moved = await api('PATCH', `/api/workspace/file/${fileId}/move`, {
  targetFolderId: folder.folder.id
});
console.log('📁 File moved:', moved.file.folderId === folder.folder.id);
```

### 5. Generate Thumbnail

```javascript
// Open thumbnail in new tab
window.open(`/api/workspace/thumbnail/${fileId}`, '_blank');
```

### 6. Download File

```javascript
window.open(`/api/workspace/file/${fileId}/download`, '_blank');
```

---

## 🐛 Troubleshooting

### Issue: No files in workspace

**Check 1: Did upload succeed?**
```javascript
// Check console for errors during upload
```

**Check 2: Is workspace initialized?**
```javascript
const status = await api('GET', '/api/workspace/status');
console.log('Workspace initialized?', status.success);
```

**Check 3: Check metadata directly**
```bash
cat workspaces/{sessionId}/metadata.json
```

### Issue: Files in old `uploads/` directory

This means you tested BEFORE the fix was applied.

**To clean up:**
```bash
# Remove old uploads
rm -rf uploads/{sessionId}/

# Files in workspace should still work
ls workspaces/{sessionId}/uploads/raw/
```

### Issue: Test script still fails

**Check WorkspaceManager has method:**
```bash
grep "initializeWorkspace" WorkspaceManager.js
# Should find the method definition
```

**Re-run with debug:**
```bash
node test_phase3_backend.js 2>&1 | tee test_output.log
```

---

## 📊 What to Test Next

After verifying uploads work:

1. **Train a model** → Check model files tracked
2. **Run inference** → Check output files tracked
3. **Batch operations** → Test with multiple uploads
4. **Folder organization** → Move files between folders
5. **Search/filter** → Test with diverse file names

---

## ✅ Sign-Off Checklist

Before moving to Phase 3.2:

- [ ] Test data uploads → files appear in workspace
- [ ] Custom file uploads → files tracked correctly
- [ ] Metadata version is 1.1.0
- [ ] Files have correct categories
- [ ] Automated test script passes
- [ ] All 14 API endpoints tested and working
- [ ] No orphaned files in old `uploads/` directory
- [ ] Workspace directory structure correct

---

## 🚀 Next: Phase 3.2 File Browser UI

Once all tests pass:

1. **Update ROADMAP.md** - Mark Phase 3.1 testing complete
2. **Create session log** - Document upload fix
3. **Start Phase 3.2** - Build FileBrowser component

**See:** `docs/vision/PHASE3_PLAN.md` for Phase 3.2 tasks

---

**Navigation:** [← Testing Quick Reference](TESTING_QUICK_REFERENCE.md) | [Phase 3 Plan →](../vision/PHASE3_PLAN.md)
