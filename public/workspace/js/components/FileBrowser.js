/**
 * FileBrowser Component
 *
 * Displays workspace files in a hierarchical tree structure with thumbnails,
 * supports file operations (download, rename, delete), and provides search filtering.
 *
 * @class FileBrowser
 */
class FileBrowser {
  constructor(stateManager, api) {
    this.state = stateManager;
    this.api = api;
    this.container = null;
    this.expandedFolders = new Set();  // Track expanded directories
    this.searchQuery = '';
    this.recentFileIds = new Set();    // Track new files for badges
    this.scrollPosition = 0;           // Save scroll position for refresh
    this.isRendering = false;          // Prevent render loops

    // Selection state for batch operations
    this.selectedFiles = new Set();    // Track selected file IDs
    this.allFiles = [];                // Cache all visible files for "Select All"
    this.batchToolbarVisible = false;  // Track toolbar visibility across renders

    // Category keyword mapping for unified search
    this.categoryKeywords = {
      'raw_images': ['raw', 'image', 'images', 'training', 'input'],
      'annotations': ['annotation', 'annotations', 'mask', 'masks', 'label', 'labels'],
      'inference_data': ['inference', 'test', 'predict', 'prediction'],
      'imported_models': ['model', 'models', 'imported', 'pth', 'weights', 'checkpoint'],
      'segmentation_results': ['segmentation', 'segment', 'result', 'results', 'output'],
      'denoised': ['denoise', 'denoised', 'denoising', 'clean', 'cleaned'],
      'meshes': ['mesh', 'meshes', '3d', 'surface', 'reconstruction']
    };

    // Create context menu instance
    this.contextMenu = new ContextMenu();
  }

  /**
   * Initialize the file browser component
   * @param {string} containerId - ID of the container element
   */
  async initialize(containerId) {
    this.container = document.getElementById(containerId);

    if (!this.container) {
      console.error(`[FileBrowser] Container element #${containerId} not found`);
      return;
    }

    // Subscribe to state changes
    this.state.subscribe('workspace.files', () => {
      if (!this.isRendering) {
        this.render();
      }
    });

    this.state.subscribe('workspace.folders', () => {
      if (!this.isRendering) {
        this.render();
      }
    });

    // Initial render
    await this.refresh();
  }

  /**
   * Refresh file list from backend
   */
  async refresh() {
    try {
      const response = await this.api.getWorkspaceStatus();

      if (response && response.workspace) {
        this.state.update('workspace.files', response.workspace.files || []);
        this.state.update('workspace.folders', response.workspace.folders || []);
      }

      this.render();

      // Also refresh workspace stats (file count and size in sidebar)
      if (window.workspace && window.workspace.loadWorkspaceStats) {
        await window.workspace.loadWorkspaceStats();
      }
    } catch (error) {
      console.error('[FileBrowser] Error refreshing file list:', error);
      this.state.notify('error', `Failed to load files: ${error.message}`);
    }
  }

  /**
   * Selection Management Methods
   */

  /**
   * Check if a file is selected
   * @param {string} fileId - File ID to check
   * @returns {boolean} True if file is selected
   */
  isFileSelected(fileId) {
    return this.selectedFiles.has(fileId);
  }

  /**
   * Toggle file selection on/off
   * @param {string} fileId - File ID to toggle
   */
  toggleFileSelection(fileId) {
    if (this.selectedFiles.has(fileId)) {
      this.selectedFiles.delete(fileId);
    } else {
      this.selectedFiles.add(fileId);
    }
    this.updateSelectionUI();
    this.updateBatchToolbar();
  }

  /**
   * Select all visible files
   */
  selectAll() {
    this.allFiles.forEach(file => this.selectedFiles.add(file.id));
    this.updateSelectionUI();
    this.updateBatchToolbar();
  }

  /**
   * Clear all selections
   */
  clearSelection() {
    this.selectedFiles.clear();
    this.updateSelectionUI();
    this.updateBatchToolbar();
  }

  /**
   * Get count of selected files
   * @returns {number} Number of selected files
   */
  getSelectedCount() {
    return this.selectedFiles.size;
  }

  /**
   * Get array of selected file IDs
   * @returns {Array<string>} Array of selected file IDs
   */
  getSelectedFileIds() {
    return Array.from(this.selectedFiles);
  }

