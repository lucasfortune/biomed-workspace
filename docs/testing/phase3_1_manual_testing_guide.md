# Phase 3.1 Backend Infrastructure - Manual Testing Guide

**Date:** 2025-12-05
**Phase:** Phase 3.1 Backend Testing
**Prerequisites:** Server running, authenticated user session

---

## Testing Approach

Since all endpoints require authentication (`requireAuth`), we'll test using **browser console** while logged into the workspace. This ensures proper session handling.

---

## Setup

### 1. Start the Server

```bash
cd /home/lucas/Documents/phd/RKI_laue/viz_app
npm start
```

### 2. Login to Workspace

1. Navigate to `http://localhost:3000`
2. Login with your credentials
3. Navigate to `/workspace`
4. Open browser DevTools (F12)
5. Go to Console tab

---

## Testing Checklist

### ✅ Backend Endpoints (14 endpoints)

#### File Operations (9 endpoints)

- [ ] **Test 1:** Get file info (`GET /api/workspace/file/:fileId`)
- [ ] **Test 2:** Delete single file (`DELETE /api/workspace/file/:fileId`)
- [ ] **Test 3:** Rename file (`PATCH /api/workspace/file/:fileId/rename`)
- [ ] **Test 4:** Move file to folder (`PATCH /api/workspace/file/:fileId/move`)
- [ ] **Test 5:** Download file (`GET /api/workspace/file/:fileId/download`)
- [ ] **Test 6:** Batch delete files (`POST /api/workspace/files/batch-delete`)
- [ ] **Test 7:** Batch download files (`POST /api/workspace/files/batch-download`)
- [ ] **Test 8:** Search files (`GET /api/workspace/files/search?q=query`)
- [ ] **Test 9:** Filter by category (`GET /api/workspace/files/category/:category`)

#### Folder Operations (4 endpoints)

- [ ] **Test 10:** List all folders (`GET /api/workspace/folders`)
- [ ] **Test 11:** Create folder (`POST /api/workspace/folders`)
- [ ] **Test 12:** Rename folder (`PATCH /api/workspace/folders/:folderId`)
- [ ] **Test 13:** Delete folder (`DELETE /api/workspace/folders/:folderId`)

#### Thumbnail System (1 endpoint)

- [ ] **Test 14:** Generate/serve thumbnail (`GET /api/workspace/thumbnail/:fileId`)

### ✅ Integration Testing

- [ ] **Test 15:** Upload file → verify tracked in metadata
- [ ] **Test 16:** Train model → verify outputs tracked (models category)
- [ ] **Test 17:** Run inference → verify outputs tracked (segmentations category)
- [ ] **Test 18:** Full workflow (upload → train → infer → manage files)

---

## Test Scripts (Run in Browser Console)

### Helper Functions

First, paste these helper functions in the console:

```javascript
// Helper: Make authenticated API request
async function testAPI(method, url, body = null) {
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' }
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  const data = await response.json();

  console.log(`✅ ${method} ${url}`, data);
  return data;
}

// Helper: Get workspace status (to see current files/folders)
async function getStatus() {
  const data = await testAPI('GET', '/api/workspace/status');
  console.log('📁 Current Files:', data.files?.length || 0);
  console.log('📂 Current Folders:', data.folders?.length || 0);
  return data;
}

// Helper: List all files
async function listFiles() {
  const data = await getStatus();
  console.table(data.files?.map(f => ({
    id: f.id,
    name: f.name,
    category: f.category,
    size: Math.round(f.size / 1024) + ' KB',
    folderId: f.folderId || 'root'
  })) || []);
  return data.files;
}

// Helper: List all folders
async function listFolders() {
  const data = await testAPI('GET', '/api/workspace/folders');
  console.table(data.folders?.map(f => ({
    id: f.id,
    name: f.name,
    parentId: f.parentId || 'root',
    color: f.color
  })) || []);
  return data.folders;
}
```

---

## Test Sequence

### Phase 1: Initial Setup

#### Test 0: Check Current State

