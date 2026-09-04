/**
 * MeshModule - Surface Mesh Generation Module
 *
 * Converts segmented TIFF image stacks into 3D surface meshes.
 * Uses hybrid approach: Python backend for mesh generation,
 * frontend for visualization integration.
 *
 * Features:
 * - Step 1: Data selection (recent results + workspace files)
 * - Step 2: Mesh generation with real-time progress
 * - Output formats: Three.js JSON (feeds the 3D viewer) and OBJ; other
 *   formats come from the file browser's "Convert to..." action
 * - Navigation to 3D visualization module
 *
 * @module MeshModule
 */

// =============================================================================
// IMPORTS
// =============================================================================

import BaseModule from '/workspace/js/core/BaseModule.js';
import { StepNavigator, FileSelector, ValidationDisplay }
  from '/workspace/js/core/components/index.js';
import MeshAPI from './MeshAPI.js';
import ParameterValidator from '/workspace/js/core/utils/ParameterValidator.js';
import FormValidationController from '/workspace/js/core/utils/FormValidationController.js';

// =============================================================================
// MODULE CLASS
// =============================================================================

class MeshModule extends BaseModule {

  // ===========================================================================
  // CONSTRUCTOR
  // ===========================================================================

  constructor(stateManager) {
    super(stateManager, {
      id: 'mesh',
      name: 'Surface Mesh Generation',
      cssPath: '/workspace/js/modules/mesh/css/mesh.css',
      steps: [
        { id: 'select', name: 'Data Selection' },
        { id: 'generate', name: 'Mesh Generation' }
      ]
    });

    // =========================================================================
    // STEP CONDITION FLAGS
    // =========================================================================

    this.dataValidated = false;      // Step 1 complete -> can access Step 2
    this.generationComplete = false; // Step 2 complete

    // =========================================================================
    // COMPONENT REFERENCES
    // =========================================================================

    this.stepNavigator = null;
    this.validationDisplay = null;
    this.fileSelector = null;
    this.api = null;

    // =========================================================================
    // MODULE STATE
    // =========================================================================

    this.selectedFile = null;
    this.dataInfo = null;
    this.currentMeshId = null;
    this.meshResult = null;
    this.socket = null;

    // Timer for elapsed time
    this.generationStartTime = null;
    this.elapsedTimeInterval = null;

    // Generation options
    this.generationOptions = {
      outputFormats: ['json', 'obj'],
      targetClasses: 'all',
      zAspect: 1
    };

    // =========================================================================
    // BIND METHODS
    // =========================================================================

    this.onFileSelected = this.onFileSelected.bind(this);
    this.onFileUploaded = this.onFileUploaded.bind(this);
    this.startGeneration = this.startGeneration.bind(this);
    this.onGenerationProgress = this.onGenerationProgress.bind(this);
    this.onGenerationComplete = this.onGenerationComplete.bind(this);

    // Event listener references for cleanup
    this.eventListeners = [];
  }

  /**
   * Render a help icon that opens the info panel with a specific article
   * @param {string} articleId - The article ID to display
   * @returns {string} HTML for the help icon
   */
  renderHelpIcon(articleId) {
    return `<span class="help-icon" data-info-id="${articleId}" title="Click for help">
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z"/>
      </svg>
    </span>`;
  }

  // ===========================================================================
  // RENDER METHOD
  // ===========================================================================

