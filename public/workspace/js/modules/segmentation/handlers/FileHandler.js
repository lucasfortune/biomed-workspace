/**
 * FileHandler.js - File Selection and Validation for Segmentation Module
 *
 * Handles file selection, upload, validation, and test data loading.
 * Extracted from SegmentationModule.js for better maintainability.
 */

import { FileSelector, ValidationDisplay } from '/workspace/js/core/components/index.js';
import Templates from '../templates/Templates.js';

class FileHandler {
  /**
   * @param {SegmentationModule} module - Reference to the parent module
   */
  constructor(module) {
    this.module = module;
    this.validationDisplay = null;
  }

  /**
   * Set up event listeners for direction-aware UI controls
   */
  setupDirectionListeners() {
    // Prevent clicks on the mode toggle from toggling the workflow header
    const toggleSection = document.getElementById('segModeToggleSection');
    if (toggleSection) {
      toggleSection.addEventListener('click', (e) => e.stopPropagation());
    }

    // Filament checkbox toggle
    const filamentCheckbox = document.getElementById('useFilamentAnnotations');
    if (filamentCheckbox) {
      filamentCheckbox.onchange = () => {
        const checked = filamentCheckbox.checked;
        const toggleSection = document.getElementById('segModeToggleSection');
        const modeToggle = document.getElementById('seg-mode-toggle');

        if (checked && this.module.directionVolumePath) {
          // Lock to 2.5D, disable toggle
          this.module.useFilamentAnnotations = true;
          this.module.selectedMode = '2.5d';
          if (modeToggle) modeToggle.checked = true;
          if (toggleSection) toggleSection.classList.add('disabled');
          this._updateModeLabels('2.5d');
        } else {
          // Enable toggle, default to 2D
          this.module.useFilamentAnnotations = false;
          this.module.directionVolumePath = null;
          this.module.selectedMode = '2d';
          if (modeToggle) modeToggle.checked = false;
          if (toggleSection) toggleSection.classList.remove('disabled');
          this._updateModeLabels('2d');

          // If re-checked, restore direction volume path
          if (checked && this._savedDirectionVolumePath) {
            this.module.directionVolumePath = this._savedDirectionVolumePath;
          }
        }

      };
    }

    // Mode toggle (2D / 2.5D)
    const modeToggle = document.getElementById('seg-mode-toggle');
    if (modeToggle) {
      modeToggle.onchange = () => {
        const toggleSection = document.getElementById('segModeToggleSection');
        if (toggleSection && toggleSection.classList.contains('disabled')) {
          return; // Ignore when disabled
        }
        this.module.selectedMode = modeToggle.checked ? '2.5d' : '2d';
        this._updateModeLabels(this.module.selectedMode);

      };
    }
  }

  /**
   * Update mode toggle label active states
   * @param {string} mode - '2d' or '2.5d'
   */
  _updateModeLabels(mode) {
    const section = document.getElementById('segModeToggleSection');
    if (!section) return;
    const leftLabel = section.querySelector('.mode-label-left');
    const rightLabel = section.querySelector('.mode-label-right');
    if (leftLabel && rightLabel) {
      leftLabel.classList.toggle('active', mode === '2d');
      rightLabel.classList.toggle('active', mode === '2.5d');
    }
  }

  /**
   * Check for direction volume associated with selected annotation
   * @param {Object} annotationFileInfo - The selected annotation file info
   */
  async checkForDirectionVolume(annotationFileInfo) {
    const dirAwareSection = document.getElementById('directionAwareSection');
    const toggleSection = document.getElementById('segModeToggleSection');
    const modeToggle = document.getElementById('seg-mode-toggle');
    const dirVolumeInfo = document.getElementById('directionVolumeInfo');

    // Clear direction state if no annotation or test data
    if (!annotationFileInfo || annotationFileInfo.isTestData) {
      if (dirAwareSection) dirAwareSection.style.display = 'none';
      if (toggleSection) toggleSection.classList.remove('disabled');
      this.module.directionVolumePath = null;
      this.module.useFilamentAnnotations = false;
      this._savedDirectionVolumePath = null;
      return;
    }

    try {
      // Fetch workspace files to find direction volume sidecar
      const response = await fetch('/api/workspace/files');
      const data = await response.json();

      if (!data.success || !data.files) return;

      // Search for direction volume linked to this annotation
      const annotationId = annotationFileInfo.id;
      const dirVolume = data.files.find(f =>
        f.parentId === annotationId && f.tags && f.tags.includes('direction_volume')
      );

      if (dirVolume) {
        // Found direction volume
        this._savedDirectionVolumePath = dirVolume.path;
        this.module.directionVolumePath = dirVolume.path;
        this.module.useFilamentAnnotations = true;
        this.module.selectedMode = '2.5d';

        // Show filament section
        if (dirAwareSection) dirAwareSection.style.display = 'block';
        if (dirVolumeInfo) dirVolumeInfo.textContent = `Direction volume: ${dirVolume.name || dirVolume.path.split('/').pop()}`;

        // Set checkbox to checked
        const filamentCheckbox = document.getElementById('useFilamentAnnotations');
        if (filamentCheckbox) filamentCheckbox.checked = true;

        // Lock mode toggle to 2.5D
        if (modeToggle) modeToggle.checked = true;
        if (toggleSection) toggleSection.classList.add('disabled');
        this._updateModeLabels('2.5d');

        console.log('[FileHandler] Direction volume found:', dirVolume.path);
      } else {
        // No direction volume found
        if (dirAwareSection) dirAwareSection.style.display = 'none';
        if (toggleSection) toggleSection.classList.remove('disabled');
        this.module.directionVolumePath = null;
        this.module.useFilamentAnnotations = false;
        this._savedDirectionVolumePath = null;
      }
    } catch (error) {
      console.error('[FileHandler] Error checking for direction volume:', error);
      // On error, just leave direction UI hidden
      if (dirAwareSection) dirAwareSection.style.display = 'none';
      if (toggleSection) toggleSection.classList.remove('disabled');
    }
  }

