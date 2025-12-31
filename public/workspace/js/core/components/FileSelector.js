/**
 * FileSelector Component
 *
 * Modern dropdown-based file selector with upload capability.
 * Supports test data, recent results, and workspace files with optional filtering.
 *
 * Usage:
 * ```javascript
 * const selector = new FileSelector({
 *   id: 'training-data',
 *   title: 'Training Images',
 *   icon: '🖼️',
 *   fileType: 'raw_images',
 *   accept: '.tif,.tiff',
 *   showTestData: true,
 *   showRecentResults: false,
 *   onSelect: (file) => console.log('Selected:', file),
 *   onUpload: async (file) => { ... }
 * });
 *
 * container.innerHTML = selector.render();
 * await selector.init();
 *
 * // Get selected file
 * const file = selector.getSelectedFile();
 * ```
 */
class FileSelector {
  /**
   * Create a FileSelector
   * @param {object} config - Configuration options
   * @param {string} [config.id] - Unique identifier
   * @param {string} [config.title='Select File'] - Display title
   * @param {string} [config.icon='📁'] - Emoji icon
   * @param {string} [config.fileType] - File type for categorization (raw_images, annotations, etc.)
   * @param {string} [config.accept='.tif,.tiff'] - Accepted file extensions
   * @param {boolean} [config.showTestData=true] - Show test data optgroup
   * @param {boolean} [config.showRecentResults=false] - Show recent results optgroup
   * @param {boolean} [config.acceptAllTiff=false] - Accept any TIFF regardless of category
   * @param {Array} [config.resultCategories] - Categories to show in Recent Results (default: segmentations, denoised, processed)
   * @param {Object} [config.resultCategoryLabels] - Labels for result categories (e.g., { meshes: 'Mesh' })
   * @param {Array} [config.testDataOptions] - Custom test data options
   * @param {Function} [config.onSelect] - Callback when file is selected (file) => {}
   * @param {Function} [config.onUpload] - Callback when file is uploaded (file, uploadedInfo) => {}
   * @param {Function} [config.onValidate] - Callback for file validation (file) => Promise<boolean>
   * @param {Function} [config.filterFiles] - Custom file filter function (files) => files
   * @param {Function} [config.filterRecentResults] - Custom filter for recent results (results) => results
   * @param {string} [config.uploadEndpoint='/api/workspace/upload'] - Upload endpoint
   * @param {Object} [config.stateManager] - Optional StateManager for notifications
   */
  constructor(config = {}) {
    this.id = config.id || `file-selector-${Date.now()}`;
    this.title = config.title || 'Select File';
    this.icon = config.icon || '📁';
    this.fileType = config.fileType || 'file';
    this.accept = config.accept || '.tif,.tiff';
    this.showTestData = config.showTestData !== false;
    this.showRecentResults = config.showRecentResults === true;
    this.acceptAllTiff = config.acceptAllTiff === true;
    this.testDataOptions = config.testDataOptions || null;
    this.uploadEndpoint = config.uploadEndpoint || '/api/workspace/upload';

    // Configurable result categories (default to TIFF-based results)
    this.resultCategories = config.resultCategories || ['segmentations', 'denoised', 'processed'];
    this.resultCategoryLabels = config.resultCategoryLabels || {
      'segmentations': 'Segmentation',
      'denoised': 'Denoised',
      'processed': 'Processed',
      'meshes': 'Mesh'
    };

    // Callbacks
    this.onSelect = config.onSelect || null;
    this.onUpload = config.onUpload || null;
    this.onValidate = config.onValidate || null;
    this.filterFiles = config.filterFiles || null;
    this.filterRecentResults = config.filterRecentResults || null;
    this.stateManager = config.stateManager || null;

    // External recent results (passed via config, not fetched from API)
    this.externalRecentResults = config.recentResults || null;

    // State
    this.selectedFile = null;
    this.availableFiles = [];
    this.recentResults = [];
    this.container = null;
    this.isLoading = false;
  }

