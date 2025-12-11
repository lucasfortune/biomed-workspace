# Phase 3.2: File Browser UI Core - Implementation Plan

**Status:** Planning Complete - Ready for Implementation
**Phase:** 3.2 (File Browser UI Core)
**Prerequisites:** Phase 3.1 (Backend) ✅ Complete, Phase 3.1.1 (Path Consistency) ✅ Complete
**Target Duration:** 3-4 days
**Created:** 2025-12-11

---

## Overview

Implement a persistent file browser component in the workspace sidebar that displays the workspace file tree with thumbnails, allows basic file operations (download, rename, delete), and provides search/filter capabilities. The file browser will be visible only when the sidebar is expanded and will show the physical directory structure.

---

## User Requirements Clarifications

Based on user input:
- **Location:** Sidebar (persistent, always visible when sidebar expanded)
- **Thumbnail Generation:** Already implemented (`python/generate_thumbnail.py`) ✅
- **File Operations:** Download, Rename, Delete (single file)
- **Auto-refresh:** Hybrid approach (auto-refresh with manual option)
- **Collapsed Behavior:** Hidden when sidebar collapsed
- **Tree Structure:** Physical directories (uploads/, models/, results/)
- **Search:** Client-side only with debouncing
- **New Files:** Maintain scroll position on refresh

---

## Architecture Integration

### State Management Pattern
```javascript
// File browser subscribes to workspace.files
this.state.subscribe('workspace.files', (files) => {
  this.renderFileTree(files);
});

// Update state triggers re-render
this.state.update('workspace.files', newFiles);
```

### API Integration
```javascript
// Use existing WorkspaceAPI methods
const response = await this.api.getWorkspaceStatus();
// Returns: { workspace: { files: [], folders: [], fileTree: [] } }

// File operations
await this.api.deleteFile(fileId);
api.downloadFile(fileId);  // Direct download
```

### Component Location
- Renders into: `#file-tree-container` (sidebar)
- Parent container: `.sidebar-section.file-browser`
- CSS namespace: `.fb-*` classes (file-browser prefix)

---

## Implementation Tasks

### Task 1: Create FileBrowser Component Class

**New File:** `public/workspace/js/components/FileBrowser.js`

**Component Structure:**
```javascript
class FileBrowser {
  constructor(stateManager, api) {
    this.state = stateManager;
    this.api = api;
    this.container = null;
    this.expandedFolders = new Set();  // Track expanded state
    this.searchQuery = '';
  }

  async initialize(containerId) {
    this.container = document.getElementById(containerId);

    // Subscribe to state changes
    this.state.subscribe('workspace.files', (files) => {
      this.render();
    });

    this.state.subscribe('workspace.folders', (folders) => {
      this.render();
    });

    // Initial render
    await this.refresh();
  }

  async refresh() {
    try {
      const response = await this.api.getWorkspaceStatus();
      this.state.update('workspace.files', response.workspace.files || []);
      this.state.update('workspace.folders', response.workspace.folders || []);
      this.render();
    } catch (error) {
      console.error('Error refreshing file browser:', error);
      this.state.notify('error', `Failed to load files: ${error.message}`);
    }
  }

  render() {
    const files = this.state.get('workspace.files') || [];
    const folders = this.state.get('workspace.folders') || [];

    // Filter files based on search
    const filteredFiles = this.filterFiles(files);

    // Build tree structure (physical directories)
    const tree = this.buildPhysicalTree(filteredFiles, folders);

    this.container.innerHTML = this.renderTree(tree);
    this.attachEventListeners();
  }

  buildPhysicalTree(files, folders) {
    // Group files by directory path
    // Show physical structure: uploads/, models/, results/
    // Return nested tree structure
  }

  renderTree(node, level = 0) {
    // Recursive tree rendering
    // Returns HTML string
  }

  attachEventListeners() {
    // File selection
    // Folder expand/collapse
    // Search input (debounced)
    // File action buttons
    // Manual refresh button
  }

  // File operations
  async downloadFile(fileId) { }
  async renameFile(fileId) { }
  async deleteFile(fileId) { }

  // Search/filter
  filterFiles(files) {
    if (!this.searchQuery.trim()) return files;
    return files.filter(f =>
      f.name.toLowerCase().includes(this.searchQuery.toLowerCase())
    );
  }

  // Helpers
  getFileIcon(filename) { }
  formatFileSize(bytes) { }
  formatDate(dateString) { }
  escapeHtml(text) { }
}

export default FileBrowser;
```

