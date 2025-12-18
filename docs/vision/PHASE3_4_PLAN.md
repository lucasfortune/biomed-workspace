# Phase 3.4 Implementation Plan: Batch Operations & Polish

## Overview

**Goal:** Add multi-select with checkboxes, batch operations (download/delete), and polish features to the FileBrowser component.

**Status:** Planning Complete
**Estimated Duration:** 6-12 hours implementation time
**Backend Status:** ✅ COMPLETE (both endpoints already implemented)
**Frontend Status:** 🚧 Needs implementation

---

## Key Findings from Exploration

### Backend (✅ Ready to Use)
- **Batch Delete Endpoint:** `POST /api/workspace/files/batch-delete` (server.js:844-866)
- **Batch Download Endpoint:** `POST /api/workspace/files/batch-download` (server.js:871-911)
- Both endpoints fully functional and tested

### Frontend (Needs Work)
- **No selection state tracking** - needs to be added
- **No checkboxes in file items** - needs to be added
- **No batch toolbar** - needs to be created
- **WorkspaceAPI methods missing** - need wrapper methods for batch operations
- **CSS missing** - need checkbox, selection highlight, and toolbar styles

---

## Implementation Sections

The implementation is divided into 6 logical sections:

1. **Selection State Foundation** - Add state tracking for selected files
2. **Checkbox UI Integration** - Add checkboxes to file items and search results
3. **Batch Toolbar Component** - Create floating toolbar with batch actions
4. **Batch Operations Logic** - Wire up download and delete functionality
5. **Polish & Loading States** - Add loading indicators and visual feedback
6. **Testing & Edge Cases** - Verify all functionality works correctly

---

## Section 1: Selection State Foundation

**Goal:** Set up the data structures and state management for tracking selected files.

### Files to Modify:
- `public/workspace/js/components/FileBrowser.js` (constructor and state methods)
- `public/workspace/js/core/StateManager.js` (optional - for global state tracking)

### To-Do List:

- [ ] **1.1: Add selection state to FileBrowser constructor** (FileBrowser.js:10-32)
  ```javascript
  constructor(stateManager, api) {
    this.state = stateManager;
    this.api = api;
    this.container = null;
    this.selectedFiles = new Set(); // NEW: Track selected file IDs
    this.allFiles = []; // NEW: Cache all visible files for "Select All"
  }
  ```

- [ ] **1.2: Add selection helper methods** (Add after constructor)
  ```javascript
  // Selection management methods
  isFileSelected(fileId) {
    return this.selectedFiles.has(fileId);
  }

  toggleFileSelection(fileId) {
    if (this.selectedFiles.has(fileId)) {
      this.selectedFiles.delete(fileId);
    } else {
      this.selectedFiles.add(fileId);
    }
    this.updateBatchToolbar();
  }

  selectAll() {
    this.allFiles.forEach(file => this.selectedFiles.add(file.id));
    this.updateSelectionUI();
    this.updateBatchToolbar();
  }

  clearSelection() {
    this.selectedFiles.clear();
    this.updateSelectionUI();
    this.updateBatchToolbar();
  }

  getSelectedCount() {
    return this.selectedFiles.size;
  }

  getSelectedFileIds() {
    return Array.from(this.selectedFiles);
  }
  ```

- [ ] **1.3: Add method to update selection UI**
  ```javascript
  updateSelectionUI() {
    // Update checkbox states for all visible files
    this.container.querySelectorAll('.fb-file-checkbox').forEach(checkbox => {
      const fileId = checkbox.dataset.fileId;
      checkbox.checked = this.isFileSelected(fileId);
    });

    // Update file row highlighting
    this.container.querySelectorAll('.fb-file').forEach(fileRow => {
      const fileId = fileRow.dataset.fileId;
      if (this.isFileSelected(fileId)) {
        fileRow.classList.add('fb-file-selected');
      } else {
        fileRow.classList.remove('fb-file-selected');
      }
    });

    // Update "Select All" checkbox state
    const selectAllCheckbox = this.container.querySelector('.fb-select-all-checkbox');
    if (selectAllCheckbox) {
      const allSelected = this.allFiles.length > 0 &&
                          this.allFiles.every(f => this.isFileSelected(f.id));
      const someSelected = this.allFiles.some(f => this.isFileSelected(f.id));

      selectAllCheckbox.checked = allSelected;
      selectAllCheckbox.indeterminate = someSelected && !allSelected;
    }
  }
  ```