  render() {
    this.container.innerHTML = `
      <div class="mesh-module module-container">
        <!-- Header with back button -->
        ${this.renderHeader()}

        <!-- Step navigation -->
        ${this.renderStepNav()}

        <!-- Step Contents Container -->
        <div class="step-contents">

          <!-- =============================================================== -->
          <!-- STEP 1: Data Selection -->
          <!-- =============================================================== -->
          <div id="step1" class="step-content active">
            <div class="step-inner">
              <h3>Select Segmentation Data</h3>
              <p class="step-description">
                Choose segmentation results or annotation data to convert into a 3D surface mesh.
              </p>

              <!-- File Selector Container -->
              <div id="fileSelectorContainer"></div>

              <!-- Validation Display (minimal confirmation) -->
              ${ValidationDisplay.renderContainer('validationResult')}

              <!-- Navigation Buttons -->
              <div class="navigation-buttons">
                <div></div>
                <button id="step1Next" class="btn" disabled>
                  Next: Generate Mesh
                </button>
              </div>
            </div>
          </div>

          <!-- =============================================================== -->
          <!-- STEP 2: Mesh Generation -->
          <!-- =============================================================== -->
          <div id="step2" class="step-content">
            <div class="step-inner">
              <h3>Generate Surface Mesh</h3>

              <!-- Data Summary -->
              <div id="dataSummary" class="data-summary"></div>

              <!-- Generation Options (shown before generation) -->
              <div id="generationOptions" class="generation-options">
                <div class="options-header">
                  <h4>Output Options</h4>
                  ${this.renderHelpIcon('mesh.step2.output-options')}
                </div>

                <p class="format-note">
                  The mesh is generated as Three.js JSON (for the 3D viewer)
                  plus OBJ geometry. Other formats (STL, PLY, glTF) are
                  available afterwards via the file browser's right-click
                  "Convert to..." action on the OBJ file.
                </p>

                <div class="form-field">
                  <label for="classSelection">Classes to Generate</label>
                  <select id="classSelection">
                    <option value="all" selected>All Classes</option>
                  </select>
                </div>

                <div class="form-field">
                  <label for="zAspectInput">
                    Z Voxel Scale
                  </label>
                  <input type="number" id="zAspectInput" min="0.05" max="20" step="0.1" value="1">
                  <small class="field-hint">
                    Z voxel size relative to X/Y. Use 1 for cubic voxels, or e.g. 2 if your
                    z-step is twice the in-plane pixel size (aspect 1:1:2).
                  </small>
                </div>
              </div>

              <!-- Progress Section (shown during generation) -->
              <div id="generationProgress" class="progress-section" style="display: none;">
                <div class="progress-header">
                  <span class="progress-title">
                    <span class="spinner"></span>
                    Generating Surface Mesh
                  </span>
                  <span id="elapsedTime" class="elapsed-time">00:00</span>
                </div>
                <div class="progress-info">
                  <span id="progressStatus">Initializing...</span>
                  <span id="progressPercent">0%</span>
                </div>
                <div class="progress-bar-container">
                  <div id="progressBar" class="job-progress-fill" style="width: 0%"></div>
                </div>
                <div class="progress-details">
                  <span id="progressClassInfo">Preparing data...</span>
                </div>
              </div>

              <!-- Results Section (shown after generation) -->
              <div class="section-card success-card" id="generationResults" style="display: none;">
                <div class="success-header">
                  <span class="success-icon">&#10003;</span>
                  <span class="success-title">Mesh Generation Complete</span>
                </div>

                <div id="resultsDetails" class="validation-details"></div>

                <p class="field-hint">The mesh is saved to your workspace. Download it any time from the file browser.</p>

                <div class="success-actions">
                  <button class="btn primary" id="openVisualizationBtn">
                    Open in 3D Visualization
                  </button>
                  <button class="btn secondary" id="generateAnotherBtn">
                    Start New Run
                  </button>
                </div>
              </div>

              <!-- Navigation Buttons (the job action lives in the right slot) -->
              <div class="navigation-buttons">
                <button id="step2Back" class="btn secondary">Back</button>
                <button id="startGenerationBtn" class="btn primary">
                  <span class="btn-glyph">&#9658;</span> Generate Mesh
                </button>
              </div>
            </div>
          </div>

        </div>
      </div>
    `;
  }

  // ===========================================================================
  // INITIALIZE METHOD
  // ===========================================================================