**Key Methods:**
1. **initialize(containerId)** - Set up component, subscribe to state
2. **refresh()** - Fetch latest files from backend, update state
3. **render()** - Build and display file tree HTML
4. **buildPhysicalTree()** - Group files by directory path
5. **renderTree()** - Recursive HTML generation for tree
6. **attachEventListeners()** - Bind all UI interactions
7. **downloadFile/renameFile/deleteFile()** - File operations
8. **filterFiles()** - Client-side search filtering

---

### Task 2: Build Physical Directory Tree Structure

**Method:** `buildPhysicalTree(files, folders)`

**Logic:**
1. Parse file paths to extract directory structure
2. Group files by their parent directory
3. Create nested tree nodes:
   ```javascript
   {
     type: 'directory',
     path: 'uploads/raw/',
     name: 'raw',
     expanded: false,
     children: [
       { type: 'file', id: 'file_123', name: 'image.tif', ... }
     ]
   }
   ```
4. Sort directories first, then files alphabetically
5. Respect `this.expandedFolders` set for collapsed/expanded state

**Expected Structure:**
```
📁 uploads/
  📁 raw/
    🖼️ sample.tif
  📁 annotations/
    🖼️ sample_masks.tif
📁 models/
  📁 segmentation/
    📁 training_1701612345/
      🧠 best_model.pth
      📄 config.json
📁 results/
  📁 segmentation/
    📁 training_1701612345/
      📁 visualizations/
        🖼️ segmented.tif
```

---

### Task 3: Implement Tree Rendering with Thumbnails

**Method:** `renderTree(node, level = 0)`

**HTML Structure:**
```html
<!-- Directory Node -->
<div class="fb-folder" data-path="uploads/raw" style="padding-left: ${level * 16}px">
  <div class="fb-folder-header">
    <span class="fb-toggle">${expanded ? '▼' : '▶'}</span>
    <span class="fb-icon">📁</span>
    <span class="fb-name">raw</span>
  </div>
  ${expanded ? `<div class="fb-folder-content">${children}</div>` : ''}
</div>

<!-- File Node -->
<div class="fb-file" data-file-id="${fileId}" style="padding-left: ${level * 16}px">
  <div class="fb-file-content">
    ${hasThumbnail ? `
      <img src="/api/workspace/thumbnail/${fileId}"
           class="fb-thumbnail"
           alt="thumbnail"
           loading="lazy">
    ` : `
      <span class="fb-icon">${icon}</span>
    `}
    <div class="fb-file-info">
      <div class="fb-file-name">${fileName}</div>
      <div class="fb-file-meta">${size} • ${date}</div>
    </div>
    <div class="fb-file-actions">
      <button class="fb-btn-icon" title="Download" data-action="download">⬇️</button>
      <button class="fb-btn-icon" title="Rename" data-action="rename">✏️</button>
      <button class="fb-btn-icon" title="Delete" data-action="delete">🗑️</button>
    </div>
  </div>
</div>
```

**Thumbnail Logic:**
- Check if file extension is `.tif` or `.tiff`
- Use thumbnail endpoint: `/api/workspace/thumbnail/${fileId}`
- Use `loading="lazy"` for performance
- Fallback to icon if not TIFF