- [ ] **1.4: Cache all visible files on render** (Modify render() method)
  - In `render()` method, after building file tree, extract flat list of files
  - Store in `this.allFiles` for "Select All" functionality
  - Clear selection when search query changes (optional)

---

## Section 2: Checkbox UI Integration

**Goal:** Add checkboxes to the left side of all file items in both tree view and search results.

### Files to Modify:
- `public/workspace/js/components/FileBrowser.js` (renderFile and renderSearchResultItem)
- `public/workspace/css/workspace.css` (checkbox styles)

### To-Do List:

- [ ] **2.1: Add "Select All" checkbox to header** (Modify render() method ~lines 91-199)
  ```html
  <div class="fb-header">
    <div class="fb-header-left">
      <input type="checkbox"
             class="fb-select-all-checkbox"
             id="fb-select-all"
             title="Select all files">
      <label for="fb-select-all" class="fb-select-all-label">Files</label>
    </div>
    <!-- Keep existing refresh button on right -->
  </div>
  ```

- [ ] **2.2: Add checkbox to renderFile() method** (lines 375-408)
  - Add checkbox HTML before file icon
  ```html
  <div class="fb-file" data-file-id="${file.id}">
    <input type="checkbox"
           class="fb-file-checkbox"
           data-file-id="${file.id}"
           ${this.isFileSelected(file.id) ? 'checked' : ''}>
    <!-- Rest of file item HTML -->
  </div>
  ```

- [ ] **2.3: Add checkbox to renderSearchResultItem() method** (lines 436-470)
  - Same checkbox HTML as above
  - Ensure checkbox works in search results view

- [ ] **2.4: Add checkbox CSS styles** (workspace.css ~line 762+)
  ```css
  /* File selection checkbox */
  .fb-file-checkbox {
    width: 18px;
    height: 18px;
    margin-right: 8px;
    cursor: pointer;
    flex-shrink: 0;
  }

  /* Selected file highlight */
  .fb-file.fb-file-selected {
    background-color: rgba(66, 133, 244, 0.1);
    border-left: 3px solid #4285f4;
  }

  .fb-file.fb-file-selected:hover {
    background-color: rgba(66, 133, 244, 0.15);
  }

  /* Select all checkbox in header */
  .fb-header-left {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .fb-select-all-checkbox {
    width: 18px;
    height: 18px;
    cursor: pointer;
  }

  .fb-select-all-label {
    font-weight: 600;
    font-size: 14px;
    cursor: pointer;
    user-select: none;
  }
  ```

- [ ] **2.5: Prevent checkbox click from triggering file click**
  - Add stopPropagation to checkbox click events
  - Ensure clicking checkbox doesn't open file or trigger other actions

---

## Section 3: Batch Toolbar Component

**Goal:** Create a floating toolbar that appears when files are selected, showing count and batch action buttons.

### Files to Modify:
- `public/workspace/js/components/FileBrowser.js` (render and toolbar methods)
- `public/workspace/css/workspace.css` (toolbar styles)

### To-Do List:

- [ ] **3.1: Add batch toolbar HTML to render() method** (after fb-search div ~line 170)
  ```html
  <!-- Batch Toolbar (hidden by default) -->
  <div class="fb-batch-toolbar" id="fb-batch-toolbar" style="display: none;">
    <div class="fb-batch-info">
      <span class="fb-batch-count" id="fb-batch-count">0 files selected</span>
    </div>
    <div class="fb-batch-actions">
      <button class="fb-btn-batch fb-btn-batch-download"
              id="fb-batch-download"
              title="Download selected files as ZIP">
        ⬇️ Download All
      </button>
      <button class="fb-btn-batch fb-btn-batch-delete"
              id="fb-batch-delete"
              title="Delete selected files">
        🗑️ Delete All
      </button>
      <button class="fb-btn-batch fb-btn-batch-clear"
              id="fb-batch-clear"
              title="Clear selection">
        ✕ Clear Selection
      </button>
    </div>
  </div>
  ```

