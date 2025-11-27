/**
 * SegmentationModule - Complete U-Net Segmentation Pipeline
 * Phase 2: Full integration of classic segmentation workflow
 */
class SegmentationModule {
  constructor(stateManager) {
    this.state = stateManager;
    this.container = null;

    // Module-specific state (replaces global variables from classic app)
    this.currentStep = 1;
    this.socket = null;
    this.currentTrainingId = null;
    this.currentInferenceId = null;
    this.trainingPollInterval = null;

    // File uploads
    this.uploadedFiles = {
      rawImages: null,
      annotations: null,
      inferenceData: null
    };

    // File selectors
    this.rawImageSelector = null;
    this.annotationsSelector = null;
    this.inferenceSelector = null;

    // Charts
    this.lossChart = null;
    this.diceChart = null;

    // Three.js visualization
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.segmentationMesh = null;
    this.segmentationData = null;
    this.availableClasses = [];
    this.visibleClasses = [];
    this.currentSliceRange = [0, 100];
    this.classMeshes = {};
    this.meshGroup = null;
    this.sliceDirection = 'z';

    // Dependencies loaded flag
    this.dependenciesLoaded = false;

    // Visualization initialized flag
    this.visualizationInitialized = false;

    // Bind methods
    this.activate = this.activate.bind(this);
    this.deactivate = this.deactivate.bind(this);
    this.loadDependencies = this.loadDependencies.bind(this);
  }

  /**
   * Activate the module
   */
  async activate() {
    console.log('[SegmentationModule] Activating...');

    // Make module instance globally accessible for helper scripts
    window.segmentationModule = this;

    try {
      // Get container
      this.container = document.getElementById('module-view');

      if (!this.container) {
        throw new Error('Module container not found');
      }

      // Show loading
      this.state.update('ui.loading', true);

      // Load dependencies (Socket.IO, Chart.js, Three.js, UTIF)
      await this.loadDependencies();

      // Load CSS
      await this.loadCSS();

      // Render UI
      this.render();

      // Initialize components
      await this.initialize();

      // Hide loading
      this.state.update('ui.loading', false);

      // Check for resume
      await this.checkForResume();

      console.log('[SegmentationModule] Activation complete');

    } catch (error) {
      console.error('[SegmentationModule] Activation error:', error);
      this.state.notify('error', `Failed to activate segmentation module: ${error.message}`);
      this.state.update('ui.loading', false);
    }
  }

  /**
   * Load external dependencies
   */
  async loadDependencies() {
    if (this.dependenciesLoaded) {
      console.log('[SegmentationModule] Dependencies already loaded');
      return;
    }

    console.log('[SegmentationModule] Loading dependencies...');

    try {
      // Load Socket.IO
      if (!window.io) {
        await this.loadScript('https://cdnjs.cloudflare.com/ajax/libs/socket.io/4.7.2/socket.io.js');
        console.log('[SegmentationModule] Socket.IO loaded');
      }

      // Load Chart.js
      if (!window.Chart) {
        await this.loadScript('https://cdnjs.cloudflare.com/ajax/libs/Chart.js/3.9.1/chart.min.js');
        console.log('[SegmentationModule] Chart.js loaded');
      }

      // Load Three.js
      if (!window.THREE) {
        await this.loadScript('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js');
        console.log('[SegmentationModule] Three.js loaded');
      }

      // Load UTIF.js
      if (!window.UTIF) {
        await this.loadScript('https://cdn.jsdelivr.net/npm/utif@3.1.0/UTIF.js');
        console.log('[SegmentationModule] UTIF.js loaded');
      }

      this.dependenciesLoaded = true;
      console.log('[SegmentationModule] All dependencies loaded');

    } catch (error) {
      console.error('[SegmentationModule] Error loading dependencies:', error);
      throw new Error(`Failed to load dependencies: ${error.message}`);
    }
  }

  /**
   * Load CSS dynamically
   */
  async loadCSS() {
    // Check if already loaded
    if (document.getElementById('segmentation-module-css')) {
      return;
    }

    // Load modern CSS
    // Load segmentation module CSS (self-contained, no classic CSS dependencies)
    const link = document.createElement('link');
    link.id = 'segmentation-module-css';
    link.rel = 'stylesheet';
    link.href = '/workspace/js/modules/segmentation/css/segmentation-modern.css';
    document.head.appendChild(link);
  }