**File Icons:**
```javascript
getFileIcon(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  const icons = {
    tif: '🖼️', tiff: '🖼️',
    pth: '🧠', h5: '🧠',
    json: '📄', txt: '📄', csv: '📄',
    zip: '📦', tar: '📦'
  };
  return icons[ext] || '📄';
}
```

---

### Task 4: Implement File Operations

#### 4.1 Download File
```javascript
async downloadFile(fileId) {
  try {
    const file = this.state.get('workspace.files').find(f => f.id === fileId);
    if (!file) throw new Error('File not found');

    // Use WorkspaceAPI method (direct download)
    this.api.downloadFile(fileId);
    this.state.notify('success', 'Download started', 3000);
  } catch (error) {
    this.state.notify('error', `Download failed: ${error.message}`);
  }
}
```

#### 4.2 Rename File
```javascript
async renameFile(fileId) {
  const file = this.state.get('workspace.files').find(f => f.id === fileId);
  if (!file) return;

  const newName = prompt('Enter new filename:', file.name);
  if (!newName || newName === file.name) return;

  // Validate extension matches
  const oldExt = file.name.split('.').pop();
  const newExt = newName.split('.').pop();
  if (oldExt !== newExt) {
    this.state.notify('error', 'File extension must remain the same');
    return;
  }

  try {
    this.state.update('ui.loading', true);

    const response = await this.api.request('PATCH',
      `/api/workspace/file/${fileId}/rename`,
      { method: 'PATCH', body: JSON.stringify({ newName }) }
    );

    if (response.success) {
      await this.refresh();
      this.state.notify('success', 'File renamed successfully');
    }
  } catch (error) {
    this.state.notify('error', `Rename failed: ${error.message}`);
  } finally {
    this.state.update('ui.loading', false);
  }
}
```

#### 4.3 Delete File
```javascript
async deleteFile(fileId) {
  const file = this.state.get('workspace.files').find(f => f.id === fileId);
  if (!file) return;

  if (!confirm(`Delete "${file.name}"?\n\nThis action cannot be undone.`)) {
    return;
  }

  try {
    this.state.update('ui.loading', true);

    await this.api.deleteFile(fileId);
    await this.refresh();
    this.state.notify('success', 'File deleted successfully');
  } catch (error) {
    this.state.notify('error', `Delete failed: ${error.message}`);
  } finally {
    this.state.update('ui.loading', false);
  }
}
```

---

### Task 5: Implement Search with Debouncing

**HTML Structure (in render()):**
```html
<div class="fb-header">
  <h3>Files</h3>
  <button class="fb-btn-refresh" title="Refresh">🔄</button>
</div>
<div class="fb-search">
  <input type="text"
         class="fb-search-input"
         placeholder="Search files..."
         value="${this.searchQuery}">
</div>
<div class="fb-tree">
  ${treeHTML}
</div>
```

**Event Listener with Debouncing:**
```javascript
attachEventListeners() {
  // Search input with 300ms debounce
  const searchInput = this.container.querySelector('.fb-search-input');
  if (searchInput) {
    let searchTimeout;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        this.searchQuery = e.target.value;
        this.render();  // Re-render with filtered files
      }, 300);
    });
  }

  // Manual refresh button
  const refreshBtn = this.container.querySelector('.fb-btn-refresh');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => this.refresh());
  }

  // Folder toggle
  this.container.addEventListener('click', (e) => {
    if (e.target.classList.contains('fb-toggle')) {
      const folderEl = e.target.closest('.fb-folder');
      const path = folderEl.dataset.path;
      this.toggleFolder(path);
    }
  });

  // File action buttons
  this.container.addEventListener('click', (e) => {
    if (e.target.classList.contains('fb-btn-icon')) {
      const action = e.target.dataset.action;
      const fileEl = e.target.closest('.fb-file');
      const fileId = fileEl.dataset.fileId;

      e.stopPropagation();

      switch (action) {
        case 'download': this.downloadFile(fileId); break;
        case 'rename': this.renameFile(fileId); break;
        case 'delete': this.deleteFile(fileId); break;
      }
    }
  });
}

toggleFolder(path) {
  if (this.expandedFolders.has(path)) {
    this.expandedFolders.delete(path);
  } else {
    this.expandedFolders.add(path);
  }
  this.render();
}
```

