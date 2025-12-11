# Phase 3 Implementation Plan: File Browser & Workspace Management

**Status:** Phase 3.1 Complete ✅ | Phase 3.1.1 Complete ✅ | Phase 3.2 Ready to Start
**Target Duration:** 3-4 weeks
**Priority:** File browser with search, filter, and simple folder organization
**Approach:** Backend-first, iterative development

---

## 🎉 Phase 3.1 Backend Infrastructure - COMPLETE

**Completed:** 2025-12-04
**Status:** ✅ All implementation tasks complete, tested and functional

**Summary:** Implemented complete backend infrastructure for file browser system including enhanced metadata schema, 15 WorkspaceManager methods, 14 API endpoints, Python thumbnail generator, and automatic file tracking integration.

**Session Log:** [docs/sessions/2025-12-04_phase3_1_backend_infrastructure.md](../sessions/2025-12-04_phase3_1_backend_infrastructure.md)

**Delivered:**
- ✅ Enhanced metadata schema v1.1.0 with folders array
- ✅ 15 WorkspaceManager methods (folder, file, thumbnail operations)
- ✅ 14 new API endpoints (file/folder/thumbnail operations)
- ✅ Python thumbnail generator (120x120px JPEG from TIFF)
- ✅ Automatic file tracking for uploads and module outputs
- ✅ Batch operations (download as zip, batch delete)
- ✅ Integration with training/inference endpoints
- ✅ Backward compatibility with v1.0.0 metadata
- ✅ Comprehensive error handling

**Testing Status:**
- ✅ Syntax checks passed (all files)
- ✅ Server startup successful
- ✅ End-to-end segmentation workflow verified
- ✅ Integration testing complete

---

## 🎉 Phase 3.1.1 Directory Structure Consistency - COMPLETE

**Completed:** 2025-12-11
**Status:** ✅ All path consistency issues resolved, visualization functional

**Summary:** Fixed directory structure inconsistencies and visualization loading issues after workspace migration. Established consistent module-first organization pattern and proper path conversion between filesystem and web URLs.

**Session Log:** [docs/sessions/2025-12-11_workspace_path_consistency.md](../sessions/2025-12-11_workspace_path_consistency.md)

**Delivered:**
- ✅ Consistent directory structure: `/models/{module}/{trainingId}/` and `/results/{module}/{trainingId}/`
- ✅ Training output paths use `/models/segmentation/{trainingId}/`
- ✅ Inference results paths use `/results/segmentation/{trainingId}/segmented|visualizations/`
- ✅ Inference data path resolution for workspace structure
- ✅ Workspace-scoped static file serving routes with session verification
- ✅ Automatic filesystem-to-web path conversion for Python results
- ✅ Visualization data loading with new workspace paths
- ✅ Original data overlay loading functional
- ✅ Backward compatibility maintained with legacy paths

**Testing Status:**
- ✅ Training workflow verified
- ✅ Inference workflow verified
- ✅ Visualization rendering verified
- ✅ Complete segmentation pipeline end-to-end tested

**Next:** Proceed to Phase 3.2 File Browser UI Core

---

## Executive Summary

Phase 3 focuses on building a comprehensive file browser with folder organization, search/filter capabilities, and batch operations. The segmentation module is already complete, so we can focus entirely on file management infrastructure.

**Key Features:**
- Visual file tree with thumbnails (TIFF files)
- File operations (download, delete, rename, move)
- Folder organization (create, rename, move files into folders)
- Search by filename with real-time filtering
- Filter by category (raw images, annotations, models, etc.)
- Batch operations (multi-select, batch delete, batch download as zip)
- Context menu (right-click operations)
- Keyboard shortcuts (Ctrl+A, Delete, Escape)

**Architecture Decisions:**
- **Logical folders:** Metadata-only (no physical directory moves), stored in metadata.json
- **Thumbnail generation:** On-demand Python script with server-side caching (.thumbnails/)
- **Component structure:** FileBrowser.js (main), ContextMenu.js (reusable)
- **State management:** Centralized in StateManager (ui.fileSelection, workspace.files)
- **Backend storage:** Enhanced metadata.json schema with folders array

---

## Phase 3.1: Backend Infrastructure (Week 1, Days 1-3)

**Goal:** Build all backend endpoints and data structures needed for file operations.

### 1.1 Enhanced Metadata Schema

**Modify:** `WorkspaceManager.js`

**Current metadata.json structure:**
```json
{
  "sessionId": "abc123",
  "createdAt": "2025-12-03T10:00:00.000Z",
  "lastAccessed": "2025-12-03T14:00:00.000Z",
  "version": "1.0.0",
  "files": [
    {
      "id": "file_1701612345678",
      "name": "sample.tif",
      "path": "uploads/raw/sample.tif",
      "category": "raw_images",
      "size": 1024000,
      "uploadedAt": "2025-12-03T12:00:00.000Z"
    }
  ],
  "modules": { ... }
}
```

**Enhanced schema (add folders array):**
```json
{
  "sessionId": "abc123",
  "createdAt": "2025-12-03T10:00:00.000Z",
  "lastAccessed": "2025-12-03T14:00:00.000Z",
  "version": "1.1.0",
  "files": [
    {
      "id": "file_1701612345678",
      "name": "sample.tif",
      "path": "uploads/raw/sample.tif",
      "category": "raw_images",
      "size": 1024000,
      "uploadedAt": "2025-12-03T12:00:00.000Z",
      "folderId": null,
      "thumbnailPath": ".thumbnails/file_1701612345678.jpg"
    }
  ],
  "folders": [
    {
      "id": "folder_1701612400000",
      "name": "My Project",
      "parentId": null,
      "createdAt": "2025-12-03T12:05:00.000Z",
      "color": "#4A90E2"
    }
  ],
  "modules": { ... }
}
```

**Changes:**
- Add `folderId` field to files (null = root level)
- Add `thumbnailPath` field to files (populated on-demand)
- Add `folders` array with id, name, parentId (null = root), createdAt, color

### 1.2 WorkspaceManager Enhancements

**File:** `WorkspaceManager.js`

**New methods to add:**

```javascript
// Folder operations
createFolder(sessionId, folderName, parentId = null, color = '#4A90E2')
renameFolder(sessionId, folderId, newName)
deleteFolder(sessionId, folderId) // Also moves files to root
getFolders(sessionId)

// File operations
renameFile(sessionId, fileId, newName)
moveFile(sessionId, fileId, targetFolderId)
moveFilesToFolder(sessionId, fileIds, targetFolderId) // Batch
deleteFile(sessionId, fileId)
deleteFiles(sessionId, fileIds) // Batch
getFile(sessionId, fileId)
getFilesByCategory(sessionId, category)
searchFiles(sessionId, query)

// Thumbnail operations
generateThumbnail(sessionId, fileId)
getThumbnailPath(sessionId, fileId)

// Tree structure
getFileTree(sessionId) // Returns nested tree structure
```