- [ ] **3.2: Add updateBatchToolbar() method**
  ```javascript
  updateBatchToolbar() {
    const toolbar = this.container.querySelector('#fb-batch-toolbar');
    const countEl = this.container.querySelector('#fb-batch-count');
    const selectedCount = this.getSelectedCount();

    if (selectedCount > 0) {
      // Show toolbar
      toolbar.style.display = 'flex';

      // Update count text
      const fileWord = selectedCount === 1 ? 'file' : 'files';
      countEl.textContent = `${selectedCount} ${fileWord} selected`;
    } else {
      // Hide toolbar
      toolbar.style.display = 'none';
    }
  }
  ```

- [ ] **3.3: Add batch toolbar CSS styles** (workspace.css)
  ```css
  /* Batch Toolbar */
  .fb-batch-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border-radius: 8px;
    margin: 12px 16px;
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
    animation: slideDown 0.2s ease-out;
  }

  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .fb-batch-info {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .fb-batch-count {
    font-weight: 600;
    font-size: 14px;
  }

  .fb-batch-actions {
    display: flex;
    gap: 8px;
  }

  .fb-btn-batch {
    padding: 8px 16px;
    border: none;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    background: rgba(255, 255, 255, 0.2);
    color: white;
    backdrop-filter: blur(10px);
  }

  .fb-btn-batch:hover {
    background: rgba(255, 255, 255, 0.3);
    transform: translateY(-1px);
  }

  .fb-btn-batch:active {
    transform: translateY(0);
  }

  .fb-btn-batch-delete:hover {
    background: rgba(239, 68, 68, 0.9);
  }

  .fb-btn-batch-clear {
    background: rgba(255, 255, 255, 0.1);
  }

  .fb-btn-batch-clear:hover {
    background: rgba(255, 255, 255, 0.2);
  }
  ```

- [ ] **3.4: Position toolbar appropriately**
  - Decide: Fixed at top of file browser OR inline below search bar
  - User preference: Suggest inline below search bar for better context
  - Ensure toolbar doesn't overlap file tree content

---

## Section 4: Batch Operations Logic

**Goal:** Wire up the batch toolbar buttons to perform download and delete operations on selected files.

### Files to Modify:
- `public/workspace/js/components/FileBrowser.js` (batch operation methods)
- `public/workspace/js/core/WorkspaceAPI.js` (add batch API methods)

### To-Do List:

- [ ] **4.1: Add WorkspaceAPI batch methods** (WorkspaceAPI.js ~lines 140-146)
  ```javascript
  // Batch operations
  async batchDeleteFiles(fileIds) {
    return this.request('POST', '/api/workspace/files/batch-delete', { fileIds });
  }

  async batchDownloadFiles(fileIds) {
    // Use fetch with blob response for file download
    const response = await fetch('/api/workspace/files/batch-download', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ fileIds })
    });

    if (!response.ok) {
      throw new Error('Batch download failed');
    }

    // Trigger download
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'workspace_files.zip';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);

    return { success: true };
  }
  ```

- [ ] **4.2: Add batch download method to FileBrowser** (FileBrowser.js)
  ```javascript
  async batchDownloadSelected() {
    const selectedIds = this.getSelectedFileIds();

    if (selectedIds.length === 0) {
      this.state.notify('warning', 'No files selected', 3000);
      return;
    }

    try {
      // Show loading state
      this.setLoading(true, 'Preparing download...');

      // Call API
      await this.api.batchDownloadFiles(selectedIds);

      // Success notification
      this.state.notify('success', `Downloaded ${selectedIds.length} files`, 3000);

      // Optional: Clear selection after download
      // this.clearSelection();

    } catch (error) {
      console.error('Batch download error:', error);
      this.state.notify('error', `Download failed: ${error.message}`, 5000);
    } finally {
      this.setLoading(false);
    }
  }
  ```

