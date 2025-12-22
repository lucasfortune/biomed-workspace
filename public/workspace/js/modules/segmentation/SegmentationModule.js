/**
 * SegmentationModule - Complete U-Net Segmentation Pipeline
 * Extends BaseModule for consistent lifecycle and step navigation.
 */

import BaseModule from '/workspace/js/core/BaseModule.js';
import { StepNavigator, FileSelector, ValidationDisplay } from '/workspace/js/core/components/index.js';

class SegmentationModule extends BaseModule {
  constructor(stateManager) {
    // Define module configuration with 4 steps
    const config = {
      id: 'segmentation',
      name: 'U-Net Segmentation Pipeline',
      cssPath: '/workspace/js/modules/segmentation/css/segmentation-modern.css',
      steps: [
        {
          id: 'upload',
          name: 'Data Upload',
          canNavigate: true  // Always accessible
        },
        {
          id: 'config',
          name: 'Configuration',
          canNavigate: (module) => module.filesValidated  // Requires files validated
        },
        {
          id: 'training',
          name: 'Training',
          canNavigate: (module) => module.configSaved,  // Requires config saved
          shouldSkip: (module) => module.hasImportedModel  // Skip if imported model
        },
        {
          id: 'inference',
          name: 'Inference',
          canNavigate: (module) => module.trainingComplete || module.hasImportedModel
        }
      ]
    };

    super(stateManager, config);

    // Module-specific state (replaces global variables from classic app)
    this.socket = null;
    this.currentTrainingId = null;
    this.currentInferenceId = null;
    this.trainingPollInterval = null;

    // State flags for step navigation
    this.filesValidated = false;
    this.configSaved = false;
    this.trainingComplete = false;
    this.hasImportedModel = false;

    // File uploads
    this.uploadedFiles = {
      raw_images: null,
      annotations: null,
      inference_data: null
    };

    // File selectors
    this.rawImageSelector = null;
    this.annotationsSelector = null;
    this.inferenceSelector = null;

    // Charts
    this.lossChart = null;
    this.diceChart = null;

    // Components
    this.stepNavigator = null;
    this.validationDisplay = null;

    // Bind methods (additional ones not in BaseModule)
    this.loadDependencies = this.loadDependencies.bind(this);
  }