**Key implementation details:**
- `deleteFolder()` moves all files in folder to root (folderId = null)
- `moveFile()` updates folderId in metadata, no physical move
- `deleteFile()` removes from metadata AND filesystem
- `getFileTree()` builds nested structure from flat arrays

### 1.3 Backend API Endpoints

**File:** `server.js`

**New endpoints to add:**

```javascript
// File operations
GET    /api/workspace/file/:fileId          // Get file info
DELETE /api/workspace/file/:fileId          // Delete single file
PATCH  /api/workspace/file/:fileId/rename   // Rename file
PATCH  /api/workspace/file/:fileId/move     // Move file to folder
POST   /api/workspace/files/batch-delete    // Delete multiple files
POST   /api/workspace/files/batch-download  // Download as zip
GET    /api/workspace/files/search          // Search files by name
GET    /api/workspace/files/category/:cat   // Filter by category

// Folder operations
GET    /api/workspace/folders               // List all folders
POST   /api/workspace/folders               // Create folder
PATCH  /api/workspace/folders/:folderId     // Rename folder
DELETE /api/workspace/folders/:folderId     // Delete folder (moves files to root)

// Thumbnail operations
GET    /api/workspace/thumbnail/:fileId     // Get or generate thumbnail
```

**Endpoint specifications:**

**1. GET /api/workspace/file/:fileId**
- Returns file metadata from metadata.json
- Response: `{ success: true, file: {...} }`

**2. DELETE /api/workspace/file/:fileId**
- Deletes file from filesystem and metadata
- Response: `{ success: true, message: "File deleted" }`

**3. PATCH /api/workspace/file/:fileId/rename**
- Body: `{ newName: "filename.tif" }`
- Validates extension matches original
- Updates metadata only (path stays same)
- Response: `{ success: true, file: {...} }`

**4. PATCH /api/workspace/file/:fileId/move**
- Body: `{ targetFolderId: "folder_123" }` (null for root)
- Updates folderId in metadata
- Response: `{ success: true, file: {...} }`

**5. POST /api/workspace/files/batch-delete**
- Body: `{ fileIds: ["file_1", "file_2", ...] }`
- Deletes multiple files
- Response: `{ success: true, deletedCount: 5 }`

**6. POST /api/workspace/files/batch-download**
- Body: `{ fileIds: ["file_1", "file_2", ...] }`
- Creates zip archive using `archiver` library
- Streams zip file to client
- Response: Binary zip file, Content-Disposition: attachment; filename="workspace_files.zip"

**7. GET /api/workspace/files/search?q=query**
- Query param: `q` (search term)
- Returns files matching name (case-insensitive)
- Response: `{ success: true, files: [...] }`

**8. GET /api/workspace/files/category/:category**
- Returns files in category (raw_images, annotations, etc.)
- Response: `{ success: true, files: [...] }`

**9. POST /api/workspace/folders**
- Body: `{ name: "My Project", parentId: null, color: "#4A90E2" }`
- Creates folder in metadata
- Response: `{ success: true, folder: {...} }`

**10. PATCH /api/workspace/folders/:folderId**
- Body: `{ name: "New Name" }`
- Updates folder name
- Response: `{ success: true, folder: {...} }`

**11. DELETE /api/workspace/folders/:folderId**
- Deletes folder, moves all files to root
- Response: `{ success: true, message: "Folder deleted, files moved to root" }`

**12. GET /api/workspace/thumbnail/:fileId**
- Checks if thumbnail exists in `.thumbnails/`
- If not, spawns Python script to generate
- Caches for future requests
- Response: Binary JPEG image, Content-Type: image/jpeg

### 1.4 Thumbnail Generation Script

**New file:** `python/generate_thumbnail.py`

**Usage:**
```bash
python generate_thumbnail.py <input_tiff_path> <output_jpeg_path> [slice_index]
```

**Implementation:**
```python
import sys
import numpy as np
from PIL import Image
import tifffile

def generate_thumbnail(input_path, output_path, slice_index=None):
    """
    Generate 120x120px JPEG thumbnail from TIFF file.
    If TIFF is 3D, extract middle slice by default.
    """
    # Load TIFF
    img = tifffile.imread(input_path)

    # Handle 3D: extract slice
    if len(img.shape) == 3:
        if slice_index is None:
            slice_index = img.shape[0] // 2
        img = img[slice_index]

    # Normalize to 0-255
    img = ((img - img.min()) / (img.max() - img.min()) * 255).astype(np.uint8)

    # Convert to PIL Image
    pil_img = Image.fromarray(img)

    # Resize to 120x120 (maintain aspect ratio, crop if needed)
    pil_img.thumbnail((120, 120), Image.Resampling.LANCZOS)

    # Save as JPEG
    pil_img.save(output_path, "JPEG", quality=85)

    print(f"SUCCESS:{output_path}")

if __name__ == "__main__":
    input_path = sys.argv[1]
    output_path = sys.argv[2]
    slice_index = int(sys.argv[3]) if len(sys.argv) > 3 else None

    try:
        generate_thumbnail(input_path, output_path, slice_index)
    except Exception as e:
        print(f"ERROR:{str(e)}")
        sys.exit(1)
```

**Node.js integration (in thumbnail endpoint):**
```javascript
const thumbnailPath = path.join('workspaces', sessionId, '.thumbnails', `${fileId}.jpg`);

// Create .thumbnails directory if not exists
await fs.mkdir(path.join('workspaces', sessionId, '.thumbnails'), { recursive: true });

// Spawn Python script
const pythonProcess = spawn('python', [
  'python/generate_thumbnail.py',
  filePath,
  thumbnailPath
]);

// Wait for completion, then serve thumbnail
```

### 1.5 Dependencies

**Add to package.json:**
```json
{
  "dependencies": {
    "archiver": "^6.0.1"
  }
}
```

**Install:** `npm install archiver`

### 1.6 Testing Checkpoints (Phase 3.1)

**Test each endpoint with curl/Postman:**
1. Create folder → verify in metadata.json
2. Upload file → verify thumbnail generation
3. Rename file → verify metadata updated
4. Move file to folder → verify folderId updated
5. Delete file → verify removed from filesystem and metadata
6. Batch delete → verify multiple files deleted
7. Search files → verify results match query
8. Filter by category → verify correct files returned
9. Batch download → verify zip file contains correct files
10. Delete folder → verify files moved to root