```javascript
// View current workspace status
await getStatus();

// List all files
await listFiles();

// List all folders
await listFolders();
```

**Expected:** Should see files from previous uploads/training sessions (if any)

---

### Phase 2: Folder Operations

#### Test 11: Create Folder

```javascript
// Create a test folder
const folderResult = await testAPI('POST', '/api/workspace/folders', {
  name: 'Test Project',
  parentId: null,
  color: '#4A90E2'
});

console.log('📂 Created folder:', folderResult.folder);

// Verify it appears in status
await listFolders();
```

**Expected:**
- `success: true`
- Returns folder object with `id`, `name`, `parentId`, `createdAt`, `color`
- Folder appears in folder list

**Save the folder ID for next tests:**
```javascript
const testFolderId = folderResult.folder.id;
console.log('Save this ID:', testFolderId);
```

#### Test 12: Rename Folder

```javascript
// Rename the folder
const renameResult = await testAPI('PATCH', `/api/workspace/folders/${testFolderId}`, {
  name: 'Renamed Project'
});

console.log('✏️ Renamed folder:', renameResult.folder);

// Verify name changed
await listFolders();
```

**Expected:**
- `success: true`
- Folder name updates to "Renamed Project"

---

### Phase 3: File Operations (Requires Existing File)

First, let's get a file ID to test with:

```javascript
// Get first file from workspace
const files = await listFiles();

if (files && files.length > 0) {
  const testFile = files[0];
  const testFileId = testFile.id;
  console.log('📄 Using test file:', testFile.name, '(ID:', testFileId, ')');

  // Store for use in tests below
  window.testFileId = testFileId;
} else {
  console.warn('⚠️ No files found. Upload a file first to test file operations.');
  console.log('You can upload test data in the segmentation module.');
}
```

#### Test 1: Get File Info

```javascript
// Get file details
const fileInfo = await testAPI('GET', `/api/workspace/file/${testFileId}`);
console.log('📄 File info:', fileInfo.file);
```

**Expected:**
- `success: true`
- Returns file object with metadata

#### Test 3: Rename File

```javascript
// Get current file name first
const currentFile = await testAPI('GET', `/api/workspace/file/${testFileId}`);
const originalName = currentFile.file.name;
const extension = originalName.split('.').pop();

// Create new name with same extension
const newName = 'renamed_file_test.' + extension;

// Rename file
const renameResult = await testAPI('PATCH', `/api/workspace/file/${testFileId}/rename`, {
  newName: newName
});

console.log('✏️ Renamed file:', renameResult.file);

// Verify rename
await listFiles();
```

**Expected:**
- `success: true`
- File name updates in metadata
- Extension validation prevents changing file type

#### Test 4: Move File to Folder

```javascript
// Move file into the test folder
const moveResult = await testAPI('PATCH', `/api/workspace/file/${testFileId}/move`, {
  targetFolderId: testFolderId
});

console.log('📁 Moved file:', moveResult.file);

// Verify folderId updated
await listFiles();
```

**Expected:**
- `success: true`
- File's `folderId` updates to `testFolderId`

#### Test 8: Search Files

```javascript
// Search for files containing "test" in name
const searchResult = await testAPI('GET', '/api/workspace/files/search?q=test');
console.log('🔍 Search results:', searchResult.files);
console.table(searchResult.files);
```

**Expected:**
- Returns files matching "test" (case-insensitive)

#### Test 9: Filter by Category

```javascript
// Filter by category (try: raw_images, models, segmentations)
const filterResult = await testAPI('GET', '/api/workspace/files/category/raw_images');
console.log('🗂️ Filtered files:', filterResult.files);
console.table(filterResult.files);
```

**Expected:**
- Returns only files with `category: 'raw_images'`

#### Test 14: Generate Thumbnail

```javascript
// Get thumbnail for a TIFF file
// This will open in a new tab
const thumbnailUrl = `/api/workspace/thumbnail/${testFileId}`;
window.open(thumbnailUrl, '_blank');

console.log('🖼️ Thumbnail URL:', thumbnailUrl);
```