  /**
   * Initialize FileSelector components
   */
  async initializeFileSelectors() {
    console.log('[FileHandler] Initializing FileSelectors...');

    // Create FileSelector instances with core component API
    // New metadata system: uploads category with raw/annotation tags
    this.module.rawImageSelector = new FileSelector({
      id: 'raw_images',
      fileType: 'uploads',
      filterTags: ['raw'],
      title: 'Raw Images',
      icon: '📁',
      helpIconHtml: Templates.renderHelpIcon('segmentation.step1.raw-images'),
      showTestData: true,
      stateManager: this.module.state,
      onSelect: (fileInfo) => this.onFileSelected('raw_images', fileInfo),
      onUpload: (file, uploadedInfo) => this.onFileUploaded('raw_images', file, uploadedInfo)
    });

    this.module.annotationsSelector = new FileSelector({
      id: 'annotations',
      fileType: 'uploads',
      filterTags: ['annotation'],
      title: 'Annotations',
      icon: '🏷️',
      helpIconHtml: Templates.renderHelpIcon('segmentation.step1.annotations'),
      showTestData: true,
      stateManager: this.module.state,
      onSelect: (fileInfo) => this.onFileSelected('annotations', fileInfo),
      onUpload: (file, uploadedInfo) => this.onFileUploaded('annotations', file, uploadedInfo)
    });

    this.module.inferenceSelector = new FileSelector({
      id: 'inference_data',
      fileType: 'uploads',
      filterTags: ['raw'],
      title: 'Inference Data',
      icon: '📁',
      helpIconHtml: Templates.renderHelpIcon('segmentation.step4.inference-data'),
      showTestData: true,
      showRecentResults: true,
      resultTags: ['denoising', 'data'],
      stateManager: this.module.state,
      onSelect: (fileInfo) => this.onFileSelected('inference_data', fileInfo),
      onUpload: (file, uploadedInfo) => this.onFileUploaded('inference_data', file, uploadedInfo)
    });

    // Insert into containers
    const rawContainer = document.getElementById('rawImagesSelectorContainer');
    const annotationsContainer = document.getElementById('annotationsSelectorContainer');
    const inferenceContainer = document.getElementById('inferenceSelectorContainer');

    if (rawContainer) {
      rawContainer.innerHTML = this.module.rawImageSelector.render();
      await this.module.rawImageSelector.init();
    }

    if (annotationsContainer) {
      annotationsContainer.innerHTML = this.module.annotationsSelector.render();
      await this.module.annotationsSelector.init();
    }

    if (inferenceContainer) {
      inferenceContainer.innerHTML = this.module.inferenceSelector.render();
      await this.module.inferenceSelector.init();
    }

    console.log('[FileHandler] FileSelectors initialized');
  }