**Success criteria:**
- All endpoints return expected JSON responses
- Metadata.json updates correctly
- Thumbnails generated and cached
- Batch operations work for 10+ files
- No orphaned files after delete operations

---

## Phase 3.2: File Browser UI Core (Week 1-2, Days 4-5 + 1-2)

**Goal:** Build the visual file browser component with tree rendering and basic operations.

### 2.1 FileBrowser Component

**New file:** `public/workspace/js/components/FileBrowser.js`

**Component structure:**
```javascript
class FileBrowser {
  constructor(stateManager, api) {
    this.state = stateManager;
    this.api = api;
    this.container = null;
    this.expandedFolders = new Set(); // Track expanded state
  }

  async initialize(containerId) {
    this.container = document.getElementById(containerId);
    await this.render();
    this.attachEventListeners();
  }

  async render() {
    const files = this.state.get('workspace.files') || [];
    const folders = this.state.get('workspace.folders') || [];

    const tree = this.buildTree(files, folders);

    this.container.innerHTML = `
      <div class="file-browser">
        <div class="file-browser-header">
          <h3>Files</h3>
          <button class="btn-new-folder" title="New Folder">
            <span class="icon">📁</span> New Folder
          </button>
        </div>

        <div class="file-browser-toolbar">
          <input type="text"
                 class="search-input"
                 placeholder="Search files..."
                 id="file-search">
          <select class="filter-select" id="category-filter">
            <option value="">All Categories</option>
            <option value="raw_images">Raw Images</option>
            <option value="annotations">Annotations</option>
            <option value="inference_data">Inference Data</option>
            <option value="models">Models</option>
            <option value="results">Results</option>
          </select>
        </div>

        <div class="file-tree" id="file-tree">
          ${this.renderTree(tree)}
        </div>

        <div class="file-browser-footer">
          <div class="selection-info" id="selection-info">
            0 selected
          </div>
        </div>
      </div>
    `;
  }

  buildTree(files, folders) {
    // Build nested tree structure
    const tree = {
      id: 'root',
      name: 'Root',
      type: 'folder',
      children: []
    };

    // Create folder map
    const folderMap = new Map();
    folderMap.set(null, tree); // Root

    folders.forEach(folder => {
      folderMap.set(folder.id, {
        ...folder,
        type: 'folder',
        children: []
      });
    });

    // Add folders to tree
    folders.forEach(folder => {
      const folderNode = folderMap.get(folder.id);
      const parent = folderMap.get(folder.parentId);
      if (parent) {
        parent.children.push(folderNode);
      }
    });

    // Add files to tree
    files.forEach(file => {
      const parent = folderMap.get(file.folderId);
      if (parent) {
        parent.children.push({
          ...file,
          type: 'file'
        });
      }
    });

    return tree;
  }

  renderTree(node, level = 0) {
    if (node.type === 'file') {
      return this.renderFile(node, level);
    } else {
      return this.renderFolder(node, level);
    }
  }

  renderFolder(folder, level) {
    const isExpanded = this.expandedFolders.has(folder.id);
    const hasChildren = folder.children && folder.children.length > 0;

    return `
      <div class="tree-folder" data-folder-id="${folder.id}" style="padding-left: ${level * 20}px">
        <div class="tree-folder-header">
          <span class="folder-toggle ${hasChildren ? '' : 'hidden'}">
            ${isExpanded ? '▼' : '▶'}
          </span>
          <span class="folder-icon">📁</span>
          <span class="folder-name">${this.escapeHtml(folder.name)}</span>
          <span class="folder-actions">
            <button class="btn-icon" title="Rename" data-action="rename-folder">✏️</button>
            <button class="btn-icon" title="Delete" data-action="delete-folder">🗑️</button>
          </span>
        </div>
        ${isExpanded && hasChildren ? `
          <div class="tree-folder-content">
            ${folder.children.map(child => this.renderTree(child, level + 1)).join('')}
          </div>
        ` : ''}
      </div>
    `;
  }

  renderFile(file, level) {
    const selected = this.state.get('ui.fileSelection')?.includes(file.id) || false;
    const icon = this.getFileIcon(file.name);
    const hasThumbnail = file.name.toLowerCase().endsWith('.tif') ||
                         file.name.toLowerCase().endsWith('.tiff');

    return `
      <div class="tree-file ${selected ? 'selected' : ''}"
           data-file-id="${file.id}"
           data-file-path="${file.path}"
           style="padding-left: ${level * 20}px">
        <div class="file-content">
          ${hasThumbnail ? `
            <img src="/api/workspace/thumbnail/${file.id}"
                 class="file-thumbnail"
                 alt="thumbnail"
                 loading="lazy">
          ` : `
            <span class="file-icon">${icon}</span>
          `}
          <div class="file-info">
            <div class="file-name">${this.escapeHtml(file.name)}</div>
            <div class="file-meta">
              ${this.formatFileSize(file.size)} ·
              ${this.formatDate(file.uploadedAt)} ·
              ${file.category || 'Uncategorized'}
            </div>
          </div>
          <div class="file-actions">
            <button class="btn-icon" title="Download" data-action="download">⬇️</button>
            <button class="btn-icon" title="Rename" data-action="rename">✏️</button>
            <button class="btn-icon" title="Delete" data-action="delete">🗑️</button>
          </div>
        </div>
      </div>
    `;
  }

  attachEventListeners() {
    // File selection
    this.container.addEventListener('click', (e) => {
      const fileEl = e.target.closest('.tree-file');
      if (fileEl) {
        this.handleFileClick(fileEl, e);
      }
    });

    // Folder toggle
    this.container.addEventListener('click', (e) => {
      if (e.target.classList.contains('folder-toggle')) {
        const folderEl = e.target.closest('.tree-folder');
        this.toggleFolder(folderEl.dataset.folderId);
      }
    });

    // Action buttons
    this.container.addEventListener('click', (e) => {
      if (e.target.classList.contains('btn-icon')) {
        const action = e.target.dataset.action;
        const fileEl = e.target.closest('.tree-file');
        const folderEl = e.target.closest('.tree-folder');

        if (fileEl) {
          this.handleFileAction(action, fileEl.dataset.fileId);
        } else if (folderEl) {
          this.handleFolderAction(action, folderEl.dataset.folderId);
        }
      }
    });

    // Search input
    const searchInput = document.getElementById('file-search');
    searchInput?.addEventListener('input', (e) => {
      this.handleSearch(e.target.value);
    });

    // Category filter
    const filterSelect = document.getElementById('category-filter');
    filterSelect?.addEventListener('change', (e) => {
      this.handleFilter(e.target.value);
    });

    // New folder button
    this.container.querySelector('.btn-new-folder')?.addEventListener('click', () => {
      this.createNewFolder();
    });
  }

  handleFileClick(fileEl, event) {
    const fileId = fileEl.dataset.fileId;
    const currentSelection = this.state.get('ui.fileSelection') || [];

    if (event.ctrlKey || event.metaKey) {
      // Ctrl+Click: Toggle selection
      if (currentSelection.includes(fileId)) {
        this.state.update('ui.fileSelection',
          currentSelection.filter(id => id !== fileId));
      } else {
        this.state.update('ui.fileSelection',
          [...currentSelection, fileId]);
      }
    } else if (event.shiftKey && currentSelection.length > 0) {
      // Shift+Click: Range selection
      // TODO: Implement range selection
    } else {
      // Normal click: Single selection
      this.state.update('ui.fileSelection', [fileId]);
    }

    this.updateSelectionUI();
  }

  toggleFolder(folderId) {
    if (this.expandedFolders.has(folderId)) {
      this.expandedFolders.delete(folderId);
    } else {
      this.expandedFolders.add(folderId);
    }
    this.render();
  }

  async handleFileAction(action, fileId) {
    switch (action) {
      case 'download':
        await this.downloadFile(fileId);
        break;
      case 'rename':
        await this.renameFile(fileId);
        break;
      case 'delete':
        await this.deleteFile(fileId);
        break;
    }
  }

  async downloadFile(fileId) {
    try {
      const response = await fetch(`/api/workspace/file/${fileId}/download`);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = ''; // Filename from Content-Disposition header
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      this.state.notify('error', `Failed to download file: ${error.message}`);
    }
  }

  async renameFile(fileId) {
    const file = this.state.get('workspace.files')
      .find(f => f.id === fileId);

    const newName = prompt('Enter new filename:', file.name);
    if (!newName || newName === file.name) return;

    try {
      const response = await this.api.request('PATCH',
        `/api/workspace/file/${fileId}/rename`,
        { newName });

      if (response.success) {
        await this.refresh();
        this.state.notify('success', 'File renamed successfully');
      }
    } catch (error) {
      this.state.notify('error', `Failed to rename file: ${error.message}`);
    }
  }

  async deleteFile(fileId) {
    if (!confirm('Are you sure you want to delete this file?')) return;

    try {
      const response = await this.api.request('DELETE',
        `/api/workspace/file/${fileId}`);

      if (response.success) {
        await this.refresh();
        this.state.notify('success', 'File deleted successfully');
      }
    } catch (error) {
      this.state.notify('error', `Failed to delete file: ${error.message}`);
    }
  }

  async refresh() {
    const response = await this.api.getWorkspaceStatus();
    this.state.update('workspace.files', response.files || []);
    this.state.update('workspace.folders', response.folders || []);
    await this.render();
  }

  getFileIcon(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const icons = {
      tif: '🖼️', tiff: '🖼️',
      pth: '🧠', h5: '🧠',
      json: '📄', txt: '📄',
      zip: '📦', tar: '📦'
    };
    return icons[ext] || '📄';
  }

  formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString();
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

export default FileBrowser;
```