  /**
   * Helper to load external scripts
   * @param {string} src - Script source URL
   * @param {boolean} isModule - Whether to load as ES6 module
   */
  loadScript(src, isModule = false) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      if (isModule) {
        script.type = 'module';
      }
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
      document.head.appendChild(script);
    });
  }

  /**
   * Render the complete segmentation UI
   */
  render() {
    this.container.innerHTML = `
      <div class="segmentation-module">
        <!-- Module Header with Back Button -->
        <div class="module-header">
          <button class="btn-back" onclick="workspace.returnToHub()">← Back to Hub</button>
          <div class="header-content">
            <h1>U-Net Segmentation Pipeline</h1>
          </div>
        </div>

        <!-- Progress Bar -->
        <div class="progress-bar">
          <div class="progress-fill" id="overallProgress"></div>
        </div>

        <!-- Step Navigation -->
        <div class="step-nav">
          <div class="step active" data-step="1">
            <div class="step-number">1</div>
            <span>Data Upload</span>
          </div>
          <div class="step" data-step="2">
            <div class="step-number">2</div>
            <span>Configuration</span>
          </div>
          <div class="step" data-step="3">
            <div class="step-number">3</div>
            <span>Training</span>
          </div>
          <div class="step" data-step="4">
            <div class="step-number">4</div>
            <span>Inference</span>
          </div>
          <div class="step" data-step="5">
            <div class="step-number">5</div>
            <span>3D Visualization</span>
          </div>
        </div>

        <!-- Main Content Area -->
        <div class="main-content">
          <!-- Step 1: Data Upload -->
          <div class="step-content active" id="step1">
            <h2>Step 1: Training Data Selection</h2>
            <p>Select your TIFF image stacks for training. Both raw images and annotations are required.</p>

            <!-- FileSelector components will be inserted here -->
            <div id="rawImagesSelectorContainer"></div>
            <div id="annotationsSelectorContainer"></div>

            <div id="validationResult"></div>

            <div class="navigation-buttons">
              <div></div>
              <button class="btn" id="step1Next" disabled>Next: Configuration</button>
            </div>
          </div>

          <!-- Step 2: Configuration -->
          <div class="step-content" id="step2">
            <h2>Step 2: Training Configuration</h2>
            <p>Configure your model and training parameters.</p>

            <div class="config-form">
              <div class="config-group">
                <h3>Dataset Configuration</h3>
                <div class="form-field">
                  <label for="patchSize">Patch Size</label>
                  <input type="number" id="patchSize" value="64" min="16" max="1024">
                </div>
                <div class="form-field">
                  <label for="patchesPerImage">Patches per Image</label>
                  <input type="number" id="patchesPerImage" value="50" min="1" max="100">
                </div>
                <div class="form-field">
                  <label for="batchSize">Batch Size</label>
                  <input type="number" id="batchSize" value="8" min="1" max="32">
                </div>
                <div class="form-field checkbox-field">
                  <input type="checkbox" id="augmentation" checked>
                  <label for="augmentation">Apply Data Augmentation</label>
                </div>
              </div>

              <div class="config-group">
                <h3>Model Architecture</h3>
                <div class="form-field">
                  <label for="numFeatures">Number of Features</label>
                  <input type="number" id="numFeatures" value="64" min="16" max="256" step="16">
                </div>
                <div class="form-field">
                  <label for="numLayers">Number of Layers</label>
                  <input type="number" id="numLayers" value="4" min="2" max="6">
                </div>
              </div>

              <div class="config-group">
                <h3>Training Parameters</h3>
                <div class="form-field">
                  <label for="learningRate">Learning Rate</label>
                  <input type="number" id="learningRate" value="0.001" min="0.0001" max="0.1" step="0.0001">
                </div>
                <div class="form-field">
                  <label for="numEpochs">Number of Epochs</label>
                  <input type="number" id="numEpochs" value="100" min="10" max="500">
                </div>
              </div>
            </div>

            <div class="navigation-buttons">
              <button class="btn secondary" id="step2Back">Previous</button>
              <button class="btn" id="step2Next">Next: Training</button>
            </div>
          </div>

          <!-- Step 3: Training Progress -->
          <div class="step-content" id="step3">
            <h2>Step 3: Training Progress</h2>

            <!-- Training Container: Shows button initially, then progress -->
            <div class="training-status">
              <!-- Initial state: Show start button -->
              <div id="trainingActionContent">
                <h2 style="margin-top: 0; color: #24292e;">Ready to Train Your Model</h2>
                <p style="color: #586069; margin-bottom: 30px;">
                  Your configuration has been saved. Click below to start training your U-Net model.
                </p>
                <button class="btn btn-large" id="startTrainingBtn">
                  Start Training
                </button>
              </div>

              <!-- Training progress state: Hidden initially -->
              <div id="trainingProgressContent" style="display: none;">
                <h3 id="trainingStatusText">Training started... Preparing data...</h3>
                <div class="training-progress">
                  <div>Epoch <span id="currentEpoch">0</span> of <span id="totalEpochs">0</span></div>
                  <div class="training-progress-bar">
                    <div class="training-progress-fill" id="trainingProgressFill"></div>
                  </div>
                </div>
              </div>
            </div>

            <div class="metrics-display">
              <div class="metric-card">
                <div class="metric-value" id="trainLoss">--</div>
                <div class="metric-label">Training Loss</div>
              </div>
              <div class="metric-card">
                <div class="metric-value" id="valLoss">--</div>
                <div class="metric-label">Validation Loss</div>
              </div>
              <div class="metric-card">
                <div class="metric-value" id="trainDice">--</div>
                <div class="metric-label">Training Dice</div>
              </div>
              <div class="metric-card">
                <div class="metric-value" id="valDice">--</div>
                <div class="metric-label">Validation Dice</div>
              </div>
            </div>

            <div class="charts-container">
              <div class="chart-container">
                <h4>Loss Curves</h4>
                <div style="position: relative; height: 220px; margin-top: 40px;">
                  <canvas id="lossChart"></canvas>
                </div>
              </div>
              <div class="chart-container">
                <h4>Dice Score</h4>
                <div style="position: relative; height: 220px; margin-top: 40px;">
                  <canvas id="diceChart"></canvas>
                </div>
              </div>
            </div>

            <div class="navigation-buttons">
              <button class="btn secondary" id="trainingBackBtn">Previous</button>
              <button class="btn" id="trainingNextBtn" disabled>Next: Inference</button>
            </div>
          </div>

          <!-- Step 4: Inference -->
          <div class="step-content" id="step4">
            <h2>Step 4: Run Inference</h2>

            <div class="model-info">
              <h3>Trained Model Ready</h3>
              <p>Your model has been trained successfully. You can now run inference on new data or download the model.</p>
              <div style="margin-top: 15px;">
                <button class="btn" id="downloadModelBtn">Download Model & Config</button>
              </div>
            </div>

            <div class="inference-section" style="margin-top: 30px;">
              <h3 style="margin-bottom: 20px; font-size: 18px; color: #24292e;">Select Data for Inference</h3>

              <!-- FileSelector component will be inserted here -->
              <div id="inferenceSelectorContainer"></div>

              <button class="btn" id="runInferenceBtn" disabled style="margin-top: 20px;">
                Run Segmentation
              </button>

              <!-- Inference Progress Display -->
              <div id="inferenceProgressContainer" style="display: none; margin-top: 25px; padding: 20px; background: #f6f8fa; border-radius: 8px; border: 1px solid #d1d5da;">
                <h4 style="margin: 0 0 15px 0; font-size: 16px; color: #24292e;">Running Inference...</h4>

                <div style="margin-bottom: 12px;">
                  <div style="display: flex; justify-content: space-between; margin-bottom: 5px; font-size: 14px; color: #586069;">
                    <span>Progress: <span id="currentSlice">0</span> / <span id="totalSlices">0</span> slices</span>
                    <span id="inferenceProgressPercent">0%</span>
                  </div>
                  <div style="width: 100%; height: 8px; background: #e1e4e8; border-radius: 4px; overflow: hidden;">
                    <div id="inferenceProgressBar" style="width: 0%; height: 100%; background: linear-gradient(90deg, #667eea 0%, #764ba2 100%); transition: width 0.3s;"></div>
                  </div>
                </div>

                <div style="font-size: 13px; color: #586069;">
                  <span id="inferenceStatusText">Processing your data...</span>
                </div>
              </div>
            </div>

            <div class="navigation-buttons">
              <button class="btn secondary" id="step4Back">Previous</button>
              <button class="btn" id="inferenceNextBtn" disabled>Next: 3D Visualization</button>
            </div>
          </div>

          <!-- Step 5: 3D Visualization -->
          <div class="step-content" id="step5">
            <h2>Step 5: 3D Interactive Visualization</h2>

            <div class="visualization-container" id="threejsContainer">
              <!-- Three.js visualization will be rendered here -->
            </div>

            <div class="viz-controls-container">
              <div class="controls-header">
                <h3 class="controls-title">Class Controls</h3>
                <button id="resetViewBtn" class="btn btn-reset">Reset View</button>
              </div>
              <div id="classControlPanels" class="class-control-panels">
                <!-- Individual class control panels will be dynamically generated here -->
              </div>
            </div>

            <div style="text-align: center; margin-top: 20px;">
              <button class="btn" id="downloadResultsBtn">Download Segmentation Results</button>
              <button class="btn secondary" id="resetWorkflowBtn">Start New Analysis</button>
            </div>

            <div class="navigation-buttons">
              <button class="btn secondary" id="step5Back">Previous</button>
              <div></div>
            </div>
          </div>
        </div>

        <!-- Loading Overlay -->
        <div class="loading-overlay" id="moduleLoadingOverlay" style="display: none;">
          <div class="loading-content">
            <div class="spinner"></div>
            <h3 id="moduleLoadingText">Processing...</h3>
            <p id="moduleLoadingDescription">Please wait while we process your request.</p>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Initialize all components after render
   */
  async initialize() {
    console.log('[SegmentationModule] Initializing components...');

    // Initialize Socket.IO
    this.initializeSocketConnection();

    // Initialize charts
    this.initializeCharts();

    // Set up event listeners
    this.setupEventListeners();

    // Load helper scripts
    await this.loadHelperScripts();

    // Update progress bar
    this.updateProgressBar();

    console.log('[SegmentationModule] Initialization complete');
  }

  /**
   * Load helper scripts (navigation, fileUpload, etc.)
   */
  async loadHelperScripts() {
    // Regular scripts (non-module)
    const regularScripts = [
      '/workspace/js/modules/segmentation/SegmentationAPI.js',
      '/workspace/js/modules/segmentation/components/FileSelector.js',
      '/workspace/js/modules/segmentation/utils.js',
      '/workspace/js/modules/segmentation/navigation.js',
      '/workspace/js/modules/segmentation/training.js',
      '/workspace/js/modules/segmentation/inference.js',
      '/workspace/js/modules/segmentation/charts.js'
    ];

    // Load regular scripts
    for (const scriptSrc of regularScripts) {
      if (!document.querySelector(`script[src="${scriptSrc}"]`)) {
        await this.loadScript(scriptSrc, false);
      }
    }

    // Initialize FileSelectors after loading regular scripts
    await this.initializeFileSelectors();

    // Load visualization module (ES6 module)
    // This will be loaded dynamically when Step 5 is reached
    console.log('[SegmentationModule] Helper scripts loaded, visualization will load on Step 5');
  }

  /**
   * Initialize FileSelector components
   */
  async initializeFileSelectors() {
    console.log('[SegmentationModule] Initializing FileSelectors...');

    // Create FileSelector instances
    this.rawImageSelector = new FileSelector('raw_images', 'Raw Images', '📁', this);
    this.annotationsSelector = new FileSelector('annotations', 'Annotations', '🏷️', this);
    this.inferenceSelector = new FileSelector('inference_data', 'Inference Data', '📁', this);

    // Insert into containers
    const rawContainer = document.getElementById('rawImagesSelectorContainer');
    const annotationsContainer = document.getElementById('annotationsSelectorContainer');
    const inferenceContainer = document.getElementById('inferenceSelectorContainer');

    if (rawContainer) {
      rawContainer.innerHTML = this.rawImageSelector.render();
      await this.rawImageSelector.init();
    }

    if (annotationsContainer) {
      annotationsContainer.innerHTML = this.annotationsSelector.render();
      await this.annotationsSelector.init();
    }

    if (inferenceContainer) {
      inferenceContainer.innerHTML = this.inferenceSelector.render();
      await this.inferenceSelector.init();
    }

    console.log('[SegmentationModule] FileSelectors initialized');
  }

  /**
   * Called when a file is selected in FileSelector
   */
  async onFileSelected(type, fileInfo) {
    console.log(`[SegmentationModule] File selected for ${type}:`, fileInfo);

    // Update uploadedFiles
    this.uploadedFiles[type] = fileInfo;

    // Handle test data vs. custom files
    if (type === 'raw_images' || type === 'annotations') {
      // Check if both are test data
      const bothTestData =
        this.uploadedFiles.raw_images?.isTestData &&
        this.uploadedFiles.annotations?.isTestData;

      if (bothTestData) {
        // Both are test data - trigger test data loading
        await this.loadTestData();
      }
    } else if (type === 'inference_data') {
      if (fileInfo.isTestData) {
        // Test inference data
        await this.loadTestInferenceData();
      }
    }
  }

  /**
   * Called when a file is uploaded via FileSelector
   */
  async onFileUploaded(type, file, uploadedFileInfo) {
    console.log(`[SegmentationModule] File uploaded for ${type}:`, uploadedFileInfo);

    // Store the actual File object for validation
    if (!this.pendingFiles) {
      this.pendingFiles = {};
    }
    this.pendingFiles[type] = file;

    // If both training files uploaded, validate them together
    if (type === 'raw_images' || type === 'annotations') {
      if (this.pendingFiles.rawImages && this.pendingFiles.annotations) {
        await this.validateUploadedFiles();
      }
    } else if (type === 'inference_data') {
      // Validate inference file immediately
      await this.validateInferenceFile(file);
    }
  }

  /**
   * Load test data (when both dropdowns select test data)
   */
  async loadTestData() {
    console.log('[SegmentationModule] Loading test data...');

    try {
      this.state.update('ui.loading', true);

      const formData = new FormData();
      formData.append('isTestData', 'true');

      const response = await fetch('/upload-data', {
        method: 'POST',
        body: formData
      });

      const result = await response.json();

      if (result.success) {
        // Store actual file info from backend
        this.uploadedFiles.rawImages = { path: result.raw_images_path, isTestData: true };
        this.uploadedFiles.annotations = { path: result.annotations_path, isTestData: true };

        // Show validation results
        this.displayValidationResults(result.validation);

        // Enable next button
        const step1Next = document.getElementById('step1Next');
        if (step1Next) {
          step1Next.disabled = false;
        }

        this.state.notify('success', 'Test data loaded and validated successfully');
      } else {
        throw new Error(result.error || 'Failed to load test data');
      }
    } catch (error) {
      console.error('[SegmentationModule] Test data loading error:', error);
      this.state.notify('error', `Failed to load test data: ${error.message}`);
    } finally {
      this.state.update('ui.loading', false);
    }
  }

  /**
   * Validate uploaded custom files
   */
  async validateUploadedFiles() {
    console.log('[SegmentationModule] Validating uploaded files...');

    try {
      this.state.update('ui.loading', true);

      const formData = new FormData();
      formData.append('raw_images', this.pendingFiles.rawImages);
      formData.append('annotations', this.pendingFiles.annotations);

      const response = await fetch('/upload-data', {
        method: 'POST',
        body: formData
      });

      const result = await response.json();

      if (result.success) {
        // Update uploadedFiles with validated info
        this.uploadedFiles.rawImages = { path: result.raw_images_path };
        this.uploadedFiles.annotations = { path: result.annotations_path };

        // Show validation results
        this.displayValidationResults(result.validation);

        // Enable next button
        const step1Next = document.getElementById('step1Next');
        if (step1Next) {
          step1Next.disabled = false;
        }

        // Clear pending files
        this.pendingFiles = {};

        this.state.notify('success', 'Files validated successfully');
      } else {
        throw new Error(result.error || 'Validation failed');
      }
    } catch (error) {
      console.error('[SegmentationModule] Validation error:', error);
      this.state.notify('error', `Validation failed: ${error.message}`);

      // Show error in validation div
      this.displayValidationError(error.message);
    } finally {
      this.state.update('ui.loading', false);
    }
  }

  /**
   * Load test inference data
   */
  async loadTestInferenceData() {
    console.log('[SegmentationModule] Loading test inference data...');

    try {
      this.state.update('ui.loading', true);

      const formData = new FormData();
      formData.append('isTestData', 'true');

      const response = await fetch('/upload-inference', {
        method: 'POST',
        body: formData
      });

      const result = await response.json();

      if (result.success) {
        this.uploadedFiles.inferenceData = { path: result.file_path, isTestData: true };

        // Enable run inference button
        const runInferenceBtn = document.getElementById('runInferenceBtn');
        if (runInferenceBtn) {
          runInferenceBtn.disabled = false;
        }

        this.state.notify('success', 'Test inference data loaded successfully');
      } else {
        throw new Error(result.error || 'Failed to load test inference data');
      }
    } catch (error) {
      console.error('[SegmentationModule] Test inference loading error:', error);
      this.state.notify('error', `Failed to load test inference data: ${error.message}`);
    } finally {
      this.state.update('ui.loading', false);
    }
  }

  /**
   * Validate inference file
   */
  async validateInferenceFile(file) {
    console.log('[SegmentationModule] Validating inference file...');

    try {
      this.state.update('ui.loading', true);

      const formData = new FormData();
      formData.append('inference_data', file);

      const response = await fetch('/upload-inference', {
        method: 'POST',
        body: formData
      });

      const result = await response.json();

      if (result.success) {
        this.uploadedFiles.inferenceData = { path: result.file_path };

        // Enable run inference button
        const runInferenceBtn = document.getElementById('runInferenceBtn');
        if (runInferenceBtn) {
          runInferenceBtn.disabled = false;
        }

        this.state.notify('success', 'Inference file validated successfully');
      } else {
        throw new Error(result.error || 'Validation failed');
      }
    } catch (error) {
      console.error('[SegmentationModule] Inference validation error:', error);
      this.state.notify('error', `Inference validation failed: ${error.message}`);
    } finally {
      this.state.update('ui.loading', false);
    }
  }

  /**
   * Display validation results
   */
  displayValidationResults(validation) {
    const validationDiv = document.getElementById('validationResult');

    if (!validationDiv) return;

    if (validation && validation.success !== false) {
      validationDiv.className = 'success';
      validationDiv.innerHTML = `
        <h4>✅ Validation Successful</h4>
        <div class="validation-details">
          ${validation.raw_dims ? `<p><strong>Raw Images:</strong> ${validation.raw_dims} (${validation.raw_slices} slices)</p>` : ''}
          ${validation.ann_dims ? `<p><strong>Annotations:</strong> ${validation.ann_dims} (${validation.ann_slices} slices)</p>` : ''}
          ${validation.classes ? `<p><strong>Classes detected:</strong> ${validation.classes.join(', ')}</p>` : ''}
          ${validation.warnings ? `<p class="warning">⚠️ ${validation.warnings}</p>` : ''}
        </div>
      `;
    } else {
      validationDiv.className = 'error';
      validationDiv.innerHTML = `
        <h4>❌ Validation Failed</h4>
        <p>${validation?.error || 'Unknown error'}</p>
      `;
    }

    validationDiv.style.display = 'block';
  }

  /**
   * Display validation error
   */
  displayValidationError(errorMessage) {
    const validationDiv = document.getElementById('validationResult');

    if (!validationDiv) return;

    validationDiv.className = 'error';
    validationDiv.innerHTML = `
      <h4>❌ Validation Failed</h4>
      <p>${errorMessage}</p>
    `;
    validationDiv.style.display = 'block';
  }

  /**
   * Check if Step 1 is valid
   */
  checkStep1Validation() {
    const step1Next = document.getElementById('step1Next');

    if (this.uploadedFiles.raw_images && this.uploadedFiles.annotations) {
      if (step1Next) {
        step1Next.disabled = false;
      }

      // Show validation success
      const validationResult = document.getElementById('validationResult');
      if (validationResult) {
        validationResult.className = 'success';
        validationResult.innerHTML = '✅ Both files selected and ready for training';
        validationResult.style.display = 'block';
      }
    } else {
      if (step1Next) {
        step1Next.disabled = true;
      }
    }
  }

  /**
   * Check if inference is valid
   */
  checkInferenceValidation() {
    const runInferenceBtn = document.getElementById('runInferenceBtn');

    if (this.uploadedFiles.inference_data) {
      if (runInferenceBtn) {
        runInferenceBtn.disabled = false;
      }
    } else {
      if (runInferenceBtn) {
        runInferenceBtn.disabled = true;
      }
    }
  }

  /**
   * Initialize Socket.IO connection
   */
  initializeSocketConnection() {
    if (this.socket) {
      this.socket.disconnect();
    }

    this.socket = io();

    // Training progress
    this.socket.on('training-progress', (data) => {
      console.log('[SegmentationModule] Training progress:', data);
      if (typeof updateTrainingProgress === 'function') {
        updateTrainingProgress(data);
      }
    });

    // Training complete
    this.socket.on('training-complete', (data) => {
      console.log('[SegmentationModule] Training complete:', data);
      if (typeof onTrainingComplete === 'function') {
        onTrainingComplete(data);
      }
    });

    // Inference progress
    this.socket.on('inference-progress', (data) => {
      console.log('[SegmentationModule] Inference progress:', data);
      if (typeof updateInferenceProgress === 'function') {
        updateInferenceProgress(data);
      }
    });

    // Inference complete
    this.socket.on('inference-complete', (data) => {
      console.log('[SegmentationModule] Inference complete:', data);
      if (typeof onInferenceComplete === 'function') {
        onInferenceComplete(data);
      }
    });

    console.log('[SegmentationModule] Socket.IO initialized');
  }

  /**
   * Initialize Chart.js charts
   */
  initializeCharts() {
    const lossCanvas = document.getElementById('lossChart');
    const diceCanvas = document.getElementById('diceChart');

    if (!lossCanvas || !diceCanvas) {
      console.warn('[SegmentationModule] Chart canvases not found');
      return;
    }

    // Loss chart
    this.lossChart = new Chart(lossCanvas.getContext('2d'), {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          {
            label: 'Training Loss',
            data: [],
            borderColor: '#FF6384',
            backgroundColor: 'rgba(255, 99, 132, 0.1)',
            tension: 0.4
          },
          {
            label: 'Validation Loss',
            data: [],
            borderColor: '#36A2EB',
            backgroundColor: 'rgba(54, 162, 235, 0.1)',
            tension: 0.4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: 'top'
          }
        },
        scales: {
          y: {
            beginAtZero: true
          }
        }
      }
    });

    // Dice chart
    this.diceChart = new Chart(diceCanvas.getContext('2d'), {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          {
            label: 'Training Dice',
            data: [],
            borderColor: '#4BC0C0',
            backgroundColor: 'rgba(75, 192, 192, 0.1)',
            tension: 0.4
          },
          {
            label: 'Validation Dice',
            data: [],
            borderColor: '#9966FF',
            backgroundColor: 'rgba(153, 102, 255, 0.1)',
            tension: 0.4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: 'top'
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            max: 1
          }
        }
      }
    });

    // Charts are accessible via window.segmentationModule.lossChart and .diceChart
    console.log('[SegmentationModule] Charts initialized');
  }

  /**
   * Set up event listeners
   */
  setupEventListeners() {
    // Step 1: Navigation
    const step1Next = document.getElementById('step1Next');
    if (step1Next) {
      step1Next.onclick = () => this.goToStep(2);
    }

    // Step 2: Configuration
    const step2Back = document.getElementById('step2Back');
    const step2Next = document.getElementById('step2Next');
    if (step2Back) step2Back.onclick = () => this.goToStep(1);
    if (step2Next) step2Next.onclick = () => this.configureAndProceed();

    // Step 3: Training
    const startTrainingBtn = document.getElementById('startTrainingBtn');
    if (startTrainingBtn) {
      startTrainingBtn.onclick = () => this.startTraining();
    }

    const trainingBackBtn = document.getElementById('trainingBackBtn');
    const trainingNextBtn = document.getElementById('trainingNextBtn');
    if (trainingBackBtn) trainingBackBtn.onclick = () => this.goToStep(2);
    if (trainingNextBtn) trainingNextBtn.onclick = () => this.goToStep(4);

    // Step 4: Inference
    const downloadModelBtn = document.getElementById('downloadModelBtn');
    if (downloadModelBtn) {
      downloadModelBtn.onclick = () => this.downloadModel();
    }

    const runInferenceBtn = document.getElementById('runInferenceBtn');
    if (runInferenceBtn) {
      runInferenceBtn.onclick = () => this.runInference();
    }

    const step4Back = document.getElementById('step4Back');
    const inferenceNextBtn = document.getElementById('inferenceNextBtn');
    if (step4Back) step4Back.onclick = () => this.goToStep(3);
    if (inferenceNextBtn) inferenceNextBtn.onclick = () => this.goToStep(5);

    // Step 5: Visualization
    const resetViewBtn = document.getElementById('resetViewBtn');
    if (resetViewBtn) {
      resetViewBtn.onclick = () => this.resetView();
    }

    const downloadResultsBtn = document.getElementById('downloadResultsBtn');
    if (downloadResultsBtn) {
      downloadResultsBtn.onclick = () => this.downloadResults();
    }

    const resetWorkflowBtn = document.getElementById('resetWorkflowBtn');
    if (resetWorkflowBtn) {
      resetWorkflowBtn.onclick = () => this.resetWorkflow();
    }

    const step5Back = document.getElementById('step5Back');
    if (step5Back) step5Back.onclick = () => this.goToStep(4);

    console.log('[SegmentationModule] Event listeners set up');
  }

  /**
   * Initialize 3D visualization module
   */
  async initialize3DVisualization() {
    if (this.visualizationInitialized) {
      console.log('[SegmentationModule] 3D visualization already initialized');
      return;
    }

    if (!window.inferenceResult) {
      console.warn('[SegmentationModule] No inference result available for visualization');
      const container = document.getElementById('threejsContainer');
      if (container) {
        container.innerHTML = `
          <div style="display: flex; align-items: center; justify-content: center; height: 100%; text-align: center; color: #666; padding: 20px;">
            <div>
              <h3>No Inference Data Available</h3>
              <p style="color: #999; margin-top: 10px;">Please complete inference in Step 4 first.</p>
            </div>
          </div>
        `;
      }
      return;
    }

    // Debug: Log the inference result to see what we have
    console.log('[SegmentationModule] Inference result:', window.inferenceResult);
    console.log('[SegmentationModule] Visualization path:', window.inferenceResult.visualization_path);
    console.log('[SegmentationModule] Inference ID:', this.currentInferenceId);

    // Validate that we have the necessary data
    if (!window.inferenceResult.visualization_path) {
      console.error('[SegmentationModule] Missing visualization_path in inference result');
      const container = document.getElementById('threejsContainer');
      if (container) {
        container.innerHTML = `
          <div style="display: flex; align-items: center; justify-content: center; height: 100%; text-align: center; color: #666; padding: 20px;">
            <div>
              <h3>Visualization Data Not Found</h3>
              <p style="color: #999; margin-top: 10px;">The inference result does not contain a visualization path.</p>
              <p style="color: #999; margin-top: 10px; font-size: 12px;">This may indicate that inference did not complete successfully.</p>
            </div>
          </div>
        `;
      }
      return;
    }

    console.log('[SegmentationModule] Initializing 3D visualization...');

    try {
      // Dynamically import the visualization module
      const visualizationModule = await import('/workspace/js/modules/segmentation/visualization/main.js');

      console.log('[SegmentationModule] Visualization module loaded');

      // Expose visualization functions globally
      window.resetCameraView = visualizationModule.resetView;
      window.visualizationModule = visualizationModule;

      // Call the initialization function
      if (visualizationModule.initialize3DVisualization) {
        await visualizationModule.initialize3DVisualization();
        this.visualizationInitialized = true;
        console.log('[SegmentationModule] 3D visualization initialized successfully');
      } else {
        console.error('[SegmentationModule] initialize3DVisualization function not found in module');
      }
    } catch (error) {
      console.error('[SegmentationModule] Failed to initialize 3D visualization:', error);

      // Show user-friendly error message in container
      const container = document.getElementById('threejsContainer');
      if (container) {
        container.innerHTML = `
          <div style="display: flex; align-items: center; justify-content: center; height: 100%; text-align: center; color: #666; padding: 20px;">
            <div>
              <h3>3D Visualization Failed to Load</h3>
              <p style="color: #999; margin-top: 10px;">${error.message}</p>
              <p style="font-size: 12px; color: #999; margin-top: 10px;">Check the browser console for more details.</p>
            </div>
          </div>
        `;
      }
    }
  }

  /**
   * Navigate to a specific step
   */
  goToStep(stepNumber) {
    this.currentStep = stepNumber;

    // Update step navigation
    const steps = document.querySelectorAll('.step');
    steps.forEach((step, index) => {
      if (index + 1 <= stepNumber) {
        step.classList.add('active');
      } else {
        step.classList.remove('active');
      }
    });

    // Update step content
    const stepContents = document.querySelectorAll('.step-content');
    stepContents.forEach((content, index) => {
      if (index + 1 === stepNumber) {
        content.classList.add('active');
      } else {
        content.classList.remove('active');
      }
    });

    // Initialize 3D visualization when reaching step 5
    if (stepNumber === 5 && window.inferenceResult) {
      console.log('[SegmentationModule] Reached step 5, initializing 3D visualization...');
      // Use setTimeout to allow UI to update first
      setTimeout(() => {
        this.initialize3DVisualization();
      }, 100);
    }

    // Update progress bar
    this.updateProgressBar();

    // Scroll main-content container to top when changing steps
    const mainContent = document.querySelector('.segmentation-module .main-content');
    if (mainContent) {
      mainContent.scrollTop = 0;
    }

    // Update state
    this.state.update('modules.segmentation.currentStep', stepNumber);
  }

  /**
   * Update progress bar
   */
  updateProgressBar() {
    const progressBar = document.getElementById('overallProgress');
    if (progressBar) {
      const progress = (this.currentStep / 5) * 100;
      progressBar.style.width = `${progress}%`;
    }
  }

  /**
   * Configure training and proceed to step 3
   */
  async configureAndProceed() {
    // Get configuration values
    const config = {
      patch_size: parseInt(document.getElementById('patchSize').value),
      patches_per_image: parseInt(document.getElementById('patchesPerImage').value),
      batch_size: parseInt(document.getElementById('batchSize').value),
      augmentation: document.getElementById('augmentation').checked,
      features: parseInt(document.getElementById('numFeatures').value),
      num_layers: parseInt(document.getElementById('numLayers').value),
      learning_rate: parseFloat(document.getElementById('learningRate').value),
      num_epochs: parseInt(document.getElementById('numEpochs').value)
    };

    try {
      const response = await fetch('/configure-training', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });

      const result = await response.json();

      if (result.success) {
        this.state.notify('success', 'Configuration saved successfully');
        this.goToStep(3);
      } else {
        throw new Error(result.error || 'Failed to save configuration');
      }
    } catch (error) {
      console.error('[SegmentationModule] Configuration error:', error);
      this.state.notify('error', `Configuration failed: ${error.message}`);
    }
  }

  /**
   * Start training
   */
  async startTraining() {
    console.log('[SegmentationModule] Starting training...');

    try {
      // Switch from action button to progress display
      const trainingActionContent = document.getElementById('trainingActionContent');
      const trainingProgressContent = document.getElementById('trainingProgressContent');

      if (trainingActionContent) {
        trainingActionContent.style.display = 'none';
      }
      if (trainingProgressContent) {
        trainingProgressContent.style.display = 'block';
      }

      const response = await fetch('/start-training', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      const result = await response.json();

      if (result.success) {
        this.currentTrainingId = result.training_id;
        this.state.update('modules.segmentation.currentTask', {
          type: 'training',
          trainingId: result.training_id
        });

        // Join training room
        if (this.socket) {
          this.socket.emit('join-training', result.training_id);
        }

        this.state.notify('success', 'Training started successfully');
      } else {
        throw new Error(result.error || 'Failed to start training');
      }
    } catch (error) {
      console.error('[SegmentationModule] Training start error:', error);
      this.state.notify('error', `Failed to start training: ${error.message}`);
    }
  }

  /**
   * Download trained model
   */
  downloadModel() {
    if (this.currentTrainingId) {
      window.location.href = `/download-model/${this.currentTrainingId}`;
    }
  }

  /**
   * Run inference
   */
  async runInference() {
    console.log('[SegmentationModule] Running inference...');

    try {
      // Prepare request body
      const requestBody = {};

      // Add data path (required)
      if (this.uploadedFiles.inferenceData && this.uploadedFiles.inferenceData.path) {
        requestBody.data_path = this.uploadedFiles.inferenceData.path;
        console.log('[SegmentationModule] Using data path:', requestBody.data_path);
      } else {
        throw new Error('No inference data uploaded. Please select or upload inference data first.');
      }

      // Check if we have a training ID (from SegmentationModule or global training.js)
      const trainingId = this.currentTrainingId || (typeof currentTrainingId !== 'undefined' ? currentTrainingId : null);

      if (trainingId) {
        requestBody.training_id = trainingId;
        console.log('[SegmentationModule] Using training ID:', trainingId);
      }

      const response = await fetch('/run-inference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      const result = await response.json();

      if (result.success) {
        this.currentInferenceId = result.inference_id;
        this.state.update('modules.segmentation.currentTask', {
          type: 'inference',
          inferenceId: result.inference_id
        });

        // Sync to global variable for inference.js
        if (typeof currentInferenceId !== 'undefined') {
          currentInferenceId = result.inference_id;
        }

        // Show progress container
        const progressContainer = document.getElementById('inferenceProgressContainer');
        if (progressContainer) {
          progressContainer.style.display = 'block';
          console.log('[SegmentationModule] Progress container shown');

          // Initialize progress elements
          const currentSliceEl = document.getElementById('currentSlice');
          const totalSlicesEl = document.getElementById('totalSlices');
          const progressPercentEl = document.getElementById('inferenceProgressPercent');
          const progressBarEl = document.getElementById('inferenceProgressBar');

          if (currentSliceEl) currentSliceEl.textContent = '0';
          if (totalSlicesEl) totalSlicesEl.textContent = '...';
          if (progressPercentEl) progressPercentEl.textContent = '0%';
          if (progressBarEl) progressBarEl.style.width = '0%';
        } else {
          console.warn('[SegmentationModule] Progress container not found');
        }

        // Join inference room
        if (this.socket) {
          this.socket.emit('join-inference', result.inference_id);
        }

        this.state.notify('success', 'Inference started successfully');
      } else {
        throw new Error(result.error || 'Failed to start inference');
      }
    } catch (error) {
      console.error('[SegmentationModule] Inference start error:', error);
      this.state.notify('error', `Failed to start inference: ${error.message}`);
    }
  }

  /**
   * Download inference results
   */
  downloadResults() {
    if (this.currentInferenceId) {
      window.location.href = `/download-inference-results/${this.currentInferenceId}`;
    }
  }

  /**
   * Reset 3D view
   */
  resetView() {
    if (typeof resetCameraView === 'function') {
      resetCameraView();
    }
  }

  /**
   * Reset entire workflow
   */
  async resetWorkflow() {
    const confirmed = confirm('Are you sure you want to start a new analysis? This will clear all current data.');

    if (confirmed) {
      try {
        const response = await fetch('/reset-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });

        const result = await response.json();

        if (result.success) {
          this.state.notify('success', 'Session reset successfully');
          this.goToStep(1);
          // Reinitialize
          await this.initialize();
        }
      } catch (error) {
        console.error('[SegmentationModule] Reset error:', error);
        this.state.notify('error', `Reset failed: ${error.message}`);
      }
    }
  }

  /**
   * Check if there's a task to resume
   */
  async checkForResume() {
    const segmentationState = this.state.get('modules.segmentation');

    if (segmentationState && segmentationState.currentTask) {
      const task = segmentationState.currentTask;

      if (task.type === 'training') {
        this.currentTrainingId = task.trainingId;
        this.goToStep(3);
        // Rejoin training room
        if (this.socket) {
          this.socket.emit('join-training', task.trainingId);
        }
      } else if (task.type === 'inference') {
        this.currentInferenceId = task.inferenceId;
        this.goToStep(4);
        // Rejoin inference room
        if (this.socket) {
          this.socket.emit('join-inference', task.inferenceId);
        }
      }
    }
  }

  /**
   * Deactivate the module
   */
  async deactivate() {
    console.log('[SegmentationModule] Deactivating...');

    // Disconnect Socket.IO
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }

    // Destroy charts
    if (this.lossChart) {
      this.lossChart.destroy();
      this.lossChart = null;
    }

    if (this.diceChart) {
      this.diceChart.destroy();
      this.diceChart = null;
    }

    // Clean up Three.js
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer = null;
    }

    if (this.scene) {
      // Dispose geometries and materials
      this.scene.traverse((object) => {
        if (object.geometry) {
          object.geometry.dispose();
        }
        if (object.material) {
          if (Array.isArray(object.material)) {
            object.material.forEach(material => material.dispose());
          } else {
            object.material.dispose();
          }
        }
      });
      this.scene = null;
    }

    // Clear intervals
    if (this.trainingPollInterval) {
      clearInterval(this.trainingPollInterval);
      this.trainingPollInterval = null;
    }

    // Reset visualization flag to allow re-initialization
    this.visualizationInitialized = false;

    // Clear container
    if (this.container) {
      this.container.innerHTML = '';
    }

    console.log('[SegmentationModule] Deactivation complete');
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    console.log('[SegmentationModule] Cleaning up...');
    this.deactivate();
  }
}

// Export as default
export default SegmentationModule;