---

### Task 6: Add CSS Styling

**File:** `public/workspace/css/workspace.css`

**Add File Browser Styles:**
```css
/* ============================================================================
   File Browser
   ============================================================================ */

.file-browser {
  display: flex;
  flex-direction: column;
  height: 100%;
}

/* Header */
.fb-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-color);
}

.fb-header h3 {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--text-secondary);
}

.fb-btn-refresh {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 14px;
  padding: 4px 8px;
  border-radius: 4px;
  transition: background-color 0.2s;
}

.fb-btn-refresh:hover {
  background-color: var(--darker-bg);
}

/* Search */
.fb-search {
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-color);
}

.fb-search-input {
  width: 100%;
  padding: 6px 10px;
  background-color: var(--darker-bg);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  color: var(--text-primary);
  font-size: 12px;
  outline: none;
  transition: border-color 0.2s;
}

.fb-search-input:focus {
  border-color: var(--primary-color);
}

.fb-search-input::placeholder {
  color: var(--text-secondary);
}

/* Tree Container */
.fb-tree {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}

/* Folder Node */
.fb-folder {
  user-select: none;
}

.fb-folder-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  cursor: pointer;
  border-radius: 4px;
  transition: background-color 0.15s;
}

.fb-folder-header:hover {
  background-color: var(--darker-bg);
}

.fb-toggle {
  font-size: 10px;
  color: var(--text-secondary);
  width: 12px;
  text-align: center;
}

.fb-icon {
  font-size: 16px;
}

.fb-name {
  flex: 1;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.fb-folder-content {
  /* Container for nested items */
}

/* File Node */
.fb-file {
  user-select: none;
  cursor: pointer;
  border-radius: 4px;
  transition: background-color 0.15s;
}

.fb-file:hover {
  background-color: var(--darker-bg);
}

.fb-file-content {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
}

.fb-thumbnail {
  width: 32px;
  height: 32px;
  object-fit: cover;
  border-radius: 3px;
  border: 1px solid var(--border-color);
  flex-shrink: 0;
}

.fb-file-info {
  flex: 1;
  min-width: 0;
}

.fb-file-name {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.fb-file-meta {
  font-size: 10px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.fb-file-actions {
  display: none;
  gap: 2px;
  flex-shrink: 0;
}

.fb-file:hover .fb-file-actions {
  display: flex;
}

.fb-btn-icon {
  padding: 4px;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 12px;
  border-radius: 3px;
  transition: background-color 0.15s;
}

.fb-btn-icon:hover {
  background-color: var(--primary-color);
}

/* Empty State */
.fb-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px 16px;
  text-align: center;
}

.fb-empty-icon {
  font-size: 36px;
  margin-bottom: 8px;
  opacity: 0.3;
}

.fb-empty-text {
  font-size: 12px;
  color: var(--text-secondary);
}

/* Scrollbar Styling */
.fb-tree::-webkit-scrollbar {
  width: 8px;
}

.fb-tree::-webkit-scrollbar-track {
  background: transparent;
}

.fb-tree::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: 4px;
}

.fb-tree::-webkit-scrollbar-thumb:hover {
  background: var(--text-secondary);
}
```

---

### Task 7: Integrate FileBrowser into Workspace

**File:** `public/workspace/js/workspace.js`

**Modifications:**

1. **Add FileBrowser Instance** (in Workspace class):
```javascript
class Workspace {
  constructor() {
    this.state = null;
    this.api = null;
    this.moduleLoader = null;
    this.fileBrowser = null;  // <-- Add this
    this.initialized = false;
  }
}
```