### 2.2 CSS Styling

**Modify:** `public/workspace/css/workspace.css`

**Add file browser styles:**
```css
/* File Browser */
.file-browser {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-primary);
}

.file-browser-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  border-bottom: 1px solid var(--border-color);
}

.file-browser-header h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.btn-new-folder {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  font-size: 12px;
  background: var(--accent-color);
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.btn-new-folder:hover {
  opacity: 0.9;
}

.file-browser-toolbar {
  display: flex;
  gap: 8px;
  padding: 8px;
  border-bottom: 1px solid var(--border-color);
}

.search-input {
  flex: 1;
  padding: 6px 10px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  font-size: 12px;
}

.filter-select {
  padding: 6px 10px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  font-size: 12px;
}

.file-tree {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}

/* Tree nodes */
.tree-folder, .tree-file {
  user-select: none;
  cursor: pointer;
}

.tree-folder-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 4px;
  transition: background 0.15s;
}

.tree-folder-header:hover {
  background: var(--hover-bg);
}

.folder-toggle {
  font-size: 10px;
  color: var(--text-secondary);
  cursor: pointer;
  width: 12px;
  text-align: center;
}

.folder-toggle.hidden {
  visibility: hidden;
}

.folder-icon {
  font-size: 16px;
}

.folder-name {
  flex: 1;
  font-size: 13px;
  font-weight: 500;
}

.folder-actions {
  display: none;
  gap: 4px;
}

.tree-folder-header:hover .folder-actions {
  display: flex;
}

.tree-file {
  padding: 4px 8px;
  border-radius: 4px;
  transition: background 0.15s;
}

.tree-file:hover {
  background: var(--hover-bg);
}

.tree-file.selected {
  background: var(--selected-bg);
}

.file-content {
  display: flex;
  align-items: center;
  gap: 8px;
}

.file-thumbnail {
  width: 40px;
  height: 40px;
  object-fit: cover;
  border-radius: 4px;
  border: 1px solid var(--border-color);
}

.file-icon {
  font-size: 24px;
  width: 40px;
  text-align: center;
}

.file-info {
  flex: 1;
  min-width: 0;
}

.file-name {
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.file-meta {
  font-size: 11px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.file-actions {
  display: none;
  gap: 4px;
}

.tree-file:hover .file-actions {
  display: flex;
}

.btn-icon {
  padding: 4px;
  background: none;
  border: none;
  cursor: pointer;
  border-radius: 3px;
  font-size: 14px;
}

.btn-icon:hover {
  background: var(--hover-bg);
}

.file-browser-footer {
  padding: 8px 12px;
  border-top: 1px solid var(--border-color);
  font-size: 12px;
  color: var(--text-secondary);
}

.selection-info {
  font-weight: 500;
}
```

### 2.3 Integration with Workspace

**Modify:** `public/workspace/js/workspace.js`

**Add FileBrowser initialization:**
```javascript
import FileBrowser from './components/FileBrowser.js';

class WorkspaceController {
  constructor() {
    // ... existing code
    this.fileBrowser = null;
  }

  async initialize() {
    // ... existing initialization

    // Initialize file browser
    this.fileBrowser = new FileBrowser(this.state, this.api);
    await this.fileBrowser.initialize('file-browser-container');

    // Subscribe to file updates
    this.state.subscribe('workspace.files', () => {
      this.fileBrowser.refresh();
    });
  }
}
```