- [ ] **4.3: Add batch delete method to FileBrowser** (FileBrowser.js)
  ```javascript
  async batchDeleteSelected() {
    const selectedIds = this.getSelectedFileIds();

    if (selectedIds.length === 0) {
      this.state.notify('warning', 'No files selected', 3000);
      return;
    }

    // CONFIRMATION DIALOG (REQUIRED)
    const fileWord = selectedIds.length === 1 ? 'file' : 'files';
    const confirmMessage = `Are you sure you want to delete ${selectedIds.length} ${fileWord}?\n\nThis action cannot be undone.`;

    if (!confirm(confirmMessage)) {
      return; // User cancelled
    }

    try {
      // Show loading state
      this.setLoading(true, `Deleting ${selectedIds.length} files...`);

      // Call API
      const response = await this.api.batchDeleteFiles(selectedIds);

      // Success notification
      this.state.notify('success', `Deleted ${response.deletedCount} files`, 3000);

      // Clear selection
      this.clearSelection();

      // Refresh file list
      await this.refresh();

    } catch (error) {
      console.error('Batch delete error:', error);
      this.state.notify('error', `Delete failed: ${error.message}`, 5000);
    } finally {
      this.setLoading(false);
    }
  }
  ```

- [ ] **4.4: Add event listeners for batch toolbar buttons** (attachEventListeners)
  ```javascript
  // In attachEventListeners() method (~lines 475-615)

  // Batch toolbar buttons
  const batchDownloadBtn = this.container.querySelector('#fb-batch-download');
  if (batchDownloadBtn) {
    batchDownloadBtn.addEventListener('click', () => this.batchDownloadSelected());
  }

  const batchDeleteBtn = this.container.querySelector('#fb-batch-delete');
  if (batchDeleteBtn) {
    batchDeleteBtn.addEventListener('click', () => this.batchDeleteSelected());
  }

  const batchClearBtn = this.container.querySelector('#fb-batch-clear');
  if (batchClearBtn) {
    batchClearBtn.addEventListener('click', () => this.clearSelection());
  }
  ```

- [ ] **4.5: Add event listener for "Select All" checkbox**
  ```javascript
  const selectAllCheckbox = this.container.querySelector('.fb-select-all-checkbox');
  if (selectAllCheckbox) {
    selectAllCheckbox.addEventListener('change', (e) => {
      if (e.target.checked) {
        this.selectAll();
      } else {
        this.clearSelection();
      }
    });
  }
  ```

- [ ] **4.6: Add event listener for individual file checkboxes**
  ```javascript
  // Delegate event for all file checkboxes
  this.container.addEventListener('change', (e) => {
    if (e.target.classList.contains('fb-file-checkbox')) {
      const fileId = e.target.dataset.fileId;
      this.toggleFileSelection(fileId);
    }
  });
  ```

---

## Section 5: Polish & Loading States

**Goal:** Add loading indicators, visual feedback, and polish to create a smooth user experience.

### Files to Modify:
- `public/workspace/js/components/FileBrowser.js` (loading methods)
- `public/workspace/css/workspace.css` (loading styles)

### To-Do List:

- [ ] **5.1: Add loading overlay HTML to render() method**
  ```html
  <!-- Loading Overlay (hidden by default) -->
  <div class="fb-loading-overlay" id="fb-loading-overlay" style="display: none;">
    <div class="fb-loading-content">
      <div class="fb-spinner"></div>
      <p class="fb-loading-text" id="fb-loading-text">Loading...</p>
    </div>
  </div>
  ```

- [ ] **5.2: Add setLoading() method to FileBrowser**
  ```javascript
  setLoading(isLoading, message = 'Loading...') {
    const overlay = this.container.querySelector('#fb-loading-overlay');
    const text = this.container.querySelector('#fb-loading-text');

    if (isLoading) {
      overlay.style.display = 'flex';
      text.textContent = message;

      // Disable batch toolbar buttons
      const toolbar = this.container.querySelector('#fb-batch-toolbar');
      if (toolbar) {
        toolbar.style.pointerEvents = 'none';
        toolbar.style.opacity = '0.6';
      }
    } else {
      overlay.style.display = 'none';

      // Re-enable batch toolbar
      const toolbar = this.container.querySelector('#fb-batch-toolbar');
      if (toolbar) {
        toolbar.style.pointerEvents = 'auto';
        toolbar.style.opacity = '1';
      }
    }
  }
  ```