2. **Initialize FileBrowser** (in `init()` method, after workspace initialization):
```javascript
async init() {
  // ... existing initialization ...

  await this.initializeWorkspace();

  // Initialize file browser
  this.fileBrowser = new FileBrowser(this.state, this.api);
  await this.fileBrowser.initialize('file-tree-container');

  // ... rest of initialization ...
}
```

3. **Manual Refresh Method** (for global access):
```javascript
async refreshWorkspace() {
  // ... existing code ...

  // Refresh file browser
  if (this.fileBrowser) {
    await this.fileBrowser.refresh();
  }
}
```

---

### Task 8: Update HTML to Include FileBrowser Component

**File:** `public/workspace/index.html`

**Modifications:**

1. **Update file browser section** (replace placeholder):
```html
<!-- File Browser (Phase 3.2) -->
<div class="sidebar-section file-browser">
  <div id="file-tree-container">
    <!-- FileBrowser component will render here -->
  </div>
</div>
```

2. **Add script tag for FileBrowser** (before workspace.js):
```html
<!-- Core JavaScript Modules -->
<script src="/workspace/js/core/StateManager.js"></script>
<script src="/workspace/js/core/ModuleLoader.js"></script>
<script src="/workspace/js/core/WorkspaceAPI.js"></script>
<script src="/workspace/js/components/FileBrowser.js"></script> <!-- Add this -->
<script src="/workspace/js/modules/registry.js"></script>
<script src="/workspace/js/workspace.js"></script>
```

---

### Task 9: Enhance WorkspaceAPI with File Operation Methods

**File:** `public/workspace/js/core/WorkspaceAPI.js`

**Add missing methods if not present:**

```javascript
/**
 * Rename a file
 */
async renameFile(fileId, newName) {
  return this.request(`/api/workspace/file/${fileId}/rename`, {
    method: 'PATCH',
    body: JSON.stringify({ newName })
  });
}

/**
 * Generic request method (if not exists)
 */
async request(endpoint, options = {}) {
  const url = endpoint.startsWith('http') ? endpoint : `${this.baseURL}${endpoint}`;

  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    },
    ...options
  };

  try {
    const response = await fetch(url, config);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }

    return data;
  } catch (error) {
    console.error(`[WorkspaceAPI] Error calling ${endpoint}:`, error);
    throw error;
  }
}
```

---

### Task 10: Testing & Validation

**Manual Testing Checklist:**

1. **Sidebar Behavior:**
   - [ ] File browser hidden when sidebar collapsed
   - [ ] File browser visible when sidebar expanded
   - [ ] Sidebar toggle works smoothly

2. **Tree Rendering:**
   - [ ] Physical directory structure displayed correctly
   - [ ] Folders can be expanded/collapsed
   - [ ] Files show correct icons or thumbnails
   - [ ] File metadata (size, date) displays correctly
   - [ ] Tree structure updates when files added/removed

3. **Thumbnails:**
   - [ ] TIFF files show thumbnails (32x32px display size)
   - [ ] Thumbnails lazy load correctly
   - [ ] Non-TIFF files show appropriate icons
   - [ ] Thumbnails load from cache on subsequent views

4. **Search:**
   - [ ] Search input filters files in real-time
   - [ ] 300ms debounce prevents excessive re-renders
   - [ ] Clear search shows all files
   - [ ] Search is case-insensitive
   - [ ] Search works across nested directories

5. **File Operations:**
   - [ ] Download button downloads correct file
   - [ ] Rename validates extension matching
   - [ ] Rename updates tree immediately
   - [ ] Delete shows confirmation dialog
   - [ ] Delete removes file from tree and backend
   - [ ] All operations show loading state
   - [ ] Success/error notifications display

6. **Auto-refresh:**
   - [ ] Manual refresh button updates file list
   - [ ] Tree refreshes when files uploaded in segmentation
   - [ ] Scroll position maintained after refresh
   - [ ] Expanded folders remain expanded after refresh