  /**
   * Update UI to reflect current selection state
   */
  updateSelectionUI() {
    if (!this.container) return;

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

  /**
   * Update batch toolbar visibility and count
   */
  updateBatchToolbar() {
    if (!this.container) return;

    const toolbar = this.container.querySelector('#fb-batch-toolbar');
    const countEl = this.container.querySelector('#fb-batch-count');
    const selectedCount = this.getSelectedCount();

    if (toolbar && countEl) {
      if (selectedCount > 0) {
        // Only set display and animate if transitioning from hidden to visible
        if (!this.batchToolbarVisible) {
          toolbar.style.display = 'flex';
          this.batchToolbarVisible = true;

          // Add animation class for entrance
          toolbar.classList.add('fb-toolbar-entering');

          // Remove animation class after animation completes
          setTimeout(() => {
            toolbar.classList.remove('fb-toolbar-entering');
          }, 200);
        }

        // Update count text
        const fileWord = selectedCount === 1 ? 'file' : 'files';
        countEl.textContent = `${selectedCount} ${fileWord} selected`;
      } else {
        // Hide toolbar
        if (this.batchToolbarVisible) {
          toolbar.style.display = 'none';
          this.batchToolbarVisible = false;
        }
      }
    }
  }

  /**
   * Render the file browser UI
   */
  render() {
    if (!this.container || this.isRendering) return;

    this.isRendering = true;

    try {
      // Save scroll position
      const treeEl = this.container.querySelector('.fb-tree');
      if (treeEl) {
        this.scrollPosition = treeEl.scrollTop;
      }

      // Save search input focus and cursor position
      const searchInput = this.container.querySelector('.fb-search-input');
      const hadFocus = searchInput && document.activeElement === searchInput;
      const cursorPosition = hadFocus ? searchInput.selectionStart : null;

      const files = this.state.get('workspace.files') || [];

      // Filter files based on search
      const filteredFiles = this.filterFiles(files);

      // Cache all visible files for "Select All" functionality
      this.allFiles = filteredFiles;

      // Build tree structure with all standard folders
      const tree = this.buildPhysicalTree(filteredFiles);

      // Render HTML
      this.container.innerHTML = `
        <div class="fb-header">
          <div class="fb-header-left">
            <input type="checkbox"
                   class="fb-select-all-checkbox"
                   id="fb-select-all"
                   title="Select all files">
            <label for="fb-select-all" class="fb-select-all-label">Files</label>
          </div>
          <button class="fb-btn-refresh" title="Refresh">🔄</button>
        </div>

        <div class="fb-upload-section">
          <select class="fb-category-dropdown" id="fb-upload-category" title="Select upload category">
            <option value="">Upload to...</option>
            <option value="raw_images">📷 Raw Images</option>
            <option value="annotations">🎨 Annotations</option>
            <option value="inference_data">🔬 Inference Data</option>
            <option value="imported_models">🧠 Model Files</option>
          </select>
          <button class="fb-btn-upload" id="fb-upload-btn" title="Upload file" disabled>
            <span class="fb-upload-icon">⬆️</span>
            <span class="fb-upload-text">Upload</span>
          </button>
        </div>

        <input type="file" id="fb-file-input" class="fb-file-input-hidden"
               accept=".tif,.tiff,.pth,.json" multiple style="display: none;">

        <div class="fb-upload-progress" id="fb-upload-progress" style="display: none;">
          <div class="fb-progress-bar">
            <div class="fb-progress-fill" id="fb-progress-fill" style="width: 0%;"></div>
          </div>
          <div class="fb-progress-text" id="fb-progress-text">Uploading...</div>
        </div>

        <div class="fb-drop-overlay" id="fb-drop-overlay" style="display: none;">
          <div class="fb-drop-content">
            <span class="fb-drop-icon">📁</span>
            <p class="fb-drop-text">Drop files here to upload</p>
            <p class="fb-drop-category" id="fb-drop-category-text"></p>
          </div>
        </div>

        <div class="fb-search">
          <input type="text"
                 class="fb-search-input"
                 placeholder="Search files by name or type..."
                 title="Search by filename or category (raw, annotation, model, mesh, etc.)"
                 value="${this.escapeHtml(this.searchQuery)}">
          ${this.searchQuery ? `
            <button class="fb-search-clear" title="Clear search">✕</button>
          ` : ''}
        </div>

        <!-- Batch Toolbar (hidden by default) -->
        <div class="fb-batch-toolbar" id="fb-batch-toolbar" style="display: ${this.batchToolbarVisible ? 'flex' : 'none'};">
          <div class="fb-batch-info">
            <span class="fb-batch-count" id="fb-batch-count">0</span>
          </div>
          <div class="fb-batch-actions">
            <button class="fb-btn-batch fb-btn-batch-download"
                    id="fb-batch-download"
                    title="Download selected files as ZIP">
              ⬇️
            </button>
            <button class="fb-btn-batch fb-btn-batch-delete"
                    id="fb-batch-delete"
                    title="Delete selected files">
              🗑️
            </button>
            <button class="fb-btn-batch fb-btn-batch-clear"
                    id="fb-batch-clear"
                    title="Clear selection">
              ✕
            </button>
          </div>
        </div>

        <div class="fb-tree">
          ${this.searchQuery && filteredFiles.length === 0 ? `
            <div class="fb-empty-state">
              <div class="fb-empty-icon">🔍</div>
              <div class="fb-empty-text">No files found</div>
              <div class="fb-empty-subtext">No files match "${this.escapeHtml(this.searchQuery)}"</div>
              <button class="fb-btn-clear-search">Clear search</button>
            </div>
          ` : this.searchQuery ? this.renderSearchResults(filteredFiles) : this.renderTree(tree)}
        </div>

        <!-- Loading Overlay (hidden by default) -->
        <div class="fb-loading-overlay" id="fb-loading-overlay" style="display: none;">
          <div class="fb-loading-content">
            <div class="fb-spinner"></div>
            <p class="fb-loading-text" id="fb-loading-text">Loading...</p>
          </div>
        </div>
      `;

      // Restore scroll position
      const newTreeEl = this.container.querySelector('.fb-tree');
      if (newTreeEl) {
        newTreeEl.scrollTop = this.scrollPosition;
      }

      // Attach event listeners
      this.attachEventListeners();

      // Restore search input focus and cursor position
      if (hadFocus) {
        const newSearchInput = this.container.querySelector('.fb-search-input');
        if (newSearchInput) {
          newSearchInput.focus();
          if (cursorPosition !== null) {
            newSearchInput.setSelectionRange(cursorPosition, cursorPosition);
          }
        }
      }

      // Update selection UI and batch toolbar to reflect current selection state
      this.updateSelectionUI();
      this.updateBatchToolbar();
    } finally {
      this.isRendering = false;
    }
  }

  /**
   * Build physical directory tree structure with standard workspace folders
   * @param {Array} files - List of file objects
   * @returns {Object} Tree structure
   */
  buildPhysicalTree(files) {
    const tree = {
      name: 'root',
      path: '',
      type: 'directory',
      children: []
    };

    // Define standard workspace directory structure
    const standardDirs = [
      'uploads',
      'uploads/raw',
      'uploads/annotations',
      'uploads/inference_data',
      'uploads/imported_models',
      'models',
      'models/segmentation',
      'models/denoising',
      'results',
      'results/segmentation',
      'results/denoised',
      'results/meshes'
    ];

    // Map to store directory nodes
    const dirMap = new Map();
    dirMap.set('', tree);

    // Create standard directory structure first
    standardDirs.forEach(dirPath => {
      const pathParts = dirPath.split('/');
      let currentPath = '';

      pathParts.forEach(part => {
        const parentPath = currentPath;
        currentPath = currentPath ? `${currentPath}/${part}` : part;

        if (!dirMap.has(currentPath)) {
          const dirNode = {
            name: part,
            path: currentPath,
            type: 'directory',
            children: []
          };
          dirMap.set(currentPath, dirNode);

          // Add to parent
          const parent = dirMap.get(parentPath);
          if (parent) {
            parent.children.push(dirNode);
          }
        }
      });
    });

    // Add any additional directories from file paths
    files.forEach(file => {
      const pathParts = file.path.split('/');
      pathParts.pop(); // Remove filename

      let currentPath = '';
      pathParts.forEach(part => {
        const parentPath = currentPath;
        currentPath = currentPath ? `${currentPath}/${part}` : part;

        if (!dirMap.has(currentPath)) {
          const dirNode = {
            name: part,
            path: currentPath,
            type: 'directory',
            children: []
          };
          dirMap.set(currentPath, dirNode);

          // Add to parent
          const parent = dirMap.get(parentPath);
          if (parent) {
            parent.children.push(dirNode);
          }
        }
      });
    });

    // Add files to their parent directories
    files.forEach(file => {
      const pathParts = file.path.split('/');
      const filename = pathParts.pop();
      const dirPath = pathParts.join('/');

      const parentDir = dirMap.get(dirPath);
      if (parentDir) {
        parentDir.children.push({
          ...file,
          name: filename,
          type: 'file'
        });
      }
    });

    // Sort children (directories first, then alphabetically)
    const sortChildren = (node) => {
      if (node.children) {
        node.children.sort((a, b) => {
          if (a.type !== b.type) {
            return a.type === 'directory' ? -1 : 1;
          }
          return a.name.localeCompare(b.name);
        });
        node.children.forEach(child => sortChildren(child));
      }
    };

    sortChildren(tree);

    return tree;
  }

  /**
   * Recursively render tree structure
   * @param {Object} node - Tree node
   * @param {number} level - Nesting level
   * @returns {string} HTML string
   */
  renderTree(node, level = 0) {
    if (node.type === 'file') {
      return this.renderFile(node, level);
    } else {
      return this.renderDirectory(node, level);
    }
  }

  /**
   * Render a directory node
   * @param {Object} dir - Directory node
   * @param {number} level - Nesting level
   * @returns {string} HTML string
   */
  renderDirectory(dir, level) {
    // Skip rendering root, but render its children at level 1
    if (level === 0) {
      return dir.children.map(child => this.renderTree(child, 1)).join('');
    }

    const isExpanded = this.expandedFolders.has(dir.path);
    const hasChildren = dir.children && dir.children.length > 0;
    const indent = (level - 1) * 16; // Adjust indent for level 1 starting at 0px

    return `
      <div class="fb-folder" data-path="${this.escapeHtml(dir.path)}">
        <div class="fb-folder-header" style="padding-left: ${indent}px">
          <span class="fb-toggle">${hasChildren ? (isExpanded ? '▼' : '▶') : ' '}</span>
          <span class="fb-icon">📁</span>
          <span class="fb-name">${this.escapeHtml(dir.name)}</span>
        </div>
        ${isExpanded && hasChildren ? `
          <div class="fb-folder-content">
            ${dir.children.map(child => this.renderTree(child, level + 1)).join('')}
          </div>
        ` : ''}
      </div>
    `;
  }

  /**
   * Render a file node
   * @param {Object} file - File object
   * @param {number} level - Nesting level
   * @returns {string} HTML string
   */
  renderFile(file, level) {
    const indent = (level - 1) * 16;
    const isRecent = this.recentFileIds.has(file.id);
    const hasThumbnail = this.shouldShowThumbnail(file.name);
    const icon = this.getFileIcon(file.name);
    const isSelected = this.isFileSelected(file.id);

    return `
      <div class="fb-file ${isRecent ? 'fb-file-new' : ''} ${isSelected ? 'fb-file-selected' : ''}"
           data-file-id="${file.id}"
           style="padding-left: ${indent}px">
        <div class="fb-file-content">
          <input type="checkbox"
                 class="fb-file-checkbox"
                 data-file-id="${file.id}"
                 ${isSelected ? 'checked' : ''}
                 title="Select file">
          ${hasThumbnail ? `
            <img src="/api/workspace/thumbnail/${file.id}"
                 class="fb-thumbnail"
                 alt="thumbnail"
                 loading="lazy"
                 onerror="this.style.display='none'; this.nextElementSibling.style.display='inline';">
            <span class="fb-icon" style="display: none;">${icon}</span>
          ` : `
            <span class="fb-icon">${icon}</span>
          `}
          <div class="fb-file-info">
            <div class="fb-file-name" title="${this.escapeHtml(file.name)}">${this.escapeHtml(file.name)}</div>
            <div class="fb-file-meta">${this.formatFileSize(file.size)} • ${this.formatDate(file.uploadedAt)}</div>
          </div>
          <div class="fb-file-actions">
            <button class="fb-btn-icon" title="Download" data-action="download">⬇️</button>
            <button class="fb-btn-icon" title="Rename" data-action="rename">✏️</button>
            <button class="fb-btn-icon" title="Delete" data-action="delete">🗑️</button>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render search results as a flat list
   * @param {Array} files - Filtered files array
   * @returns {string} HTML string
   */
  renderSearchResults(files) {
    if (files.length === 0) {
      return '';
    }

    return `
      <div class="fb-search-results">
        <div class="fb-search-header">
          <span class="fb-search-count">${files.length} result${files.length !== 1 ? 's' : ''}</span>
          <span class="fb-search-query">matching "${this.escapeHtml(this.searchQuery)}"</span>
        </div>
        ${files.map(file => this.renderSearchResultItem(file)).join('')}
      </div>
    `;
  }

  /**
   * Render a single search result item
   * @param {Object} file - File object
   * @returns {string} HTML string
   */
  renderSearchResultItem(file) {
    const isRecent = this.recentFileIds.has(file.id);
    const hasThumbnail = this.shouldShowThumbnail(file.name);
    const icon = this.getFileIcon(file.name);
    const isSelected = this.isFileSelected(file.id);

    // Extract directory path for display
    const pathParts = file.path.split('/');
    pathParts.pop(); // Remove filename
    const dirPath = pathParts.join('/') || 'root';

    return `
      <div class="fb-search-result ${isRecent ? 'fb-file-new' : ''} ${isSelected ? 'fb-file-selected' : ''}"
           data-file-id="${file.id}">
        <input type="checkbox"
               class="fb-file-checkbox"
               data-file-id="${file.id}"
               ${isSelected ? 'checked' : ''}
               title="Select file">
        ${hasThumbnail ? `
          <img src="/api/workspace/thumbnail/${file.id}"
               class="fb-result-thumbnail"
               alt="thumbnail"
               loading="lazy"
               onerror="this.style.display='none'; this.nextElementSibling.style.display='inline';">
          <span class="fb-result-icon" style="display: none;">${icon}</span>
        ` : `
          <span class="fb-result-icon">${icon}</span>
        `}
        <div class="fb-result-info">
          <div class="fb-result-name" title="${this.escapeHtml(file.name)}">${this.escapeHtml(file.name)}</div>
          <div class="fb-result-path" title="${this.escapeHtml(file.path)}">📁 ${this.escapeHtml(dirPath)}</div>
        </div>
        <div class="fb-result-actions">
          <button class="fb-btn-icon" title="Download" data-action="download">⬇️</button>
          <button class="fb-btn-icon" title="Rename" data-action="rename">✏️</button>
          <button class="fb-btn-icon" title="Delete" data-action="delete">🗑️</button>
        </div>
      </div>
    `;
  }

  /**
   * Attach event listeners to UI elements
   */
  attachEventListeners() {
    // Remove old container to clear all listeners, then re-add
    const newContainer = this.container.cloneNode(false);
    newContainer.innerHTML = this.container.innerHTML;
    this.container.parentNode.replaceChild(newContainer, this.container);
    this.container = newContainer;

    // Search with 300ms debounce
    const searchInput = this.container.querySelector('.fb-search-input');
    if (searchInput) {
      let searchTimeout;
      searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
          this.searchQuery = e.target.value;
          this.render();
        }, 300);
      });
    }

    // Clear search button (X in search input)
    const searchClearBtn = this.container.querySelector('.fb-search-clear');
    if (searchClearBtn) {
      searchClearBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.searchQuery = '';
        if (searchInput) searchInput.value = '';
        this.render();
      });
    }

    // Clear search button in empty state
    const clearSearchBtn = this.container.querySelector('.fb-btn-clear-search');
    if (clearSearchBtn) {
      clearSearchBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.searchQuery = '';
        if (searchInput) searchInput.value = '';
        this.render();
      });
    }

    // Manual refresh
    const refreshBtn = this.container.querySelector('.fb-btn-refresh');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.refresh();
      });
    }

    // Category dropdown - enable/disable upload button
    const categoryDropdown = this.container.querySelector('#fb-upload-category');
    const uploadBtn = this.container.querySelector('#fb-upload-btn');

    if (categoryDropdown && uploadBtn) {
      categoryDropdown.addEventListener('change', (e) => {
        const category = e.target.value;
        uploadBtn.disabled = !category;
        this.updateFileInputAccept(category);
      });
    }

    // Upload button click
    if (uploadBtn) {
      uploadBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const fileInput = this.container.querySelector('#fb-file-input');
        if (fileInput && !uploadBtn.disabled) {
          fileInput.click();
        }
      });
    }

    // File input change
    const fileInput = this.container.querySelector('#fb-file-input');
    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        this.handleFileSelection(e.target.files);
        e.target.value = '';
      });
    }

    // Drag and drop
    this.attachDragAndDropListeners();

    // Folder toggle - use event delegation on container
    this.container.addEventListener('click', (e) => {
      // Check if click is on folder header or toggle
      const folderHeader = e.target.closest('.fb-folder-header');
      if (folderHeader) {
        e.stopPropagation();
        const folderEl = folderHeader.closest('.fb-folder');
        if (folderEl) {
          const path = folderEl.dataset.path;
          if (path) {
            this.toggleFolder(path);
          }
        }
        return;
      }

      // File action buttons
      if (e.target.classList.contains('fb-btn-icon')) {
        e.stopPropagation();
        const action = e.target.dataset.action;
        const fileEl = e.target.closest('.fb-file');
        if (!fileEl) return;

        const fileId = fileEl.dataset.fileId;

        switch (action) {
          case 'download':
            this.downloadFile(fileId);
            break;
          case 'rename':
            this.renameFile(fileId);
            break;
          case 'delete':
            this.deleteFile(fileId);
            break;
        }
      }
    });

    // Context menu for files and search results
    this.container.addEventListener('contextmenu', (e) => {
      // Check if right-click is on a file element (tree or search result)
      const fileEl = e.target.closest('.fb-file, .fb-search-result');

      if (fileEl) {
        e.preventDefault(); // Prevent browser context menu
        e.stopPropagation();

        const fileId = fileEl.dataset.fileId;
        if (fileId) {
          this.showFileContextMenu(e.pageX, e.pageY, fileId);
        }
      }
    });

    // Batch toolbar buttons
    const batchDownloadBtn = this.container.querySelector('#fb-batch-download');
    if (batchDownloadBtn) {
      batchDownloadBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.batchDownloadSelected();
      });
    }

    const batchDeleteBtn = this.container.querySelector('#fb-batch-delete');
    if (batchDeleteBtn) {
      batchDeleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.batchDeleteSelected();
      });
    }

    const batchClearBtn = this.container.querySelector('#fb-batch-clear');
    if (batchClearBtn) {
      batchClearBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.clearSelection();
      });
    }

    // Select All checkbox
    const selectAllCheckbox = this.container.querySelector('.fb-select-all-checkbox');
    if (selectAllCheckbox) {
      selectAllCheckbox.addEventListener('change', (e) => {
        e.stopPropagation();
        if (e.target.checked) {
          this.selectAll();
        } else {
          this.clearSelection();
        }
      });
    }

    // Individual file checkboxes - use event delegation
    this.container.addEventListener('change', (e) => {
      if (e.target.classList.contains('fb-file-checkbox')) {
        e.stopPropagation();
        const fileId = e.target.dataset.fileId;
        this.toggleFileSelection(fileId);
      }
    });

    // Prevent checkbox clicks from propagating to parent elements
    this.container.addEventListener('click', (e) => {
      if (e.target.classList.contains('fb-file-checkbox')) {
        e.stopPropagation();
      }
    });
  }

  /**
   * Toggle folder expand/collapse state
   * @param {string} path - Folder path
   */
  toggleFolder(path) {
    if (!path) return;

    if (this.expandedFolders.has(path)) {
      this.expandedFolders.delete(path);
    } else {
      this.expandedFolders.add(path);
    }
    this.render();
  }

  /**
   * Download a file
   * @param {string} fileId - File ID
   */
  async downloadFile(fileId) {
    try {
      const file = this.state.get('workspace.files').find(f => f.id === fileId);
      if (!file) {
        throw new Error('File not found');
      }

      // Use WorkspaceAPI method for download
      this.api.downloadFile(fileId);
      this.state.notify('success', 'Download started', 3000);
    } catch (error) {
      console.error('[FileBrowser] Download error:', error);
      this.state.notify('error', `Download failed: ${error.message}`);
    }
  }

  /**
   * Rename a file
   * @param {string} fileId - File ID
   */
  async renameFile(fileId) {
    const file = this.state.get('workspace.files').find(f => f.id === fileId);
    if (!file) return;

    const newName = prompt('Enter new filename:', file.name);
    if (!newName || newName === file.name) return;

    // Validate extension matches
    const oldExt = file.name.split('.').pop().toLowerCase();
    const newExt = newName.split('.').pop().toLowerCase();
    if (oldExt !== newExt) {
      this.state.notify('error', 'File extension must remain the same');
      return;
    }

    try {
      this.state.update('ui.loading', true);

      const response = await this.api.request(`/api/workspace/file/${fileId}/rename`, {
        method: 'PATCH',
        body: JSON.stringify({ newName })
      });

      if (response.success) {
        await this.refresh();
        this.state.notify('success', 'File renamed successfully');
      }
    } catch (error) {
      console.error('[FileBrowser] Rename error:', error);
      this.state.notify('error', `Rename failed: ${error.message}`);
    } finally {
      this.state.update('ui.loading', false);
    }
  }

  /**
   * Delete a file
   * @param {string} fileId - File ID
   */
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
      console.error('[FileBrowser] Delete error:', error);
      this.state.notify('error', `Delete failed: ${error.message}`);
    } finally {
      this.state.update('ui.loading', false);
    }
  }

  /**
   * Batch download selected files as ZIP
   */
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
      this.state.notify('success', `Downloaded ${selectedIds.length} file${selectedIds.length !== 1 ? 's' : ''}`, 3000);

      // Optional: Clear selection after download
      // this.clearSelection();

    } catch (error) {
      console.error('[FileBrowser] Batch download error:', error);
      this.state.notify('error', `Download failed: ${error.message}`, 5000);
    } finally {
      this.setLoading(false);
    }
  }

  /**
   * Batch delete selected files
   */
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
      this.setLoading(true, `Deleting ${selectedIds.length} ${fileWord}...`);

      // Call API
      const response = await this.api.batchDeleteFiles(selectedIds);

      // Success notification
      this.state.notify('success', `Deleted ${response.deletedCount} ${fileWord}`, 3000);

      // Clear selection
      this.clearSelection();

      // Refresh file list
      await this.refresh();

    } catch (error) {
      console.error('[FileBrowser] Batch delete error:', error);
      this.state.notify('error', `Delete failed: ${error.message}`, 5000);
    } finally {
      this.setLoading(false);
    }
  }

  /**
   * Set loading state with custom message
   * @param {boolean} isLoading - Show or hide loading overlay
   * @param {string} message - Loading message to display
   */
  setLoading(isLoading, message = 'Loading...') {
    if (!this.container) return;

    const overlay = this.container.querySelector('#fb-loading-overlay');
    const text = this.container.querySelector('#fb-loading-text');

    if (overlay && text) {
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

    // Also update global loading state
    this.state.update('ui.loading', isLoading);
  }

  /**
   * Show context menu for a file
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   * @param {string} fileId - File ID
   */
  showFileContextMenu(x, y, fileId) {
    const file = this.state.get('workspace.files').find(f => f.id === fileId);
    if (!file) return;

    const menuItems = [
      {
        icon: '⬇️',
        label: 'Download',
        onClick: () => this.downloadFile(fileId)
      },
      {
        icon: 'ℹ️',
        label: 'View Info',
        onClick: () => this.showFileInfo(fileId)
      },
      {
        icon: '✏️',
        label: 'Rename',
        onClick: () => this.renameFile(fileId)
      },
      {
        separator: true
      },
      {
        icon: '🗑️',
        label: 'Delete',
        shortcut: 'Del',
        onClick: () => this.deleteFile(fileId)
      }
    ];

    this.contextMenu.show(x, y, menuItems);
  }

  /**
   * Show file info modal with metadata
   * @param {string} fileId - File ID
   */
  showFileInfo(fileId) {
    const file = this.state.get('workspace.files').find(f => f.id === fileId);
    if (!file) return;

    // Create modal overlay
    const modal = document.createElement('div');
    modal.className = 'file-info-modal';
    modal.innerHTML = `
      <div class="file-info-overlay"></div>
      <div class="file-info-content">
        <div class="file-info-header">
          <h3>File Information</h3>
          <button class="file-info-close" title="Close">✕</button>
        </div>
        <div class="file-info-body">
          ${this.shouldShowThumbnail(file.name) ? `
            <div class="file-info-thumbnail">
              <img src="/api/workspace/thumbnail/${file.id}"
                   alt="Thumbnail"
                   onerror="this.parentElement.style.display='none';">
            </div>
          ` : ''}
          <div class="file-info-details">
            <div class="file-info-row">
              <span class="file-info-label">Name:</span>
              <span class="file-info-value">${this.escapeHtml(file.name)}</span>
            </div>
            <div class="file-info-row">
              <span class="file-info-label">Path:</span>
              <span class="file-info-value">${this.escapeHtml(file.path)}</span>
            </div>
            <div class="file-info-row">
              <span class="file-info-label">Size:</span>
              <span class="file-info-value">${this.formatFileSize(file.size)}</span>
            </div>
            <div class="file-info-row">
              <span class="file-info-label">Category:</span>
              <span class="file-info-value">${this.escapeHtml(file.category || 'N/A')}</span>
            </div>
            <div class="file-info-row">
              <span class="file-info-label">Uploaded:</span>
              <span class="file-info-value">${this.formatDate(file.uploadedAt)}</span>
            </div>
            <div class="file-info-row">
              <span class="file-info-label">ID:</span>
              <span class="file-info-value file-info-mono">${this.escapeHtml(file.id)}</span>
            </div>
          </div>
        </div>
      </div>
    `;

    // Add to document
    document.body.appendChild(modal);

    // Close handlers
    const closeModal = () => {
      if (modal.parentNode) {
        modal.parentNode.removeChild(modal);
      }
    };

    // Close button
    const closeBtn = modal.querySelector('.file-info-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', closeModal);
    }

    // Click overlay to close
    const overlay = modal.querySelector('.file-info-overlay');
    if (overlay) {
      overlay.addEventListener('click', closeModal);
    }

    // ESC key to close
    const handleEscape = (e) => {
      if (e.key === 'Escape' || e.key === 'Esc') {
        closeModal();
        document.removeEventListener('keydown', handleEscape);
      }
    };
    document.addEventListener('keydown', handleEscape);
  }

  /**
   * Filter files based on search query - matches filename OR category
   * Supports multi-word search (OR logic between words)
   * @param {Array} files - List of files
   * @returns {Array} Filtered files
   */
  filterFiles(files) {
    if (!this.searchQuery.trim()) {
      return files;
    }

    const query = this.searchQuery.toLowerCase().trim();
    const queryWords = query.split(/\s+/); // Split by whitespace for multi-word search

    return files.filter(file => {
      // Check if ANY word in query matches filename or category
      return queryWords.some(word => {
        // Match 1: Filename (case-insensitive substring match)
        if (file.name.toLowerCase().includes(word)) {
          return true;
        }

        // Match 2: Category value (direct partial match)
        // e.g., "seg" matches "segmentation_results"
        if (file.category && file.category.toLowerCase().includes(word)) {
          return true;
        }

        // Match 3: Category keywords (mapped natural language terms)
        // e.g., "model" matches imported_models, "mesh" matches meshes
        if (file.category && this.categoryKeywords[file.category]) {
          const keywords = this.categoryKeywords[file.category];
          return keywords.some(keyword => keyword.toLowerCase().includes(word));
        }

        return false;
      });
    });
  }

  /**
   * Mark a file as recently added (shows NEW badge)
   * @param {string} fileId - File ID
   */
  markAsRecent(fileId) {
    this.recentFileIds.add(fileId);

    // Remove badge after 10 seconds
    setTimeout(() => {
      this.recentFileIds.delete(fileId);
      this.render();
    }, 10000);

    this.render();
  }

  /**
   * Check if file should show thumbnail
   * @param {string} filename - Filename
   * @returns {boolean}
   */
  shouldShowThumbnail(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    return ['tif', 'tiff', 'png', 'jpg', 'jpeg'].includes(ext);
  }

  /**
   * Get icon for file type
   * @param {string} filename - Filename
   * @returns {string} Emoji icon
   */
  getFileIcon(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const icons = {
      tif: '🖼️',
      tiff: '🖼️',
      png: '🖼️',
      jpg: '🖼️',
      jpeg: '🖼️',
      pth: '🧠',
      h5: '🧠',
      json: '📄',
      txt: '📄',
      csv: '📄',
      zip: '📦',
      tar: '📦',
      gz: '📦'
    };
    return icons[ext] || '📄';
  }

  /**
   * Format file size for display
   * @param {number} bytes - File size in bytes
   * @returns {string} Formatted size
   */
  formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  }

  /**
   * Format date for display
   * @param {string} dateString - ISO date string
   * @returns {string} Formatted date
   */
  formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString();
  }

  /**
   * Escape HTML to prevent XSS
   * @param {string} text - Text to escape
   * @returns {string} Escaped text
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Update file input accept attribute based on category
   * @param {string} category - Selected category
   */
  updateFileInputAccept(category) {
    const fileInput = this.container.querySelector('#fb-file-input');
    if (!fileInput) return;

    if (category === 'imported_models') {
      fileInput.accept = '.pth,.json';
    } else {
      fileInput.accept = '.tif,.tiff';
    }
  }

  /**
   * Attach drag-and-drop event listeners to file browser
   */
  attachDragAndDropListeners() {
    const dropOverlay = this.container.querySelector('#fb-drop-overlay');
    const categoryDropdown = this.container.querySelector('#fb-upload-category');
    const categoryText = this.container.querySelector('#fb-drop-category-text');

    if (!dropOverlay) return;

    // Find the entire sidebar element
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;

    // Prevent default drag behavior on entire sidebar
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
      sidebar.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
    });

    // Show overlay on drag enter
    sidebar.addEventListener('dragenter', (e) => {
      const category = categoryDropdown.value;

      if (!category) {
        categoryText.textContent = '⚠️ Please select a category first';
        categoryText.style.color = 'var(--error-color, #e74c3c)';
      } else {
        const categoryNames = {
          raw_images: 'Raw Images',
          annotations: 'Annotations',
          inference_data: 'Inference Data',
          imported_models: 'Model Files'
        };
        categoryText.textContent = `Uploading to: ${categoryNames[category]}`;
        categoryText.style.color = 'var(--primary-color, #4A90E2)';
      }

      dropOverlay.style.display = 'flex';
    });

    // Hide overlay on drag leave
    sidebar.addEventListener('dragleave', (e) => {
      // Only hide if actually leaving the sidebar (not just moving to a child)
      const rect = sidebar.getBoundingClientRect();
      const x = e.clientX;
      const y = e.clientY;

      // Check if mouse is outside the sidebar bounds
      if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
        dropOverlay.style.display = 'none';
      }
    });

    // Handle drop
    sidebar.addEventListener('drop', (e) => {
      dropOverlay.style.display = 'none';

      const category = categoryDropdown.value;
      if (!category) {
        this.state.notify('error', 'Please select a category before uploading files');
        return;
      }

      const files = Array.from(e.dataTransfer.files);
      this.handleFileSelection(files);
    });
  }

  /**
   * Handle file selection from input or drag-and-drop
   * @param {FileList} files - Files to upload
   */
  async handleFileSelection(files) {
    const categoryDropdown = this.container.querySelector('#fb-upload-category');
    const category = categoryDropdown.value;

    if (!category) {
      this.state.notify('error', 'Please select a category first');
      return;
    }

    if (!files || files.length === 0) return;

    const validationResult = this.validateFiles(files, category);

    if (!validationResult.valid) {
      this.state.notify('error', validationResult.error);
      return;
    }

    await this.uploadFiles(Array.from(files), category);
  }

  /**
   * Validate files before upload (client-side)
   * @param {FileList} files - Files to validate
   * @param {string} category - Upload category
   * @returns {Object} { valid: boolean, error: string }
   */
  validateFiles(files, category) {
    const fileArray = Array.from(files);

    if (fileArray.length === 0) {
      return { valid: false, error: 'No files selected' };
    }

    if (category === 'imported_models') {
      const invalidFiles = fileArray.filter(file => {
        const ext = file.name.toLowerCase().split('.').pop();
        return !['pth', 'json'].includes(ext);
      });

      if (invalidFiles.length > 0) {
        return {
          valid: false,
          error: `Invalid file type(s). Only .pth and .json files allowed for models.`
        };
      }

      // Show info for model uploads
      if (fileArray.some(f => f.name.toLowerCase().endsWith('.pth'))) {
        this.state.notify('info', 'Tip: For complete model validation, use the Segmentation module\'s Import Model feature', 5000);
      }

    } else {
      const invalidFiles = fileArray.filter(file => {
        const ext = file.name.toLowerCase().split('.').pop();
        return !['tif', 'tiff'].includes(ext);
      });

      if (invalidFiles.length > 0) {
        return {
          valid: false,
          error: `Invalid file type(s). Only TIFF files (.tif, .tiff) allowed.`
        };
      }
    }

    // Check file sizes (200MB limit)
    const maxSize = 200 * 1024 * 1024;
    const oversizedFiles = fileArray.filter(f => f.size > maxSize);

    if (oversizedFiles.length > 0) {
      return {
        valid: false,
        error: `File(s) too large. Maximum 200MB per file.`
      };
    }

    return { valid: true };
  }

  /**
   * Upload files to workspace
   * @param {Array<File>} files - Files to upload
   * @param {string} category - Upload category
   */
  async uploadFiles(files, category) {
    const uploadBtn = this.container.querySelector('#fb-upload-btn');
    const categoryDropdown = this.container.querySelector('#fb-upload-category');
    const progressContainer = this.container.querySelector('#fb-upload-progress');
    const progressFill = this.container.querySelector('#fb-progress-fill');
    const progressText = this.container.querySelector('#fb-progress-text');

    // Disable upload controls
    if (uploadBtn) {
      uploadBtn.disabled = true;
      uploadBtn.querySelector('.fb-upload-text').textContent = 'Uploading...';
      uploadBtn.classList.add('uploading');
    }
    if (categoryDropdown) {
      categoryDropdown.disabled = true;
    }

    // Show progress bar
    if (progressContainer) {
      progressContainer.style.display = 'block';
    }

    const totalFiles = files.length;
    let uploadedCount = 0;
    const uploadedFileIds = [];

    try {
      for (const file of files) {
        if (progressText) {
          progressText.textContent = `Uploading ${uploadedCount + 1} of ${totalFiles}: ${file.name}`;
        }

        const result = await this.api.uploadFile(file, category);

        if (result.success && result.file) {
          uploadedFileIds.push(result.file.id);
          uploadedCount++;

          const progress = (uploadedCount / totalFiles) * 100;
          if (progressFill) {
            progressFill.style.width = `${progress}%`;
          }
        }
      }

      this.state.notify('success', `Successfully uploaded ${uploadedCount} file(s)`);

      await this.refresh();

      uploadedFileIds.forEach(id => this.markAsRecent(id));

    } catch (error) {
      console.error('[FileBrowser] Upload error:', error);

      let errorMsg = error.message;
      if (errorMsg.includes('403') || errorMsg.includes('approval')) {
        errorMsg = 'Account approval required. You can use test data while waiting.';
      }

      this.state.notify('error', `Upload failed: ${errorMsg}`);

    } finally {
      if (uploadBtn) {
        uploadBtn.disabled = false;
        uploadBtn.querySelector('.fb-upload-text').textContent = 'Upload';
        uploadBtn.classList.remove('uploading');
      }
      if (categoryDropdown) {
        categoryDropdown.disabled = false;
      }

      setTimeout(() => {
        if (progressContainer) {
          progressContainer.style.display = 'none';
          if (progressFill) progressFill.style.width = '0%';
        }
      }, 2000);
    }
  }
}

// Make available globally for workspace.js
window.FileBrowser = FileBrowser;