**Modify:** `public/workspace/index.html`

**Update sidebar to include file browser container:**
```html
<div class="sidebar-section">
  <div id="file-browser-container"></div>
</div>
```

**Add script tag:**
```html
<script type="module" src="/workspace/js/components/FileBrowser.js"></script>
```

### 2.4 Testing Checkpoints (Phase 3.2)

**Manual testing:**
1. File tree renders correctly with folders and files
2. Clicking folder expands/collapses children
3. File thumbnails load for TIFF files
4. File actions (download, rename, delete) work
5. Single file selection highlights correctly
6. Ctrl+Click toggles selection
7. New folder button prompts for name
8. Empty states display when no files exist

**Success criteria:**
- File tree renders in <100ms for 50 files
- Thumbnails load progressively (lazy loading works)
- UI is responsive and animations are smooth
- No console errors

---

## Phase 3.3: Search, Filter & Context Menu (Week 2, Days 3-5)

**Goal:** Add search/filter functionality and right-click context menu.

### 3.1 Search Implementation

**Modify:** `FileBrowser.js`

**Add search method:**
```javascript
handleSearch(query) {
  const files = this.state.get('workspace.files') || [];

  if (!query.trim()) {
    // Show all files
    this.state.update('ui.fileFilter', null);
  } else {
    // Filter files by name (case-insensitive)
    const filtered = files.filter(file =>
      file.name.toLowerCase().includes(query.toLowerCase())
    );
    this.state.update('ui.filteredFiles', filtered);
  }

  this.render();
}
```

**Add debouncing to search input:**
```javascript
attachEventListeners() {
  // ... existing code

  let searchTimeout;
  const searchInput = document.getElementById('file-search');
  searchInput?.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      this.handleSearch(e.target.value);
    }, 300); // 300ms debounce
  });
}
```

### 3.2 Filter Implementation

**Modify:** `FileBrowser.js`

**Add filter method:**
```javascript
handleFilter(category) {
  const files = this.state.get('workspace.files') || [];

  if (!category) {
    // Show all categories
    this.state.update('ui.categoryFilter', null);
  } else {
    // Filter by category
    const filtered = files.filter(file => file.category === category);
    this.state.update('ui.filteredFiles', filtered);
  }

  this.render();
}
```

**Update buildTree to respect filters:**
```javascript
buildTree(files, folders) {
  // Check if filters are active
  const filteredFiles = this.state.get('ui.filteredFiles');
  const filesToDisplay = filteredFiles || files;

  // ... rest of buildTree logic
}
```

### 3.3 Context Menu Component

**New file:** `public/workspace/js/components/ContextMenu.js`

```javascript
class ContextMenu {
  constructor() {
    this.menu = null;
    this.visible = false;
  }

  show(x, y, items) {
    // Remove existing menu
    this.hide();

    // Create menu element
    this.menu = document.createElement('div');
    this.menu.className = 'context-menu';
    this.menu.style.left = `${x}px`;
    this.menu.style.top = `${y}px`;

    // Add menu items
    items.forEach(item => {
      if (item.separator) {
        const separator = document.createElement('div');
        separator.className = 'context-menu-separator';
        this.menu.appendChild(separator);
      } else {
        const menuItem = document.createElement('div');
        menuItem.className = 'context-menu-item';
        menuItem.innerHTML = `
          <span class="menu-icon">${item.icon || ''}</span>
          <span class="menu-label">${item.label}</span>
          ${item.shortcut ? `<span class="menu-shortcut">${item.shortcut}</span>` : ''}
        `;

        if (item.disabled) {
          menuItem.classList.add('disabled');
        } else {
          menuItem.addEventListener('click', () => {
            item.onClick();
            this.hide();
          });
        }

        this.menu.appendChild(menuItem);
      }
    });

    // Add to document
    document.body.appendChild(this.menu);
    this.visible = true;

    // Position adjustment (keep within viewport)
    const rect = this.menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      this.menu.style.left = `${window.innerWidth - rect.width - 5}px`;
    }
    if (rect.bottom > window.innerHeight) {
      this.menu.style.top = `${window.innerHeight - rect.height - 5}px`;
    }

    // Close on click outside
    setTimeout(() => {
      document.addEventListener('click', () => this.hide(), { once: true });
    }, 0);
  }

  hide() {
    if (this.menu) {
      this.menu.remove();
      this.menu = null;
      this.visible = false;
    }
  }
}

export default ContextMenu;
```

**Add CSS for context menu:**
```css
.context-menu {
  position: fixed;
  background: white;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
  padding: 4px;
  min-width: 180px;
  z-index: 10000;
}

.context-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  transition: background 0.15s;
}

.context-menu-item:hover {
  background: var(--hover-bg);
}

.context-menu-item.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.menu-icon {
  font-size: 16px;
  width: 20px;
  text-align: center;
}

.menu-label {
  flex: 1;
}

.menu-shortcut {
  font-size: 11px;
  color: var(--text-secondary);
}

.context-menu-separator {
  height: 1px;
  background: var(--border-color);
  margin: 4px 0;
}
```

### 3.4 Integrate Context Menu with FileBrowser

**Modify:** `FileBrowser.js`

**Import ContextMenu:**
```javascript
import ContextMenu from './ContextMenu.js';

class FileBrowser {
  constructor(stateManager, api) {
    // ... existing code
    this.contextMenu = new ContextMenu();
  }

  attachEventListeners() {
    // ... existing code

    // Right-click context menu
    this.container.addEventListener('contextmenu', (e) => {
      e.preventDefault();

      const fileEl = e.target.closest('.tree-file');
      const folderEl = e.target.closest('.tree-folder');

      if (fileEl) {
        this.showFileContextMenu(e.pageX, e.pageY, fileEl.dataset.fileId);
      } else if (folderEl) {
        this.showFolderContextMenu(e.pageX, e.pageY, folderEl.dataset.folderId);
      }
    });
  }

  showFileContextMenu(x, y, fileId) {
    const selection = this.state.get('ui.fileSelection') || [];
    const isMultiSelect = selection.length > 1;

    const items = [
      {
        icon: '⬇️',
        label: isMultiSelect ? 'Download Selected' : 'Download',
        onClick: () => this.downloadFile(fileId)
      },
      {
        icon: '✏️',
        label: 'Rename',
        onClick: () => this.renameFile(fileId),
        disabled: isMultiSelect
      },
      {
        icon: '📁',
        label: 'Move to Folder...',
        onClick: () => this.showMoveDialog(fileId)
      },
      { separator: true },
      {
        icon: '🗑️',
        label: isMultiSelect ? 'Delete Selected' : 'Delete',
        onClick: () => this.deleteFile(fileId)
      }
    ];

    this.contextMenu.show(x, y, items);
  }

  showFolderContextMenu(x, y, folderId) {
    const items = [
      {
        icon: '✏️',
        label: 'Rename Folder',
        onClick: () => this.renameFolder(folderId)
      },
      {
        icon: '🗑️',
        label: 'Delete Folder',
        onClick: () => this.deleteFolder(folderId)
      }
    ];

    this.contextMenu.show(x, y, items);
  }
}
```