**Expected:**
- If file is TIFF: Generates 120x120px JPEG thumbnail
- If not TIFF: Returns 404 or placeholder
- Thumbnail cached in `.thumbnails/` folder

#### Test 5: Download File

```javascript
// Download file (will trigger browser download)
const downloadUrl = `/api/workspace/file/${testFileId}/download`;
window.open(downloadUrl, '_blank');

console.log('⬇️ Download URL:', downloadUrl);
```

**Expected:**
- File downloads with correct filename

---

### Phase 4: Batch Operations

#### Test 6: Batch Delete

**⚠️ WARNING:** This will delete files. Only use with test files!

```javascript
// Get IDs of files to delete (create test files first if needed)
const files = await listFiles();
const filesToDelete = files.slice(0, 2).map(f => f.id); // Delete first 2 files

console.log('🗑️ Files to delete:', filesToDelete);

// Confirm deletion
if (confirm(`Delete ${filesToDelete.length} files?`)) {
  const deleteResult = await testAPI('POST', '/api/workspace/files/batch-delete', {
    fileIds: filesToDelete
  });

  console.log('✅ Deleted:', deleteResult.deletedCount, 'files');

  // Verify deletion
  await listFiles();
}
```

**Expected:**
- `success: true`
- `deletedCount` matches number of files
- Files removed from metadata AND filesystem

#### Test 7: Batch Download

```javascript
// Download multiple files as zip
const files = await listFiles();
const fileIds = files.slice(0, 3).map(f => f.id); // Download first 3 files

console.log('📦 Files to download:', fileIds);

// Create download (will trigger browser download)
const response = await fetch('/api/workspace/files/batch-download', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ fileIds })
});

if (response.ok) {
  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'workspace_files.zip';
  a.click();
  window.URL.revokeObjectURL(url);

  console.log('✅ Downloaded zip with', fileIds.length, 'files');
}
```

**Expected:**
- Downloads zip file containing selected files
- Zip should be valid and extractable

#### Test 13: Delete Folder

```javascript
// Delete the test folder (moves files to root)
const deleteResult = await testAPI('DELETE', `/api/workspace/folders/${testFolderId}`);

console.log('🗑️ Deleted folder:', deleteResult.message);

// Verify folder deleted and files moved to root
await listFolders();
await listFiles(); // Check files now have folderId: null
```

**Expected:**
- `success: true`
- Folder removed from metadata
- All files in folder moved to root (`folderId: null`)

---

### Phase 5: Integration Tests

#### Test 15: Upload File → Verify Tracking

**Manual Steps:**
1. Navigate to Segmentation Module
2. Upload test data or custom file
3. Run this in console:

```javascript
// Check if file was tracked
const status = await getStatus();
const recentFile = status.files[status.files.length - 1];

console.log('📄 Most recent file:', recentFile);
console.log('Has thumbnail path?', recentFile.thumbnailPath ? '✅' : '❌');
```

**Expected:**
- New file appears in metadata
- `category` is correct (e.g., `raw_images`)
- `thumbnailPath` may be null initially (generated on-demand)

#### Test 16: Train Model → Verify Outputs Tracked

**Manual Steps:**
1. Train a model in Segmentation Module
2. After training completes, run:

```javascript
// Check for tracked model files
const modelFiles = await testAPI('GET', '/api/workspace/files/category/models');
console.log('🧠 Model files:', modelFiles.files);
console.table(modelFiles.files);
```

**Expected:**
- `best_model.pth` tracked in metadata
- `config.json` tracked
- `results.json` tracked
- All have `category: 'models'`

#### Test 17: Run Inference → Verify Outputs Tracked

**Manual Steps:**
1. Run inference in Segmentation Module
2. After inference completes, run:

```javascript
// Check for tracked segmentation files
const segFiles = await testAPI('GET', '/api/workspace/files/category/segmentations');
console.log('🎨 Segmentation files:', segFiles.files);
console.table(segFiles.files);
```

