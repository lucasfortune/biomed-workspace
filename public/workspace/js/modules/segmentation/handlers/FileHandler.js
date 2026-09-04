/**
 * FileHandler.js - File Selection and Validation for Segmentation Module
 *
 * Handles file selection, upload, and validation.
 * Extracted from SegmentationModule.js for better maintainability.
 */

import { FileSelector, ValidationDisplay } from '/workspace/js/core/components/index.js';
import { icon } from '/workspace/js/core/icons.js';
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
      icon: 'image',
      helpIconHtml: Templates.renderHelpIcon('segmentation.step1.raw-images'),
      stateManager: this.module.state,
      onSelect: (fileInfo) => this.onFileSelected('raw_images', fileInfo),
      onUpload: (file, uploadedInfo) => this.onFileUploaded('raw_images', file, uploadedInfo)
    });

    this.module.annotationsSelector = new FileSelector({
      id: 'annotations',
      fileType: 'uploads',
      filterTags: ['annotation'],
      title: 'Annotations',
      icon: 'tag',
      helpIconHtml: Templates.renderHelpIcon('segmentation.step1.annotations'),
      stateManager: this.module.state,
      onSelect: (fileInfo) => this.onFileSelected('annotations', fileInfo),
      onUpload: (file, uploadedInfo) => this.onFileUploaded('annotations', file, uploadedInfo)
    });

    this.module.inferenceSelector = new FileSelector({
      id: 'inference_data',
      fileType: 'uploads',
      filterTags: ['raw'],
      title: 'Inference Data',
      icon: 'image',
      helpIconHtml: Templates.renderHelpIcon('segmentation.step4.inference-data'),
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

    // Handle based on file type
    if (type === 'raw_images' || type === 'annotations') {
      if (this.module.uploadedFiles.raw_images && this.module.uploadedFiles.annotations) {
        await this.validateUploadedFiles();
      }
    } else if (type === 'inference_data') {
      if (fileInfo) {
        const runInferenceBtn = document.getElementById('runInferenceBtn');
        if (runInferenceBtn) {
          runInferenceBtn.disabled = false;
        }
        this.module.stateHandler.saveState();
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
        this.module.stateHandler.saveState();

        this.module.state.notify('success', 'Files validated successfully');
      } else {
        const detail = result.details || result.error || 'Validation failed';
        throw new Error(detail);
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

        if (result.validation?.info?.slice_dimensions) {
          const [h, w] = result.validation.info.slice_dimensions;
          this.module.inferenceDimensions = { width: w, height: h };
        }

        const runInferenceBtn = document.getElementById('runInferenceBtn');
        if (runInferenceBtn) {
          runInferenceBtn.disabled = false;
        }

        if (this.module.inferenceSelector && this.module.uploadedFiles.inference_data) {
          this.module.inferenceSelector.setSelectedFile(this.module.uploadedFiles.inference_data);
        }

        this.module.stateHandler.saveState();
        this.module.state.notify('success', 'Inference file validated successfully');
        this.module._validateInferenceCompatibility();
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
      // Store image dimensions for parameter validation
      if (validation.info?.slice_dimensions) {
        const [h, w] = validation.info.slice_dimensions;
        this.module.imageDimensions = { width: w, height: h };
      }

      const details = [];
      if (validation.info?.slice_dimensions) {
        const [h, w] = validation.info.slice_dimensions;
        details.push({ label: 'Raw Images', value: `${w}x${h} (${validation.info.num_slices} slices)` });
      } else if (validation.raw_dims) {
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
          warningDiv.innerHTML = `${icon('warning')} <span>${validation.warnings}</span>`;
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
