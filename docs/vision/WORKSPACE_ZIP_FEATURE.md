# Workspace Download/Upload (ZIP) Feature Implementation Plan

**Created:** 2026-01-01
**Status:** Planned
**Purpose:** Enable users to backup and restore workspaces across sessions

## Overview

Add the ability to download an entire workspace as a compressed `.zip` file and restore workspaces from previously exported zip files. This enables users to continue work across sessions without requiring server-side long-term storage.

## User Decisions
- **Restore mode**: Replace (clear workspace before extracting)
- **Cache directories**: Exclude (.thumbnails, .slices, .mesh-previews) - smaller zip, regenerate on demand
- **Session ID**: Update to new session on restore
- **Download confirmation**: Show confirmation dialog before starting

---

## Phase 1: Backend Implementation

### 1.1 Add Dependency
**File:** `package.json`
```bash
npm install unzipper
```

### 1.2 WorkspaceManager Methods
**File:** `/WorkspaceManager.js`

Add methods:
- `clearWorkspace(sessionId)` - Delete all files except cache dirs, reset metadata
- `updateMetadataSessionId(sessionId)` - Update session ID in metadata.json
- `getTiffFiles(sessionId)` - Get list of TIFF files for thumbnail regeneration

### 1.3 WorkspaceService Methods
**File:** `/src/services/WorkspaceService.js`

Add methods:
- `exportWorkspace(sessionId, res)` - Stream zip to response
- `restoreWorkspace(sessionId, zipBuffer)` - Extract and restore workspace

### 1.4 New API Endpoints
**File:** `/src/routes/workspace.routes.js`

#### Download Endpoint
```
GET /api/workspace/download
```
- Requires auth
- Creates zip using `archiver` (already installed)
- Excludes: `.thumbnails/`, `.slices/`, `.mesh-previews/`
- Streams directly to response (no temp files)
- Headers: `Content-Disposition: attachment; filename="workspace_<timestamp>.zip"`

#### Restore Endpoint
```
POST /api/workspace/restore
```
- Requires auth
- Accepts multipart form with `workspace` field (.zip file)
- Validates zip contains `metadata.json`
- Clears current workspace
- Extracts zip contents
- Updates session ID in metadata
- Triggers async thumbnail regeneration
- Returns file count and status

### 1.5 Upload Middleware Update
**File:** `/src/middleware/upload.middleware.js`

Add workspace zip file filter and multer config:
- Accept only `.zip` files for workspace restore
- 5GB file size limit for workspace zips

### 1.6 Timeout Configuration
**File:** `/server.js` or `/src/app.js`

Increase timeout for workspace routes (10 minutes for large workspaces)

---

## Phase 2: Frontend Implementation

### 2.1 Sidebar Download Button
**File:** `/public/workspace/index.html` (lines 38-49)

Change the workspace stats section header:
```html
<div class="sidebar-section workspace-stats">
  <div class="workspace-header">
    <h3>Workspace</h3>
    <button class="btn-workspace-download" id="btn-download-workspace" title="Download workspace as ZIP">
      <svg><!-- download icon --></svg>
    </button>
  </div>
  <!-- existing stat-items -->
</div>
```

### 2.2 FileBrowser Dropdown Update
**File:** `/public/workspace/js/components/FileBrowser.js`

Update dropdown (around line 272-278):
```html
<option value="workspace">Restore Workspace (ZIP)</option>
```

Update methods:
- `updateFileInputAccept()` - Set `.zip` accept for workspace category
- `validateFiles()` - Add workspace zip validation (single file, .zip extension)
- Add `handleWorkspaceRestore(file)` method for restore workflow

### 2.3 WorkspaceAPI Methods
**File:** `/public/workspace/js/core/WorkspaceAPI.js`

Add:
- `downloadWorkspace()` - Fetch blob and trigger download
- `restoreWorkspace(zipFile, onProgress)` - Upload with XHR for progress tracking

### 2.4 Confirmation Dialogs
**File:** `/public/workspace/js/components/FileBrowser.js`

Add modal methods:
- `showDownloadConfirmation(stats)` - Confirm before download with size info
- `showRestoreConfirmation()` - Warn about replacing current workspace

### 2.5 Loading Overlay
**File:** `/public/workspace/js/workspace.js`

Add workspace download handler with loading overlay

---

## Phase 3: CSS Styling
**File:** `/public/workspace/css/workspace.css`

Add styles for:
- `.workspace-header` - Flexbox layout with h3 and download button
- `.btn-workspace-download` - Small icon button styling
- `.workspace-confirm-modal` - Confirmation dialog overlay
- `.workspace-confirm-content` - Dialog content styling
- `.workspace-confirm-actions` - Button row (cancel/confirm)

---

## Critical Files to Modify

| File | Changes |
|------|---------|
| `package.json` | Add `unzipper` dependency |
| `WorkspaceManager.js` | Add clearWorkspace, updateMetadataSessionId, getTiffFiles |
| `src/services/WorkspaceService.js` | Add exportWorkspace, restoreWorkspace |
| `src/routes/workspace.routes.js` | Add GET /download, POST /restore endpoints |
| `src/middleware/upload.middleware.js` | Add workspace zip filter and config |
| `public/workspace/index.html` | Update workspace-stats section header |
| `public/workspace/js/components/FileBrowser.js` | Add workspace option, restore handling |
| `public/workspace/js/core/WorkspaceAPI.js` | Add downloadWorkspace, restoreWorkspace |
| `public/workspace/js/workspace.js` | Add downloadWorkspace handler, event listener |
| `public/workspace/css/workspace.css` | Add header and modal styles |

---

## Implementation Order

1. **Phase 1A**: Backend core (WorkspaceManager methods)
2. **Phase 1B**: Backend routes (download endpoint first, then restore)
3. **Phase 2A**: Frontend API methods
4. **Phase 2B**: Frontend UI (button, dropdown, confirmation dialogs)
5. **Phase 3**: CSS styling
6. **Testing**: End-to-end testing with various workspace sizes

---

## Error Handling

### Backend
- Invalid/missing zip structure
- Corrupted zip extraction
- Disk space issues
- Timeout handling for large files

### Frontend
- Network errors during upload/download
- User cancellation
- Session expiry during long operations
- Browser download restrictions

---

## Testing Checklist
- [ ] Download empty workspace
- [ ] Download workspace with files (small)
- [ ] Download large workspace (>1GB)
- [ ] Upload valid workspace zip
- [ ] Upload invalid zip (no metadata.json)
- [ ] Upload corrupted zip
- [ ] Verify thumbnails regenerate after restore
- [ ] Verify session ID updates in restored metadata
- [ ] Cancel operations work correctly
- [ ] Dark mode styling