**Expected:**
- Segmented TIFF file tracked
- Metadata JSON tracked
- Category is `segmentations`

---

## Verification Checklist

After running all tests, verify:

### ✅ Metadata Integrity

```javascript
// Check metadata.json directly
const status = await getStatus();

console.log('📊 Workspace Stats:');
console.log('- Total files:', status.files?.length || 0);
console.log('- Total folders:', status.folders?.length || 0);
console.log('- Metadata version:', status.version);

// Verify no orphaned files
const filesInFolders = status.files?.filter(f => f.folderId) || [];
const folderIds = new Set(status.folders?.map(f => f.id) || []);

const orphans = filesInFolders.filter(f => !folderIds.has(f.folderId));
console.log('🔍 Orphaned files:', orphans.length, orphans);
```

**Expected:**
- No orphaned files (files with folderId that doesn't exist)
- Metadata version is `1.1.0`

### ✅ Filesystem Consistency

**Manual verification:**
1. Navigate to workspace directory:
   ```bash
   cd workspaces/<your-session-id>
   ls -la
   ```

2. Check `.thumbnails/` folder exists:
   ```bash
   ls -la .thumbnails/
   ```

3. Verify files match metadata:
   ```bash
   find . -type f -name "*.tif" -o -name "*.pth" -o -name "*.json"
   ```

---

## Common Issues & Solutions

### Issue 1: "No files found"

**Solution:** Upload test data first:
1. Go to Segmentation Module
2. Select "Use Test Data"
3. Click Upload
4. Return to console and re-run tests

### Issue 2: Thumbnail generation fails

**Check Python script:**
```bash
cd /home/lucas/Documents/phd/RKI_laue/viz_app
python python/generate_thumbnail.py test_data/trypB_testData_training.tif /tmp/test_thumb.jpg
```

**Expected:** Creates `/tmp/test_thumb.jpg`

### Issue 3: Session ID unknown

**Get session ID:**
```javascript
// In browser console
fetch('/api/workspace/status')
  .then(r => r.json())
  .then(d => console.log('Session ID:', d.sessionId));
```

### Issue 4: Batch operations timeout

**Solution:** Test with smaller batches (<10 files) first

---

## Test Results Template

Copy this template to track your results:

```markdown
## Phase 3.1 Backend Testing Results

**Date:** 2025-12-05
**Tester:** [Your Name]
**Environment:** Local Development

### File Operations
- [ ] Test 1: Get file info - PASS/FAIL
- [ ] Test 2: Delete file - PASS/FAIL
- [ ] Test 3: Rename file - PASS/FAIL
- [ ] Test 4: Move file - PASS/FAIL
- [ ] Test 5: Download file - PASS/FAIL
- [ ] Test 6: Batch delete - PASS/FAIL
- [ ] Test 7: Batch download - PASS/FAIL
- [ ] Test 8: Search files - PASS/FAIL
- [ ] Test 9: Filter by category - PASS/FAIL

### Folder Operations
- [ ] Test 10: List folders - PASS/FAIL
- [ ] Test 11: Create folder - PASS/FAIL
- [ ] Test 12: Rename folder - PASS/FAIL
- [ ] Test 13: Delete folder - PASS/FAIL

### Thumbnail System
- [ ] Test 14: Generate thumbnail - PASS/FAIL

### Integration Tests
- [ ] Test 15: Upload tracking - PASS/FAIL
- [ ] Test 16: Model output tracking - PASS/FAIL
- [ ] Test 17: Inference output tracking - PASS/FAIL

### Issues Found
[List any bugs or unexpected behavior]

### Notes
[Additional observations]
```

---

## Next Steps After Testing

1. **Document issues** in session log
2. **Fix critical bugs** before Phase 3.2
3. **Update ROADMAP.md** to mark Phase 3.1 testing complete
4. **Proceed to Phase 3.2** (File Browser UI Core)

---

**Navigation:** [← Session Log](../sessions/2025-12-04_phase3_1_backend_infrastructure.md) | [PHASE3_PLAN →](../vision/PHASE3_PLAN.md)