### 3.5 Move to Folder Dialog

**Add method to FileBrowser.js:**
```javascript
showMoveDialog(fileId) {
  const folders = this.state.get('workspace.folders') || [];

  const dialog = document.createElement('div');
  dialog.className = 'modal-overlay';
  dialog.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h3>Move to Folder</h3>
        <button class="btn-close">×</button>
      </div>
      <div class="modal-body">
        <select id="target-folder-select" class="folder-select">
          <option value="">Root</option>
          ${folders.map(f => `
            <option value="${f.id}">${this.escapeHtml(f.name)}</option>
          `).join('')}
        </select>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" data-action="cancel">Cancel</button>
        <button class="btn-primary" data-action="move">Move</button>
      </div>
    </div>
  `;

  document.body.appendChild(dialog);

  // Event listeners
  dialog.querySelector('.btn-close').addEventListener('click', () => {
    dialog.remove();
  });

  dialog.querySelector('[data-action="cancel"]').addEventListener('click', () => {
    dialog.remove();
  });

  dialog.querySelector('[data-action="move"]').addEventListener('click', async () => {
    const targetFolderId = document.getElementById('target-folder-select').value || null;
    await this.moveFile(fileId, targetFolderId);
    dialog.remove();
  });
}

async moveFile(fileId, targetFolderId) {
  try {
    const response = await this.api.request('PATCH',
      `/api/workspace/file/${fileId}/move`,
      { targetFolderId });

    if (response.success) {
      await this.refresh();
      this.state.notify('success', 'File moved successfully');
    }
  } catch (error) {
    this.state.notify('error', `Failed to move file: ${error.message}`);
  }
}
```

### 3.6 Testing Checkpoints (Phase 3.3)

**Manual testing:**
1. Search filters files in real-time (with 300ms debounce)
2. Category filter shows only selected category
3. Search + filter work together
4. Right-click on file shows context menu
5. Right-click on folder shows folder-specific menu
6. Context menu items trigger correct actions
7. Move dialog displays available folders
8. Moving file updates tree structure
9. Context menu closes on click outside
10. Context menu stays within viewport bounds

**Success criteria:**
- Search responds quickly (<50ms after debounce)
- Context menu appears at cursor position
- All context menu actions work correctly
- UI remains responsive with filters active

---

## Phase 3.4: Batch Operations & Polish (Week 3, Days 1-3)

**Goal:** Add multi-select, batch operations, keyboard shortcuts, and final polish.

### 4.1 Multi-Select Implementation

**Modify:** `FileBrowser.js`

**Enhance handleFileClick for range selection:**
```javascript
handleFileClick(fileEl, event) {
  const fileId = fileEl.dataset.fileId;
  const currentSelection = this.state.get('ui.fileSelection') || [];

  if (event.ctrlKey || event.metaKey) {
    // Ctrl+Click: Toggle selection
    if (currentSelection.includes(fileId)) {
      this.state.update('ui.fileSelection',
        currentSelection.filter(id => id !== fileId));
    } else {
      this.state.update('ui.fileSelection',
        [...currentSelection, fileId]);
    }
  } else if (event.shiftKey && currentSelection.length > 0) {
    // Shift+Click: Range selection
    const allFileIds = this.getAllVisibleFileIds();
    const lastSelectedId = currentSelection[currentSelection.length - 1];
    const startIndex = allFileIds.indexOf(lastSelectedId);
    const endIndex = allFileIds.indexOf(fileId);

    if (startIndex !== -1 && endIndex !== -1) {
      const rangeStart = Math.min(startIndex, endIndex);
      const rangeEnd = Math.max(startIndex, endIndex);
      const rangeIds = allFileIds.slice(rangeStart, rangeEnd + 1);

      this.state.update('ui.fileSelection',
        [...new Set([...currentSelection, ...rangeIds])]);
    }
  } else {
    // Normal click: Single selection
    this.state.update('ui.fileSelection', [fileId]);
  }

  this.updateSelectionUI();
}

getAllVisibleFileIds() {
  // Return array of file IDs in display order
  const fileEls = this.container.querySelectorAll('.tree-file');
  return Array.from(fileEls).map(el => el.dataset.fileId);
}

updateSelectionUI() {
  const selection = this.state.get('ui.fileSelection') || [];

  // Update file elements
  this.container.querySelectorAll('.tree-file').forEach(el => {
    if (selection.includes(el.dataset.fileId)) {
      el.classList.add('selected');
    } else {
      el.classList.remove('selected');
    }
  });

  // Update footer text
  const infoEl = document.getElementById('selection-info');
  if (infoEl) {
    if (selection.length === 0) {
      infoEl.textContent = '0 selected';
    } else if (selection.length === 1) {
      infoEl.textContent = '1 file selected';
    } else {
      infoEl.textContent = `${selection.length} files selected`;
    }
  }

  // Show/hide batch toolbar
  this.updateBatchToolbar(selection.length > 0);
}
```

### 4.2 Batch Toolbar

**Modify:** `FileBrowser.render()` to add batch toolbar:**
```javascript
async render() {
  // ... existing code

  this.container.innerHTML = `
    <div class="file-browser">
      <!-- ... existing header and toolbar ... -->

      <div class="batch-toolbar" id="batch-toolbar" style="display: none;">
        <button class="btn-batch" data-action="download-selected">
          ⬇️ Download Selected
        </button>
        <button class="btn-batch btn-danger" data-action="delete-selected">
          🗑️ Delete Selected
        </button>
        <button class="btn-batch btn-secondary" data-action="clear-selection">
          Clear Selection
        </button>
      </div>

      <!-- ... rest of UI ... -->
    </div>
  `;
}

