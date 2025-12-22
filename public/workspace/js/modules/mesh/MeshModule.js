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
 * - Multiple output formats: Three.js JSON, OBJ, STL
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
      targetClasses: 'all'
    };

    // =========================================================================
    // BIND METHODS
    // =========================================================================

    this.onFileSelected = this.onFileSelected.bind(this);
    this.onFileUploaded = this.onFileUploaded.bind(this);
    this.startGeneration = this.startGeneration.bind(this);
    this.onGenerationProgress = this.onGenerationProgress.bind(this);
    this.onGenerationComplete = this.onGenerationComplete.bind(this);
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
              <div id="validationResult"></div>

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
                <h4>Output Options</h4>

                <div class="form-field">
                  <label>Output Formats</label>
                  <div class="checkbox-group">
                    <label>
                      <input type="checkbox" id="formatJson" value="json" checked>
                      Three.js JSON (for 3D viewer)
                    </label>
                    <label>
                      <input type="checkbox" id="formatObj" value="obj" checked>
                      OBJ (Wavefront)
                    </label>
                    <label>
                      <input type="checkbox" id="formatStl" value="stl">
                      STL (3D printing)
                    </label>
                  </div>
                </div>

                <div class="form-field">
                  <label for="classSelection">Classes to Generate</label>
                  <select id="classSelection">
                    <option value="all" selected>All Classes</option>
                  </select>
                </div>

                <button id="startGenerationBtn" class="btn btn-primary" onclick="startGeneration()">
                  Generate Mesh
                </button>
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
                  <div id="progressBar" class="progress-fill" style="width: 0%"></div>
                </div>
                <div class="progress-details">
                  <span id="progressClassInfo">Preparing data...</span>
                </div>
              </div>

              <!-- Results Section (shown after generation) -->
              <div id="generationResults" class="results-section" style="display: none;">
                <div class="validation-success">
                  <div class="validation-header">Mesh Generation Complete!</div>
                  <div class="validation-details" id="resultsDetails"></div>
                </div>

                <div class="download-buttons" id="downloadButtons"></div>

                <div class="result-actions">
                  <button id="openVisualizationBtn" class="btn" onclick="openInVisualization()">
                    Open in 3D Visualization
                  </button>
                  <button id="generateAnotherBtn" class="btn secondary" onclick="generateAnother()">
                    Generate Another
                  </button>
                </div>
              </div>

              <!-- Navigation Buttons -->
              <div class="navigation-buttons">
                <button id="step2Back" class="btn secondary" onclick="previousStep()">
                  Back
                </button>
                <div></div>
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
        fileType: 'annotations', // Default file type for uploads
        title: 'Segmentation Data',
        icon: '🧩',
        showTestData: false,
        stateManager: this.state,
        onSelect: this.onFileSelected,
        onUpload: this.onFileUploaded,
        // Custom filter to show only segmentation results and annotations
        filterFiles: (files) => {
          return files.filter(f =>
            f.category === 'segmentations' ||
            f.category === 'annotations' ||
            f.category === 'segmented_stack'
          );
        }
      });

      fileSelectorContainer.innerHTML = this.fileSelector.render();
      await this.fileSelector.init();
    }

    // =========================================================================
    // Set Up Event Listeners
    // =========================================================================

    this.setupEventListeners();

    // =========================================================================
    // Initialize Socket.IO
    // =========================================================================

    await this.initializeSocket();

    // =========================================================================
    // Make Module Globally Accessible
    // =========================================================================

    window.meshModule = this;
    window.nextStep = () => this.nextStep();
    window.previousStep = () => this.previousStep();
    window.startGeneration = () => this.startGeneration();
    window.openInVisualization = () => this.openInVisualization();
    window.generateAnother = () => this.reset();

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
    // Back to Hub button
    const backButton = document.getElementById('backToHub');
    if (backButton) {
      backButton.addEventListener('click', () => {
        window.workspace.returnToHub();
      });
    }

    // Step 1 Next button
    const step1Next = document.getElementById('step1Next');
    if (step1Next) {
      step1Next.addEventListener('click', () => this.nextStep());
    }

    // Format checkboxes
    ['formatJson', 'formatObj', 'formatStl'].forEach(id => {
      const checkbox = document.getElementById(id);
      if (checkbox) {
        checkbox.addEventListener('change', () => this.updateGenerationOptions());
      }
    });
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
    const formats = [];
    if (document.getElementById('formatJson')?.checked) formats.push('json');
    if (document.getElementById('formatObj')?.checked) formats.push('obj');
    if (document.getElementById('formatStl')?.checked) formats.push('stl');

    this.generationOptions.outputFormats = formats;

    const classSelect = document.getElementById('classSelection');
    this.generationOptions.targetClasses = classSelect?.value || 'all';
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
            <img id="summaryPreviewImage" src="${previewUrl}" alt="Slice preview" onerror="this.parentElement.style.display='none'">
            <span class="preview-label">Slice ${middleSlice + 1} of ${this.dataInfo.dimensions[0]}</span>
          </div>
        </div>
      </div>
    `;
  }

  // ===========================================================================
  // MESH GENERATION
  // ===========================================================================

  async startGeneration() {
    console.log('[MeshModule] Starting mesh generation...');

    // Update options from UI
    this.updateGenerationOptions();

    // Validate at least one format selected
    if (this.generationOptions.outputFormats.length === 0) {
      this.state.notify('error', 'Please select at least one output format');
      return;
    }

    // Show progress, hide options
    document.getElementById('generationOptions').style.display = 'none';
    document.getElementById('generationProgress').style.display = 'block';

    // Reset and start elapsed time timer
    this.startElapsedTimer();

    // Reset progress UI
    this.updateProgressUI(0, 'Initializing...', 'Starting mesh generation...');

    try {
      const result = await this.api.generateMesh(
        this.selectedFile.path || this.selectedFile.id,
        {
          outputFormats: this.generationOptions.outputFormats,
          targetClasses: this.generationOptions.targetClasses
        }
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

    // Hide progress, show results
    document.getElementById('generationProgress').style.display = 'none';
    document.getElementById('generationResults').style.display = 'block';

    // Display results with elapsed time
    const elapsedTime = this.getElapsedTime();
    this.showGenerationResults(data, elapsedTime);

    this.saveState();
    this.state.notify('success', 'Mesh generation complete!');
  }

  onGenerationError(error) {
    console.error('[MeshModule] Generation error:', error);

    // Stop timer
    this.stopElapsedTimer();

    // Show options again
    document.getElementById('generationProgress').style.display = 'none';
    document.getElementById('generationOptions').style.display = 'block';

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
    const downloadBtns = document.getElementById('downloadButtons');

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
        ${elapsedTime ? `
        <div class="detail-row">
          <span>Generation Time:</span>
          <span>${elapsedTime}</span>
        </div>
        ` : ''}
      `;
    }

    if (downloadBtns && data.formats) {
      const formatIcons = { json: '📊', obj: '📐', stl: '🖨️' };
      downloadBtns.innerHTML = data.formats.map(format => `
        <button class="btn secondary download-btn" onclick="meshModule.downloadMesh('${format}')">
          ${formatIcons[format] || '📁'} Download ${format.toUpperCase()}
        </button>
      `).join('');
    }
  }

  downloadMesh(format) {
    if (!this.currentMeshId) return;

    const url = this.api.getDownloadUrl(this.currentMeshId, format);
    window.open(url, '_blank');
  }

  // ===========================================================================
  // MODULE NAVIGATION
  // ===========================================================================

  openInVisualization() {
    if (!this.meshResult) {
      this.state.notify('error', 'No mesh result available');
      return;
    }

    // Store result in state for visualization module
    this.state.update('modules.mesh.result', {
      meshId: this.currentMeshId,
      outputDir: this.meshResult.output_dir,
      formats: this.meshResult.formats,
      timestamp: Date.now()
    });

    // Navigate to visualization module (placeholder - will show notification for now)
    this.state.notify('info', 'Visualization module coming soon! Mesh saved to: ' + this.meshResult.output_dir);

    // When visualization module is ready:
    // window.workspace.loadModule('visualization');
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

    // Reset UI
    document.getElementById('generationOptions').style.display = 'block';
    document.getElementById('generationProgress').style.display = 'none';
    document.getElementById('generationResults').style.display = 'none';

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

    // Clear state
    this.state.update('modules.mesh', {});

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

          this.showGenerationResults(status.result);

        } else if (status.status === 'failed') {
          // Generation failed - reset to options
          console.log('[MeshModule] Generation failed:', status.error);
          this.currentMeshId = null;
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

    // Stop elapsed time timer
    this.stopElapsedTimer();

    // Disconnect socket event handlers
    if (this.socket) {
      this.socket.off('mesh-progress', this.onGenerationProgress);
      this.socket.off('mesh-complete', this.onGenerationComplete);
      this.socket.off('mesh-error');
      // Don't disconnect - other modules may need it
    }

    // Clean up global references
    delete window.meshModule;
    delete window.nextStep;
    delete window.previousStep;
    delete window.startGeneration;
    delete window.openInVisualization;
    delete window.generateAnother;

    // Call parent deactivate
    await super.deactivate();

    console.log('[MeshModule] Deactivated');
  }
}

// =============================================================================
// EXPORT
// =============================================================================

export default MeshModule;