  /**
   * Activate the module - overrides BaseModule.activate()
   * Custom implementation to handle Socket.IO and Chart.js dependencies
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

      // Show loading using BaseModule's method
      this.showLoading('Loading Module', 'Preparing Segmentation Pipeline...');

      // Load CSS using BaseModule's method (uses config.cssPath)
      if (this.config.cssPath) {
        await this.loadCSS(this.config.cssPath, `${this.config.id}-module-css`);
      }

      // Load dependencies (Socket.IO, Chart.js)
      await this.loadDependencies();

      // Render UI
      this.render();

      // Initialize components
      await this.initialize();

      // Hide loading
      this.hideLoading();

      // Check for resume
      await this.checkForResume();

      console.log('[SegmentationModule] Activation complete');

    } catch (error) {
      console.error('[SegmentationModule] Activation error:', error);
      this.state.notify('error', `Failed to activate segmentation module: ${error.message}`);
      this.hideLoading();
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

      this.dependenciesLoaded = true;
      console.log('[SegmentationModule] All dependencies loaded');

    } catch (error) {
      console.error('[SegmentationModule] Error loading dependencies:', error);
      throw new Error(`Failed to load dependencies: ${error.message}`);
    }
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
        <!-- Module Header (using BaseModule helper) -->
        ${this.renderHeader()}

        <!-- Step Navigation (using BaseModule helper) -->
        ${this.renderStepNav()}

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
              <p>Your model has been trained successfully. Select data below to run segmentation.</p>
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

              <!-- Inference Completion Section -->
              <div id="inferenceCompletionSection" class="completion-section" style="display: none; margin-top: 25px; padding: 25px; background: linear-gradient(135deg, #d4edda 0%, #c3e6cb 100%); border-radius: 12px; border: 1px solid #28a745; text-align: center;">
                <div style="font-size: 48px; margin-bottom: 15px;">✓</div>
                <h4 style="margin: 0 0 10px 0; font-size: 20px; color: #155724;">Segmentation Complete</h4>
                <p style="margin: 0 0 20px 0; font-size: 14px; color: #155724;">Your segmentation results are ready. View them in the Image Viewer or start a new analysis.</p>
                <div class="completion-actions" style="display: flex; gap: 12px; justify-content: center; flex-wrap: wrap;">
                  <button class="btn" id="openInViewerBtn" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">Open in Image Viewer</button>
                  <button class="btn secondary" id="resetWorkflowBtn">Start New Analysis</button>
                </div>
              </div>
            </div>

            <div class="navigation-buttons">
              <button class="btn secondary" id="step4Back">Previous</button>
              <div></div>
            </div>
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

    // Initialize StepNavigator component
    this.stepNavigator = new StepNavigator({
      steps: this.config.steps,
      currentStep: this.currentStep,
      onStepClick: (stepNum) => this.goToStep(stepNum),
      canNavigate: (stepNum) => this.canNavigateToStep(stepNum)
    });
    this.stepNavigator.init(this.container);

    // Initialize ValidationDisplay component
    this.validationDisplay = new ValidationDisplay('validationResult');

    // Set up back button handler
    const backButton = document.getElementById('backToHub');
    if (backButton) {
      backButton.addEventListener('click', () => workspace.returnToHub());
    }

    // Initialize Socket.IO
    this.initializeSocketConnection();

    // Initialize charts
    this.initializeCharts();

    // Set up event listeners
    this.setupEventListeners();

    // Load helper scripts
    await this.loadHelperScripts();

    // Update progress bar (using StepNavigator)
    if (this.stepNavigator) {
      this.stepNavigator.update(this.currentStep);
    }

    console.log('[SegmentationModule] Initialization complete');
  }

  /**
   * Load helper scripts (navigation, fileUpload, etc.)
   */
  async loadHelperScripts() {
    // Regular scripts (non-module)
    // Note: FileSelector is now imported from core/components as ES6 module
    const regularScripts = [
      '/workspace/js/modules/segmentation/SegmentationAPI.js',
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

    console.log('[SegmentationModule] Helper scripts loaded');
  }

  /**
   * Initialize FileSelector components
   * Uses FileSelector from core/components with config-based API
   */
  async initializeFileSelectors() {
    console.log('[SegmentationModule] Initializing FileSelectors...');

    // Create FileSelector instances with core component API
    this.rawImageSelector = new FileSelector({
      id: 'raw_images',
      fileType: 'raw_images',
      title: 'Raw Images',
      icon: '📁',
      showTestData: true,
      stateManager: this.state,
      onSelect: (fileInfo) => this.onFileSelected('raw_images', fileInfo),
      onUpload: (file, uploadedInfo) => this.onFileUploaded('raw_images', file, uploadedInfo)
    });

    this.annotationsSelector = new FileSelector({
      id: 'annotations',
      fileType: 'annotations',
      title: 'Annotations',
      icon: '🏷️',
      showTestData: true,
      stateManager: this.state,
      onSelect: (fileInfo) => this.onFileSelected('annotations', fileInfo),
      onUpload: (file, uploadedInfo) => this.onFileUploaded('annotations', file, uploadedInfo)
    });

    this.inferenceSelector = new FileSelector({
      id: 'inference_data',
      fileType: 'inference_data',
      title: 'Inference Data',
      icon: '📁',
      showTestData: true,
      stateManager: this.state,
      onSelect: (fileInfo) => this.onFileSelected('inference_data', fileInfo),
      onUpload: (file, uploadedInfo) => this.onFileUploaded('inference_data', file, uploadedInfo)
    });

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

    // Handle based on file type
    if (type === 'raw_images' || type === 'annotations') {
      // Check if both are test data
      const bothTestData =
        this.uploadedFiles.raw_images?.isTestData &&
        this.uploadedFiles.annotations?.isTestData;

      if (bothTestData) {
        // Both are test data - trigger test data loading
        await this.loadTestData();
      } else if (this.uploadedFiles.raw_images && this.uploadedFiles.annotations) {
        // Both files are selected (workspace files or mix)
        // Enable the Next button and mark as validated
        this.filesValidated = true;
        const step1Next = document.getElementById('step1Next');
        if (step1Next) {
          step1Next.disabled = false;
        }

        // Show validation message using ValidationDisplay component
        if (!this.validationDisplay) {
          this.validationDisplay = new ValidationDisplay('validationResult');
        }
        this.validationDisplay.showSuccess('Files Selected', [
          { label: 'Raw Images', value: this.uploadedFiles.raw_images.name || 'Selected' },
          { label: 'Annotations', value: this.uploadedFiles.annotations.name || 'Selected' }
        ]);

        // Save state
        this.saveState();
      }
    } else if (type === 'inference_data') {
      if (fileInfo.isTestData) {
        // Test inference data
        await this.loadTestInferenceData();
      } else if (fileInfo) {
        // Workspace file selected - enable Run Segmentation button
        const runInferenceBtn = document.getElementById('runInferenceBtn');
        if (runInferenceBtn) {
          runInferenceBtn.disabled = false;
        }

        // Save state
        this.saveState();
      }
    }
  }

  /**
   * Called when a file is uploaded via FileSelector
   * @returns {Promise<boolean>} - Returns true if validation was triggered, false otherwise
   */
  async onFileUploaded(type, file, uploadedFileInfo) {
    console.log(`[SegmentationModule] File uploaded for ${type}:`, {
      fileName: file.name,
      fileSize: file.size,
      uploadedPath: uploadedFileInfo.path,
      category: uploadedFileInfo.category
    });

    // Store the actual File object for validation
    if (!this.pendingFiles) {
      this.pendingFiles = {};
    }
    this.pendingFiles[type] = file;

    // Store the uploaded file info (contains path from server)
    if (!this.uploadedFiles) {
      this.uploadedFiles = {};
    }
    this.uploadedFiles[type] = uploadedFileInfo;

    // Log pending files state for debugging
    console.log(`[SegmentationModule] Pending files state:`, {
      keys: Object.keys(this.pendingFiles),
      has_raw_images: !!this.pendingFiles.raw_images,
      has_annotations: !!this.pendingFiles.annotations,
      has_inference_data: !!this.pendingFiles.inference_data
    });

    // If both training files uploaded, validate them together
    if (type === 'raw_images' || type === 'annotations') {
      const hasBoth = this.pendingFiles.raw_images && this.pendingFiles.annotations;
      console.log(`[SegmentationModule] Validation check:`, {
        type: type,
        hasBoth: hasBoth,
        willValidate: hasBoth
      });

      if (hasBoth) {
        await this.validateUploadedFiles();
        return true; // Validation was triggered
      }
    } else if (type === 'inference_data') {
      // Validate inference file immediately
      await this.validateInferenceFile(file);
      return true; // Validation was triggered
    }

    return false; // No validation triggered
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
        this.uploadedFiles.raw_images = { path: result.raw_images_path, isTestData: true };
        this.uploadedFiles.annotations = { path: result.annotations_path, isTestData: true };

        // Show validation results
        this.displayValidationResults(result.validation);

        // Mark files as validated for step navigation
        this.filesValidated = true;

        // Enable next button
        const step1Next = document.getElementById('step1Next');
        if (step1Next) {
          step1Next.disabled = false;
        }

        // Save state to persist uploaded files
        this.saveState();

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

      // Files are already uploaded to workspace, just validate them
      // Don't send file objects again (would cause multer to save duplicates)
      const formData = new FormData();
      formData.append('skipUpload', 'true'); // Signal to skip multer processing
      formData.append('raw_images_path', this.uploadedFiles.raw_images?.path || '');
      formData.append('annotations_path', this.uploadedFiles.annotations?.path || '');

      const response = await fetch('/upload-data', {
        method: 'POST',
        body: formData
      });

      const result = await response.json();

      if (result.success) {
        // Update uploadedFiles with validated info (preserve file names from original upload)
        this.uploadedFiles.raw_images = {
          path: result.raw_images_path,
          name: this.pendingFiles.raw_images?.name || 'Raw Images'
        };
        this.uploadedFiles.annotations = {
          path: result.annotations_path,
          name: this.pendingFiles.annotations?.name || 'Annotations'
        };

        // Show validation results
        this.displayValidationResults(result.validation);

        // Mark files as validated for step navigation
        this.filesValidated = true;

        // Enable next button
        const step1Next = document.getElementById('step1Next');
        if (step1Next) {
          step1Next.disabled = false;
        }

        // Update FileSelector UI to show uploaded files
        if (this.rawImageSelector && this.uploadedFiles.raw_images) {
          this.rawImageSelector.setSelectedFile(this.uploadedFiles.raw_images);
        }
        if (this.annotationsSelector && this.uploadedFiles.annotations) {
          this.annotationsSelector.setSelectedFile(this.uploadedFiles.annotations);
        }

        // Clear pending files
        this.pendingFiles = {};

        // Save state to persist uploaded files
        this.saveState();

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
        console.log('[SegmentationModule] Test inference data response:', result);
        // Use inference_data_path (relative to workspace) instead of file_path
        // The server's /run-inference expects a path relative to workspace
        const dataPath = result.inference_data_path || result.file_path;
        this.uploadedFiles.inference_data = { path: dataPath, isTestData: true };
        console.log('[SegmentationModule] Stored inference path:', this.uploadedFiles.inference_data.path);

        // Enable run inference button
        const runInferenceBtn = document.getElementById('runInferenceBtn');
        if (runInferenceBtn) {
          runInferenceBtn.disabled = false;
        }

        // Save state to persist uploaded files
        this.saveState();

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

      // File is already uploaded to workspace, just validate it
      // Don't send file object again (would cause multer to save duplicate)
      const formData = new FormData();
      formData.append('skipUpload', 'true');
      formData.append('inference_data_path', this.uploadedFiles.inference_data?.path || '');

      const response = await fetch('/upload-inference', {
        method: 'POST',
        body: formData
      });

      const result = await response.json();

      if (result.success) {
        this.uploadedFiles.inference_data = {
          path: result.inference_data_path,
          name: file?.name || 'Inference Data'
        };

        // Enable run inference button
        const runInferenceBtn = document.getElementById('runInferenceBtn');
        if (runInferenceBtn) {
          runInferenceBtn.disabled = false;
        }

        // Update FileSelector UI to show uploaded file
        if (this.inferenceSelector && this.uploadedFiles.inference_data) {
          this.inferenceSelector.setSelectedFile(this.uploadedFiles.inference_data);
        }

        // Save state to persist uploaded files
        this.saveState();

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
   * Display validation results using ValidationDisplay component
   */
  displayValidationResults(validation) {
    if (!this.validationDisplay) {
      this.validationDisplay = new ValidationDisplay('validationResult');
    }

    if (validation && validation.success !== false) {
      // Build details array for the component
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

      // Show warning separately if present
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
   */
  displayValidationError(errorMessage) {
    if (!this.validationDisplay) {
      this.validationDisplay = new ValidationDisplay('validationResult');
    }
    this.validationDisplay.showError('Validation Failed', errorMessage);
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

      // Show validation success using ValidationDisplay
      if (!this.validationDisplay) {
        this.validationDisplay = new ValidationDisplay('validationResult');
      }
      this.validationDisplay.showSuccess('Files Ready', 'Both files selected and ready for training');
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

      // Mark training as complete for step navigation
      this.trainingComplete = true;

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
    const runInferenceBtn = document.getElementById('runInferenceBtn');
    if (runInferenceBtn) {
      runInferenceBtn.onclick = () => this.runInference();
    }

    const step4Back = document.getElementById('step4Back');
    if (step4Back) step4Back.onclick = () => this.goToStep(3);

    // Step 4 Completion: Image Viewer and Reset
    const openInViewerBtn = document.getElementById('openInViewerBtn');
    if (openInViewerBtn) {
      openInViewerBtn.onclick = () => this.openInImageViewer();
    }

    const resetWorkflowBtn = document.getElementById('resetWorkflowBtn');
    if (resetWorkflowBtn) {
      resetWorkflowBtn.onclick = () => this.resetWorkflow();
    }

    console.log('[SegmentationModule] Event listeners set up');
  }

  /**
   * Navigate to a specific step
   */
  goToStep(stepNumber) {
    this.currentStep = stepNumber;

    // Update StepNavigator component (handles step classes and progress bar)
    if (this.stepNavigator) {
      this.stepNavigator.update(stepNumber);
    }

    // Update step content visibility
    const stepContents = document.querySelectorAll('.step-content');
    stepContents.forEach((content, index) => {
      if (index + 1 === stepNumber) {
        content.classList.add('active');
      } else {
        content.classList.remove('active');
      }
    });

    // Handle step-specific UI restoration
    if (stepNumber === 1) {
      // Restore step 1 button state based on uploaded files
      this.checkStep1Validation();
    } else if (stepNumber === 2) {
      // Step 2: Configuration is always accessible if we reached it
      const step2Next = document.getElementById('step2Next');
      if (step2Next && this.uploadedFiles.raw_images && this.uploadedFiles.annotations) {
        step2Next.disabled = false;
      }
    } else if (stepNumber === 3) {
      // Step 3: Enable next button if training is complete
      const trainingNextBtn = document.getElementById('trainingNextBtn');
      if (trainingNextBtn && this.currentTrainingId) {
        trainingNextBtn.disabled = false;
      }
    } else if (stepNumber === 4) {
      // Step 4: Restore inference button states
      if (this.uploadedFiles.inference_data) {
        const runInferenceBtn = document.getElementById('runInferenceBtn');
        if (runInferenceBtn) {
          runInferenceBtn.disabled = false;
        }
      }
      // Show completion section if inference was completed
      if (this.currentInferenceId && window.inferenceResult) {
        const completionSection = document.getElementById('inferenceCompletionSection');
        if (completionSection) {
          completionSection.style.display = 'block';
        }
      }
    }

    // Scroll main-content container to top when changing steps
    const mainContent = document.querySelector('.segmentation-module .main-content');
    if (mainContent) {
      mainContent.scrollTop = 0;
    }

    // Save state to persist current step
    this.saveState();
  }

  /**
   * Update progress bar (delegates to StepNavigator if available)
   */
  updateProgressBar() {
    if (this.stepNavigator) {
      this.stepNavigator.update(this.currentStep);
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
        // Mark config as saved for step navigation
        this.configSaved = true;

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

        // Join training room
        if (this.socket) {
          this.socket.emit('join-training', result.training_id);
        }

        // Save state to persist training ID
        this.saveState();

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
   * Run inference
   */
  async runInference() {
    console.log('[SegmentationModule] Running inference...');
    console.log('[SegmentationModule] uploadedFiles.inference_data:', this.uploadedFiles.inference_data);

    try {
      // Prepare request body
      const requestBody = {};

      // Add data path (required)
      if (this.uploadedFiles.inference_data && this.uploadedFiles.inference_data.path) {
        // Check if path is the placeholder 'test_data' which means loadTestInferenceData didn't complete
        if (this.uploadedFiles.inference_data.path === 'test_data') {
          console.warn('[SegmentationModule] Path is still "test_data" - loading not complete, retrying...');
          await this.loadTestInferenceData();
        }
        requestBody.data_path = this.uploadedFiles.inference_data.path;
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

        // Sync to global variable for inference.js
        if (typeof currentInferenceId !== 'undefined') {
          currentInferenceId = result.inference_id;
        }

        // Hide result div from previous inference (if any)
        const resultDiv = document.getElementById('inferenceResult');
        if (resultDiv) {
          resultDiv.style.display = 'none';
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

        // Save state to persist inference ID
        this.saveState();

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
   * Open results in Image Viewer module
   */
  openInImageViewer() {
    // Store inference result in StateManager for Image Viewer to consume
    const inferenceData = {
      type: 'segmentation_result',
      inferenceId: this.currentInferenceId,
      outputPath: window.inferenceResult?.output_path,
      metadataPath: window.inferenceResult?.metadata_path,
      timestamp: Date.now()
    };

    this.state.update('modules.segmentation.inferenceResults', inferenceData);

    // Navigate to Image Viewer module
    window.workspace.loadModule('imageviewer');
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
          // Clear global inference result
          if (typeof window.inferenceResult !== 'undefined') {
            window.inferenceResult = null;
          }

          // Destroy existing charts before reinitializing
          if (this.lossChart) {
            this.lossChart.destroy();
            this.lossChart = null;
          }
          if (this.diceChart) {
            this.diceChart.destroy();
            this.diceChart = null;
          }

          // Reset uploaded files
          this.uploadedFiles = {
            raw_images: null,
            annotations: null,
            inference_data: null
          };

          // Reset step condition flags
          this.filesValidated = false;
          this.configSaved = false;
          this.trainingComplete = false;
          this.hasImportedModel = false;

          // Reset IDs
          this.currentTrainingId = null;
          this.currentInferenceId = null;

          // Reset training UI state
          this.resetTrainingUIState();

          // Reset inference UI state
          this.resetInferenceUIState();

          // Clear validation display on Step 1
          if (this.validationDisplay) {
            this.validationDisplay.hide();
          }

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
   * Reset training UI to initial state
   */
  resetTrainingUIState() {
    // Show start button, hide progress
    const trainingActionContent = document.getElementById('trainingActionContent');
    const trainingProgressContent = document.getElementById('trainingProgressContent');

    if (trainingActionContent) {
      trainingActionContent.style.display = 'block';
    }
    if (trainingProgressContent) {
      trainingProgressContent.style.display = 'none';
    }

    // Reset progress bar
    const trainingProgressFill = document.getElementById('trainingProgressFill');
    if (trainingProgressFill) {
      trainingProgressFill.style.width = '0%';
    }

    // Reset epoch counters
    const currentEpoch = document.getElementById('currentEpoch');
    const totalEpochs = document.getElementById('totalEpochs');
    if (currentEpoch) currentEpoch.textContent = '0';
    if (totalEpochs) totalEpochs.textContent = '0';

    // Reset metrics
    const trainLoss = document.getElementById('trainLoss');
    const valLoss = document.getElementById('valLoss');
    const trainDice = document.getElementById('trainDice');
    const valDice = document.getElementById('valDice');
    if (trainLoss) trainLoss.textContent = '--';
    if (valLoss) valLoss.textContent = '--';
    if (trainDice) trainDice.textContent = '--';
    if (valDice) valDice.textContent = '--';

    // Reset status text
    const trainingStatusText = document.getElementById('trainingStatusText');
    if (trainingStatusText) {
      trainingStatusText.textContent = 'Training started... Preparing data...';
    }

    // Disable Next button
    const trainingNextBtn = document.getElementById('trainingNextBtn');
    if (trainingNextBtn) {
      trainingNextBtn.disabled = true;
    }

    console.log('[SegmentationModule] Training UI state reset to initial');
  }

  /**
   * Reset inference UI to initial state
   */
  resetInferenceUIState() {
    // Hide inference progress container
    const inferenceProgressContainer = document.getElementById('inferenceProgressContainer');
    if (inferenceProgressContainer) {
      inferenceProgressContainer.style.display = 'none';
    }

    // Hide inference result div
    const inferenceResult = document.getElementById('inferenceResult');
    if (inferenceResult) {
      inferenceResult.style.display = 'none';
    }

    // Reset progress elements
    const currentSlice = document.getElementById('currentSlice');
    const totalSlices = document.getElementById('totalSlices');
    const inferenceProgressPercent = document.getElementById('inferenceProgressPercent');
    const inferenceProgressBar = document.getElementById('inferenceProgressBar');

    if (currentSlice) currentSlice.textContent = '0';
    if (totalSlices) totalSlices.textContent = '0';
    if (inferenceProgressPercent) inferenceProgressPercent.textContent = '0%';
    if (inferenceProgressBar) inferenceProgressBar.style.width = '0%';

    // Disable "Next: Visualization" button
    const inferenceNextBtn = document.getElementById('inferenceNextBtn');
    if (inferenceNextBtn) {
      inferenceNextBtn.disabled = true;
    }

    // Disable "Run Inference" button (will be enabled when data is uploaded)
    const runInferenceBtn = document.getElementById('runInferenceBtn');
    if (runInferenceBtn) {
      runInferenceBtn.disabled = true;
    }

    console.log('[SegmentationModule] Inference UI state reset to initial');
  }

  /**
   * Save current module state to StateManager for persistence
   */
  saveState() {
    const state = {
      currentStep: this.currentStep,
      uploadedFiles: this.uploadedFiles,
      currentTrainingId: this.currentTrainingId,
      currentInferenceId: this.currentInferenceId,
      currentTask: null,
      // Step condition flags
      filesValidated: this.filesValidated,
      configSaved: this.configSaved,
      trainingComplete: this.trainingComplete,
      hasImportedModel: this.hasImportedModel
    };

    // Preserve currentTask if it exists
    if (this.currentTrainingId) {
      state.currentTask = { type: 'training', trainingId: this.currentTrainingId };
    } else if (this.currentInferenceId) {
      state.currentTask = { type: 'inference', inferenceId: this.currentInferenceId };
    }

    // Update state in StateManager
    this.state.update('modules.segmentation.currentStep', this.currentStep);
    this.state.update('modules.segmentation.uploadedFiles', this.uploadedFiles);
    this.state.update('modules.segmentation.currentTrainingId', this.currentTrainingId);
    this.state.update('modules.segmentation.currentInferenceId', this.currentInferenceId);
    // Persist step condition flags
    this.state.update('modules.segmentation.filesValidated', this.filesValidated);
    this.state.update('modules.segmentation.configSaved', this.configSaved);
    this.state.update('modules.segmentation.trainingComplete', this.trainingComplete);
    this.state.update('modules.segmentation.hasImportedModel', this.hasImportedModel);
    if (state.currentTask) {
      this.state.update('modules.segmentation.currentTask', state.currentTask);
    }

    console.log('[SegmentationModule] State saved:', state);
  }

  /**
   * Check if there's a task to resume
   */
  async checkForResume() {
    const segmentationState = this.state.get('modules.segmentation');

    if (!segmentationState) {
      console.log('[SegmentationModule] No saved state to resume');
      return;
    }

    console.log('[SegmentationModule] Checking for resume:', segmentationState);

    // Restore uploaded files
    if (segmentationState.uploadedFiles) {
      this.uploadedFiles = segmentationState.uploadedFiles;
      console.log('[SegmentationModule] Restored uploaded files:', this.uploadedFiles);
    }

    // Restore step condition flags
    if (segmentationState.filesValidated !== undefined) {
      this.filesValidated = segmentationState.filesValidated;
    }
    if (segmentationState.configSaved !== undefined) {
      this.configSaved = segmentationState.configSaved;
    }
    if (segmentationState.trainingComplete !== undefined) {
      this.trainingComplete = segmentationState.trainingComplete;
    }
    if (segmentationState.hasImportedModel !== undefined) {
      this.hasImportedModel = segmentationState.hasImportedModel;
    }
    console.log('[SegmentationModule] Restored step flags:', {
      filesValidated: this.filesValidated,
      configSaved: this.configSaved,
      trainingComplete: this.trainingComplete,
      hasImportedModel: this.hasImportedModel
    });

    // Restore training/inference IDs
    if (segmentationState.currentTrainingId) {
      this.currentTrainingId = segmentationState.currentTrainingId;
      console.log('[SegmentationModule] Restored training ID:', this.currentTrainingId);
    }

    if (segmentationState.currentInferenceId) {
      this.currentInferenceId = segmentationState.currentInferenceId;
      console.log('[SegmentationModule] Restored inference ID:', this.currentInferenceId);
    }

    // Restore current step
    if (segmentationState.currentStep && segmentationState.currentStep !== 1) {
      console.log('[SegmentationModule] Restoring to step:', segmentationState.currentStep);
      this.goToStep(segmentationState.currentStep);

      // Rejoin Socket.IO rooms if needed
      if (segmentationState.currentTask) {
        if (segmentationState.currentTask.type === 'training' && this.socket) {
          this.socket.emit('join-training', segmentationState.currentTask.trainingId);
          console.log('[SegmentationModule] Rejoined training room');
        } else if (segmentationState.currentTask.type === 'inference' && this.socket) {
          this.socket.emit('join-inference', segmentationState.currentTask.inferenceId);
          console.log('[SegmentationModule] Rejoined inference room');
        }
      }
    }

    // If we have uploaded files on step 1, restore the validation UI
    if (this.currentStep === 1 && (this.uploadedFiles.raw_images || this.uploadedFiles.annotations)) {
      console.log('[SegmentationModule] Restoring step 1 validation UI');
      this.restoreStep1Validation();
    }

    // Restore training UI state if training is in progress
    if (segmentationState.currentTask?.type === 'training') {
      console.log('[SegmentationModule] Restoring training UI state');
      this.restoreTrainingUI();
    }

    // If we're on step 4 (inference), restore inference UI
    if (this.currentStep === 4 && this.uploadedFiles.inference_data) {
      console.log('[SegmentationModule] Restoring step 4 inference UI');
      this.restoreStep4InferenceUI();
    }
  }

  /**
   * Restore Step 1 validation UI after resume
   */
  restoreStep1Validation() {
    // Check if both files are present
    if (this.uploadedFiles.raw_images && this.uploadedFiles.annotations) {
      const step1Next = document.getElementById('step1Next');
      if (step1Next) {
        step1Next.disabled = false;
      }

      // Show validation success using ValidationDisplay component
      if (this.validationDisplay) {
        const details = [
          { label: 'Raw Images', value: this.uploadedFiles.raw_images.isTestData ? 'Test Dataset' : 'Custom Upload' },
          { label: 'Annotations', value: this.uploadedFiles.annotations.isTestData ? 'Test Dataset' : 'Custom Upload' },
          { label: 'Status', value: 'Files are ready. Click Next to configure training.' }
        ];
        this.validationDisplay.showSuccess('Files Loaded', details);
      }

      // Update FileSelector UI to show selected files
      if (this.rawImageSelector && this.uploadedFiles.raw_images) {
        this.rawImageSelector.setSelectedFile(this.uploadedFiles.raw_images);
      }
      if (this.annotationsSelector && this.uploadedFiles.annotations) {
        this.annotationsSelector.setSelectedFile(this.uploadedFiles.annotations);
      }
    }
  }

  /**
   * Restore training UI state (show progress, hide start button)
   */
  restoreTrainingUI() {
    // Toggle UI visibility
    const trainingActionContent = document.getElementById('trainingActionContent');
    const trainingProgressContent = document.getElementById('trainingProgressContent');

    if (trainingActionContent) {
      trainingActionContent.style.display = 'none';
    }
    if (trainingProgressContent) {
      trainingProgressContent.style.display = 'block';
    }

    // Set status text
    const statusText = document.getElementById('trainingStatusText');
    if (statusText) {
      statusText.textContent = 'Training in progress...';
    }

    // Enable Next button (training may have completed while away)
    const trainingNextBtn = document.getElementById('trainingNextBtn');
    if (trainingNextBtn) {
      trainingNextBtn.disabled = false;
    }

    console.log('[SegmentationModule] Training UI state restored');
  }

  /**
   * Restore Step 4 inference UI after resume
   */
  restoreStep4InferenceUI() {
    // Enable run inference button
    const runInferenceBtn = document.getElementById('runInferenceBtn');
    if (runInferenceBtn) {
      runInferenceBtn.disabled = false;
    }

    // Update FileSelector UI to show selected file
    if (this.inferenceSelector && this.uploadedFiles.inference_data) {
      this.inferenceSelector.setSelectedFile(this.uploadedFiles.inference_data);
    }

    console.log('[SegmentationModule] Step 4 inference UI restored');
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

    // Clear intervals
    if (this.trainingPollInterval) {
      clearInterval(this.trainingPollInterval);
      this.trainingPollInterval = null;
    }

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