  /**
   * Called when a file is selected in FileSelector
   * @param {string} type - File type (raw_images, annotations, inference_data)
   * @param {Object} fileInfo - Selected file info
   */
  async onFileSelected(type, fileInfo) {
    console.log(`[FileHandler] File selected for ${type}:`, fileInfo);

    // Update uploadedFiles
    this.module.uploadedFiles[type] = fileInfo;

    // Check for direction volume when annotations are selected
    if (type === 'annotations') {
      await this.checkForDirectionVolume(fileInfo);
    }

    // Handle based on file type
    if (type === 'raw_images' || type === 'annotations') {
      // Check if both are test data
      const bothTestData =
        this.module.uploadedFiles.raw_images?.isTestData &&
        this.module.uploadedFiles.annotations?.isTestData;

      if (bothTestData) {
        await this.loadTestData();
      } else if (this.module.uploadedFiles.raw_images && this.module.uploadedFiles.annotations) {
        await this.validateUploadedFiles();
      }
    } else if (type === 'inference_data') {
      if (fileInfo.isTestData) {
        await this.loadTestInferenceData();
      } else if (fileInfo) {
        const runInferenceBtn = document.getElementById('runInferenceBtn');
        if (runInferenceBtn) {
          runInferenceBtn.disabled = false;
        }

      }
    }
  }

  /**
   * Called when a file is uploaded via FileSelector
   * @param {string} type - File type
   * @param {File} file - The uploaded file
   * @param {Object} uploadedFileInfo - Upload result info
   * @returns {Promise<boolean>} - Returns true if validation was triggered
   */
  async onFileUploaded(type, file, uploadedFileInfo) {
    console.log(`[FileHandler] File uploaded for ${type}:`, {
      fileName: file.name,
      fileSize: file.size,
      uploadedPath: uploadedFileInfo.path,
      category: uploadedFileInfo.category
    });

    // Store the actual File object for validation
    if (!this.module.pendingFiles) {
      this.module.pendingFiles = {};
    }
    this.module.pendingFiles[type] = file;

    // Store the uploaded file info (contains path from server)
    if (!this.module.uploadedFiles) {
      this.module.uploadedFiles = {};
    }
    this.module.uploadedFiles[type] = uploadedFileInfo;

    // Refresh workspace file browser to show uploaded file
    if (window.workspace?.fileBrowser) {
      window.workspace.fileBrowser.refresh();
    }

    // If both training files uploaded, validate them together
    if (type === 'raw_images' || type === 'annotations') {
      const hasBoth = this.module.pendingFiles.raw_images && this.module.pendingFiles.annotations;

      if (hasBoth) {
        await this.validateUploadedFiles();
        return true;
      }
    } else if (type === 'inference_data') {
      await this.validateInferenceFile(file);
      return true;
    }

    return false;
  }

  /**
   * Load test data (when both dropdowns select test data)
   */
  async loadTestData() {
    console.log('[FileHandler] Loading test data...');

    try {
      this.module.state.update('ui.loading', true);

      const formData = new FormData();
      formData.append('isTestData', 'true');

      const response = await fetch('/upload-data', {
        method: 'POST',
        body: formData
      });

      const result = await response.json();

      if (result.success) {
        this.module.uploadedFiles.raw_images = { path: result.raw_images_path, isTestData: true };
        this.module.uploadedFiles.annotations = { path: result.annotations_path, isTestData: true };

        this.displayValidationResults(result.validation);

        this.module.filesValidated = true;
        this.module.updateStep1NextButton();


        if (window.workspace?.fileBrowser) {
          window.workspace.fileBrowser.refresh();
        }

        this.module.state.notify('success', 'Test data loaded and validated successfully');
      } else {
        throw new Error(result.error || 'Failed to load test data');
      }
    } catch (error) {
      console.error('[FileHandler] Test data loading error:', error);
      this.module.state.notify('error', `Failed to load test data: ${error.message}`);
    } finally {
      this.module.state.update('ui.loading', false);
    }
  }

  /**
   * Validate uploaded custom files
   */
  async validateUploadedFiles() {
    console.log('[FileHandler] Validating uploaded files...');

    try {
      this.module.state.update('ui.loading', true);

      const formData = new FormData();
      formData.append('skipUpload', 'true');
      formData.append('raw_images_path', this.module.uploadedFiles.raw_images?.path || '');
      formData.append('annotations_path', this.module.uploadedFiles.annotations?.path || '');

      const response = await fetch('/upload-data', {
        method: 'POST',
        body: formData
      });

      const result = await response.json();

      if (result.success) {
        this.module.uploadedFiles.raw_images = {
          path: result.raw_images_path,
          name: this.module.pendingFiles?.raw_images?.name || this.module.uploadedFiles.raw_images?.name || 'Raw Images'
        };
        this.module.uploadedFiles.annotations = {
          path: result.annotations_path,
          name: this.module.pendingFiles?.annotations?.name || this.module.uploadedFiles.annotations?.name || 'Annotations'
        };

        this.displayValidationResults(result.validation);

        this.module.filesValidated = true;
        this.module.updateStep1NextButton();

        if (this.module.rawImageSelector && this.module.uploadedFiles.raw_images) {
          this.module.rawImageSelector.setSelectedFile(this.module.uploadedFiles.raw_images);
        }
        if (this.module.annotationsSelector && this.module.uploadedFiles.annotations) {
          this.module.annotationsSelector.setSelectedFile(this.module.uploadedFiles.annotations);
        }

        this.module.pendingFiles = {};


        this.module.state.notify('success', 'Files validated successfully');
      } else {
        throw new Error(result.error || 'Validation failed');
      }
    } catch (error) {
      console.error('[FileHandler] Validation error:', error);
      this.module.state.notify('error', `Validation failed: ${error.message}`);
      this.displayValidationError(error.message);
    } finally {
      this.module.state.update('ui.loading', false);
    }
  }

