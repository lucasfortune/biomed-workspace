# Phase 3.1 Testing - Quick Reference Card

**Keep this open while testing!**

---

## 🚀 Quick Start

### Option 1: Automated Testing (Fastest)

```bash
# Test WorkspaceManager methods directly
node test_phase3_backend.js
```

**Expected:** All tests pass ✅

---

### Option 2: Browser Console Testing (For API Endpoints)

1. **Start server:** `npm start`
2. **Login:** Navigate to `http://localhost:3000/workspace`
3. **Open DevTools:** Press `F12` → Console tab
4. **Copy-paste helpers:** See below 👇

---

## 📋 Browser Console Helpers

### Copy-paste this first:

```javascript
// API Helper
async function api(method, url, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const data = await res.json();
  console.log(`✅ ${method} ${url}`, data);
  return data;
}

// List files
async function files() {
  const d = await api('GET', '/api/workspace/status');
  const fileList = d.workspace?.files || [];
  console.table(fileList.map(f => ({ id: f.id, name: f.name, category: f.category })));
  return fileList;
}

// List folders
async function folders() {
  const d = await api('GET', '/api/workspace/folders');
  console.table(d.folders);
  return d.folders;
}
```

---

## ⚡ Common Test Commands

### Create a folder
```javascript
const folder = await api('POST', '/api/workspace/folders', {
  name: 'My Test Folder',
  parentId: null,
  color: '#4A90E2'
});
console.log('Folder ID:', folder.folder.id);
```

### Get first file ID
```javascript
const fileList = await files();
const fileId = fileList[0]?.id;
console.log('File ID:', fileId);
```

### Rename file
```javascript
await api('PATCH', `/api/workspace/file/${fileId}/rename`, {
  newName: 'renamed_test.tif'
});
```

### Move file to folder
```javascript
await api('PATCH', `/api/workspace/file/${fileId}/move`, {
  targetFolderId: folder.folder.id
});
```

### Search files
```javascript
const results = await api('GET', '/api/workspace/files/search?q=test');
console.table(results.files);
```

### Download thumbnail
```javascript
window.open(`/api/workspace/thumbnail/${fileId}`, '_blank');
```

### Batch delete
```javascript
await api('POST', '/api/workspace/files/batch-delete', {
  fileIds: [fileId1, fileId2]
});
```

### Delete folder (moves files to root)
```javascript
await api('DELETE', `/api/workspace/folders/${folderId}`);
```

---

## 📝 Test Checklist (Print & Check Off)

```
Folder Operations:
[ ] Create folder
[ ] Rename folder
[ ] List folders
[ ] Delete folder (files moved to root)

File Operations:
[ ] Get file info
[ ] Rename file (same extension enforced)
[ ] Move file to folder
[ ] Download file
[ ] Delete file

Search & Filter:
[ ] Search by filename
[ ] Filter by category

Batch Operations:
[ ] Batch download (creates zip)
[ ] Batch delete

Thumbnails:
[ ] Generate thumbnail for TIFF file
[ ] Thumbnail cached in .thumbnails/

Integration:
[ ] Upload file → tracked in metadata
[ ] Train model → outputs tracked
[ ] Run inference → outputs tracked
```

---

## 🐛 Troubleshooting

### No files in workspace?
```javascript
// Upload test data first via Segmentation Module
// Then check:
await files();
```

### Need to reset workspace?
```javascript
// Reset current session (clears all files)
await api('POST', '/api/reset-session', {});
```

### Check metadata directly?
```bash
# In terminal
cd workspaces/<session-id>
cat metadata.json | jq .
```

### Python thumbnail script failing?
```bash
# Test manually
python python/generate_thumbnail.py \
  test_data/trypB_testData_training.tif \
  /tmp/test_thumb.jpg
```

---

## ✅ Success Criteria

**All endpoints should:**
- Return `{ success: true }` on success
- Return proper error messages on failure
- Update `metadata.json` correctly
- Not create orphaned files/folders

**Metadata should:**
- Be version `1.1.0`
- Have `folders` array
- Have files with `folderId` and `thumbnailPath` fields

---

## 📊 What to Record

**For each test:**
- ✅ PASS or ❌ FAIL
- If failed: Error message
- Any unexpected behavior

**Report findings in:**
`docs/sessions/2025-12-05_phase3_1_testing_results.md`

---

## 🎯 Next Steps After Testing

1. **All tests pass?** → Update ROADMAP.md, start Phase 3.2
2. **Some tests fail?** → Create session log, fix bugs, re-test
3. **Major issues?** → Consult Phase 3.1 session log for implementation details

---

**Reference:** [Full Testing Guide](phase3_1_manual_testing_guide.md)