updateBatchToolbar(visible) {
  const toolbar = document.getElementById('batch-toolbar');
  if (toolbar) {
    toolbar.style.display = visible ? 'flex' : 'none';
  }
}
```

**Add batch toolbar event listeners:**
```javascript
attachEventListeners() {
  // ... existing code

  // Batch operations
  this.container.addEventListener('click', (e) => {
    const action = e.target.dataset.action;

    switch (action) {
      case 'download-selected':
        this.downloadSelectedFiles();
        break;
      case 'delete-selected':
        this.deleteSelectedFiles();
        break;
      case 'clear-selection':
        this.state.update('ui.fileSelection', []);
        this.updateSelectionUI();
        break;
    }
  });
}
```

### 4.3 Batch Download Implementation

**Add method to FileBrowser.js:**
```javascript
async downloadSelectedFiles() {
  const selection = this.state.get('ui.fileSelection') || [];

  if (selection.length === 0) return;

  try {
    this.state.update('ui.loading', true);

    const response = await fetch('/api/workspace/files/batch-download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileIds: selection })
    });

    if (!response.ok) throw new Error('Download failed');

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'workspace_files.zip';
    a.click();
    window.URL.revokeObjectURL(url);

    this.state.notify('success', `Downloaded ${selection.length} files`);

  } catch (error) {
    this.state.notify('error', `Failed to download files: ${error.message}`);
  } finally {
    this.state.update('ui.loading', false);
  }
}
```

**Add backend endpoint in server.js:**
```javascript
app.post('/api/workspace/files/batch-download', requireAuth, async (req, res) => {
  const { fileIds } = req.body;
  const sessionId = req.session.id;

  try {
    const archiver = require('archiver');
    const archive = archiver('zip', { zlib: { level: 9 } });

    res.attachment('workspace_files.zip');
    archive.pipe(res);

    // Get file metadata
    const metadata = await workspaceManager.loadMetadata(sessionId);
    const files = metadata.files.filter(f => fileIds.includes(f.id));

    // Add files to archive
    for (const file of files) {
      const filePath = path.join('workspaces', sessionId, file.path);
      if (fs.existsSync(filePath)) {
        archive.file(filePath, { name: file.name });
      }
    }

    await archive.finalize();

  } catch (error) {
    console.error('Batch download error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});
```

### 4.4 Batch Delete Implementation

**Add method to FileBrowser.js:**
```javascript
async deleteSelectedFiles() {
  const selection = this.state.get('ui.fileSelection') || [];

  if (selection.length === 0) return;

  const confirmed = confirm(`Are you sure you want to delete ${selection.length} file(s)?`);
  if (!confirmed) return;

  try {
    this.state.update('ui.loading', true);

    const response = await this.api.request('POST',
      '/api/workspace/files/batch-delete',
      { fileIds: selection });

    if (response.success) {
      this.state.update('ui.fileSelection', []);
      await this.refresh();
      this.state.notify('success', `Deleted ${response.deletedCount} file(s)`);
    }

  } catch (error) {
    this.state.notify('error', `Failed to delete files: ${error.message}`);
  } finally {
    this.state.update('ui.loading', false);
  }
}
```

### 4.5 Keyboard Shortcuts

**Add keyboard event listener:**
```javascript
attachEventListeners() {
  // ... existing code

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Only handle if file browser is focused/visible
    if (!this.container.contains(document.activeElement) &&
        document.activeElement !== document.body) {
      return;
    }

    switch (e.key) {
      case 'a':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          this.selectAll();
        }
        break;

      case 'Delete':
        e.preventDefault();
        this.deleteSelectedFiles();
        break;

      case 'Escape':
        e.preventDefault();
        this.state.update('ui.fileSelection', []);
        this.updateSelectionUI();
        break;
    }
  });
}

selectAll() {
  const allFileIds = this.getAllVisibleFileIds();
  this.state.update('ui.fileSelection', allFileIds);
  this.updateSelectionUI();
}
```

### 4.6 Loading States

**Add loading overlay to FileBrowser.render():**
```javascript
async render() {
  const loading = this.state.get('ui.loading');

  this.container.innerHTML = `
    <div class="file-browser">
      ${loading ? '<div class="loading-overlay"><div class="spinner"></div></div>' : ''}
      <!-- ... rest of UI ... -->
    </div>
  `;
}
```

**Add CSS:**
```css
.loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid #f3f3f3;
  border-top: 3px solid var(--accent-color);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
```

### 4.7 Empty States

**Add empty state rendering:**
```javascript
renderTree(node, level = 0) {
  if (node.children && node.children.length === 0 && level === 0) {
    return `
      <div class="empty-state">
        <div class="empty-icon">📁</div>
        <div class="empty-text">No files yet</div>
        <div class="empty-subtext">Upload files from the segmentation module</div>
      </div>
    `;
  }

  // ... existing rendering logic
}
```

**Add CSS:**
```css
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  text-align: center;
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 12px;
  opacity: 0.3;
}

.empty-text {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.empty-subtext {
  font-size: 12px;
  color: var(--text-secondary);
}
```

### 4.8 Batch Toolbar CSS

**Add to workspace.css:**
```css
.batch-toolbar {
  display: flex;
  gap: 8px;
  padding: 8px 12px;
  background: var(--selected-bg);
  border-bottom: 1px solid var(--border-color);
}

.btn-batch {
  padding: 6px 12px;
  font-size: 12px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  background: white;
  border: 1px solid var(--border-color);
  transition: all 0.15s;
}

.btn-batch:hover {
  background: var(--hover-bg);
}

.btn-batch.btn-danger {
  color: #dc3545;
  border-color: #dc3545;
}

.btn-batch.btn-danger:hover {
  background: #dc3545;
  color: white;
}

.btn-batch.btn-secondary {
  color: var(--text-secondary);
}
```

### 4.9 Testing Checkpoints (Phase 3.4)

**Manual testing:**
1. Ctrl+Click selects multiple individual files
2. Shift+Click selects range of files
3. Ctrl+A selects all visible files
4. Delete key deletes selected files
5. Escape clears selection
6. Batch download creates zip with correct files
7. Batch delete removes all selected files
8. Batch toolbar appears when files selected
9. Loading overlay displays during operations
10. Empty state shows when no files exist
11. Selection count updates in footer

**Success criteria:**
- Multi-select is intuitive and responsive
- Batch operations work for 20+ files
- Keyboard shortcuts work consistently
- Loading states prevent multiple clicks
- Empty states are clear and helpful

---

## Migration Strategy

### Backward Compatibility

**Existing workspaces without folders array:**
- WorkspaceManager checks for `folders` key in metadata.json
- If missing, initializes as empty array: `folders: []`
- Version bump: `1.0.0` → `1.1.0`

**Code:**
```javascript
// In WorkspaceManager.loadMetadata()
const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));

// Migrate old format
if (!metadata.folders) {
  metadata.folders = [];
  metadata.version = '1.1.0';
  await this.saveMetadata(sessionId, metadata);
}