  async initialize() {
    console.log('[MeshModule] Initializing components...');

    // Initialize API client
    this.api = new MeshAPI();

    // =========================================================================
    // Initialize StepNavigator
    // =========================================================================

    this.stepNavigator = new StepNavigator({
      steps: this.config.steps,
      currentStep: this.currentStep,
      onStepClick: (stepNum) => this.goToStep(stepNum),
      canNavigate: (stepNum) => this.canNavigateToStep(stepNum)
    });
    this.stepNavigator.init(this.container);

    // =========================================================================
    // Initialize ValidationDisplay
    // =========================================================================

    this.validationDisplay = new ValidationDisplay('validationResult');

    // =========================================================================
    // Initialize FileSelector
    // =========================================================================

    const fileSelectorContainer = document.getElementById('fileSelectorContainer');
    if (fileSelectorContainer) {
      this.fileSelector = new FileSelector({
        id: 'mesh_input',
        fileType: 'uploads',  // New metadata system
        filterTags: ['annotation'],  // Show annotation uploads
        title: 'Segmentation Data',
        icon: 'tag',
        helpIconHtml: this.renderHelpIcon('mesh.step1.segmentation-data'),
        // Mesh input is a mask; segmentation results and annotation uploads
        // (including the built-in sample) all carry the `annotation` tag the
        // filters below accept.
        showRecentResults: true, // Show segmentation results in "Recent Results" section
        stateManager: this.state,
        onSelect: this.onFileSelected,
        onUpload: this.onFileUploaded,
        // Result categories to include segmentation results
        resultCategories: ['results', 'segmentations', 'segmented_stack'],
        resultTags: ['segmentation', 'data'],  // Filter to segmentation data files (not info)
        resultCategoryLabels: {
          'results': 'Result',
          'segmentations': 'Segmentation',
          'segmented_stack': 'Segmented'
        },
        // Custom filter for workspace files (annotations)
        // Support both new (uploads with annotation tag) and legacy categories
        filterFiles: (files) => {
          return files.filter(f => {
            // New system: uploads with annotation tag
            if (f.category === 'uploads' && f.tags && f.tags.includes('annotation')) {
              return true;
            }
            // Legacy categories for backward compat
            return f.category === 'annotations' ||
                   f.category === 'segmented_stack';
          });
        }
      });

      fileSelectorContainer.innerHTML = this.fileSelector.render();
      await this.fileSelector.init();
    }

    // =========================================================================
    // Set Up Event Listeners
    // =========================================================================

    this.setupEventListeners();
    this._initParamValidation();

    // =========================================================================
    // Initialize Socket.IO
    // =========================================================================

    await this.initializeSocket();

    // =========================================================================
    // Make Module Globally Accessible
    // =========================================================================

    window.meshModule = this;

    // =========================================================================
    // Check for Resume
    // =========================================================================

    await this.checkForResume();

    console.log('[MeshModule] Initialization complete');
  }

  // ===========================================================================
  // EVENT LISTENERS
  // ===========================================================================

  setupEventListeners() {
    // Helper to add and track event listeners
    const addListener = (element, event, handler) => {
      if (element) {
        element.addEventListener(event, handler);
        this.eventListeners.push({ element, event, handler });
      }
    };

    // Back to Hub button
    addListener(document.getElementById('backToHub'), 'click', () => {
      window.workspace.returnToHub();
    });

    // Step navigation buttons
    addListener(document.getElementById('step1Next'), 'click', () => this.nextStep());
    addListener(document.getElementById('step2Back'), 'click', () => this.previousStep());

    // Job action (nav row, step 2)
    addListener(document.getElementById('startGenerationBtn'), 'click', () => this.startGeneration());

    // Result actions
    addListener(document.getElementById('openVisualizationBtn'), 'click', () => this.openInVisualization());
    addListener(document.getElementById('generateAnotherBtn'), 'click', () => this.reset());
  }

  /**
   * Show/hide the nav-row job button. It is hidden while a generation runs
   * and while the results card is shown, and comes back on reset/failure.
   * @param {boolean} visible
   */
  setJobButtonVisible(visible) {
    const btn = document.getElementById('startGenerationBtn');
    if (btn) btn.style.display = visible ? '' : 'none';
  }

  /**
   * Field-level validation of the generation options; the job button stays
   * disabled while the Z voxel scale is out of range.
   */
  _initParamValidation() {
    this.formValidationController?.destroy();
    this.paramValidator = new ParameterValidator();
    this.formValidationController = new FormValidationController(this.paramValidator, {
      onValidationChange: (allValid) => {
        const btn = document.getElementById('startGenerationBtn');
        if (btn) btn.disabled = !allValid;
      }
    });
    const form = document.getElementById('step2');
    if (form) this.formValidationController.attachTo(form);
    this.formValidationController.addFieldRule('zAspectInput', (value) =>
      this.paramValidator.validateRange(value, 0.05, 20, 'Z voxel scale'));
    this.formValidationController.validateAll();
  }

  // ===========================================================================
  // SOCKET.IO INITIALIZATION
  // ===========================================================================

  async initializeSocket() {
    // Load Socket.IO if not already loaded
    if (typeof io === 'undefined') {
      await this.loadScript('/socket.io/socket.io.js');
    }

    this.socket = io();

    // Set up event listeners
    this.socket.on('mesh-progress', this.onGenerationProgress);
    this.socket.on('mesh-complete', this.onGenerationComplete);
    this.socket.on('mesh-error', (data) => {
      console.error('[MeshModule] Generation error:', data);
      this.onGenerationError(data.error || 'Unknown error');
    });

    console.log('[MeshModule] Socket.IO initialized');
  }

  // ===========================================================================
  // FILE SELECTION HANDLERS
  // ===========================================================================