7. **Empty States:**
   - [ ] Empty workspace shows appropriate message
   - [ ] Empty search results show "no matches" message
   - [ ] Empty folders render correctly

8. **Performance:**
   - [ ] Tree renders quickly (<100ms for 50 files)
   - [ ] Scrolling is smooth
   - [ ] Search debouncing prevents lag
   - [ ] Lazy loading thumbnails doesn't block UI

9. **Error Handling:**
   - [ ] Network errors show notifications
   - [ ] Failed thumbnail loads show fallback icon
   - [ ] Invalid operations prevented with clear messages

10. **Integration:**
    - [ ] Segmentation module file uploads appear in tree
    - [ ] Training outputs appear in models/ folder
    - [ ] Inference results appear in results/ folder
    - [ ] State updates propagate correctly

---

## Files to Create/Modify

### New Files (1)
1. `public/workspace/js/components/FileBrowser.js` (~400 lines)

### Modified Files (4)
1. `public/workspace/js/workspace.js` - Initialize FileBrowser
2. `public/workspace/index.html` - Add script tag
3. `public/workspace/css/workspace.css` - Add ~200 lines of styles
4. `public/workspace/js/core/WorkspaceAPI.js` - Add renameFile method (if needed)

---

## Implementation Order

1. **Day 1 Morning:** Create FileBrowser.js skeleton with basic structure
2. **Day 1 Afternoon:** Implement buildPhysicalTree() and renderTree() methods
3. **Day 2 Morning:** Add CSS styling and test tree rendering
4. **Day 2 Afternoon:** Implement file operations (download, rename, delete)
5. **Day 3 Morning:** Add search with debouncing, test filtering
6. **Day 3 Afternoon:** Integration testing, bug fixes, polish
7. **Day 4 (Buffer):** Final testing, edge cases, documentation

---

## Success Criteria

✅ File browser renders physical directory structure
✅ TIFF files display thumbnails (32x32px)
✅ Folders can be expanded/collapsed
✅ Search filters files with 300ms debounce
✅ Download, rename, delete operations work correctly
✅ Manual refresh button updates file list
✅ Auto-refresh when files created by modules
✅ Scroll position maintained on refresh
✅ Loading states and notifications display
✅ Empty states render appropriately
✅ No console errors, smooth performance

---

## Future Enhancements (Phase 3.3+)

Deferred to Phase 3.3-3.4:
- Context menu (right-click operations)
- Multi-select and batch operations
- Keyboard shortcuts (Ctrl+A, Delete, Escape)
- Move files to folders
- Batch download as zip
- Category filter dropdown
- Folder management (create, rename, delete)

---

## Notes & Considerations

1. **State Management:** FileBrowser subscribes to `workspace.files` - any module updating files should call `stateManager.update('workspace.files', newFiles)` to trigger refresh

2. **Thumbnail Caching:** Backend already implements caching in `.thumbnails/` directory, so subsequent loads are fast

3. **Physical vs Logical Paths:** Files stored in physical directories, but could add logical folder organization in Phase 3.3

4. **Search Performance:** Client-side search is sufficient for typical workspace sizes (<500 files). Can migrate to server-side if needed in future

5. **Scroll Position:** Use `scrollTop` property to save/restore position on refresh

6. **Module Integration:** Segmentation module should update `workspace.files` state after upload/training/inference completes

7. **Error Recovery:** All API calls wrapped in try-catch with user-facing notifications

8. **Accessibility:** Consider adding aria-labels and keyboard navigation in future enhancement

---

**Related Documentation:**
- [ROADMAP.md](ROADMAP.md) - Phase 3 overview
- [PHASE3_PLAN.md](PHASE3_PLAN.md) - Complete Phase 3 plan
- [Architecture Overview](../architecture/OVERVIEW.md) - System architecture

---

**End of Plan**