- [ ] **5.3: Add loading overlay CSS styles** (workspace.css)
  ```css
  /* Loading Overlay */
  .fb-loading-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(255, 255, 255, 0.95);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    backdrop-filter: blur(4px);
  }

  .fb-loading-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
  }

  .fb-spinner {
    width: 48px;
    height: 48px;
    border: 4px solid #e0e0e0;
    border-top-color: #4285f4;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .fb-loading-text {
    font-size: 14px;
    color: #5f6368;
    font-weight: 500;
    margin: 0;
  }
  ```

- [ ] **5.4: Add loading state to existing single file operations**
  - Update `deleteFile()` to use `setLoading(true, 'Deleting file...')`
  - Update `downloadFile()` to show brief loading indicator
  - Update `renameFile()` to show loading during API call

- [ ] **5.5: Add visual feedback for checkbox interactions**
  ```css
  /* Checkbox hover/focus states */
  .fb-file-checkbox:hover {
    transform: scale(1.1);
    cursor: pointer;
  }

  .fb-file-checkbox:focus {
    outline: 2px solid #4285f4;
    outline-offset: 2px;
  }

  /* File row hover when checkbox present */
  .fb-file:hover {
    background-color: rgba(0, 0, 0, 0.02);
  }

  .fb-file:hover .fb-file-checkbox {
    opacity: 1;
  }
  ```

- [ ] **5.6: Add smooth animations for selection changes**
  ```css
  .fb-file {
    transition: background-color 0.15s ease, border-left 0.15s ease;
  }

  .fb-file-selected {
    animation: selectPulse 0.3s ease;
  }

  @keyframes selectPulse {
    0% { transform: scale(1); }
    50% { transform: scale(1.01); }
    100% { transform: scale(1); }
  }
  ```

- [ ] **5.7: Add progress indicator for large batch operations (optional)**
  - If deleting >20 files, show progress bar
  - Update loading text: "Deleting 5/20 files..."
  - Requires backend to support chunked operations OR client-side progress estimation

---

## Section 6: Testing & Edge Cases

**Goal:** Verify all functionality works correctly and handle edge cases gracefully.

### To-Do List:

- [ ] **6.1: Test basic checkbox selection**
  - [ ] Single file selection/deselection
  - [ ] Multiple file selection
  - [ ] Select All checkbox
  - [ ] Clear Selection button
  - [ ] Selection persists when scrolling
  - [ ] Selection persists during search (or clears - decide behavior)

- [ ] **6.2: Test batch download**
  - [ ] Download 1 file
  - [ ] Download 5 files
  - [ ] Download 20+ files
  - [ ] Verify ZIP contains all files with correct names
  - [ ] Test with large files (>50MB each)
  - [ ] Verify error handling if file missing

- [ ] **6.3: Test batch delete**
  - [ ] Delete 1 file (confirm dialog appears)
  - [ ] Delete multiple files
  - [ ] Cancel confirmation dialog (nothing deleted)
  - [ ] Verify files removed from filesystem
  - [ ] Verify files removed from metadata
  - [ ] Verify UI updates correctly after delete
  - [ ] Test deleting all visible files

- [ ] **6.4: Test loading states**
  - [ ] Loading overlay appears during operations
  - [ ] Loading text updates appropriately
  - [ ] Buttons disabled during loading
  - [ ] Loading clears after operation completes
  - [ ] Loading clears on error

- [ ] **6.5: Test edge cases**
  - [ ] Select files, then search (do selected files stay selected?)
  - [ ] Select files in search results, clear search (what happens?)
  - [ ] Upload new file while files selected (does selection clear?)
  - [ ] Delete a file that's selected (does it remove from selection?)
  - [ ] Batch delete fails (verify no partial deletions)
  - [ ] Network error during batch download (verify error message)

- [ ] **6.6: Test UI polish**
  - [ ] Batch toolbar appears/disappears smoothly
  - [ ] Selection highlight looks good
  - [ ] Animations are smooth
  - [ ] No console errors
  - [ ] Works on different screen sizes
  - [ ] Toolbar doesn't overlap content

- [ ] **6.7: Test integration with existing features**
  - [ ] Context menu still works on selected files
  - [ ] Individual file actions (download, rename, delete) still work
  - [ ] Upload still works
  - [ ] Folder expansion/collapse still works
  - [ ] Search still works
  - [ ] Refresh button clears selection (or maintains it - decide)

