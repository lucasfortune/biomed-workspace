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
    } catch (error) {
      console.error('[FileBrowser] Error refreshing file list:', error);
      this.state.notify('error', `Failed to load files: ${error.message}`);
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

      const files = this.state.get('workspace.files') || [];

      // Filter files based on search
      const filteredFiles = this.filterFiles(files);

      // Build tree structure with all standard folders
      const tree = this.buildPhysicalTree(filteredFiles);

      // Render HTML
      this.container.innerHTML = `
        <div class="fb-header">
          <h3>Files</h3>
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
                 placeholder="Search files..."
                 value="${this.escapeHtml(this.searchQuery)}">
        </div>
        <div class="fb-tree">
          ${this.renderTree(tree)}
        </div>
      `;

      // Restore scroll position
      const newTreeEl = this.container.querySelector('.fb-tree');
      if (newTreeEl) {
        newTreeEl.scrollTop = this.scrollPosition;
      }

      // Attach event listeners
      this.attachEventListeners();
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

    return `
      <div class="fb-file ${isRecent ? 'fb-file-new' : ''}"
           data-file-id="${file.id}"
           style="padding-left: ${indent}px">
        <div class="fb-file-content">
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
   * Filter files based on search query
   * @param {Array} files - List of files
   * @returns {Array} Filtered files
   */
  filterFiles(files) {
    if (!this.searchQuery.trim()) {
      return files;
    }

    const query = this.searchQuery.toLowerCase();
    return files.filter(file =>
      file.name.toLowerCase().includes(query)
    );
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
