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
      // Image stacks produced in the workspace (denoised, preprocessed,
      // stitched) can be annotated and trained on too (ADR-018)
      showRecentResults: true,
      resultTags: ['data'],
      filterRecentResults: (files) => files.filter(FileSelector.isImageStack),
      resultCategoryLabels: { results: 'Workspace' },
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
      // Annotations made in the workspace (ADR-018) and segmentation results
      // (inference output, cleanup output) are label maps too: they pass the
      // same validator and close the "correct, then retrain" loop (ADR-014)
      showRecentResults: true,
      resultTags: ['data'],
      filterRecentResults: (files) => files.filter(FileSelector.isLabelMask),
      resultCategoryLabels: { results: 'Workspace' },
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
      resultTags: ['data'],
      filterRecentResults: (files) => files.filter(FileSelector.isImageStack),
      resultCategoryLabels: { results: 'Workspace' },
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

    this.renderPairList();
    this.updateAddPairButton();

    console.log('[FileHandler] FileSelectors initialized');
  }

  // ===========================================================================
  // TRAINING PAIRS (ADR-014)
  // ===========================================================================

  /** Pairs kept in the list (not counting the pair currently in the selectors) */
  get pairs() {
    if (!Array.isArray(this.module.uploadedFiles.pairs)) {
      this.module.uploadedFiles.pairs = [];
    }
    return this.module.uploadedFiles.pairs;
  }

  /** The pair composed in the two selectors, if both are chosen */
  currentPair() {
    const raw = this.module.uploadedFiles.raw_images;
    const ann = this.module.uploadedFiles.annotations;
    if (!raw?.path || !ann?.path) return null;
    return { raw_images: raw, annotations: ann };
  }

  /** All pairs that a validation / training run covers */
  allPairs() {
    const current = this.currentPair();
    return current ? [...this.pairs, current] : [...this.pairs];
  }

  updateAddPairButton() {
    const btn = document.getElementById('addPairBtn');
    if (btn) btn.disabled = !this.currentPair();
  }

  /** Move the selected pair into the list and free the selectors for the next one */
  async addPair() {
    const current = this.currentPair();
    if (!current) return;
    const duplicate = this.pairs.some(p =>
      p.raw_images?.path === current.raw_images.path && p.annotations?.path === current.annotations.path);
    if (duplicate) {
      this.module.state.notify('error', 'This pair is already in the list');
      return;
    }
    this.pairs.push(current);
    this.module.uploadedFiles.raw_images = null;
    this.module.uploadedFiles.annotations = null;
    this.module.rawImageSelector?.clearSelection();
    this.module.annotationsSelector?.clearSelection();
    this.renderPairList();
    this.updateAddPairButton();
    await this.validateUploadedFiles();
  }

  async removePair(index) {
    if (index < 0 || index >= this.pairs.length) return;
    this.pairs.splice(index, 1);
    this.renderPairList();
    if (this.allPairs().length > 0) {
      await this.validateUploadedFiles();
    } else {
      this.module.filesValidated = false;
      this.module.trainingData = null;
      this.module.updateStep1NextButton();
      this.validationDisplay?.hide?.();
      this.module.stateHandler.saveState();
    }
  }

  /** Render the pair list; facts per pair come from the last validation */
  renderPairList() {
    const list = document.getElementById('trainingPairList');
    if (!list) return;
    const facts = this.module.trainingData?.pairs || [];
    const esc = (v) => String(v ?? '').replace(/[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    if (this.pairs.length === 0) {
      list.innerHTML = '<li class="pair-item empty">No pairs added yet. A single selected pair is enough to train.</li>';
      return;
    }
    list.innerHTML = this.pairs.map((pair, i) => {
      const f = facts[i];
      const dims = f
        ? `${f.slice_dimensions[1]}x${f.slice_dimensions[0]}, ${f.labelled_slices} of ${f.num_slices} slices labelled`
        : 'not validated yet';
      return `
        <li class="pair-item" data-index="${i}">
          <span class="pair-order">${i + 1}</span>
          <span class="pair-names">
            <span class="pair-name" title="${esc(pair.raw_images.path)}">${esc(pair.raw_images.displayName || pair.raw_images.name)}</span>
            <span class="pair-sep">+</span>
            <span class="pair-name" title="${esc(pair.annotations.path)}">${esc(pair.annotations.displayName || pair.annotations.name)}</span>
          </span>
          <span class="pair-dims">${esc(dims)}</span>
          <button type="button" class="btn-icon-sm pair-remove" data-index="${i}" title="Remove pair">${icon('cross')}</button>
        </li>`;
    }).join('');
    list.querySelectorAll('.pair-remove').forEach(btn => {
      btn.addEventListener('click', () => this.removePair(parseInt(btn.dataset.index, 10)));
    });
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
      this.updateAddPairButton();
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
   * Validate the training pairs (the list plus the pair in the selectors)
   * in one server call; the server builds one class map over all of them.
   */
  async validateUploadedFiles() {
    const pairs = this.allPairs();
    if (pairs.length === 0) return;
    console.log(`[FileHandler] Validating ${pairs.length} training pair(s)...`);

    try {
      this.module.state.update('ui.loading', true);

      const formData = new FormData();
      formData.append('skipUpload', 'true');
      formData.append('pairs', JSON.stringify(pairs.map(p => ({
        raw_images_path: p.raw_images.path,
        annotations_path: p.annotations.path
      }))));

      const response = await fetch('/upload-data', {
        method: 'POST',
        body: formData
      });

      const result = await response.json();

      if (result.success) {
        // Adopt the server's canonical paths / ids
        (result.pairs || []).forEach((srv, i) => {
          const pair = pairs[i];
          if (!pair) return;
          pair.raw_images = { ...pair.raw_images, path: srv.raw_images_path, id: srv.raw_images_id || pair.raw_images.id };
          pair.annotations = { ...pair.annotations, path: srv.annotations_path, id: srv.annotations_id || pair.annotations.id };
        });
        const current = this.currentPair();
        if (current) {
          this.module.uploadedFiles.raw_images = pairs[pairs.length - 1].raw_images;
          this.module.uploadedFiles.annotations = pairs[pairs.length - 1].annotations;
        }

        this.module.trainingData = result.validation;
        this.displayValidationResults(result.validation);
        this.renderPairList();

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

        this.module.state.notify('success', pairs.length === 1
          ? 'Files validated successfully'
          : `${pairs.length} training pairs validated`);
      } else {
        const detail = result.details || result.error || 'Validation failed';
        throw new Error(detail);
      }
    } catch (error) {
      console.error('[FileHandler] Validation error:', error);
      this.module.filesValidated = false;
      this.module.updateStep1NextButton();
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
          name: file?.displayName || file?.name || 'Inference Data',
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

    if (validation && validation.valid !== false && validation.success !== false) {
      const pairs = validation.pairs || [];
      const details = [];

      // Smallest slice over all pairs bounds the patch size (step 2)
      if (pairs.length) {
        const minW = Math.min(...pairs.map(p => p.slice_dimensions[1]));
        const minH = Math.min(...pairs.map(p => p.slice_dimensions[0]));
        this.module.imageDimensions = { width: minW, height: minH };
      } else if (validation.info?.slice_dimensions) {
        const [h, w] = validation.info.slice_dimensions;
        this.module.imageDimensions = { width: w, height: h };
      }

      pairs.forEach((p, i) => {
        const [h, w] = p.slice_dimensions;
        details.push({
          label: pairs.length > 1 ? `Pair ${i + 1}` : 'Training data',
          value: `${w}x${h}, ${p.labelled_slices} of ${p.num_slices} slices labelled`
        });
      });
      if (validation.totals) {
        details.push({
          label: 'Used for training',
          value: `${validation.totals.labelled_slices} labelled slices of ${validation.totals.slices}`
            + (pairs.length > 1 ? ` in ${pairs.length} pairs` : '')
        });
      }
      if (validation.num_classes) {
        const foreground = validation.num_classes - 1;
        details.push({ label: 'Classes', value: `${foreground} (background + ${foreground} labelled)` });
      }

      this.validationDisplay.showSuccess('Validation Successful', details);

      const warnings = Array.isArray(validation.warnings)
        ? validation.warnings
        : (validation.warnings ? [validation.warnings] : []);
      if (warnings.length) {
        const container = this.validationDisplay.getContainer();
        const host = container?.querySelector('.validation-success');
        warnings.forEach(text => {
          const warningDiv = document.createElement('p');
          warningDiv.className = 'warning';
          warningDiv.innerHTML = `${icon('warning')} <span></span>`;
          warningDiv.querySelector('span').textContent = text;
          host?.appendChild(warningDiv);
        });
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