  async onFileSelected(fileInfo) {
    console.log('[MeshModule] File selected:', fileInfo);

    this.selectedFile = fileInfo;

    // Show loading state
    this.validationDisplay.showLoading('Validating file...');

    try {
      // Fetch data info from backend (includes validation)
      const infoResult = await this.api.getInfo(fileInfo.id || fileInfo.path);

      if (infoResult.success) {
        this.dataInfo = infoResult.info;

        // Update class selection dropdown for step 2
        this.updateClassSelection(infoResult.info.classes);

        // Show minimal success confirmation (header only)
        this.validationDisplay.showSuccess('Data Selected');

        // Enable next button
        this.dataValidated = true;
        const step1Next = document.getElementById('step1Next');
        if (step1Next) step1Next.disabled = false;

        this.saveState();
      } else {
        // Validation failed
        await this.handleValidationFailure(fileInfo, infoResult.error);
      }
    } catch (error) {
      console.error('[MeshModule] Error loading data info:', error);
      await this.handleValidationFailure(fileInfo, error.message);
    }
  }

  async handleValidationFailure(fileInfo, errorMessage) {
    let fileWasDeleted = false;

    // If the file was just uploaded, delete it to prevent it from
    // appearing in the file dropdown later
    if (fileInfo.isUploaded && fileInfo.id) {
      console.log('[MeshModule] Deleting invalid uploaded file:', fileInfo.id);
      try {
        const deleteResult = await this.api.deleteFile(fileInfo.id);
        if (deleteResult.success) {
          console.log('[MeshModule] Invalid file deleted successfully');
          fileWasDeleted = true;

          // Notify user that file was removed
          this.state.notify('warning', 'Invalid file was not saved to workspace');
        } else {
          console.error('[MeshModule] Failed to delete invalid file:', deleteResult.error);
        }
      } catch (deleteError) {
        console.error('[MeshModule] Failed to delete invalid file:', deleteError);
      }

      // Refresh the file selector to remove the deleted file from dropdown
      if (this.fileSelector) {
        await this.fileSelector.refresh();
      }
    }

    // Clear selection state
    this.selectedFile = null;
    this.dataInfo = null;
    this.dataValidated = false;

    // Clear file selector selection
    if (this.fileSelector) {
      this.fileSelector.clearSelection();
    }

    // Disable next button
    const step1Next = document.getElementById('step1Next');
    if (step1Next) step1Next.disabled = true;

    // Show error with helpful message
    // Add note about file not being saved if it was an upload
    const fullErrorMessage = fileWasDeleted
      ? `${errorMessage}\n\nThe file was not saved to your workspace.`
      : errorMessage;
    this.validationDisplay.showError('Invalid File', fullErrorMessage);
  }

  async onFileUploaded(file, uploadResult) {
    console.log('[MeshModule] File uploaded:', uploadResult);

    // uploadResult is the file entry from workspace with id, name, path, etc.
    this.selectedFile = {
      name: uploadResult.name || file.name,
      path: uploadResult.path,
      id: uploadResult.id,
      isUploaded: true  // Mark as uploaded so we can delete if validation fails
    };

    // Trigger validation flow
    await this.onFileSelected(this.selectedFile);
  }

  // ===========================================================================
  // DATA DISPLAY
  // ===========================================================================

  updateClassSelection(classes) {
    const select = document.getElementById('classSelection');
    if (!select) return;

    // Keep "All Classes" option, add individual classes
    select.innerHTML = '<option value="all" selected>All Classes</option>';
    classes.forEach(classId => {
      if (classId > 0) { // Skip background (0)
        const option = document.createElement('option');
        option.value = classId;
        option.textContent = `Class ${classId}`;
        select.appendChild(option);
      }
    });
  }

  // ===========================================================================
  // STEP NAVIGATION OVERRIDES
  // ===========================================================================

  canNavigateToStep(stepNumber) {
    switch (stepNumber) {
      case 1:
        return true;
      case 2:
        return this.dataValidated;
      default:
        return false;
    }
  }

  goToStep(stepNumber) {
    super.goToStep(stepNumber);

    if (this.stepNavigator) {
      this.stepNavigator.update(stepNumber);
    }

    // Update data summary when entering step 2
    if (stepNumber === 2) {
      this.updateDataSummary();
    }
  }

  nextStep() {
    if (this.currentStep === 1 && !this.dataValidated) {
      this.state.notify('error', 'Please select segmentation data first');
      return;
    }

    super.nextStep();
  }

  // ===========================================================================
  // GENERATION OPTIONS
  // ===========================================================================