  /**
   * Render the file selector HTML
   * @returns {string} HTML string
   */
  render() {
    return `
      <div class="file-selector-card" id="${this.id}" data-component="file-selector">
        <div class="file-selector-header">
          <h3>${this.icon} ${this.title}</h3>
        </div>

        <div class="file-selector-body">
          <!-- Dropdown Selection -->
          <div class="file-select-group">
            <label for="${this.id}-select">Select file:</label>
            <select id="${this.id}-select" class="file-dropdown">
              <option value="">-- Select a file --</option>
            </select>
          </div>

          <!-- Upload New File -->
          <div class="file-upload-group">
            <label>Or upload new:</label>
            <button class="btn-upload" id="${this.id}-upload-btn">
              <span class="btn-icon">+</span>
              Add ${this.title}
            </button>
            <input type="file" id="${this.id}-input" class="file-input-hidden" accept="${this.accept}">
          </div>

          <!-- File Preview/Info -->
          <div class="file-preview" id="${this.id}-preview" style="display: none;">
            <!-- Preview info will be populated here -->
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Initialize the component after rendering
   * @param {HTMLElement} [container] - Parent container
   */
  async init(container) {
    this.container = container || document.getElementById(this.id)?.parentElement;
    await this.loadAvailableFiles();
    this.setupEventListeners();
  }

  /**
   * Load available files from workspace
   */
  async loadAvailableFiles() {
    try {
      const response = await fetch('/api/workspace/files');
      const data = await response.json();

      if (data.success) {
        const allFiles = data.files || [];

        if (this.showRecentResults) {
          // Separate results from regular files using configurable categories
          this.recentResults = allFiles.filter(file => {
            const isAccepted = this.isAcceptedFile(file.name);
            return isAccepted && this.resultCategories.includes(file.category);
          });

          // Apply custom filter to recent results if provided
          if (this.filterRecentResults) {
            this.recentResults = this.filterRecentResults(this.recentResults);
          }

          // Regular files exclude result categories
          this.availableFiles = this.filterFilesByType(
            allFiles.filter(file => !this.resultCategories.includes(file.category))
          );
        } else {
          this.availableFiles = this.filterFilesByType(allFiles);
        }

        // Apply custom filter if provided
        if (this.filterFiles) {
          this.availableFiles = this.filterFiles(this.availableFiles);
        }

        this.populateDropdown();
      }
    } catch (error) {
      console.error(`[FileSelector] Error loading files for ${this.id}:`, error);
      this.populateDropdown();
    }
  }

  /**
   * Check if external recent results are provided
   * @returns {boolean}
   */
  hasExternalRecentResults() {
    return this.externalRecentResults && this.externalRecentResults.length > 0;
  }

  /**
   * Check if a filename is a TIFF file
   * @param {string} name - Filename
   * @returns {boolean}
   */
  isTiffFile(name) {
    if (!name) return false;
    const lower = name.toLowerCase();
    return lower.endsWith('.tif') || lower.endsWith('.tiff');
  }

  /**
   * Check if a filename matches the accepted file extensions
   * @param {string} name - Filename
   * @returns {boolean}
   */
  isAcceptedFile(name) {
    if (!name) return false;
    const lower = name.toLowerCase();
    const acceptedExtensions = this.accept.split(',').map(ext => ext.trim().toLowerCase());
    return acceptedExtensions.some(ext => lower.endsWith(ext));
  }

  /**
   * Filter files by type
   * @param {Array} files - Files to filter
   * @returns {Array}
   */
  filterFilesByType(files) {
    if (!files || !Array.isArray(files)) {
      return [];
    }

    return files.filter(file => {
      const isAccepted = this.isAcceptedFile(file.name);

      if (this.acceptAllTiff) {
        // Legacy: acceptAllTiff means accept any TIFF
        return this.isTiffFile(file.name);
      }

      // Match by category if fileType is specified
      if (this.fileType && file.category) {
        return isAccepted && file.category === this.fileType;
      }

      return isAccepted;
    });
  }

  /**
   * Populate dropdown with available files
   */
  populateDropdown() {
    const dropdown = document.getElementById(`${this.id}-select`);
    if (!dropdown) return;

    dropdown.innerHTML = '<option value="">-- Select a file --</option>';

    // Add test data option
    if (this.showTestData) {
      this.addTestDataOptions(dropdown);
    }

    // Add external recent results (passed via config from API, e.g., training results)
    if (this.hasExternalRecentResults()) {
      this.addExternalRecentResultsOptions(dropdown);
    }

    // Add recent results from workspace files
    if (this.showRecentResults) {
      this.addRecentResultsOptions(dropdown);
    }

    // Add workspace files
    if (this.availableFiles.length > 0) {
      const workspaceGroup = document.createElement('optgroup');
      workspaceGroup.label = 'Workspace Files';

      this.availableFiles.forEach(file => {
        const option = document.createElement('option');
        option.value = file.path;
        option.textContent = `${file.name} (${this.formatFileSize(file.size)})`;
        option.dataset.fileInfo = JSON.stringify(file);
        workspaceGroup.appendChild(option);
      });

      dropdown.appendChild(workspaceGroup);
    }

    // Add help text if no files, no test data, and no external results
    if (this.availableFiles.length === 0 && !this.showTestData && !this.hasExternalRecentResults()) {
      const helpOption = document.createElement('option');
      helpOption.value = '';
      helpOption.textContent = '📤 No files available - upload one above';
      helpOption.disabled = true;
      dropdown.appendChild(helpOption);
    }
  }

  /**
   * Add external recent results options to dropdown
   * These are results passed via config, typically from a dedicated API endpoint
   * @param {HTMLSelectElement} dropdown
   */
  addExternalRecentResultsOptions(dropdown) {
    const resultsGroup = document.createElement('optgroup');
    resultsGroup.label = 'Recent Training Results';

    this.externalRecentResults.forEach(result => {
      const option = document.createElement('option');
      option.value = result.value || result.path;
      option.textContent = result.label || result.name || 'Result';
      option.dataset.fileInfo = JSON.stringify(result);
      option.dataset.isExternalResult = 'true';
      if (result.trainingId) {
        option.dataset.trainingId = result.trainingId;
      }
      resultsGroup.appendChild(option);
    });

    dropdown.appendChild(resultsGroup);
  }

  /**
   * Add test data options to dropdown
   * @param {HTMLSelectElement} dropdown
   */
  addTestDataOptions(dropdown) {
    const testDataGroup = document.createElement('optgroup');
    testDataGroup.label = 'Test Data';

    // Use custom test data options if provided
    if (this.testDataOptions && this.testDataOptions.length > 0) {
      this.testDataOptions.forEach(opt => {
        const option = document.createElement('option');
        option.value = opt.value || 'test_data';
        option.textContent = opt.label;
        option.dataset.testData = 'true';
        if (opt.data) {
          option.dataset.testInfo = JSON.stringify(opt.data);
        }
        testDataGroup.appendChild(option);
      });
    } else {
      // Default test data based on fileType
      const defaults = {
        raw_images: 'Test Dataset - Training Images',
        annotations: 'Test Dataset - Annotations',
        inference_data: 'Test Dataset - Inference Images',
        image_stack: 'Test Dataset - Image Stack'
      };

      const label = defaults[this.fileType] || `Test Dataset - ${this.title}`;
      const option = document.createElement('option');
      option.value = 'test_data';
      option.textContent = label;
      option.dataset.testData = 'true';
      testDataGroup.appendChild(option);
    }

    dropdown.appendChild(testDataGroup);
  }

  /**
   * Add recent results options to dropdown
   * @param {HTMLSelectElement} dropdown
   */
  addRecentResultsOptions(dropdown) {
    const resultsGroup = document.createElement('optgroup');
    resultsGroup.label = 'Recent Results';

    if (this.recentResults.length > 0) {
      this.recentResults.forEach(result => {
        const option = document.createElement('option');
        option.value = result.path || result.id;

        // Use configurable category labels
        const categoryLabel = this.resultCategoryLabels[result.category] || 'Result';
        const displayName = result.name || `Result (${result.id})`;
        const sizeInfo = result.size ? ` (${this.formatFileSize(result.size)})` : '';

        option.textContent = `${categoryLabel}: ${displayName}${sizeInfo}`;
        option.dataset.fileInfo = JSON.stringify(result);
        option.dataset.isResult = 'true';
        resultsGroup.appendChild(option);
      });
    } else {
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = 'No recent results';
      placeholder.disabled = true;
      resultsGroup.appendChild(placeholder);
    }

    dropdown.appendChild(resultsGroup);
  }

  /**
   * Set up event listeners
   */
  setupEventListeners() {
    const dropdown = document.getElementById(`${this.id}-select`);
    if (dropdown) {
      dropdown.addEventListener('change', (e) => this.handleDropdownChange(e));
    }

    const uploadBtn = document.getElementById(`${this.id}-upload-btn`);
    const fileInput = document.getElementById(`${this.id}-input`);

    if (uploadBtn && fileInput) {
      uploadBtn.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', (e) => this.handleFileUpload(e));
    }
  }

  /**
   * Handle dropdown selection change
   * @param {Event} event
   */
  async handleDropdownChange(event) {
    const dropdown = event.target;
    const selectedOption = dropdown.options[dropdown.selectedIndex];

    if (!selectedOption.value) {
      this.hidePreview();
      this.selectedFile = null;
      // Call onSelect with null to notify of deselection
      if (this.onSelect) {
        this.onSelect(null);
      }
      return;
    }

    if (selectedOption.dataset.testData) {
      // Test data selected
      const testInfo = selectedOption.dataset.testInfo
        ? JSON.parse(selectedOption.dataset.testInfo)
        : {};

      this.selectedFile = {
        path: selectedOption.value,
        isTestData: true,
        name: selectedOption.textContent,
        ...testInfo
      };

      this.showPreview({
        name: selectedOption.textContent,
        info: 'Built-in test dataset for demonstration'
      });
    } else if (selectedOption.dataset.isExternalResult) {
      // External result (e.g., from training API)
      const fileInfo = JSON.parse(selectedOption.dataset.fileInfo || '{}');
      this.selectedFile = {
        path: fileInfo.value || fileInfo.path || selectedOption.value,
        name: fileInfo.label || selectedOption.textContent,
        isExternalResult: true,
        trainingId: fileInfo.trainingId || selectedOption.dataset.trainingId,
        ...fileInfo
      };

      this.showPreview({
        name: fileInfo.label || selectedOption.textContent,
        info: 'From previous training session'
      });
    } else {
      // Regular workspace file
      const fileInfo = JSON.parse(selectedOption.dataset.fileInfo || '{}');
      this.selectedFile = fileInfo;
      this.showPreview({
        name: fileInfo.name,
        size: this.formatFileSize(fileInfo.size),
        uploadDate: fileInfo.uploadDate ? new Date(fileInfo.uploadDate).toLocaleDateString() : null,
        info: fileInfo.metadata || 'TIFF image stack'
      });
    }

    // Call onSelect callback
    if (this.onSelect) {
      this.onSelect(this.selectedFile);
    }
  }

  /**
   * Handle file upload
   * @param {Event} event
   */
  async handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Validate file extension
    const acceptedExtensions = this.accept.split(',').map(ext => ext.trim().toLowerCase());
    const fileExt = '.' + file.name.split('.').pop().toLowerCase();
    if (!acceptedExtensions.includes(fileExt)) {
      this.notify('error', `Please select a valid file (${this.accept})`);
      return;
    }

    // Optional validation callback
    if (this.onValidate) {
      const isValid = await this.onValidate(file);
      if (!isValid) {
        event.target.value = '';
        return;
      }
    }

    try {
      this.showUploading();
      this.isLoading = true;

      // Upload file
      const uploadedFile = await this.uploadFile(file);

      // Add to available files
      this.availableFiles.push(uploadedFile);
      this.populateDropdown();

      // Auto-select the newly uploaded file
      const dropdown = document.getElementById(`${this.id}-select`);
      if (dropdown) {
        dropdown.value = uploadedFile.path;
      }

      this.selectedFile = uploadedFile;
      this.hideUploading();
      this.isLoading = false;

      this.showPreview({
        name: uploadedFile.name,
        size: this.formatFileSize(uploadedFile.size),
        info: 'Successfully uploaded'
      });

      // Call onUpload callback
      if (this.onUpload) {
        await this.onUpload(file, uploadedFile);
      }

      // Notify success
      this.notify('success', `File uploaded: ${file.name}`);

    } catch (error) {
      console.error(`[FileSelector] Upload error:`, error);

      let errorMessage = error.message;
      if (errorMessage.includes('403') || errorMessage.includes('approval')) {
        errorMessage = 'Account approval required. You can use test data while waiting.';
      }

      this.notify('error', `Upload failed: ${errorMessage}`);
      this.hideUploading();
      this.isLoading = false;

      // Reset file input
      event.target.value = '';
    }
  }

  /**
   * Upload file to workspace
   * @param {File} file
   * @returns {Promise<Object>}
   */
  async uploadFile(file) {
    const formData = new FormData();
    formData.append(this.fileType, file);
    formData.append('category', this.fileType);

    const response = await fetch(this.uploadEndpoint, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Upload failed');
    }

    const result = await response.json();
    return result.file;
  }

  /**
   * Show notification via StateManager or console
   * @param {string} type
   * @param {string} message
   */
  notify(type, message) {
    if (this.stateManager && typeof this.stateManager.notify === 'function') {
      this.stateManager.notify(type, message);
    } else {
      console.log(`[FileSelector] ${type}: ${message}`);
    }
  }

  /**
   * Show file preview
   * @param {Object} data
   */
  showPreview(data) {
    const preview = document.getElementById(`${this.id}-preview`);
    if (!preview) return;

    preview.innerHTML = `
      <div class="preview-item">
        <strong>📄 ${data.name}</strong>
      </div>
      ${data.size ? `<div class="preview-item">Size: ${data.size}</div>` : ''}
      ${data.uploadDate ? `<div class="preview-item">Uploaded: ${data.uploadDate}</div>` : ''}
      ${data.info ? `<div class="preview-item">ℹ️ ${data.info}</div>` : ''}
    `;

    preview.style.display = 'block';
  }

  /**
   * Hide file preview
   */
  hidePreview() {
    const preview = document.getElementById(`${this.id}-preview`);
    if (preview) {
      preview.style.display = 'none';
    }
  }

  /**
   * Show uploading state
   */
  showUploading() {
    const preview = document.getElementById(`${this.id}-preview`);
    if (preview) {
      preview.innerHTML = `
        <div class="preview-item uploading">
          <span class="spinner-small"></span>
          Uploading file...
        </div>
      `;
      preview.style.display = 'block';
    }
  }

  /**
   * Hide uploading state
   */
  hideUploading() {
    this.hidePreview();
  }

  /**
   * Format file size
   * @param {number} bytes
   * @returns {string}
   */
  formatFileSize(bytes) {
    if (!bytes) return 'Unknown';
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  }

  /**
   * Get selected file
   * @returns {Object|null}
   */
  getSelectedFile() {
    return this.selectedFile;
  }

  /**
   * Set selected file programmatically
   * @param {Object} fileInfo
   */
  setSelectedFile(fileInfo) {
    if (!fileInfo) {
      this.clearSelection();
      return;
    }

    this.selectedFile = fileInfo;
    const dropdown = document.getElementById(`${this.id}-select`);

    if (fileInfo.isTestData) {
      if (dropdown) {
        dropdown.value = fileInfo.path || 'test_data';
      }
      this.showPreview({
        name: fileInfo.name || 'Test Dataset',
        info: 'Built-in test dataset for demonstration'
      });
    } else {
      if (dropdown && fileInfo.path) {
        dropdown.value = fileInfo.path;
      }
      this.showPreview({
        name: fileInfo.name || 'Selected File',
        size: fileInfo.size ? this.formatFileSize(fileInfo.size) : null,
        info: fileInfo.metadata || null
      });
    }
  }

  /**
   * Clear selection
   */
  clearSelection() {
    const dropdown = document.getElementById(`${this.id}-select`);
    if (dropdown) {
      dropdown.value = '';
    }
    this.selectedFile = null;
    this.hidePreview();
  }

  /**
   * Refresh file list
   */
  async refresh() {
    await this.loadAvailableFiles();
  }

  /**
   * Subscribe to state changes for auto-refresh
   * @param {Object} stateManager
   * @param {string} [path='workspace.files']
   */
  subscribeToFileChanges(stateManager, path = 'workspace.files') {
    if (stateManager && typeof stateManager.subscribe === 'function') {
      stateManager.subscribe(path, () => {
        console.log(`[FileSelector] Files changed, refreshing ${this.id}`);
        this.refresh();
      });
    }
  }

  /**
   * Enable or disable the component
   * @param {boolean} enabled
   */
  setEnabled(enabled) {
    const dropdown = document.getElementById(`${this.id}-select`);
    const uploadBtn = document.getElementById(`${this.id}-upload-btn`);
    const fileInput = document.getElementById(`${this.id}-input`);

    if (dropdown) dropdown.disabled = !enabled;
    if (uploadBtn) uploadBtn.disabled = !enabled;
    if (fileInput) fileInput.disabled = !enabled;
  }
}

// Export for ES6 modules
export default FileSelector;

// Also make available globally
if (typeof window !== 'undefined') {
  window.FileSelector = FileSelector;
}
