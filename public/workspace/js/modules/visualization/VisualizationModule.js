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
    this.classMeshes = {};
    this.availableClasses = [];

    // Resize handler reference for cleanup
    this.handleResizeBound = null;

    // Fullscreen state
    this.isFullscreen = false;
    this.controlsVisible = true;

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

    // UTIF.js will be loaded in Phase 5 for original data overlay
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
      // Fetch and validate the mesh JSON
      const validationResult = await this.api.validateMeshFile(fileInfo.id || fileInfo.path);

      if (validationResult.success) {
        this.meshInfo = validationResult.info;

        // Show success with mesh info
        this.validationDisplay.showSuccess('Mesh File Valid', [
          { label: 'Classes', value: `${validationResult.info.classCount} classes detected` },
          { label: 'Format', value: validationResult.info.format || 'BufferGeometry' }
        ]);

        // Look up original data via lineage
        await this.lookupOriginalData(fileInfo.id);

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

    // Clear placeholder
    container.innerHTML = '';

    try {
      // Load Three.js
      await this.loadDependencies();

      // Dynamically import visualization modules
      const vizModule = await import('./visualization/index.js');

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

      // Create a placeholder mesh group (actual mesh loading in Phase 3)
      this.meshGroup = new THREE.Group();
      this.scene.add(this.meshGroup);

      // Create a simple placeholder cube to show the scene is working
      const geometry = new THREE.BoxGeometry(2, 2, 2);
      const material = new THREE.MeshPhongMaterial({
        color: 0x4CAF50,
        transparent: true,
        opacity: 0.8
      });
      const placeholderMesh = new THREE.Mesh(geometry, material);
      this.meshGroup.add(placeholderMesh);

      // Position camera
      vizModule.positionCameraForMesh(this.meshGroup);

      // Set up mouse/keyboard controls
      vizModule.setupEnhancedControls(this.renderer, this.meshGroup, this.camera);

      // Set up double-click reset
      vizModule.setupDoubleClickReset(this.renderer.domElement, () => this.resetView());

      // Update controls placeholder
      const controlsPanel = document.getElementById('classControlPanels');
      if (controlsPanel) {
        controlsPanel.innerHTML = `
          <p class="controls-placeholder">
            Scene initialized successfully!<br><br>
            <strong>Selected:</strong> ${this.selectedFile?.name || 'Unknown'}<br>
            <strong>Classes:</strong> ${this.meshInfo?.classCount || 'N/A'}<br><br>
            <em>Mesh loading will be implemented in Phase 3.<br>
            Controls will appear after mesh loads.</em>
          </p>
        `;
      }

      this.visualizationReady = true;
      console.log('[VisualizationModule] 3D visualization initialized');
      this.state.notify('success', 'Scene initialized - mesh loading in Phase 3');

    } catch (error) {
      console.error('[VisualizationModule] Initialization error:', error);
      container.innerHTML = `
        <div class="viewer-placeholder error">
          <span class="placeholder-icon">❌</span>
          <span class="placeholder-text">Failed to initialize 3D viewer</span>
          <span class="placeholder-subtext">${error.message}</span>
        </div>
      `;
      this.state.notify('error', 'Failed to initialize 3D viewer');
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
   * Reset the view to default state
   */
  resetView() {
    console.log('[VisualizationModule] Resetting view...');

    if (this.meshGroup) {
      // Reset rotation
      this.meshGroup.rotation.set(0, 0, 0);
    }

    if (this.camera && this.meshGroup) {
      // Re-position camera
      import('./visualization/index.js').then(vizModule => {
        vizModule.positionCameraForMesh(this.meshGroup);
      });
    }

    this.state.notify('info', 'View reset');
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

    if (meshResult && meshResult.meshId) {
      console.log('[VisualizationModule] Found preselected mesh from MeshModule:', meshResult);

      // Clear the preselection so it doesn't trigger again
      this.state.update('modules.mesh.result', null);

      // Try to find the JSON file from the mesh result
      try {
        const meshFile = await this.api.getMeshFileFromResult(meshResult.meshId);

        if (meshFile && meshFile.success) {
          this.selectedFile = {
            id: meshFile.fileId,
            path: meshFile.path,
            name: meshFile.name,
            fromMeshModule: true
          };

          // Trigger validation
          await this.onFileSelected(this.selectedFile);

          // Auto-advance to step 2 if validation passed
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

    // Clear references
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.meshGroup = null;
    this.classMeshes = {};

    // Clean up global references
    delete window.vizModule;
    delete window.nextStep;
    delete window.previousStep;

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