  updateGenerationOptions() {
    // Fixed formats: JSON feeds the 3D viewer, OBJ is the canonical
    // triangle geometry that the file browser's format conversion
    // (STL/PLY/glTF) reads from
    this.generationOptions.outputFormats = ['json', 'obj'];

    const classSelect = document.getElementById('classSelection');
    this.generationOptions.targetClasses = classSelect?.value || 'all';

    // Z voxel scale (relative to x/y). Fall back to 1 for empty/invalid input.
    const zAspectInput = document.getElementById('zAspectInput');
    let zAspect = parseFloat(zAspectInput?.value);
    if (!Number.isFinite(zAspect) || zAspect <= 0) {
      zAspect = 1;
    }
    zAspect = Math.min(Math.max(zAspect, 0.05), 20);
    this.generationOptions.zAspect = zAspect;
    // Reflect the normalized value back into the field
    if (zAspectInput) zAspectInput.value = zAspect;
  }

  updateDataSummary() {
    const summary = document.getElementById('dataSummary');
    if (!summary || !this.selectedFile || !this.dataInfo) return;

    // Calculate middle slice for preview
    const middleSlice = Math.floor(this.dataInfo.dimensions[0] / 2);
    const previewUrl = this.api.getPreviewUrl(
      this.selectedFile.id || this.selectedFile.path,
      middleSlice
    );

    summary.innerHTML = `
      <div class="summary-card">
        <h4>Selected Data</h4>
        <div class="summary-with-preview">
          <div class="summary-details">
            <div class="detail-row">
              <span>File:</span>
              <span>${this.selectedFile.name || 'Selected file'}</span>
            </div>
            <div class="detail-row">
              <span>Dimensions:</span>
              <span>${this.dataInfo.dimensions[0]} x ${this.dataInfo.dimensions[1]} x ${this.dataInfo.dimensions[2]}</span>
            </div>
            <div class="detail-row">
              <span>Slices:</span>
              <span>${this.dataInfo.sliceCount || this.dataInfo.dimensions[0]}</span>
            </div>
            <div class="detail-row">
              <span>Classes Detected:</span>
              <span>${this.dataInfo.classes.length} classes (${this.dataInfo.classes.filter(c => c > 0).join(', ')})</span>
            </div>
            <div class="detail-row">
              <span>Data Type:</span>
              <span>${this.dataInfo.dtype || 'uint8'}</span>
            </div>
          </div>
          <div class="summary-preview">
            <img id="summaryPreviewImage" src="${previewUrl}" alt="Slice preview">
            <span class="preview-label">Slice ${middleSlice + 1} of ${this.dataInfo.dimensions[0]}</span>
          </div>
        </div>
      </div>
    `;

    // Hide the preview box if the slice image cannot be loaded (wired here
    // rather than with an inline onerror attribute)
    const previewImage = document.getElementById('summaryPreviewImage');
    if (previewImage) {
      previewImage.addEventListener('error', () => {
        if (previewImage.parentElement) previewImage.parentElement.style.display = 'none';
      }, { once: true });
    }
  }

  // ===========================================================================
  // MESH GENERATION
  // ===========================================================================

  async startGeneration() {
    console.log('[MeshModule] Starting mesh generation...');

    // Update options from UI
    this.updateGenerationOptions();

    // Show progress, hide the options and the job button
    document.getElementById('generationOptions').style.display = 'none';
    document.getElementById('generationProgress').style.display = 'block';
    this.setJobButtonVisible(false);

    // Reset and start elapsed time timer
    this.startElapsedTimer();

    // Reset progress UI
    this.updateProgressUI(0, 'Initializing...', 'Starting mesh generation...');

    try {
      // Build options including sourceFileId for lineage tracking
      const generateOptions = {
        outputFormats: this.generationOptions.outputFormats,
        targetClasses: this.generationOptions.targetClasses,
        zAspect: this.generationOptions.zAspect
      };

      // Include sourceFileId for lineage tracking if available
      if (this.selectedFile && this.selectedFile.id) {
        generateOptions.sourceFileId = this.selectedFile.id;
        console.log('[MeshModule] Including sourceFileId for lineage:', this.selectedFile.id);
      }

      const result = await this.api.generateMesh(
        this.selectedFile.path || this.selectedFile.id,
        generateOptions
      );

      if (result.success) {
        this.currentMeshId = result.meshId;

        // Join Socket.IO room for progress updates
        if (this.socket) {
          this.socket.emit('join-mesh-generation', result.meshId);
        }

        this.saveState();
        this.state.notify('info', 'Mesh generation started');
      } else {
        this.onGenerationError(result.error || 'Failed to start mesh generation');
      }
    } catch (error) {
      console.error('[MeshModule] Generation error:', error);
      this.onGenerationError(error.message);
    }
  }