  /**
   * Load test inference data
   */
  async loadTestInferenceData() {
    console.log('[FileHandler] Loading test inference data...');

    try {
      this.module.state.update('ui.loading', true);

      const formData = new FormData();
      formData.append('isTestData', 'true');

      const response = await fetch('/upload-inference', {
        method: 'POST',
        body: formData
      });

      const result = await response.json();

      if (result.success) {
        const dataPath = result.inference_data_path || result.file_path;
        this.module.uploadedFiles.inference_data = {
          path: dataPath,
          isTestData: true,
          id: result.file_id || null
        };

        const runInferenceBtn = document.getElementById('runInferenceBtn');
        if (runInferenceBtn) {
          runInferenceBtn.disabled = false;
        }


        this.module.state.notify('success', 'Test inference data loaded successfully');
      } else {
        throw new Error(result.error || 'Failed to load test inference data');
      }
    } catch (error) {
      console.error('[FileHandler] Test inference loading error:', error);
      this.module.state.notify('error', `Failed to load test inference data: ${error.message}`);
    } finally {
      this.module.state.update('ui.loading', false);
    }
  }

  /**
   * Validate inference file
   * @param {File} file - The inference file to validate
   */
  async validateInferenceFile(file) {
    console.log('[FileHandler] Validating inference file...');

    try {
      this.module.state.update('ui.loading', true);

      const formData = new FormData();
      formData.append('skipUpload', 'true');
      formData.append('inference_data_path', this.module.uploadedFiles.inference_data?.path || '');

      const response = await fetch('/upload-inference', {
        method: 'POST',
        body: formData
      });

      const result = await response.json();

      if (result.success) {
        this.module.uploadedFiles.inference_data = {
          path: result.inference_data_path,
          name: file?.name || 'Inference Data',
          id: result.file_id || null
        };

        const runInferenceBtn = document.getElementById('runInferenceBtn');
        if (runInferenceBtn) {
          runInferenceBtn.disabled = false;
        }

        if (this.module.inferenceSelector && this.module.uploadedFiles.inference_data) {
          this.module.inferenceSelector.setSelectedFile(this.module.uploadedFiles.inference_data);
        }


        this.module.state.notify('success', 'Inference file validated successfully');
      } else {
        throw new Error(result.error || 'Validation failed');
      }
    } catch (error) {
      console.error('[FileHandler] Inference validation error:', error);
      this.module.state.notify('error', `Inference validation failed: ${error.message}`);
    } finally {
      this.module.state.update('ui.loading', false);
    }
  }

  /**
   * Display validation results using ValidationDisplay component
   * @param {Object} validation - Validation result object
   */
  displayValidationResults(validation) {
    if (!this.validationDisplay) {
      this.validationDisplay = new ValidationDisplay('validationResult');
    }

    if (validation && validation.success !== false) {
      const details = [];
      if (validation.raw_dims) {
        details.push({ label: 'Raw Images', value: `${validation.raw_dims} (${validation.raw_slices} slices)` });
      }
      if (validation.ann_dims) {
        details.push({ label: 'Annotations', value: `${validation.ann_dims} (${validation.ann_slices} slices)` });
      }
      if (validation.classes) {
        details.push({ label: 'Classes detected', value: validation.classes.join(', ') });
      }

      this.validationDisplay.showSuccess('Validation Successful', details);

      if (validation.warnings) {
        const container = this.validationDisplay.getContainer();
        if (container) {
          const warningDiv = document.createElement('p');
          warningDiv.className = 'warning';
          warningDiv.innerHTML = `⚠️ ${validation.warnings}`;
          container.querySelector('.validation-success')?.appendChild(warningDiv);
        }
      }
    } else {
      this.validationDisplay.showError('Validation Failed', validation?.error || 'Unknown error');
    }
  }

  /**
   * Display validation error using ValidationDisplay component
   * @param {string} errorMessage - The error message to display
   */
  displayValidationError(errorMessage) {
    if (!this.validationDisplay) {
      this.validationDisplay = new ValidationDisplay('validationResult');
    }
    this.validationDisplay.showError('Validation Failed', errorMessage);
  }
}

export default FileHandler;