- [ ] **6.8: Test performance**
  - [ ] Selecting 50+ files is responsive
  - [ ] Batch toolbar updates quickly
  - [ ] No lag when checking/unchecking files
  - [ ] Rendering selection state is fast

---

## Implementation Order (Recommended)

Follow this sequence for efficient implementation:

1. **Section 1: Selection State Foundation** (1-2 hours)
   - Easiest to test in isolation
   - Foundation for everything else

2. **Section 2: Checkbox UI Integration** (1-2 hours)
   - Visual feedback helps with development
   - Can test selection state interactively

3. **Section 3: Batch Toolbar Component** (1-2 hours)
   - UI component that ties everything together
   - Provides visual feedback for selection

4. **Section 4: Batch Operations Logic** (2-3 hours)
   - Core functionality
   - Requires careful error handling

5. **Section 5: Polish & Loading States** (1-2 hours)
   - Improves UX significantly
   - Can be done incrementally

6. **Section 6: Testing & Edge Cases** (2-3 hours)
   - Critical for quality assurance
   - May reveal issues to fix

**Total Estimated Time:** 8-14 hours

---

## Key Decisions Made

1. **Selection Method:** Checkboxes instead of keyboard shortcuts (per user request)
2. **Toolbar Position:** Inline below search bar (better context than fixed position)
3. **Selection Persistence:** Clear selection on search query change (UX decision to avoid confusion)
4. **Confirmation:** Always confirm batch delete (safety requirement)
5. **Loading States:** Show for all batch operations >1 second (UX improvement)
6. **Backend:** Use existing endpoints (already implemented and tested)

---

## Files to Create/Modify Summary

### Modified Files (3):
1. **`public/workspace/js/components/FileBrowser.js`**
   - Add ~200 lines (selection state, methods, event handlers)
   - Modify render() method
   - Modify renderFile() and renderSearchResultItem()

2. **`public/workspace/js/core/WorkspaceAPI.js`**
   - Add ~40 lines (two batch operation methods)

3. **`public/workspace/css/workspace.css`**
   - Add ~150 lines (checkbox styles, toolbar styles, loading overlay)

### No New Files Required
All functionality integrates into existing components.

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Batch delete accidentally deletes wrong files | Low | High | Confirmation dialog + list files in dialog |
| Selection state gets out of sync with UI | Medium | Medium | Always call updateSelectionUI() after state changes |
| Large batch operations timeout | Low | Medium | Add progress indicators, consider chunking |
| Checkbox clicks conflict with file clicks | Low | Low | Use stopPropagation on checkbox events |
| Loading overlay doesn't clear on error | Medium | Low | Always use try/finally blocks |

---

## Post-Implementation Tasks

After Phase 3.4 is complete:

1. **Update documentation**
   - Update ROADMAP.md (mark Phase 3.4 complete)
   - Create session log: `docs/sessions/YYYY-MM-DD_phase3_4_batch_operations.md`
   - Update CLAUDE.md with batch operation patterns

2. **User testing**
   - Test with real users
   - Gather feedback on checkbox placement
   - Verify batch operations meet user needs

3. **Performance optimization (if needed)**
   - Profile selection performance with 100+ files
   - Optimize rendering if laggy
   - Consider virtual scrolling for very large file lists

4. **Future enhancements** (Phase 4+)
   - Drag-and-drop for batch operations
   - Batch move to folder
   - Batch rename with pattern
   - Undo/redo for batch operations
   - Keyboard shortcuts (Ctrl+A, Delete) as optional enhancement

---

## Success Criteria

Phase 3.4 is complete when:

- [ ] Users can select multiple files using checkboxes
- [ ] "Select All" checkbox selects all visible files
- [ ] Batch toolbar appears when files selected
- [ ] Batch download creates ZIP with selected files
- [ ] Batch delete removes selected files (with confirmation)
- [ ] Loading states prevent duplicate operations
- [ ] All edge cases handled gracefully
- [ ] No console errors
- [ ] UI is responsive and polished
- [ ] Integration tests pass

---

## Documentation Note

**This plan file should be copied to:** `docs/vision/PHASE3_4_PLAN.md`

Upon implementation, this working plan will be copied to the documentation directory for permanent reference and to maintain consistency with the other phase plans (PHASE3_PLAN.md).

---

**End of Phase 3.4 Implementation Plan**