  onGenerationProgress(data) {
    console.log('[MeshModule] Progress:', data);

    if (data.mesh_id !== this.currentMeshId) return;

    const statusText = data.status || 'Processing...';
    const classInfo = `Processing class ${data.class} of ${data.total_classes}`;

    this.updateProgressUI(data.progress_percent, statusText, classInfo);
  }

  updateProgressUI(percent, status, classInfo) {
    const progressBar = document.getElementById('progressBar');
    const progressPercent = document.getElementById('progressPercent');
    const progressStatus = document.getElementById('progressStatus');
    const progressClassInfo = document.getElementById('progressClassInfo');

    if (progressBar) progressBar.style.width = `${percent}%`;
    if (progressPercent) progressPercent.textContent = `${Math.round(percent)}%`;
    if (progressStatus) progressStatus.textContent = status;
    if (progressClassInfo) progressClassInfo.textContent = classInfo;
  }

  onGenerationComplete(data) {
    console.log('[MeshModule] Generation complete:', data);

    if (data.mesh_id !== this.currentMeshId) return;

    // Stop timer
    this.stopElapsedTimer();

    this.meshResult = data;
    this.generationComplete = true;

    // Hide progress, show results (the job button stays hidden until
    // "Start New Run")
    document.getElementById('generationProgress').style.display = 'none';
    document.getElementById('generationResults').style.display = 'block';
    this.setJobButtonVisible(false);

    // Display results with elapsed time
    const elapsedTime = this.getElapsedTime();
    this.showGenerationResults(data, elapsedTime);

    this.saveState();
    this.state.notify('success', 'Mesh generation complete!');

    // Refresh file browser to show new mesh files
    if (window.workspace && window.workspace.fileBrowser) {
      window.workspace.fileBrowser.refresh().catch(err => {
        console.warn('[MeshModule] Failed to refresh file browser:', err);
      });
    }
  }

  onGenerationError(error) {
    console.error('[MeshModule] Generation error:', error);

    // Stop timer
    this.stopElapsedTimer();

    // Show options and the job button again
    document.getElementById('generationProgress').style.display = 'none';
    document.getElementById('generationOptions').style.display = 'block';
    this.setJobButtonVisible(true);

    this.state.notify('error', `Mesh generation failed: ${error}`);
  }

  // ===========================================================================
  // ELAPSED TIME TRACKING
  // ===========================================================================

  startElapsedTimer() {
    this.generationStartTime = Date.now();

    // Clear any existing interval
    if (this.elapsedTimeInterval) {
      clearInterval(this.elapsedTimeInterval);
    }

    // Update every second
    this.elapsedTimeInterval = setInterval(() => {
      this.updateElapsedTimeDisplay();
    }, 1000);

    // Initial update
    this.updateElapsedTimeDisplay();
  }

  stopElapsedTimer() {
    if (this.elapsedTimeInterval) {
      clearInterval(this.elapsedTimeInterval);
      this.elapsedTimeInterval = null;
    }
  }

  getElapsedTime() {
    if (!this.generationStartTime) return '00:00';
    const elapsed = Date.now() - this.generationStartTime;
    return this.formatElapsedTime(elapsed);
  }

  formatElapsedTime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  updateElapsedTimeDisplay() {
    const elapsedTimeEl = document.getElementById('elapsedTime');
    if (elapsedTimeEl) {
      elapsedTimeEl.textContent = this.getElapsedTime();
    }
  }

  showGenerationResults(data, elapsedTime = null) {
    const details = document.getElementById('resultsDetails');

    // Format output directory to show relative path
    let outputDirDisplay = data.output_dir || 'N/A';
    if (outputDirDisplay.includes('/results/meshes/')) {
      outputDirDisplay = outputDirDisplay.split('/results/meshes/').pop();
    }

    if (details) {
      details.innerHTML = `
        <div class="detail-row">
          <span>Total Vertices:</span>
          <span>${data.statistics?.totalVertices?.toLocaleString() || 'N/A'}</span>
        </div>
        <div class="detail-row">
          <span>Total Faces:</span>
          <span>${data.statistics?.totalFaces?.toLocaleString() || 'N/A'}</span>
        </div>
        <div class="detail-row">
          <span>Classes Processed:</span>
          <span>${data.statistics?.classesProcessed || 'N/A'}</span>
        </div>
        <div class="detail-row">
          <span>Output Formats:</span>
          <span>${data.formats?.map(f => f.toUpperCase()).join(', ') || 'N/A'}</span>
        </div>
        ${this.generationOptions.zAspect && this.generationOptions.zAspect !== 1 ? `
        <div class="detail-row">
          <span>Z Voxel Scale:</span>
          <span>1 : 1 : ${this.generationOptions.zAspect}</span>
        </div>
        ` : ''}
        ${elapsedTime ? `
        <div class="detail-row">
          <span>Generation Time:</span>
          <span>${elapsedTime}</span>
        </div>
        ` : ''}
      `;
    }
  }