return metadata;
```

### FileSelector Integration

**Phase 1:** Keep existing FileSelector working as-is
**Phase 2:** Add "Browse Workspace" button to FileSelector that opens file browser
**Phase 3 (optional):** Replace FileSelector dropdown with FileBrowser component

---

## Risk Assessment

### Technical Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Thumbnail generation slow | Medium | Medium | Cache aggressively, lazy load, show placeholders |
| Large file trees (500+ files) | Low | High | Implement virtual scrolling in Phase 4 if needed |
| File operations fail silently | Low | High | Comprehensive error handling, rollback on failure |
| Context menu positioning bugs | Medium | Low | Viewport boundary checks, fallback positions |
| Batch operations timeout | Low | Medium | Add progress bar, chunked operations for large batches |

### UX Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Users confused by folders | Low | Medium | Clear empty states, tooltips, onboarding guide |
| Multi-select not discoverable | Medium | Low | Tooltip on first visit, keyboard shortcut hints |
| Search performance poor | Low | Medium | Client-side filtering, debouncing, show spinner |

---

## Testing Strategy

### Unit Tests (Optional, Phase 4)
- WorkspaceManager methods (createFolder, moveFile, deleteFile)
- File tree building logic (buildTree)
- Search and filter logic

### Integration Tests
- File upload → thumbnail generation → display in tree
- File delete → removal from filesystem and metadata
- Folder operations → metadata updates
- Batch operations → multiple files affected

### Manual Testing Checklist

**Backend:**
- [ ] All 12 new endpoints return correct responses
- [ ] Metadata.json updates correctly after operations
- [ ] Thumbnails generated and cached
- [ ] Batch download creates valid zip
- [ ] File operations respect session isolation

**Frontend:**
- [ ] File tree renders correctly
- [ ] Folders expand/collapse
- [ ] Thumbnails load progressively
- [ ] Search filters in real-time
- [ ] Category filter works
- [ ] Context menu appears on right-click
- [ ] Multi-select works (Ctrl, Shift, Ctrl+A)
- [ ] Keyboard shortcuts work
- [ ] Batch toolbar appears/hides
- [ ] Loading states display
- [ ] Empty states display
- [ ] Selection count updates

**Integration:**
- [ ] Upload file → appears in tree
- [ ] Delete file → removed from tree
- [ ] Rename file → name updates in tree
- [ ] Move file → moves to folder in tree
- [ ] Create folder → appears in tree
- [ ] Delete folder → files move to root
- [ ] Batch delete → all files removed
- [ ] Batch download → zip contains files

---

## Performance Targets

| Metric | Target | Notes |
|--------|--------|-------|
| File tree render | <100ms | For 200 files |
| Search response | <50ms | After 300ms debounce |
| Thumbnail generation | <500ms | Cached after first generation |
| Batch download (10 files) | <2s | Zip creation and download |
| Batch delete (10 files) | <1s | All files removed |
| Context menu open | <50ms | From right-click to display |
| File operations (single) | <500ms | Download, delete, rename |

---

## Documentation Updates

### Files to Update

1. **ROADMAP.md:**
   - Mark Phase 3 as complete
   - Update "Current Phase" to Phase 4

2. **API_ENDPOINTS.md:**
   - Add 12 new workspace file/folder endpoints
   - Document request/response formats

3. **CLAUDE.md:**
   - Add FileBrowser component to architecture section
   - Document new metadata schema
   - Add thumbnail generation workflow

4. **Create new docs:**
   - `docs/guides/FILE_BROWSER_GUIDE.md` - User guide for file browser
   - `docs/sessions/2025-12-XX_phase3_complete.md` - Implementation session log

---

## Future Enhancements (Phase 4+)

**Not in Phase 3 scope, but planned:**

1. **Virtual scrolling** - For workspaces with 1000+ files
2. **Drag-and-drop** - Drag files into folders
3. **File preview** - Quick preview modal for TIFF slices
4. **Tags and labels** - Custom tags for organization
5. **Breadcrumb navigation** - For nested folder structures
6. **File history** - Track file modifications and versions
7. **Sharing** - Share files/folders with other users
8. **Permissions** - Read-only vs edit access for files
9. **Advanced search** - By date range, size, metadata
10. **Bulk upload** - Upload multiple files at once

---

## Summary: Files to Create/Modify

### New Files (3)

1. `python/generate_thumbnail.py` - Thumbnail generation script
2. `public/workspace/js/components/FileBrowser.js` - Main file browser component (~800 lines)
3. `public/workspace/js/components/ContextMenu.js` - Context menu component (~150 lines)

### Modified Files (6)

1. `WorkspaceManager.js` - Add 15+ new methods for file/folder operations
2. `server.js` - Add 12 new API endpoints
3. `public/workspace/js/core/WorkspaceAPI.js` - Add API client methods
4. `public/workspace/css/workspace.css` - Add ~300 lines of file browser styles
5. `public/workspace/index.html` - Add script tags and file-browser-container div
6. `public/workspace/js/workspace.js` - Initialize FileBrowser, subscribe to state updates

### New Dependencies (1)

1. `archiver` (npm package) - For batch download zip creation

---

## Implementation Timeline

### Week 1
- **Days 1-3:** Phase 3.1 (Backend Infrastructure)
  - Enhance metadata schema
  - Add WorkspaceManager methods
  - Implement all backend endpoints
  - Create thumbnail generation script
  - Test all endpoints

- **Days 4-5:** Phase 3.2 Part 1 (FileBrowser Component)
  - Create FileBrowser.js
  - Implement tree rendering
  - Add file/folder display with thumbnails

### Week 2
- **Days 1-2:** Phase 3.2 Part 2 (UI Integration)
  - Add CSS styling
  - Integrate with workspace.js
  - Implement basic file operations
  - Test rendering and operations

- **Days 3-5:** Phase 3.3 (Search, Filter, Context Menu)
  - Implement search with debouncing
  - Implement category filter
  - Create ContextMenu component
  - Add right-click operations
  - Create move dialog
  - Test all interactions

### Week 3
- **Days 1-3:** Phase 3.4 (Batch Operations & Polish)
  - Implement multi-select (Ctrl, Shift, Ctrl+A)
  - Add batch toolbar
  - Implement batch download/delete
  - Add keyboard shortcuts
  - Add loading and empty states
  - Final polish and bug fixes
  - Comprehensive testing

### Week 4 (Buffer)
- Bug fixes
- Performance optimization
- Documentation updates
- User testing feedback

---

**End of Phase 3 Implementation Plan**
