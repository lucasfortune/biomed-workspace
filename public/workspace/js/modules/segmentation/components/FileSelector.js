/**
 * FileSelector Component
 * Modern dropdown-based file selector with upload capability
 *
 * Configuration options:
 * - showTestData: boolean (default: true) - Show test data optgroup
 * - showRecentResults: boolean (default: false) - Show recent results optgroup
 * - acceptAllTiff: boolean (default: false) - Accept any TIFF file regardless of category
 */
class FileSelector {
  constructor(type, title, icon, moduleInstance, config = {}) {
    this.type = type; // 'raw_images', 'annotations', 'inference_data', 'image_stack'
    this.title = title; // Display title
    this.icon = icon; // Emoji icon
    this.module = moduleInstance;
    this.selectedFile = null;
    this.availableFiles = [];
    this.recentResults = []; // For recent results optgroup
    this.containerId = `file-selector-${type}`;

    // Configuration options
    this.config = {
      showTestData: config.showTestData !== false, // Default: true
      showRecentResults: config.showRecentResults === true, // Default: false
      acceptAllTiff: config.acceptAllTiff === true // Default: false
    };
  }

  /**
   * Render the file selector HTML
   */
  render() {
    return `
      <div class="file-selector-card" id="${this.containerId}">
        <div class="file-selector-header">
          <h3>${this.icon} ${this.title}</h3>
        </div>

        <div class="file-selector-body">
          <!-- Dropdown Selection -->
          <div class="file-select-group">
            <label for="${this.type}Select">Select file:</label>
            <select id="${this.type}Select" class="file-dropdown">
              <option value="">-- Select a file --</option>
            </select>
          </div>

          <!-- Upload New File -->
          <div class="file-upload-group">
            <label>Or upload new:</label>
            <button class="btn-upload" id="${this.type}UploadBtn">
              <span class="btn-icon">+</span>
              Add ${this.title}
            </button>
            <input type="file" id="${this.type}Input" class="file-input-hidden" accept=".tif,.tiff">
          </div>

          <!-- File Preview/Info -->
          <div class="file-preview" id="${this.type}Preview" style="display: none;">
            <!-- Preview info will be populated here -->
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Initialize the component after rendering
   */
  async init() {
    await this.loadAvailableFiles();
    this.setupEventListeners();

    // Subscribe to workspace file changes to auto-refresh dropdown
    if (this.module && this.module.state) {
      this.module.state.subscribe('workspace.files', () => {
        console.log(`[FileSelector] Files changed, reloading ${this.type} files`);
        this.loadAvailableFiles();
      });
    }
  }

  /**
   * Load available files from workspace
   */
  async loadAvailableFiles() {
    try {
      const response = await fetch('/api/workspace/files');
      const data = await response.json();

      if (data.success) {
        // Categories that are considered "results" (from processing modules)
        const resultCategories = ['segmentations', 'denoised', 'processed'];

        // If showRecentResults is enabled, separate results from regular files
        if (this.config.showRecentResults) {
          const allFiles = data.files || [];

          // Filter TIFF files into results and regular files
          this.recentResults = allFiles.filter(file => {
            const isTiff = file.name?.toLowerCase().endsWith('.tif') || file.name?.toLowerCase().endsWith('.tiff');
            return isTiff && resultCategories.includes(file.category);
          });

          // Regular files exclude result categories
          this.availableFiles = this.filterFilesByType(
            allFiles.filter(file => !resultCategories.includes(file.category))
          );
        } else {
          // Standard behavior - filter files by type
          this.availableFiles = this.filterFilesByType(data.files);
        }

        this.populateDropdown();
      }
    } catch (error) {
      console.error(`[FileSelector] Error loading files for ${this.type}:`, error);
      // Still populate with test data option
      this.populateDropdown();
    }
  }

  /**
   * Filter files by type
   */
  filterFilesByType(files) {
    if (!files || !Array.isArray(files)) {
      return [];
    }

    // Filter based on type and file extension
    return files.filter(file => {
      const isTiff = file.name.toLowerCase().endsWith('.tif') || file.name.toLowerCase().endsWith('.tiff');

      // If acceptAllTiff is enabled, accept any TIFF file
      if (this.config.acceptAllTiff) {
        return isTiff;
      }

      if (this.type === 'raw_images') {
        return isTiff && file.category === 'raw_images';
      } else if (this.type === 'annotations') {
        return isTiff && file.category === 'annotations';
      } else if (this.type === 'inference_data') {
        return isTiff && file.category === 'inference_data';
      } else if (this.type === 'image_stack') {
        // For image_stack type, accept any TIFF file
        return isTiff;
      }

      return false;
    });
  }

  /**
   * Populate dropdown with available files
   */
  populateDropdown() {
    const dropdown = document.getElementById(`${this.type}Select`);

    if (!dropdown) {
      // Dropdown not found - this is expected when the module is not active
      // (e.g., user navigated away but subscription is still listening)
      return;
    }

    // Clear existing options (except the first placeholder)
    dropdown.innerHTML = '<option value="">-- Select a file --</option>';

    // Add test data option (if configured)
    if (this.config.showTestData) {
      this.addTestDataOption(dropdown);
    }

    // Add recent results optgroup (if configured)
    if (this.config.showRecentResults) {
      this.addRecentResultsOption(dropdown);
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

    // Add help text if no files and no test data
    if (this.availableFiles.length === 0 && !this.config.showTestData) {
      const helpOption = document.createElement('option');
      helpOption.value = '';
      helpOption.textContent = '📤 No files available - upload one above';
      helpOption.disabled = true;
      dropdown.appendChild(helpOption);
    }
  }

  /**
   * Add test data option to dropdown
   */
  addTestDataOption(dropdown) {
    const testDataGroup = document.createElement('optgroup');
    testDataGroup.label = 'Test Data';

    if (this.type === 'raw_images') {
      const option = document.createElement('option');
      option.value = 'test_data';
      option.textContent = 'Test Dataset - Training Images';
      option.dataset.testData = 'true';
      testDataGroup.appendChild(option);
    } else if (this.type === 'annotations') {
      const option = document.createElement('option');
      option.value = 'test_data';
      option.textContent = 'Test Dataset - Annotations';
      option.dataset.testData = 'true';
      testDataGroup.appendChild(option);
    } else if (this.type === 'inference_data') {
      const option = document.createElement('option');
      option.value = 'test_data';
      option.textContent = 'Test Dataset - Inference Images';
      option.dataset.testData = 'true';
      testDataGroup.appendChild(option);
    }

    dropdown.appendChild(testDataGroup);
  }

  /**
   * Add recent results optgroup to dropdown
   * Shows results from segmentation, denoising, etc.
   */
  addRecentResultsOption(dropdown) {
    const resultsGroup = document.createElement('optgroup');
    resultsGroup.label = 'Recent Results';

    if (this.recentResults.length > 0) {
      this.recentResults.forEach(result => {
        const option = document.createElement('option');
        option.value = result.path || result.id;

        // Format display name based on category
        let displayName = result.name || `Result (${result.id})`;
        const categoryLabels = {
          'segmentations': 'Segmentation',
          'denoised': 'Denoised',
          'processed': 'Processed'
        };
        const categoryLabel = categoryLabels[result.category] || 'Result';

        // Add size info if available
        const sizeInfo = result.size ? ` (${this.formatFileSize(result.size)})` : '';
        option.textContent = `${categoryLabel}: ${displayName}${sizeInfo}`;

        option.dataset.fileInfo = JSON.stringify(result);
        option.dataset.isResult = 'true';
        resultsGroup.appendChild(option);
      });
    } else {
      // Placeholder when no results available
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
    // Dropdown change
    const dropdown = document.getElementById(`${this.type}Select`);
    if (dropdown) {
      dropdown.addEventListener('change', (e) => this.handleDropdownChange(e));
    }

    // Upload button
    const uploadBtn = document.getElementById(`${this.type}UploadBtn`);
    const fileInput = document.getElementById(`${this.type}Input`);

    if (uploadBtn && fileInput) {
      uploadBtn.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', (e) => this.handleFileUpload(e));
    }
  }

  /**
   * Handle dropdown selection change
   */
  async handleDropdownChange(event) {
    const dropdown = event.target;
    const selectedOption = dropdown.options[dropdown.selectedIndex];

    if (!selectedOption.value) {
      this.hidePreview();
      this.selectedFile = null;
      return;
    }

    // Check if test data
    if (selectedOption.dataset.testData) {
      this.selectedFile = {
        path: 'test_data',
        isTestData: true,
        name: selectedOption.textContent
      };
      this.showPreview({
        name: selectedOption.textContent,
        info: 'Built-in test dataset for demonstration'
      });
    } else {
      // Regular workspace file - trigger validation
      const fileInfo = JSON.parse(selectedOption.dataset.fileInfo || '{}');
      this.selectedFile = fileInfo;
      await this.loadFilePreview(fileInfo);

      // Trigger validation for workspace files (similar to uploaded files)
      if (this.module && typeof this.module.onFileUploaded === 'function') {
        // Create a mock File object for validation
        const mockFile = new File([], fileInfo.name, { type: 'image/tiff' });
        await this.module.onFileUploaded(this.type, mockFile, fileInfo);
      }
    }

    // Notify module that file was selected
    if (this.module && typeof this.module.onFileSelected === 'function') {
      this.module.onFileSelected(this.type, this.selectedFile);
    }
  }

  /**
   * Handle file upload
   */
  async handleFileUpload(event) {
    const file = event.target.files[0];

    if (!file) return;

    // Validate file type
    if (!file.name.toLowerCase().endsWith('.tif') && !file.name.toLowerCase().endsWith('.tiff')) {
      alert('Please select a TIFF file (.tif or .tiff)');
      return;
    }

    try {
      // Show uploading state
      this.showUploading();

      // Upload file to workspace
      const uploadedFile = await this.uploadFileToWorkspace(file);

      // Notify module that file was uploaded (for validation)
      let validationTriggered = false;
      if (this.module && typeof this.module.onFileUploaded === 'function') {
        validationTriggered = await this.module.onFileUploaded(this.type, file, uploadedFile);
      }

      // Add to available files
      this.availableFiles.push(uploadedFile);

      // Refresh dropdown
      this.populateDropdown();

      // Auto-select the newly uploaded file
      const dropdown = document.getElementById(`${this.type}Select`);
      if (dropdown) {
        dropdown.value = uploadedFile.path;
        // Don't trigger change event here - onFileUploaded already handled validation
      }

      // Hide uploading state ONLY if validation was NOT triggered
      // If validation was triggered, the module will update the UI (including preview)
      if (!validationTriggered) {
        this.hideUploading();
      }

      // Refresh file browser to show newly uploaded file
      if (window.workspace && window.workspace.fileBrowser) {
        await window.workspace.fileBrowser.refresh();
      }

    } catch (error) {
      console.error(`[FileSelector] Upload error:`, error);

      // Parse error for user-friendly message
      let errorMessage = error.message;
      if (errorMessage.includes('403') || errorMessage.includes('approval')) {
        errorMessage = 'Account approval required. You can use test data while waiting.';
      }

      this.module.state.notify('error', `Upload failed: ${errorMessage}`);
      this.hideUploading();

      // Reset file input to allow re-selection
      const fileInput = document.getElementById(`${this.type}Input`);
      if (fileInput) {
        fileInput.value = '';
      }
    }
  }

  /**
   * Upload file to workspace
   */
  async uploadFileToWorkspace(file) {
    const formData = new FormData();
    // Use type as field name so multer routes to correct directory
    // This ensures annotations go to /annotations, raw_images to /raw, etc.
    formData.append(this.type, file);
    formData.append('category', this.type); // Auto-categorize

    const response = await fetch('/api/workspace/upload', {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Upload failed');
    }

    const result = await response.json();
    // Backend returns { success: true, file: {...}, message: '...' }
    // Extract and return just the file info
    return result.file;
  }

  /**
   * Load and display file preview
   */
  async loadFilePreview(fileInfo) {
    this.showPreview({
      name: fileInfo.name,
      size: this.formatFileSize(fileInfo.size),
      uploadDate: fileInfo.uploadDate ? new Date(fileInfo.uploadDate).toLocaleDateString() : 'Unknown',
      info: fileInfo.metadata || 'TIFF image stack'
    });
  }

  /**
   * Show file preview
   */
  showPreview(data) {
    const preview = document.getElementById(`${this.type}Preview`);
    if (!preview) return;

    preview.innerHTML = `
      <div class="preview-item">
        <strong>📄 ${data.name}</strong>
      </div>
      ${data.size ? `<div class="preview-item">Size: ${data.size}</div>` : ''}
      ${data.info ? `<div class="preview-item">ℹ️ ${data.info}</div>` : ''}
    `;

    preview.style.display = 'block';
  }

  /**
   * Hide file preview
   */
  hidePreview() {
    const preview = document.getElementById(`${this.type}Preview`);
    if (preview) {
      preview.style.display = 'none';
    }
  }

  /**
   * Show uploading state
   */
  showUploading() {
    const preview = document.getElementById(`${this.type}Preview`);
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
   */
  formatFileSize(bytes) {
    if (!bytes) return 'Unknown';

    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  }

  /**
   * Get selected file
   */
  getSelectedFile() {
    return this.selectedFile;
  }

  /**
   * Set selected file (for restoring state)
   */
  setSelectedFile(fileInfo) {
    if (!fileInfo) {
      this.clearSelection();
      return;
    }

    this.selectedFile = fileInfo;

    // Update dropdown if it's test data
    if (fileInfo.isTestData) {
      const dropdown = document.getElementById(`${this.type}Select`);
      if (dropdown) {
        dropdown.value = 'test_data';
      }

      this.showPreview({
        name: fileInfo.name || 'Test Dataset',
        info: 'Built-in test dataset for demonstration'
      });
    } else {
      // Custom upload - just show preview
      this.showPreview({
        name: fileInfo.name || 'Uploaded File',
        info: 'Custom upload - previously validated'
      });
    }
  }

  /**
   * Clear selection
   */
  clearSelection() {
    const dropdown = document.getElementById(`${this.type}Select`);
    if (dropdown) {
      dropdown.value = '';
    }
    this.selectedFile = null;
    this.hidePreview();
  }
}

// Make available globally
if (typeof window !== 'undefined') {
  window.FileSelector = FileSelector;
}
