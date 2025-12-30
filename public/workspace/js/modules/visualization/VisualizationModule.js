/**
 * VisualizationModule - 3D Visualization Module
 *
 * Interactive 3D viewer for mesh files with per-class controls
 * and original data overlay support.
 *
 * Features:
 * - Step 1: Data selection (mesh JSON files from workspace)
 * - Step 2: 3D visualization with Three.js
 * - Per-class controls: visibility, opacity, clipping range
 * - Original data overlay via lineage tracking
 *
 * @module VisualizationModule
 */

// =============================================================================
// IMPORTS
// =============================================================================

import BaseModule from '/workspace/js/core/BaseModule.js';
import { StepNavigator, FileSelector, ValidationDisplay }
  from '/workspace/js/core/components/index.js';
import VisualizationAPI from './VisualizationAPI.js';

// =============================================================================
// MODULE CLASS
// =============================================================================

class VisualizationModule extends BaseModule {

  // ===========================================================================
  // CONSTRUCTOR
  // ===========================================================================

  constructor(stateManager) {
    super(stateManager, {
      id: 'visualization',
      name: '3D Visualization',
      cssPath: '/workspace/js/modules/visualization/css/visualization.css',
      steps: [
        { id: 'select', name: 'Data Selection' },
        { id: 'visualize', name: '3D Viewer' }
      ]
    });

    // =========================================================================
    // STEP CONDITION FLAGS
    // =========================================================================

    this.dataValidated = false;      // Step 1 complete -> can access Step 2
    this.visualizationReady = false; // Step 2 initialized

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
    this.meshData = null;           // Parsed JSON mesh data
    this.meshInfo = null;           // Mesh metadata (classes, statistics)
    this.originalDataFile = null;   // Original TIFF file from lineage

    // Three.js references (will be populated in Phase 2+)
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.meshGroup = null;
    this.classMeshes = {};       // For BufferGeometry format
    this.sliceMeshes = {};       // For VoxelSlices format
    this.sliceMetadata = null;   // Slice info for VoxelSlices format
    this.meshFormat = null;      // 'BufferGeometry' or 'VoxelSlices'
    this.volume = null;          // Dense volume data for endcap generation
    this.availableClasses = [];

    // Original data overlay
    this.originalDataPlanes = null;   // Array of plane meshes
    this.originalDataGroup = null;    // THREE.Group containing planes
    this.originalDataMetadata = null; // { numSlices, width, height }

    // Resize handler reference for cleanup
    this.handleResizeBound = null;

    // Fullscreen state
    this.isFullscreen = false;
    this.controlsVisible = true;

    // Persisted visualization state (survives module deactivation)
    this.persistedState = null;

    // =========================================================================
    // BIND METHODS
    // =========================================================================

    this.onFileSelected = this.onFileSelected.bind(this);
    this.onFileUploaded = this.onFileUploaded.bind(this);
    this.handleResize = this.handleResize.bind(this);
    this.toggleExpanded = this.toggleExpanded.bind(this);
    this.hideControls = this.hideControls.bind(this);
    this.showControls = this.showControls.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
  }

  // ===========================================================================
  // DEPENDENCY LOADING
  // ===========================================================================

  /**
   * Load Three.js and other required dependencies
   */
  async loadDependencies() {
    // Load Three.js if not already loaded
    if (typeof THREE === 'undefined') {
      console.log('[VisualizationModule] Loading Three.js...');
      await this.loadScript('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js');
      console.log('[VisualizationModule] Three.js loaded');
    }

    // Load UTIF.js for TIFF parsing (original data overlay)
    if (typeof UTIF === 'undefined') {
      console.log('[VisualizationModule] Loading UTIF.js...');
      await this.loadScript('https://cdn.jsdelivr.net/npm/utif@3.1.0/UTIF.js');
      console.log('[VisualizationModule] UTIF.js loaded');
    }
  }

  // ===========================================================================
  // RENDER METHOD
  // ===========================================================================