  // ===========================================================================
  // MODULE NAVIGATION
  // ===========================================================================

  openInVisualization() {
    if (!this.meshResult) {
      this.state.notify('error', 'No mesh result available');
      return;
    }

    // Build the JSON file path as a relative path (matches how backend stores in metadata)
    const jsonFilePath = `results/meshes/${this.currentMeshId}/mesh_data.json`;

    // Store result in state for visualization module
    this.state.update('modules.mesh.result', {
      meshId: this.currentMeshId,
      outputDir: this.meshResult.output_dir,
      formats: this.meshResult.formats,
      // Include direct file info so visualization module can use it immediately
      jsonFile: {
        path: jsonFilePath,
        name: 'mesh_data.json',
        id: jsonFilePath
      },
      timestamp: Date.now()
    });

    // Navigate to visualization module
    console.log('[MeshModule] Opening visualization module with mesh:', this.currentMeshId, 'file:', jsonFilePath);
    window.workspace.loadModule('visualization');
  }

  // ===========================================================================
  // RESET
  // ===========================================================================

  reset() {
    console.log('[MeshModule] Resetting module...');

    // Stop any running timer
    this.stopElapsedTimer();

    // Reset state flags
    this.dataValidated = false;
    this.generationComplete = false;
    this.selectedFile = null;
    this.dataInfo = null;
    this.currentMeshId = null;
    this.meshResult = null;
    this.generationStartTime = null;
    this.generationOptions = {
      outputFormats: ['json', 'obj'],
      targetClasses: 'all',
      zAspect: 1
    };

    // Reset UI
    const zAspectInput = document.getElementById('zAspectInput');
    if (zAspectInput) zAspectInput.value = 1;
    this.formValidationController?.validateAll();

    const classSelect = document.getElementById('classSelection');
    if (classSelect) classSelect.innerHTML = '<option value="all" selected>All Classes</option>';

    const options = document.getElementById('generationOptions');
    if (options) options.style.display = 'block';
    const progress = document.getElementById('generationProgress');
    if (progress) progress.style.display = 'none';
    const results = document.getElementById('generationResults');
    if (results) results.style.display = 'none';
    this.setJobButtonVisible(true);

    // Reset progress UI
    this.updateProgressUI(0, 'Initializing...', 'Preparing data...');
    const elapsedTimeEl = document.getElementById('elapsedTime');
    if (elapsedTimeEl) elapsedTimeEl.textContent = '00:00';

    // Reset step 1
    const step1Next = document.getElementById('step1Next');
    if (step1Next) step1Next.disabled = true;

    // Clear validation display
    if (this.validationDisplay) {
      this.validationDisplay.hide();
    }

    // Reset file selector
    if (this.fileSelector) {
      this.fileSelector.clearSelection();
    }

    // Clear the persisted step state. `modules.mesh.result` is deliberately
    // left alone: it is the hand-off to the visualization module (set by
    // openInVisualization just before we are deactivated) and is cleared
    // there once consumed.
    ['currentStep', 'selectedFile', 'dataInfo', 'dataValidated', 'currentMeshId', 'generationComplete']
      .forEach(key => this.state.update(`modules.mesh.${key}`, null));

    // Go back to step 1
    this.goToStep(1);
  }

  // ===========================================================================
  // STATE PERSISTENCE
  // ===========================================================================

  saveState() {
    this.state.update('modules.mesh.currentStep', this.currentStep);
    this.state.update('modules.mesh.selectedFile', this.selectedFile);
    this.state.update('modules.mesh.dataInfo', this.dataInfo);
    this.state.update('modules.mesh.dataValidated', this.dataValidated);
    this.state.update('modules.mesh.currentMeshId', this.currentMeshId);
    this.state.update('modules.mesh.generationComplete', this.generationComplete);
  }