  render() {
    this.container.innerHTML = `
      <div class="viz-module module-container">
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
              <h3>Select Mesh Data</h3>
              <p class="step-description">
                Choose a mesh file to visualize. You can select from recent mesh generation results
                or upload a JSON mesh file.
              </p>

              <!-- File Selector Container -->
              <div id="fileSelectorContainer"></div>

              <!-- Validation Display -->
              <div id="validationResult"></div>

              <!-- Original Data Info (shown when lineage found) -->
              <div id="originalDataInfo" class="original-data-info" style="display: none;"></div>

              <!-- Navigation Buttons -->
              <div class="navigation-buttons">
                <div></div>
                <button id="step1Next" class="btn" disabled>
                  Next: View in 3D
                </button>
              </div>
            </div>
          </div>

          <!-- =============================================================== -->
          <!-- STEP 2: 3D Visualization -->
          <!-- =============================================================== -->
          <div id="step2" class="step-content">
            <div class="step-inner viz-step-2">
              <div class="viz-layout">
                <!-- Left: 3D Viewer -->
                <div class="viz-viewer-section">
                  <div id="threejsContainer" class="threejs-container">
                    <div class="viewer-placeholder">
                      <span class="placeholder-icon">🔬</span>
                      <span class="placeholder-text">Loading 3D viewer...</span>
                    </div>
                  </div>
                  <div class="viewer-toolbar">
                    <button id="resetViewBtn" class="btn secondary">
                      Reset View
                    </button>
                    <button id="expandBtn" class="btn">
                      Expand
                    </button>
                  </div>
                </div>

                <!-- Right: Control Panel (floats in expanded mode) -->
                <div class="viz-controls-section">
                  <div class="controls-header">
                    <h4>Visualization Controls</h4>
                    <button id="collapseControlsBtn" class="collapse-controls-btn" title="Hide controls">×</button>
                  </div>
                  <div id="classControlPanels" class="class-control-panels">
                    <p class="controls-placeholder">Controls will appear after mesh loads...</p>
                  </div>
                </div>

                <!-- Show controls button (only visible when controls are hidden in expanded mode) -->
                <button id="showControlsBtn" class="show-controls-btn">
                  ⚙ Controls
                </button>
              </div>

              <!-- Navigation Buttons -->
              <div class="navigation-buttons">
                <button id="step2Back" class="btn secondary">
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
    console.log('[VisualizationModule] Initializing components...');

    // Initialize API client
    this.api = new VisualizationAPI();

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
        id: 'viz_input',
        fileType: 'meshes',
        title: 'Mesh Data',
        icon: '🔬',
        accept: '.json',
        showTestData: false,
        showRecentResults: true,
        stateManager: this.state,
        onSelect: this.onFileSelected,
        onUpload: this.onFileUploaded,
        // Configure Recent Results to show only mesh files
        resultCategories: ['meshes'],
        resultCategoryLabels: {
          'meshes': 'Mesh'
        },
        // Filter workspace files to show mesh JSON files
        filterFiles: (files) => {
          return files.filter(f =>
            f.category === 'meshes' &&
            f.name && f.name.toLowerCase().endsWith('.json')
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
    // Make Module Globally Accessible
    // =========================================================================

    window.vizModule = this;
    window.nextStep = () => this.nextStep();
    window.previousStep = () => this.previousStep();

    // =========================================================================
    // Check for Preselected File (from MeshModule)
    // =========================================================================

    await this.checkForPreselectedFile();

    // =========================================================================
    // Check for Resume
    // =========================================================================

    await this.checkForResume();

    console.log('[VisualizationModule] Initialization complete');
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

    // Step 2 Back button
    const step2Back = document.getElementById('step2Back');
    if (step2Back) {
      step2Back.addEventListener('click', () => this.previousStep());
    }

    // Reset View button
    const resetViewBtn = document.getElementById('resetViewBtn');
    if (resetViewBtn) {
      resetViewBtn.addEventListener('click', () => this.resetView());
    }

    // Expand button
    const expandBtn = document.getElementById('expandBtn');
    if (expandBtn) {
      expandBtn.addEventListener('click', () => this.toggleExpanded());
    }

    // Collapse controls button (in expanded mode)
    const collapseControlsBtn = document.getElementById('collapseControlsBtn');
    if (collapseControlsBtn) {
      collapseControlsBtn.addEventListener('click', () => this.hideControls());
    }

    // Show controls button (in expanded mode when controls hidden)
    const showControlsBtn = document.getElementById('showControlsBtn');
    if (showControlsBtn) {
      showControlsBtn.addEventListener('click', () => this.showControls());
    }

    // Keyboard listener for Escape key (exits expanded mode)
    document.addEventListener('keydown', this.handleKeyDown);
  }

  // ===========================================================================
  // FILE SELECTION HANDLERS
  // ===========================================================================

  async onFileSelected(fileInfo) {
    console.log('[VisualizationModule] File selected:', fileInfo);

    this.selectedFile = fileInfo;

    // Show loading state
    this.validationDisplay.showLoading('Validating mesh file...');

    try {
      // Build API options for mesh module files
      const apiOptions = {};
      if (fileInfo.fromMeshModule) {
        apiOptions.fromMeshModule = true;
        apiOptions.meshId = fileInfo.meshId;
      }

      // Fetch and validate the mesh JSON
      const validationResult = await this.api.validateMeshFile(
        fileInfo.id || fileInfo.path,
        apiOptions
      );

      if (validationResult.success) {
        this.meshInfo = validationResult.info;

        // Show success with mesh info
        this.validationDisplay.showSuccess('Mesh File Valid', [
          { label: 'Classes', value: `${validationResult.info.classCount} classes detected` },
          { label: 'Format', value: validationResult.info.format || 'BufferGeometry' }
        ]);

        // Look up original data via lineage (skip for mesh module files - no lineage yet)
        if (!fileInfo.fromMeshModule) {
          await this.lookupOriginalData(fileInfo.id);
        }

        // Enable next button
        this.dataValidated = true;
        const step1Next = document.getElementById('step1Next');
        if (step1Next) step1Next.disabled = false;

        this.saveState();
      } else {
        await this.handleValidationFailure(fileInfo, validationResult.error);
      }
    } catch (error) {
      console.error('[VisualizationModule] Validation error:', error);
      await this.handleValidationFailure(fileInfo, error.message);
    }
  }

  async lookupOriginalData(fileId) {
    console.log('[VisualizationModule] Looking up original data via lineage...');

    const originalDataInfo = document.getElementById('originalDataInfo');

    try {
      const lineageResult = await this.api.getOriginalDataFile(fileId);

      if (lineageResult && lineageResult.originalDataFile) {
        this.originalDataFile = lineageResult.originalDataFile;
        console.log('[VisualizationModule] Original data file found:', this.originalDataFile);

        // Show original data info
        if (originalDataInfo) {
          originalDataInfo.style.display = 'block';
          originalDataInfo.innerHTML = `
            <div class="info-card success">
              <div class="info-icon">✓</div>
              <div class="info-content">
                <strong>Original Data Available</strong>
                <p>Source: ${this.originalDataFile.name}</p>
                <p class="info-note">Original data can be overlaid in the 3D viewer.</p>
              </div>
            </div>
          `;
        }
      } else {
        this.originalDataFile = null;
        console.log('[VisualizationModule] No original data found in lineage');

        if (originalDataInfo) {
          originalDataInfo.style.display = 'block';
          originalDataInfo.innerHTML = `
            <div class="info-card neutral">
              <div class="info-icon">ℹ</div>
              <div class="info-content">
                <strong>No Original Data</strong>
                <p>Original data overlay not available for this file.</p>
              </div>
            </div>
          `;
        }
      }
    } catch (error) {
      console.warn('[VisualizationModule] Lineage lookup failed:', error);
      this.originalDataFile = null;

      if (originalDataInfo) {
        originalDataInfo.style.display = 'none';
      }
    }
  }

  async handleValidationFailure(fileInfo, errorMessage) {
    let fileWasDeleted = false;

    // If the file was just uploaded, delete it
    if (fileInfo.isUploaded && fileInfo.id) {
      console.log('[VisualizationModule] Deleting invalid uploaded file:', fileInfo.id);
      try {
        const deleteResult = await this.api.deleteFile(fileInfo.id);
        if (deleteResult.success) {
          fileWasDeleted = true;
          this.state.notify('warning', 'Invalid file was not saved to workspace');
        }
      } catch (deleteError) {
        console.error('[VisualizationModule] Failed to delete invalid file:', deleteError);
      }

      // Refresh file selector
      if (this.fileSelector) {
        await this.fileSelector.refresh();
      }
    }

    // Clear selection state
    this.selectedFile = null;
    this.meshInfo = null;
    this.meshData = null;
    this.originalDataFile = null;
    this.dataValidated = false;

    // Clear file selector
    if (this.fileSelector) {
      this.fileSelector.clearSelection();
    }

    // Disable next button
    const step1Next = document.getElementById('step1Next');
    if (step1Next) step1Next.disabled = true;

    // Hide original data info
    const originalDataInfo = document.getElementById('originalDataInfo');
    if (originalDataInfo) originalDataInfo.style.display = 'none';

    // Show error
    const fullErrorMessage = fileWasDeleted
      ? `${errorMessage}\n\nThe file was not saved to your workspace.`
      : errorMessage;
    this.validationDisplay.showError('Invalid Mesh File', fullErrorMessage);
  }

  async onFileUploaded(file, uploadResult) {
    console.log('[VisualizationModule] File uploaded:', uploadResult);

    this.selectedFile = {
      name: uploadResult.name || file.name,
      path: uploadResult.path,
      id: uploadResult.id,
      isUploaded: true
    };

    // Trigger validation
    await this.onFileSelected(this.selectedFile);
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

    // Initialize visualization when entering step 2
    // Use requestAnimationFrame to ensure the layout has been calculated
    // after the step becomes visible (display: block)
    if (stepNumber === 2 && !this.visualizationReady) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          this.initializeVisualization();
        });
      });
    }
  }

  nextStep() {
    if (this.currentStep === 1 && !this.dataValidated) {
      this.state.notify('error', 'Please select a mesh file first');
      return;
    }

    super.nextStep();
  }

  // ===========================================================================
  // VISUALIZATION
  // ===========================================================================

  async initializeVisualization() {
    console.log('[VisualizationModule] Initializing 3D visualization...');

    const container = document.getElementById('threejsContainer');
    if (!container) {
      console.error('[VisualizationModule] Container not found');
      return;
    }

    // Helper to update loading status
    const updateLoadingStatus = (message, subtext = '') => {
      const textEl = container.querySelector('.placeholder-text');
      const subtextEl = container.querySelector('.placeholder-subtext');
      if (textEl) textEl.textContent = message;
      if (subtextEl) subtextEl.textContent = subtext;
    };

    // Show loading state
    container.innerHTML = `
      <div class="viewer-placeholder">
        <div class="loading-spinner"></div>
        <span class="placeholder-text">Initializing...</span>
        <span class="placeholder-subtext"></span>
      </div>
    `;

    try {
      // Load Three.js
      updateLoadingStatus('Loading 3D libraries...', 'Please wait');
      await this.loadDependencies();

      // Dynamically import visualization modules
      updateLoadingStatus('Loading visualization modules...');
      const vizModule = await import('./visualization/index.js');

      // Clear loading placeholder
      container.innerHTML = '';

      // Initialize the scene
      const sceneResult = vizModule.initializeScene(container);
      this.scene = sceneResult.scene;
      this.camera = sceneResult.camera;
      this.renderer = sceneResult.renderer;

      // Start render loop
      vizModule.startRenderLoop();

      // Set up window resize handling
      this.handleResizeBound = () => vizModule.handleResize(container);
      window.addEventListener('resize', this.handleResizeBound);

      // Load the actual mesh data
      if (this.selectedFile && (this.selectedFile.id || this.selectedFile.path)) {
        const fileId = this.selectedFile.id || this.selectedFile.path;
        console.log('[VisualizationModule] Fetching mesh data:', fileId);

        // Show loading overlay
        this.showLoadingOverlay('Fetching mesh data...', 'Please wait');

        // Build API options for mesh module files
        const apiOptions = {};
        if (this.selectedFile.fromMeshModule) {
          apiOptions.fromMeshModule = true;
          apiOptions.meshId = this.selectedFile.meshId;
        }

        const meshResult = await this.api.getMeshData(fileId, apiOptions);

        if (meshResult.success && meshResult.data) {
          // Update overlay for mesh generation
          this.updateLoadingOverlay('Generating 3D meshes...', `${meshResult.data.data?.length?.toLocaleString() || 'Unknown'} voxels`);

          // Load mesh from JSON (auto-detects format)
          const loadResult = vizModule.loadMeshFromJSON(meshResult.data, this.scene);

          // Store common data
          this.meshGroup = loadResult.meshGroup;
          this.availableClasses = loadResult.availableClasses;
          this.meshFormat = loadResult.format;

          // Store format-specific data
          if (loadResult.format === 'VoxelSlices') {
            this.sliceMeshes = loadResult.sliceMeshes;
            this.sliceMetadata = loadResult.sliceMetadata;
            this.classMeshes = {}; // Not used in this format

            // Store volume data for endcap generation
            this.volume = this.createVolumeFromData(meshResult.data);

            console.log(`[VisualizationModule] VoxelSlices format: ${loadResult.sliceMetadata.sliceCount} slices`);
          } else {
            this.classMeshes = loadResult.classMeshes;
            this.sliceMeshes = {}; // Not used in this format
            this.sliceMetadata = null;
            this.volume = null;
          }

          // Center the mesh (only for BufferGeometry - VoxelSlices is pre-centered)
          if (loadResult.format === 'BufferGeometry') {
            vizModule.centerMeshGroup(this.meshGroup);
          }

          // Position camera for mesh
          vizModule.positionCameraForMesh(this.meshGroup);

          // Set up mouse/keyboard controls
          vizModule.setupEnhancedControls(this.renderer, this.meshGroup, this.camera);

          // Set up double-click reset
          vizModule.setupDoubleClickReset(this.renderer.domElement, () => this.resetView());

          // Load original data overlay if available
          if (this.originalDataFile && loadResult.sliceMetadata?.shape) {
            this.updateLoadingOverlay('Loading original data overlay...', 'Creating texture planes');
            await this.loadOriginalDataOverlay(loadResult.sliceMetadata.shape);
          }

          // Hide loading overlay
          this.hideLoadingOverlay();

          // Update control panel with class controls
          this.renderClassControls();

          this.visualizationReady = true;

          // Restore previous state if available (e.g., after navigating back)
          this.restoreVisualizationState();

          const formatLabel = loadResult.format === 'VoxelSlices' ? 'slice meshes' : 'class meshes';
          console.log(`[VisualizationModule] Mesh loaded: ${this.availableClasses.length} classes (${loadResult.format})`);
          this.state.notify('success', `Loaded ${this.availableClasses.length} ${formatLabel}`);

        } else {
          throw new Error(meshResult.error || 'Failed to load mesh data');
        }
      } else {
        throw new Error('No file selected');
      }

    } catch (error) {
      console.error('[VisualizationModule] Initialization error:', error);
      this.hideLoadingOverlay(); // Ensure overlay is hidden on error
      container.innerHTML = `
        <div class="viewer-placeholder error">
          <span class="placeholder-icon">❌</span>
          <span class="placeholder-text">Failed to load mesh</span>
          <span class="placeholder-subtext">${error.message}</span>
        </div>
      `;
      this.state.notify('error', `Failed to load mesh: ${error.message}`);
    }
  }

  /**
   * Render class control panels
   */
  renderClassControls() {
    const controlsPanel = document.getElementById('classControlPanels');
    if (!controlsPanel) return;

    if (!this.availableClasses || this.availableClasses.length === 0) {
      controlsPanel.innerHTML = '<p class="controls-placeholder">No class data available</p>';
      return;
    }

    // Import utils for colors
    import('./visualization/utils.js').then(utils => {
      let html = '';
      const isSliceBased = this.meshFormat === 'VoxelSlices';
      const sliceCount = this.sliceMetadata?.sliceCount || 20;

      // Add Original Data control panel (if original data is available)
      if (this.originalDataFile) {
        const numSlices = this.originalDataMetadata?.numSlices || 0;
        html += `
          <div class="class-control-panel original-data-panel" data-type="original-data">
            <div class="class-checkbox-section">
              <input type="checkbox"
                     id="originalDataVisible"
                     class="class-checkbox"
                     onchange="vizModule.toggleOriginalDataVisibility(this.checked)">
              <label for="originalDataVisible" class="class-label" style="color: #888">
                Original Data
              </label>
            </div>
            <div class="class-opacity-section">
              <span class="class-opacity-label">Opacity</span>
              <input type="range"
                     id="originalDataOpacity"
                     class="class-opacity-slider"
                     min="5" max="100" value="30"
                     oninput="vizModule.setOriginalDataOpacityValue(this.value / 100)">
              <span id="originalDataOpacityValue" class="class-opacity-value">30%</span>
            </div>
            ${numSlices > 1 ? `
            <div class="class-range-section">
              <span class="class-range-label">Range</span>
              <div class="dual-range-container" id="rangeContainerOriginal">
                <div class="dual-range-track"></div>
                <div class="dual-range-fill" id="rangeFillOriginal"></div>
                <input type="range"
                       id="rangeMinOriginal"
                       class="dual-range-input"
                       min="0" max="${numSlices - 1}" value="0"
                       oninput="vizModule.updateOriginalDataSliceRange()">
                <input type="range"
                       id="rangeMaxOriginal"
                       class="dual-range-input"
                       min="0" max="${numSlices - 1}" value="${numSlices - 1}"
                       oninput="vizModule.updateOriginalDataSliceRange()">
              </div>
              <span id="rangeValueOriginal" class="class-range-value">0-100%</span>
            </div>
            ` : ''}
          </div>
        `;
      }

      // Add class control panels
      for (const classId of this.availableClasses) {
        const colorCss = utils.getClassColor(classId);

        html += `
          <div class="class-control-panel" data-class-id="${classId}">
            <div class="class-checkbox-section">
              <input type="checkbox"
                     id="classVisible${classId}"
                     class="class-checkbox"
                     checked
                     onchange="vizModule.toggleClassVisibility(${classId}, this.checked)">
              <label for="classVisible${classId}" class="class-label" style="color: ${colorCss}">
                Class ${classId}
              </label>
            </div>
            <div class="class-opacity-section">
              <span class="class-opacity-label">Opacity</span>
              <input type="range"
                     id="classOpacity${classId}"
                     class="class-opacity-slider"
                     min="10" max="100" value="80"
                     oninput="vizModule.setClassOpacity(${classId}, this.value / 100)">
              <span id="classOpacityValue${classId}" class="class-opacity-value">80%</span>
            </div>
            ${isSliceBased ? `
            <div class="class-range-section">
              <span class="class-range-label">Range</span>
              <div class="dual-range-container" id="rangeContainer${classId}">
                <div class="dual-range-track"></div>
                <div class="dual-range-fill" id="rangeFill${classId}"></div>
                <input type="range"
                       id="rangeMin${classId}"
                       class="dual-range-input"
                       min="0" max="${sliceCount - 1}" value="0"
                       oninput="vizModule.updateSliceRange(${classId})">
                <input type="range"
                       id="rangeMax${classId}"
                       class="dual-range-input"
                       min="0" max="${sliceCount - 1}" value="${sliceCount - 1}"
                       oninput="vizModule.updateSliceRange(${classId})">
              </div>
              <span id="rangeValue${classId}" class="class-range-value">0-100%</span>
            </div>
            ` : ''}
          </div>
        `;
      }

      controlsPanel.innerHTML = html;

      // Initialize range fills for slice-based meshes
      if (isSliceBased) {
        for (const classId of this.availableClasses) {
          this.updateRangeFill(classId);
        }
      }

      // Initialize original data range fill
      if (this.originalDataFile && this.originalDataMetadata?.numSlices > 1) {
        this.updateOriginalDataRangeFill();
      }
    });
  }

  /**
   * Update range fill visual for dual-range slider
   */
  updateRangeFill(classId) {
    const minInput = document.getElementById(`rangeMin${classId}`);
    const maxInput = document.getElementById(`rangeMax${classId}`);
    const fill = document.getElementById(`rangeFill${classId}`);

    if (!minInput || !maxInput || !fill) return;

    const min = parseInt(minInput.value);
    const max = parseInt(maxInput.value);
    const sliceCount = this.sliceMetadata?.sliceCount || 20;

    const leftPercent = (min / (sliceCount - 1)) * 100;
    const rightPercent = (max / (sliceCount - 1)) * 100;

    fill.style.left = `${leftPercent}%`;
    fill.style.width = `${rightPercent - leftPercent}%`;
  }

  /**
   * Update slice range for a class (called from dual-range slider)
   */
  updateSliceRange(classId) {
    const minInput = document.getElementById(`rangeMin${classId}`);
    const maxInput = document.getElementById(`rangeMax${classId}`);
    const valueSpan = document.getElementById(`rangeValue${classId}`);

    if (!minInput || !maxInput) return;

    let min = parseInt(minInput.value);
    let max = parseInt(maxInput.value);
    const sliceCount = this.sliceMetadata?.sliceCount || 20;

    // Ensure min <= max
    if (min > max) {
      if (minInput === document.activeElement) {
        max = min;
        maxInput.value = max;
      } else {
        min = max;
        minInput.value = min;
      }
    }

    // Update fill visual
    this.updateRangeFill(classId);

    // Update value display
    const minPercent = Math.round((min / (sliceCount - 1)) * 100);
    const maxPercent = Math.round((max / (sliceCount - 1)) * 100);
    if (valueSpan) {
      valueSpan.textContent = `${minPercent}-${maxPercent}%`;
    }

    // Apply to slices
    this.setClassSliceRange(classId, min, max);
  }

  /**
   * Set slice range visibility for a class and generate endcaps
   */
  setClassSliceRange(classId, minSlice, maxSlice) {
    if (!this.sliceMeshes[classId]) return;

    // Update slice visibility
    this.sliceMeshes[classId].forEach((mesh, index) => {
      if (mesh) {
        mesh.visible = (index >= minSlice && index <= maxSlice);
      }
    });

    // Generate endcaps if we have volume data
    if (this.volume && this.sliceMetadata) {
      const sliceCount = this.sliceMetadata.sliceCount || 20;
      const minPercent = (minSlice / (sliceCount - 1)) * 100;
      const maxPercent = (maxSlice / (sliceCount - 1)) * 100;

      // Import and call clipping function
      import('./visualization/clipping.js').then(clipping => {
        clipping.updateAccurateCapping(
          { [classId]: { min: minPercent, max: maxPercent } },
          {
            sliceMeshes: this.sliceMeshes,
            sliceMetadata: this.sliceMetadata,
            meshGroup: this.meshGroup,
            volume: this.volume
          }
        );
      });
    }
  }

  // ===========================================================================
  // ORIGINAL DATA OVERLAY CONTROLS
  // ===========================================================================

  /**
   * Toggle original data visibility
   */
  toggleOriginalDataVisibility(visible) {
    if (this.originalDataGroup) {
      import('./visualization/meshCreation.js').then(meshCreation => {
        meshCreation.setOriginalDataVisibility(this.originalDataGroup, visible);
      });
    }
  }

  /**
   * Set original data opacity
   */
  setOriginalDataOpacityValue(opacity) {
    // Update value display
    const valueSpan = document.getElementById('originalDataOpacityValue');
    if (valueSpan) {
      valueSpan.textContent = `${Math.round(opacity * 100)}%`;
    }

    // Apply opacity
    if (this.originalDataPlanes) {
      import('./visualization/meshCreation.js').then(meshCreation => {
        meshCreation.setOriginalDataOpacity(this.originalDataPlanes, opacity);
      });
    }
  }

  /**
   * Update original data slice range
   */
  updateOriginalDataSliceRange() {
    const minInput = document.getElementById('rangeMinOriginal');
    const maxInput = document.getElementById('rangeMaxOriginal');
    const valueSpan = document.getElementById('rangeValueOriginal');

    if (!minInput || !maxInput) return;

    let min = parseInt(minInput.value);
    let max = parseInt(maxInput.value);
    const numSlices = this.originalDataMetadata?.numSlices || 1;

    // Ensure min <= max
    if (min > max) {
      if (minInput === document.activeElement) {
        max = min;
        maxInput.value = max;
      } else {
        min = max;
        minInput.value = min;
      }
    }

    // Update fill visual
    this.updateOriginalDataRangeFill();

    // Update value display
    const minPercent = numSlices > 1 ? Math.round((min / (numSlices - 1)) * 100) : 0;
    const maxPercent = numSlices > 1 ? Math.round((max / (numSlices - 1)) * 100) : 100;
    if (valueSpan) {
      valueSpan.textContent = `${minPercent}-${maxPercent}%`;
    }

    // Apply to planes
    if (this.originalDataPlanes) {
      import('./visualization/meshCreation.js').then(meshCreation => {
        meshCreation.setOriginalDataSliceRange(this.originalDataPlanes, min, max);
      });
    }
  }

  /**
   * Update range fill visual for original data dual-range slider
   */
  updateOriginalDataRangeFill() {
    const minInput = document.getElementById('rangeMinOriginal');
    const maxInput = document.getElementById('rangeMaxOriginal');
    const fill = document.getElementById('rangeFillOriginal');

    if (!minInput || !maxInput || !fill) return;

    const min = parseInt(minInput.value);
    const max = parseInt(maxInput.value);
    const numSlices = this.originalDataMetadata?.numSlices || 1;

    if (numSlices <= 1) {
      fill.style.left = '0%';
      fill.style.width = '100%';
      return;
    }

    const leftPercent = (min / (numSlices - 1)) * 100;
    const rightPercent = (max / (numSlices - 1)) * 100;

    fill.style.left = `${leftPercent}%`;
    fill.style.width = `${rightPercent - leftPercent}%`;
  }

  /**
   * Load original data overlay from TIFF file
   * @param {Array} shape - Mesh shape [depth, height, width] for alignment
   */
  async loadOriginalDataOverlay(shape) {
    if (!this.originalDataFile || !this.scene) {
      console.log('[VisualizationModule] No original data file or scene available');
      return;
    }

    try {
      console.log('[VisualizationModule] Loading original data overlay...');

      // Get the URL for the original data TIFF
      const tiffUrl = this.api.getOriginalDataUrl(this.originalDataFile.id || this.originalDataFile.path);
      console.log('[VisualizationModule] Original data URL:', tiffUrl);

      // Import and call the loader - add to meshGroup so planes rotate with mesh
      const meshCreation = await import('./visualization/meshCreation.js');
      const result = await meshCreation.loadAndCreateOriginalDataPlanes(tiffUrl, shape, this.meshGroup);

      if (result) {
        this.originalDataPlanes = result.planes;
        this.originalDataGroup = result.planeGroup;
        this.originalDataMetadata = result.metadata;

        console.log(`[VisualizationModule] Original data loaded: ${result.metadata.numSlices} planes`);
      } else {
        console.log('[VisualizationModule] Original data not available');
        // Clear the original data file reference since it's not usable
        this.originalDataFile = null;
      }
    } catch (error) {
      console.warn('[VisualizationModule] Failed to load original data overlay:', error);
      this.originalDataFile = null;
    }
  }

  /**
   * Create dense volume array from sparse voxel data
   * @param {Object} data - VoxelSlices JSON data
   * @returns {Uint8Array} - Dense volume array
   */
  createVolumeFromData(data) {
    if (!data || !data.shape || !data.data) return null;

    const [depth, height, width] = data.shape;
    const volume = new Uint8Array(depth * height * width);

    // Convert sparse to dense
    data.data.forEach(voxel => {
      const index = voxel.z * (height * width) + voxel.y * width + voxel.x;
      volume[index] = voxel.value;
    });

    console.log(`[VisualizationModule] Created volume: ${depth}x${height}x${width}`);
    return volume;
  }

  /**
   * Toggle class visibility
   */
  toggleClassVisibility(classId, visible) {
    if (this.meshFormat === 'VoxelSlices') {
      // For slice-based meshes, toggle all slices
      if (this.sliceMeshes[classId]) {
        // Get current range to respect it
        const minInput = document.getElementById(`rangeMin${classId}`);
        const maxInput = document.getElementById(`rangeMax${classId}`);
        const min = minInput ? parseInt(minInput.value) : 0;
        const max = maxInput ? parseInt(maxInput.value) : (this.sliceMetadata?.sliceCount || 20) - 1;

        this.sliceMeshes[classId].forEach((mesh, index) => {
          if (mesh) {
            // Only show if within range AND visibility is on
            mesh.visible = visible && (index >= min && index <= max);
          }
        });

        // Also toggle capping mesh visibility
        import('./visualization/clipping.js').then(clipping => {
          clipping.setCappingVisibility(classId, visible);
        });
      }
    } else {
      // For BufferGeometry, toggle single mesh
      const mesh = this.classMeshes[classId];
      if (mesh) {
        mesh.visible = visible;
      }
    }
  }

  /**
   * Set class opacity
   */
  setClassOpacity(classId, opacity) {
    if (this.meshFormat === 'VoxelSlices') {
      // For slice-based meshes, set opacity on all slices
      if (this.sliceMeshes[classId]) {
        this.sliceMeshes[classId].forEach(mesh => {
          if (mesh && mesh.material) {
            mesh.material.opacity = opacity;
            mesh.material.transparent = opacity < 1;
            mesh.material.needsUpdate = true;
          }
        });

        // Also update capping mesh opacity
        import('./visualization/clipping.js').then(clipping => {
          clipping.setCappingOpacity(classId, opacity);
        });
      }
    } else {
      // For BufferGeometry, set on single mesh
      const mesh = this.classMeshes[classId];
      if (mesh && mesh.material) {
        mesh.material.opacity = opacity;
        mesh.material.transparent = opacity < 1;
        mesh.material.needsUpdate = true;
      }
    }

    // Update display value
    const valueSpan = document.getElementById(`classOpacityValue${classId}`);
    if (valueSpan) {
      valueSpan.textContent = `${Math.round(opacity * 100)}%`;
    }
  }

  /**
   * Show loading overlay on canvas
   */
  showLoadingOverlay(message = 'Loading...', subtext = '') {
    const container = document.getElementById('threejsContainer');
    if (!container) return;

    // Remove existing overlay if present
    this.hideLoadingOverlay();

    const overlay = document.createElement('div');
    overlay.id = 'vizLoadingOverlay';
    overlay.className = 'viz-loading-overlay';
    overlay.innerHTML = `
      <div class="loading-spinner"></div>
      <span class="placeholder-text">${message}</span>
      <span class="placeholder-subtext">${subtext}</span>
    `;
    container.appendChild(overlay);
  }

  /**
   * Hide loading overlay
   */
  hideLoadingOverlay() {
    const overlay = document.getElementById('vizLoadingOverlay');
    if (overlay) {
      overlay.remove();
    }
  }

  /**
   * Update loading overlay message
   */
  updateLoadingOverlay(message, subtext = '') {
    const overlay = document.getElementById('vizLoadingOverlay');
    if (overlay) {
      const textEl = overlay.querySelector('.placeholder-text');
      const subtextEl = overlay.querySelector('.placeholder-subtext');
      if (textEl) textEl.textContent = message;
      if (subtextEl) subtextEl.textContent = subtext;
    }
  }

  /**
   * Handle window resize
   */
  handleResize() {
    if (!this.camera || !this.renderer) return;

    const container = document.getElementById('threejsContainer');
    if (!container) return;

    this.camera.aspect = container.clientWidth / container.clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(container.clientWidth, container.clientHeight);
  }

  /**
   * Reset the view to default state (rotation, position, and all controls)
   */
  resetView() {
    console.log('[VisualizationModule] Resetting view...');

    if (this.meshGroup) {
      // Reset rotation and position
      this.meshGroup.rotation.set(0, 0, 0);
      this.meshGroup.position.set(0, 0, 0);
    }

    if (this.camera && this.meshGroup) {
      // Re-position camera
      import('./visualization/index.js').then(vizModule => {
        vizModule.positionCameraForMesh(this.meshGroup);
      });
    }

    // Reset all class controls to defaults
    this.resetAllControls();

    this.state.notify('info', 'View reset');
  }

  /**
   * Reset all class controls to their default values
   */
  resetAllControls() {
    const isSliceBased = this.meshFormat === 'VoxelSlices';

    // Reset each class
    this.availableClasses.forEach(classId => {
      // Reset visibility to true
      const visCheckbox = document.getElementById(`classVisible${classId}`);
      if (visCheckbox) {
        visCheckbox.checked = true;
        this.toggleClassVisibility(classId, true);
      }

      // Reset opacity to 80%
      const opacitySlider = document.getElementById(`classOpacity${classId}`);
      const opacityValue = document.getElementById(`opacityValue${classId}`);
      if (opacitySlider) {
        opacitySlider.value = 80;
        if (opacityValue) opacityValue.textContent = '80%';
        this.setClassOpacity(classId, 0.8);
      }

      // Reset range sliders to full range (for slice-based meshes)
      if (isSliceBased) {
        const rangeMin = document.getElementById(`rangeMin${classId}`);
        const rangeMax = document.getElementById(`rangeMax${classId}`);
        const rangeValue = document.getElementById(`rangeValue${classId}`);

        if (rangeMin && rangeMax) {
          rangeMin.value = 0;
          rangeMax.value = this.sliceMetadata?.sliceCount - 1 || 19;
          if (rangeValue) rangeValue.textContent = '0-100%';
          this.updateRangeFill(classId);
          this.updateSliceRange(classId);
        }
      }
    });

    // Reset original data controls (if present)
    if (this.originalDataMetadata) {
      const origVisCheckbox = document.getElementById('originalDataVisible');
      const origOpacitySlider = document.getElementById('originalDataOpacity');
      const origOpacityValue = document.getElementById('originalDataOpacityValue');
      const origRangeMin = document.getElementById('originalDataRangeMin');
      const origRangeMax = document.getElementById('originalDataRangeMax');
      const origRangeValue = document.getElementById('originalDataRangeValue');

      // Reset to hidden
      if (origVisCheckbox) {
        origVisCheckbox.checked = false;
        this.toggleOriginalDataVisibility(false);
      }

      // Reset opacity to 30%
      if (origOpacitySlider) {
        origOpacitySlider.value = 30;
        if (origOpacityValue) origOpacityValue.textContent = '30%';
        this.setOriginalDataOpacityValue(0.3);
      }

      // Reset range to full
      if (origRangeMin && origRangeMax) {
        const numSlices = this.originalDataMetadata.numSlices;
        origRangeMin.value = 0;
        origRangeMax.value = numSlices - 1;
        if (origRangeValue) origRangeValue.textContent = `0 - ${numSlices - 1}`;
        this.updateOriginalDataRangeFill();
        this.updateOriginalDataSliceRange();
      }
    }

    console.log('[VisualizationModule] All controls reset to defaults');
  }

  /**
   * Save current visualization state for persistence
   */
  saveVisualizationState() {
    if (!this.visualizationReady) return;

    const state = {
      meshFileId: this.selectedFile?.id,
      classes: {},
      originalData: null,
      camera: null,
      meshTransform: null
    };

    // Save class states
    this.availableClasses.forEach(classId => {
      const visCheckbox = document.getElementById(`classVisible${classId}`);
      const opacitySlider = document.getElementById(`classOpacity${classId}`);
      const rangeMin = document.getElementById(`rangeMin${classId}`);
      const rangeMax = document.getElementById(`rangeMax${classId}`);

      const defaultMaxSlice = (this.sliceMetadata?.sliceCount || 20) - 1;
      state.classes[classId] = {
        visible: visCheckbox?.checked ?? true,
        opacity: opacitySlider ? parseInt(opacitySlider.value) : 80,
        rangeMin: rangeMin ? parseInt(rangeMin.value) : 0,
        rangeMax: rangeMax ? parseInt(rangeMax.value) : defaultMaxSlice
      };
    });

    // Save original data state
    if (this.originalDataMetadata) {
      const origVisCheckbox = document.getElementById('originalDataVisible');
      const origOpacitySlider = document.getElementById('originalDataOpacity');
      const origRangeMin = document.getElementById('originalDataRangeMin');
      const origRangeMax = document.getElementById('originalDataRangeMax');

      state.originalData = {
        visible: origVisCheckbox?.checked ?? false,
        opacity: origOpacitySlider ? parseInt(origOpacitySlider.value) : 30,
        rangeMin: origRangeMin ? parseInt(origRangeMin.value) : 0,
        rangeMax: origRangeMax ? parseInt(origRangeMax.value) : (this.originalDataMetadata.numSlices - 1)
      };
    }

    // Save camera position
    if (this.camera) {
      state.camera = {
        x: this.camera.position.x,
        y: this.camera.position.y,
        z: this.camera.position.z
      };
    }

    // Save mesh transform
    if (this.meshGroup) {
      state.meshTransform = {
        position: { x: this.meshGroup.position.x, y: this.meshGroup.position.y, z: this.meshGroup.position.z },
        rotation: { x: this.meshGroup.rotation.x, y: this.meshGroup.rotation.y, z: this.meshGroup.rotation.z }
      };
    }

    this.persistedState = state;
    console.log('[VisualizationModule] State saved:', state);
  }

  /**
   * Restore previously saved visualization state
   */
  restoreVisualizationState() {
    if (!this.persistedState || !this.visualizationReady) return;

    const state = this.persistedState;
    console.log('[VisualizationModule] Restoring state:', state);

    // Restore class states
    Object.entries(state.classes).forEach(([classId, classState]) => {
      // Restore visibility
      const visCheckbox = document.getElementById(`classVisible${classId}`);
      if (visCheckbox) {
        visCheckbox.checked = classState.visible;
        this.toggleClassVisibility(classId, classState.visible);
      }

      // Restore opacity
      const opacitySlider = document.getElementById(`classOpacity${classId}`);
      const opacityValue = document.getElementById(`opacityValue${classId}`);
      if (opacitySlider) {
        opacitySlider.value = classState.opacity;
        if (opacityValue) opacityValue.textContent = `${classState.opacity}%`;
        this.setClassOpacity(classId, classState.opacity / 100);
      }

      // Restore range (for slice-based meshes)
      if (this.meshFormat === 'VoxelSlices') {
        const rangeMin = document.getElementById(`rangeMin${classId}`);
        const rangeMax = document.getElementById(`rangeMax${classId}`);

        if (rangeMin && rangeMax) {
          rangeMin.value = classState.rangeMin;
          rangeMax.value = classState.rangeMax;
          this.updateRangeFill(classId);
          this.updateSliceRange(classId); // This updates the text display and applies to slices
        }
      }
    });

    // Restore original data state
    if (state.originalData && this.originalDataMetadata) {
      const origVisCheckbox = document.getElementById('originalDataVisible');
      const origOpacitySlider = document.getElementById('originalDataOpacity');
      const origOpacityValue = document.getElementById('originalDataOpacityValue');
      const origRangeMin = document.getElementById('originalDataRangeMin');
      const origRangeMax = document.getElementById('originalDataRangeMax');
      const origRangeValue = document.getElementById('originalDataRangeValue');

      if (origVisCheckbox) {
        origVisCheckbox.checked = state.originalData.visible;
        this.toggleOriginalDataVisibility(state.originalData.visible);
      }

      if (origOpacitySlider) {
        origOpacitySlider.value = state.originalData.opacity;
        if (origOpacityValue) origOpacityValue.textContent = `${state.originalData.opacity}%`;
        this.setOriginalDataOpacityValue(state.originalData.opacity / 100);
      }

      if (origRangeMin && origRangeMax) {
        origRangeMin.value = state.originalData.rangeMin;
        origRangeMax.value = state.originalData.rangeMax;
        if (origRangeValue) origRangeValue.textContent = `${state.originalData.rangeMin} - ${state.originalData.rangeMax}`;
        this.updateOriginalDataRangeFill();
        this.updateOriginalDataSliceRange();
      }
    }

    // Restore camera position
    if (state.camera && this.camera) {
      this.camera.position.set(state.camera.x, state.camera.y, state.camera.z);
    }

    // Restore mesh transform
    if (state.meshTransform && this.meshGroup) {
      this.meshGroup.position.set(
        state.meshTransform.position.x,
        state.meshTransform.position.y,
        state.meshTransform.position.z
      );
      this.meshGroup.rotation.set(
        state.meshTransform.rotation.x,
        state.meshTransform.rotation.y,
        state.meshTransform.rotation.z
      );
    }

    console.log('[VisualizationModule] State restored');
  }

  // ===========================================================================
  // EXPANDED MODE
  // ===========================================================================

  /**
   * Toggle between normal and expanded mode
   */
  toggleExpanded() {
    this.isFullscreen = !this.isFullscreen;

    const moduleContainer = this.container.querySelector('.viz-module');
    const expandBtn = document.getElementById('expandBtn');

    if (this.isFullscreen) {
      console.log('[VisualizationModule] Entering expanded mode');
      moduleContainer.classList.add('expanded-mode');

      // Update button text
      if (expandBtn) {
        expandBtn.textContent = 'Collapse';
      }

      // Show controls by default in expanded mode
      this.controlsVisible = true;
      const controlsSection = document.querySelector('.viz-controls-section');
      if (controlsSection) {
        controlsSection.classList.remove('hidden');
      }
    } else {
      console.log('[VisualizationModule] Exiting expanded mode');
      moduleContainer.classList.remove('expanded-mode');

      // Update button text
      if (expandBtn) {
        expandBtn.textContent = 'Expand';
      }

      // Ensure controls are visible in normal mode
      this.controlsVisible = true;
      const controlsSection = document.querySelector('.viz-controls-section');
      if (controlsSection) {
        controlsSection.classList.remove('hidden');
      }
    }

    // Trigger resize to adjust canvas
    setTimeout(() => {
      this.handleResize();
      if (this.handleResizeBound) {
        this.handleResizeBound();
      }
    }, 50);
  }

  /**
   * Hide controls panel (only in expanded mode)
   */
  hideControls() {
    if (!this.isFullscreen) return;

    this.controlsVisible = false;
    const controlsSection = document.querySelector('.viz-controls-section');
    const showControlsBtn = document.getElementById('showControlsBtn');

    if (controlsSection) {
      controlsSection.classList.add('hidden');
    }
    if (showControlsBtn) {
      showControlsBtn.classList.add('visible');
    }

    // Trigger resize
    setTimeout(() => {
      this.handleResize();
      if (this.handleResizeBound) {
        this.handleResizeBound();
      }
    }, 50);
  }

  /**
   * Show controls panel (only in expanded mode)
   */
  showControls() {
    if (!this.isFullscreen) return;

    this.controlsVisible = true;
    const controlsSection = document.querySelector('.viz-controls-section');
    const showControlsBtn = document.getElementById('showControlsBtn');

    if (controlsSection) {
      controlsSection.classList.remove('hidden');
    }
    if (showControlsBtn) {
      showControlsBtn.classList.remove('visible');
    }

    // Trigger resize
    setTimeout(() => {
      this.handleResize();
      if (this.handleResizeBound) {
        this.handleResizeBound();
      }
    }, 50);
  }

  /**
   * Handle keyboard events (Escape to exit expanded mode)
   */
  handleKeyDown(event) {
    if (event.key === 'Escape' && this.isFullscreen) {
      this.toggleExpanded();
    }
  }

  // ===========================================================================
  // PRESELECTED FILE (From MeshModule)
  // ===========================================================================

  async checkForPreselectedFile() {
    const meshResult = this.state.get('modules.mesh.result');

    if (meshResult && meshResult.jsonFile) {
      console.log('[VisualizationModule] Found preselected mesh from MeshModule:', meshResult);

      // Clear the preselection so it doesn't trigger again
      this.state.update('modules.mesh.result', null);

      try {
        // Use the file info directly from the mesh result
        this.selectedFile = {
          id: meshResult.jsonFile.id,
          path: meshResult.jsonFile.path,
          name: meshResult.jsonFile.name,
          fromMeshModule: true,
          meshId: meshResult.meshId  // Include meshId for API calls
        };

        console.log('[VisualizationModule] Using preselected file:', this.selectedFile);

        // Update file selector UI to show the selected file
        if (this.fileSelector) {
          this.fileSelector.setSelectedFile(this.selectedFile);
        }

        // Trigger validation
        await this.onFileSelected(this.selectedFile);

        // Auto-advance to step 2 if validation passed
        if (this.dataValidated) {
          this.state.notify('success', 'Mesh loaded from generation result');
          this.goToStep(2);
        }
      } catch (error) {
        console.warn('[VisualizationModule] Failed to load preselected mesh:', error);
        this.state.notify('error', 'Failed to load mesh: ' + error.message);
      }
    } else if (meshResult && meshResult.meshId) {
      // Fallback: try to get file info via API (legacy support)
      console.log('[VisualizationModule] Found preselected mesh (legacy format):', meshResult);
      this.state.update('modules.mesh.result', null);

      try {
        const meshFile = await this.api.getMeshFileFromResult(meshResult.meshId);

        if (meshFile && meshFile.success) {
          this.selectedFile = {
            id: meshFile.fileId,
            path: meshFile.path,
            name: meshFile.name,
            fromMeshModule: true,
            meshId: meshResult.meshId  // Include meshId for API calls
          };

          // Update file selector UI
          if (this.fileSelector) {
            this.fileSelector.setSelectedFile(this.selectedFile);
          }

          await this.onFileSelected(this.selectedFile);

          if (this.dataValidated) {
            this.state.notify('success', 'Mesh loaded from generation result');
            this.goToStep(2);
          }
        }
      } catch (error) {
        console.warn('[VisualizationModule] Failed to load preselected mesh:', error);
      }
    }
  }

  // ===========================================================================
  // STATE PERSISTENCE
  // ===========================================================================

  saveState() {
    this.state.update('modules.visualization.currentStep', this.currentStep);
    this.state.update('modules.visualization.selectedFile', this.selectedFile);
    this.state.update('modules.visualization.meshInfo', this.meshInfo);
    this.state.update('modules.visualization.dataValidated', this.dataValidated);
    this.state.update('modules.visualization.originalDataFile', this.originalDataFile);
  }

  async checkForResume() {
    const vizState = this.state.get('modules.visualization');
    if (!vizState) return;

    // Restore state
    if (vizState.selectedFile) {
      this.selectedFile = vizState.selectedFile;
    }
    if (vizState.meshInfo) {
      this.meshInfo = vizState.meshInfo;
    }
    if (vizState.originalDataFile) {
      this.originalDataFile = vizState.originalDataFile;
    }
    if (vizState.dataValidated) {
      this.dataValidated = true;
      const step1Next = document.getElementById('step1Next');
      if (step1Next) step1Next.disabled = false;
    }

    // Restore step
    if (vizState.currentStep && vizState.currentStep > 1) {
      this.goToStep(vizState.currentStep);
    }
  }

  // ===========================================================================
  // CLEANUP
  // ===========================================================================

  async deactivate() {
    console.log('[VisualizationModule] Deactivating...');

    // Save visualization state before cleanup
    this.saveVisualizationState();

    // Exit expanded mode if active
    if (this.isFullscreen) {
      this.toggleExpanded();
    }

    // Remove keyboard listener
    document.removeEventListener('keydown', this.handleKeyDown);

    // Remove resize listener
    if (this.handleResizeBound) {
      window.removeEventListener('resize', this.handleResizeBound);
      this.handleResizeBound = null;
    }

    // Clean up Three.js resources
    if (this.meshGroup) {
      this.meshGroup.traverse((object) => {
        if (object.geometry) {
          object.geometry.dispose();
        }
        if (object.material) {
          if (Array.isArray(object.material)) {
            object.material.forEach(m => m.dispose());
          } else {
            object.material.dispose();
          }
        }
      });
    }

    // Dispose scene
    try {
      const vizModule = await import('./visualization/index.js');
      vizModule.disposeScene();
    } catch (e) {
      console.warn('[VisualizationModule] Could not dispose scene:', e);
    }

    // Clean up capping meshes
    if (this.meshFormat === 'VoxelSlices' && this.meshGroup) {
      import('./visualization/clipping.js').then(clipping => {
        clipping.removeAllCappingMeshes(this.meshGroup);
      }).catch(() => {});
    }

    // Clean up original data planes
    if (this.originalDataPlanes || this.originalDataGroup) {
      import('./visualization/meshCreation.js').then(meshCreation => {
        meshCreation.disposeOriginalDataPlanes(this.originalDataGroup, this.originalDataPlanes);
      }).catch(() => {});
    }

    // Clear references
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.meshGroup = null;
    this.classMeshes = {};
    this.sliceMeshes = {};
    this.sliceMetadata = null;
    this.meshFormat = null;
    this.volume = null;
    this.originalDataPlanes = null;
    this.originalDataGroup = null;
    this.originalDataMetadata = null;

    // Clean up global references (use try-catch for non-configurable properties)
    const globalsToClean = ['vizModule', 'nextStep', 'previousStep'];
    for (const name of globalsToClean) {
      try {
        delete window[name];
      } catch (e) {
        // Property may be non-configurable, try setting to undefined
        try {
          window[name] = undefined;
        } catch (e2) {
          // Property may also be non-writable, just log and continue
          console.warn(`[VisualizationModule] Could not clean up window.${name}`);
        }
      }
    }

    // Reset state flags
    this.visualizationReady = false;

    // Call parent deactivate
    await super.deactivate();

    console.log('[VisualizationModule] Deactivated');
  }
}

// =============================================================================
// EXPORT
// =============================================================================

export default VisualizationModule;