  async checkForResume() {
    const meshState = this.state.get('modules.mesh');
    if (!meshState) return;

    // Restore state
    if (meshState.selectedFile) {
      this.selectedFile = meshState.selectedFile;
    }
    if (meshState.dataInfo) {
      this.dataInfo = meshState.dataInfo;
      // Update class selection for step 2
      this.updateClassSelection(meshState.dataInfo.classes);
    }
    if (meshState.dataValidated) {
      this.dataValidated = true;
      const step1Next = document.getElementById('step1Next');
      if (step1Next) step1Next.disabled = false;
    }
    if (meshState.currentMeshId) {
      this.currentMeshId = meshState.currentMeshId;

      // Check if generation is still in progress
      await this.checkGenerationStatus(meshState.currentMeshId);
    }
    if (meshState.generationComplete) {
      this.generationComplete = true;
    }

    // Restore step
    if (meshState.currentStep && meshState.currentStep > 1) {
      this.goToStep(meshState.currentStep);
    }
  }

  async checkGenerationStatus(meshId) {
    try {
      const status = await this.api.getStatus(meshId);

      if (status.success) {
        if (status.status === 'processing' || status.status === 'starting') {
          // Generation is still in progress - show progress UI and rejoin room
          console.log('[MeshModule] Resuming in-progress generation:', meshId);

          document.getElementById('generationOptions').style.display = 'none';
          document.getElementById('generationProgress').style.display = 'block';
          this.setJobButtonVisible(false);

          // Rejoin Socket.IO room
          if (this.socket) {
            this.socket.emit('join-mesh-generation', meshId);
          }

          // Update progress display
          this.updateProgressUI(
            status.progress || 0,
            'Resuming...',
            status.currentClass ? `Processing class ${status.currentClass} of ${status.totalClasses}` : 'Processing...'
          );

          // Note: We can't accurately resume the timer, so show elapsed time as unknown
          const elapsedTimeEl = document.getElementById('elapsedTime');
          if (elapsedTimeEl) elapsedTimeEl.textContent = '--:--';

          this.state.notify('info', 'Resuming mesh generation in progress...');

        } else if (status.status === 'completed' && status.result) {
          // Generation completed while we were away - show results
          console.log('[MeshModule] Generation completed while away:', meshId);
          this.meshResult = status.result;
          this.generationComplete = true;

          document.getElementById('generationOptions').style.display = 'none';
          document.getElementById('generationProgress').style.display = 'none';
          document.getElementById('generationResults').style.display = 'block';
          this.setJobButtonVisible(false);

          this.showGenerationResults(status.result);

        } else if (status.status === 'failed') {
          // Generation failed - reset to options
          console.log('[MeshModule] Generation failed:', status.error);
          this.stopElapsedTimer(); // Ensure timer is stopped on failure
          this.currentMeshId = null;
          this.setJobButtonVisible(true);
          this.state.notify('error', `Previous generation failed: ${status.error}`);
        }
      }
    } catch (error) {
      console.error('[MeshModule] Error checking generation status:', error);
    }
  }

  // ===========================================================================
  // CLEANUP
  // ===========================================================================

  async deactivate() {
    console.log('[MeshModule] Deactivating...');

    // Reset to a fresh state: the instance is cached by ModuleLoader and
    // re-rendered on the next visit, so anything left here would survive.
    // reset() runs while the DOM still exists (before super.deactivate()).
    this.reset();
    this.formValidationController?.destroy();
    this.formValidationController = null;

    // Stop elapsed time timer
    this.stopElapsedTimer();

    // Remove all tracked event listeners
    for (const { element, event, handler } of this.eventListeners) {
      element.removeEventListener(event, handler);
    }
    this.eventListeners = [];

    // Disconnect socket event handlers
    if (this.socket) {
      this.socket.off('mesh-progress', this.onGenerationProgress);
      this.socket.off('mesh-complete', this.onGenerationComplete);
      this.socket.off('mesh-error');
      // Don't disconnect - other modules may need it
    }

    // Clean up global references (use try-catch for non-configurable properties)
    const globalsToClean = ['meshModule'];
    for (const name of globalsToClean) {
      try {
        delete window[name];
      } catch (e) {
        // Property may be non-configurable, try setting to undefined
        try {
          window[name] = undefined;
        } catch (e2) {
          // Property may also be non-writable, just log and continue
          console.warn(`[MeshModule] Could not clean up window.${name}`);
        }
      }
    }

    // Call parent deactivate
    await super.deactivate();

    console.log('[MeshModule] Deactivated');
  }
}

// =============================================================================
// EXPORT
// =============================================================================

export default MeshModule;
