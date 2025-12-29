/**
 * DLDenoisingModule - Deep Learning Image Denoising
 *
 * Provides N2V (Noise2Void) and autoStructN2V denoising for TIFF stacks.
 * Uses self-supervised learning - no clean training data required.
 *
 * Workflow:
 * 1. Data Selection - Choose input image and denoising method
 * 2. Configure - Set training parameters
 * 3. Training - Train denoising model with real-time progress
 * 4. Inference - Apply trained model to denoise images
 */

import BaseModule from '/workspace/js/core/BaseModule.js';
import { StepNavigator, FileSelector, ValidationDisplay }
  from '/workspace/js/core/components/index.js';
import DLDenoisingAPI from './DLDenoisingAPI.js';
import CollapsibleSection from './components/CollapsibleSection.js';
import TrainingProgress from './components/TrainingProgress.js';
import LossChart from './components/LossChart.js';
import ResultsDisplay from './components/ResultsDisplay.js';
import MaskVisualization from './components/MaskVisualization.js';
import MaskParameterPanel from './components/MaskParameterPanel.js';

class DLDenoisingModule extends BaseModule {

  constructor(stateManager) {
    super(stateManager, {
      id: 'denoising-dl',
      name: 'Deep Learning Denoising',
      cssPath: '/workspace/js/modules/denoising-dl/css/dl-denoising.css',
      steps: [
        { id: 'data', name: 'Data Selection' },
        { id: 'configure', name: 'Configure' },
        { id: 'training', name: 'Training' },
        { id: 'inference', name: 'Inference' }
      ]
    });

    // API client
    this.api = new DLDenoisingAPI();

    // Step condition flags
    this.fileValidated = false;
    this.methodSelected = false;
    this.configSaved = false;
    this.trainingComplete = false;

    // Component references
    this.stepNavigator = null;
    this.validationDisplay = null;
    this.fileSelector = null;

    // Module state
    this.uploadedFile = null;
    this.selectedMethod = null; // 'n2v' or 'autostructn2v'
    this.gpuInfo = null;
    this.validationResult = null;
    this.trainingId = null;
    this.trainingResult = null;
    this.inferenceResult = null;

    // Presets and parameter ranges (loaded from backend)
    this.presets = null;
    this.parameterRanges = null;
    this.currentPreset = 'balanced';

    // Training configuration
    this.trainingConfig = {
      stage1: {},
      stage2: {},
      maskExtractor: {}
    };

    // Collapsible sections for config
    this.configSections = {};

    // Training components
    this.trainingProgress = null;
    this.lossChart = null;
    this.stage2LossChart = null;
    this.resultsDisplay = null;

    // Chart instances and best loss tracking
    this.charts = { n2v: null, stage1: null, stage2: null };
    this.bestValLoss = { n2v: Infinity, stage1: Infinity, stage2: Infinity };

    // Mask components (autoStructN2V)
    this.maskVisualization = null;
    this.maskParameterPanel = null;
    this.maskData = null;

    // Socket.IO connection
    this.socket = null;
    this.socketConnected = false;

    // Bind methods
    this.onFileSelected = this.onFileSelected.bind(this);
    this.onFileUploaded = this.onFileUploaded.bind(this);
    this.onMethodChange = this.onMethodChange.bind(this);
    this.onPresetChange = this.onPresetChange.bind(this);
    this.startTraining = this.startTraining.bind(this);
  }

  render() {
    this.container.innerHTML = `
      <div class="dl-denoising-module module-container">
        ${this.renderHeader()}
        ${this.renderStepNav()}

        <div class="step-contents">
          <!-- Step 1: Data Selection -->
          <div id="step1" class="step-content active">
            <div class="step-inner">
              <h3>Select Image Data & Method</h3>
              <p class="step-description">
                Choose a TIFF stack to denoise and select your denoising method.
                Deep learning denoising uses self-supervised learning - no clean reference images needed.
              </p>

              <!-- GPU Status -->
              <div id="gpuStatus" class="gpu-status">
                <span class="gpu-status-icon">⏳</span>
                <span class="gpu-status-text">Checking GPU availability...</span>
              </div>

              <!-- File Selection -->
              <div class="section-card">
                <h4>Input Image</h4>
                <div id="fileSelectorContainer"></div>
                <div id="validationResult"></div>
              </div>

              <!-- Method Selection -->
              <div class="section-card">
                <div class="method-selector">
                  <h4>Denoising Method</h4>
                  <label class="method-option">
                    <input type="radio" name="dl-method" value="n2v">
                    <span class="method-content">
                      <span class="method-name">
                        Noise2Void (N2V)
                        <span class="method-badge recommended">Recommended</span>
                      </span>
                      <span class="method-desc">
                        Fast single-stage training. Best for random, uncorrelated noise (Gaussian, Poisson).
                        Ideal for most microscopy images.
                      </span>
                    </span>
                  </label>
                  <label class="method-option">
                    <input type="radio" name="dl-method" value="autostructn2v">
                    <span class="method-content">
                      <span class="method-name">
                        autoStructN2V
                        <span class="method-badge advanced">Advanced</span>
                      </span>
                      <span class="method-desc">
                        Two-stage training with automatic structured noise detection.
                        Best for periodic artifacts, scan lines, or camera-specific patterns.
                      </span>
                    </span>
                  </label>
                </div>
              </div>

              <div class="navigation-buttons">
                <div></div>
                <button id="step1Next" class="btn" disabled>Next: Configure</button>
              </div>
            </div>
          </div>

          <!-- Step 2: Configuration -->
          <div id="step2" class="step-content">
            <div class="step-inner">
              <h3>Configure Training</h3>
              <p class="step-description">
                Select a preset or customize training parameters.
                <span id="methodModeLabel"></span>
              </p>

              <!-- Preset Selector -->
              <div class="section-card preset-section">
                <div class="preset-header">
                  <h4>Configuration Preset</h4>
                  <select id="presetSelector" class="preset-dropdown">
                    <option value="fast">Fast - Quick training, lower quality</option>
                    <option value="balanced" selected>Balanced - Recommended for most cases</option>
                    <option value="high_quality">High Quality - Best results, longer training</option>
                  </select>
                </div>
                <p id="presetDescription" class="preset-desc"></p>
              </div>

              <!-- Configuration Columns Container -->
              <div id="configColumnsContainer"></div>

              <!-- Mask Extractor Config (autoStructN2V only) -->
              <div id="maskExtractorSection" style="display: none;"></div>

              <div class="navigation-buttons">
                <button id="step2Back" class="btn secondary">Back</button>
                <button id="step2Next" class="btn">Next: Training</button>
              </div>
            </div>
          </div>

          <!-- Step 3: Run Denoising -->
          <div id="step3" class="step-content">
            <div class="step-inner">
              <h3>Run Denoising</h3>
              <p class="step-description">
                Train the denoising model on your image data. The training process will
                denoise your images - results are available once training completes.
              </p>

              <!-- Start Training Button (shown when not training) -->
              <div id="startTrainingSection" class="training-start-section">
                <button id="startTrainingBtn" class="btn primary large" onclick="window.dlDenoisingModule?.startTraining()">
                  <span class="btn-icon">&#9658;</span>
                  Start Denoising
                </button>
              </div>

              <!-- N2V Training Section (single stage) -->
              <div id="n2vTrainingSection" class="training-stage-section" style="display: none;">
                <div class="collapsible-section expanded">
                  <div class="collapsible-header" data-section="n2vTraining">
                    <span class="collapsible-icon">▼</span>
                    <h4>Training Progress</h4>
                    <span class="stage-status" id="n2vStageStatus">Initializing...</span>
                  </div>
                  <div class="collapsible-body" id="n2vTrainingBody">
                    <!-- Progress Bar with Download Buttons -->
                    <div class="training-status" id="n2vProgressStatus">
                      <div class="status-text" id="n2vStatusText">Preparing training data...</div>
                      <div class="training-progress">
                        <div class="progress-header-row">
                          <span class="epoch-info">Epoch <span id="n2vCurrentEpoch">0</span> of <span id="n2vTotalEpochs">0</span></span>
                          <div class="download-buttons" id="n2vDownloadButtons" style="display: none;">
                            <button class="btn primary small" onclick="window.dlDenoisingModule?.openInImageViewer('stage1')">
                              Open in Viewer
                            </button>
                            <button class="btn secondary small" onclick="window.dlDenoisingModule?.startNewAnalysis()">
                              Start new Analysis
                            </button>
                          </div>
                        </div>
                        <div class="training-progress-bar">
                          <div class="training-progress-fill" id="n2vProgressFill"></div>
                        </div>
                      </div>
                    </div>

                    <!-- Chart + Metrics Grid -->
                    <div class="training-display-grid">
                      <div class="chart-container">
                        <h5>Loss Curves</h5>
                        <div class="chart-wrapper">
                          <canvas id="n2vLossChart"></canvas>
                        </div>
                      </div>
                      <div class="metrics-stack">
                        <div class="metric-card">
                          <div class="metric-value" id="n2vTrainLoss">--</div>
                          <div class="metric-label">Training Loss</div>
                        </div>
                        <div class="metric-card">
                          <div class="metric-value" id="n2vValLoss">--</div>
                          <div class="metric-label">Validation Loss</div>
                        </div>
                        <div class="metric-card best-metric">
                          <div class="metric-value" id="n2vBestValLoss">--</div>
                          <div class="metric-label">Best Val Loss</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- autoStructN2V Training Sections (multi-stage) -->
              <div id="autoStructTrainingSection" style="display: none;">

                <!-- Stage 1 Section -->
                <div class="collapsible-section expanded" id="stage1Section">
                  <div class="collapsible-header" data-section="stage1Training">
                    <span class="collapsible-icon">▼</span>
                    <h4>Stage 1: N2V Training</h4>
                    <span class="stage-status" id="stage1StageStatus">Pending</span>
                  </div>
                  <div class="collapsible-body" id="stage1TrainingBody">
                    <!-- Progress Bar -->
                    <div class="training-status" id="stage1ProgressStatus">
                      <div class="status-text" id="stage1StatusText">Waiting to start...</div>
                      <div class="training-progress">
                        <div class="progress-header-row">
                          <span class="epoch-info">Epoch <span id="stage1CurrentEpoch">0</span> of <span id="stage1TotalEpochs">0</span></span>
                          <div class="download-buttons" id="stage1DownloadButtons" style="display: none;">
                            <button class="btn secondary small" onclick="window.dlDenoisingModule?.openInImageViewer('stage1')">
                              Open Stage 1 in Viewer
                            </button>
                          </div>
                        </div>
                        <div class="training-progress-bar">
                          <div class="training-progress-fill" id="stage1ProgressFill"></div>
                        </div>
                      </div>
                    </div>

                    <!-- Chart + Metrics Grid -->
                    <div class="training-display-grid">
                      <div class="chart-container">
                        <h5>Loss Curves</h5>
                        <div class="chart-wrapper">
                          <canvas id="stage1LossChart"></canvas>
                        </div>
                      </div>
                      <div class="metrics-stack">
                        <div class="metric-card">
                          <div class="metric-value" id="stage1TrainLoss">--</div>
                          <div class="metric-label">Training Loss</div>
                        </div>
                        <div class="metric-card">
                          <div class="metric-value" id="stage1ValLoss">--</div>
                          <div class="metric-label">Validation Loss</div>
                        </div>
                        <div class="metric-card best-metric">
                          <div class="metric-value" id="stage1BestValLoss">--</div>
                          <div class="metric-label">Best Val Loss</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Mask Extraction Section -->
                <div class="collapsible-section expanded" id="maskSection">
                  <div class="collapsible-header" data-section="maskExtraction">
                    <span class="collapsible-icon">▼</span>
                    <h4>Mask Extraction</h4>
                    <span class="stage-status" id="maskStageStatus">Pending</span>
                  </div>
                  <div class="collapsible-body" id="maskExtractionBody">
                    <div class="mask-section-content">
                      <div id="maskVisualizationContainer"></div>
                      <div id="maskParameterContainer"></div>
                    </div>
                    <div class="mask-actions" id="maskActions" style="display: none;">
                      <button class="btn primary" id="approveMaskBtn" onclick="window.dlDenoisingModule?.approveMask()">
                        Approve & Continue to Stage 2
                      </button>
                      <button class="btn secondary" onclick="window.dlDenoisingModule?.skipStage2()">
                        Skip Stage 2
                      </button>
                    </div>
                  </div>
                </div>

                <!-- Stage 2 Section -->
                <div class="collapsible-section expanded" id="stage2Section">
                  <div class="collapsible-header" data-section="stage2Training">
                    <span class="collapsible-icon">▼</span>
                    <h4>Stage 2: Struct-N2V Training</h4>
                    <span class="stage-status" id="stage2StageStatus">Pending</span>
                  </div>
                  <div class="collapsible-body" id="stage2TrainingBody">
                    <!-- Progress Bar -->
                    <div class="training-status" id="stage2ProgressStatus">
                      <div class="status-text" id="stage2StatusText">Waiting for Stage 1 and mask approval...</div>
                      <div class="training-progress">
                        <div class="progress-header-row">
                          <span class="epoch-info">Epoch <span id="stage2CurrentEpoch">0</span> of <span id="stage2TotalEpochs">0</span></span>
                          <div class="download-buttons" id="stage2DownloadButtons" style="display: none;">
                            <button class="btn primary small" onclick="window.dlDenoisingModule?.openInImageViewer('stage2')">
                              Open in Viewer
                            </button>
                            <button class="btn secondary small" onclick="window.dlDenoisingModule?.startNewAnalysis()">
                              Start new Analysis
                            </button>
                          </div>
                        </div>
                        <div class="training-progress-bar">
                          <div class="training-progress-fill" id="stage2ProgressFill"></div>
                        </div>
                      </div>
                    </div>

                    <!-- Chart + Metrics Grid -->
                    <div class="training-display-grid">
                      <div class="chart-container">
                        <h5>Loss Curves</h5>
                        <div class="chart-wrapper">
                          <canvas id="stage2LossChart"></canvas>
                        </div>
                      </div>
                      <div class="metrics-stack">
                        <div class="metric-card">
                          <div class="metric-value" id="stage2TrainLoss">--</div>
                          <div class="metric-label">Training Loss</div>
                        </div>
                        <div class="metric-card">
                          <div class="metric-value" id="stage2ValLoss">--</div>
                          <div class="metric-label">Validation Loss</div>
                        </div>
                        <div class="metric-card best-metric">
                          <div class="metric-value" id="stage2BestValLoss">--</div>
                          <div class="metric-label">Best Val Loss</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div class="navigation-buttons">
                <button id="step3Back" class="btn secondary">Back</button>
                <button id="step3Next" class="btn" disabled>Process Additional Images (Optional)</button>
              </div>
            </div>
          </div>

          <!-- Step 4: Inference (placeholder for Phase 7) -->
          <div id="step4" class="step-content">
            <div class="step-inner">
              <h3>Inference</h3>
              <p class="step-description">
                Apply the trained model to denoise images.
              </p>

              <div class="section-card placeholder-section">
                <div class="placeholder-icon">🔬</div>
                <div class="placeholder-text">
                  Inference functionality will be implemented in Phase 7.
                  <br><br>
                  This will allow you to apply the trained model to your
                  training data or upload new images for denoising.
                </div>
              </div>

              <div class="navigation-buttons">
                <button id="step4Back" class="btn secondary">Back</button>
                <button id="step4Finish" class="btn" disabled>View Results</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  async initialize() {
    console.log('[DLDenoisingModule] Initializing components...');

    // Initialize StepNavigator
    this.stepNavigator = new StepNavigator({
      steps: this.config.steps,
      currentStep: this.currentStep,
      onStepClick: (stepNum) => this.goToStep(stepNum),
      canNavigate: (stepNum) => this.canNavigateToStep(stepNum)
    });
    this.stepNavigator.init(this.container);

    // Initialize ValidationDisplay
    this.validationDisplay = new ValidationDisplay('validationResult');

    // Initialize FileSelector
    const fileSelectorContainer = document.getElementById('fileSelectorContainer');
    if (fileSelectorContainer) {
      this.fileSelector = new FileSelector({
        id: 'dl_denoising_input',
        fileType: 'raw_images',
        title: 'Input Image Stack',
        icon: '📁',
        showTestData: true,
        testDataOptions: [
          {
            value: 'denoising_test_data',
            label: 'Test Dataset - Denoising'
          }
        ],
        stateManager: this.state,
        onSelect: this.onFileSelected,
        onUpload: this.onFileUploaded
      });
      fileSelectorContainer.innerHTML = this.fileSelector.render();
      this.fileSelector.init();
    }

    // Set up event listeners
    this.setupEventListeners();

    // Check GPU availability
    await this.checkGPU();

    // Load configuration presets
    await this.loadPresets();

    // Expose global for onclick handlers
    window.dlDenoisingModule = this;

    console.log('[DLDenoisingModule] Initialization complete');
  }

  /**
   * Load configuration presets from backend
   */
  async loadPresets() {
    try {
      const result = await this.api.getPresets();
      if (result.success) {
        this.presets = result.presets;
        this.parameterRanges = result.parameterRanges;
        this.currentPreset = result.defaults?.preset || 'balanced';
        console.log('[DLDenoisingModule] Presets loaded:', Object.keys(this.presets));
      }
    } catch (error) {
      console.error('[DLDenoisingModule] Error loading presets:', error);
      // Use fallback defaults
      this.presets = this.getDefaultPresets();
    }
  }

  /**
   * Get fallback default presets (matches spec section 5.2)
   */
  getDefaultPresets() {
    return {
      balanced: {
        name: 'Balanced',
        description: 'Good balance between training time and quality.',
        stage1: {
          patch_size: 32,
          patches_per_image: 100,
          batch_size: 4,
          mask_percentage: 15,
          use_augmentation: true,
          features: 64,
          num_layers: 2,
          learning_rate: 0.0001,
          epochs: 100,
          early_stopping: true,
          early_stopping_patience: 10,
          use_roi: true,
          roi_threshold: 0.5,
          use_resize_conv: true,
          upsampling_mode: 'bilinear',
          masking_strategy: 0
        },
        stage2: {
          patch_size: 64,
          patches_per_image: 200,
          batch_size: 2,
          mask_percentage: 10,
          use_augmentation: true,
          features: 64,
          num_layers: 3,
          learning_rate: 0.00001,
          epochs: 100,
          early_stopping: true,
          early_stopping_patience: 10,
          use_resize_conv: true,
          upsampling_mode: 'bilinear'
        },
        maskExtractor: {
          adaptive_thresholding: true,
          base_percentile: 50,
          percentile_decay: 1.15,
          max_masked_pixels: 25
        }
      }
    };
  }

  setupEventListeners() {
    // Back to Hub
    const backButton = document.getElementById('backToHub');
    if (backButton) {
      backButton.addEventListener('click', () => window.workspace.returnToHub());
    }

    // Step navigation buttons
    document.getElementById('step1Next')?.addEventListener('click', () => this.nextStep());
    document.getElementById('step2Back')?.addEventListener('click', () => this.previousStep());
    document.getElementById('step2Next')?.addEventListener('click', () => this.nextStep());
    document.getElementById('step3Back')?.addEventListener('click', () => this.previousStep());
    document.getElementById('step3Next')?.addEventListener('click', () => this.nextStep());
    document.getElementById('step4Back')?.addEventListener('click', () => this.previousStep());
    document.getElementById('step4Finish')?.addEventListener('click', () => this.viewResults());

    // Method selector
    document.querySelectorAll('input[name="dl-method"]').forEach(radio => {
      radio.addEventListener('change', (e) => this.onMethodChange(e.target.value));
    });

    // Preset selector
    document.getElementById('presetSelector')?.addEventListener('change', (e) => {
      this.onPresetChange(e.target.value);
    });
  }

  async checkGPU() {
    const statusEl = document.getElementById('gpuStatus');
    if (!statusEl) return;

    try {
      const result = await this.api.checkGPU();
      this.gpuInfo = result;

      if (result.available) {
        statusEl.className = 'gpu-status available';
        statusEl.innerHTML = `
          <span class="gpu-status-icon">✓</span>
          <span class="gpu-status-text">
            GPU Available: ${result.device_name || 'CUDA Device'}
            <span class="gpu-status-detail">${result.memory_total_formatted || ''} VRAM</span>
          </span>
        `;
      } else {
        statusEl.className = 'gpu-status unavailable';
        statusEl.innerHTML = `
          <span class="gpu-status-icon">⚠️</span>
          <span class="gpu-status-text">
            No GPU detected - Training will use CPU
            <span class="gpu-status-detail">This may be significantly slower (10-50x)</span>
          </span>
        `;
      }
    } catch (error) {
      console.error('[DLDenoisingModule] Error checking GPU:', error);
      statusEl.className = 'gpu-status unavailable';
      statusEl.innerHTML = `
        <span class="gpu-status-icon">❓</span>
        <span class="gpu-status-text">Could not determine GPU status</span>
      `;
    }
  }

  onMethodChange(method) {
    console.log('[DLDenoisingModule] Method changed:', method);
    this.selectedMethod = method;
    this.methodSelected = true;
    this.updateNextButton();
  }

  async onFileSelected(fileInfo) {
    console.log('[DLDenoisingModule] File selected:', fileInfo);

    if (!fileInfo) {
      // Deselection
      this.uploadedFile = null;
      this.fileValidated = false;
      this.validationResult = null;
      this.updateNextButton();
      return;
    }

    // Handle test data - load it via API endpoint
    if (fileInfo.isTestData) {
      try {
        this.validationDisplay.showLoading('Loading test data...');

        const result = await this.api.loadTestData();

        if (result.success && result.file) {
          this.uploadedFile = {
            id: result.file.id,
            name: result.file.name,
            path: result.file.path,
            isTestData: true
          };

          // Validate the test data file
          await this.validateFile(result.file.path);
        } else {
          throw new Error(result.error || 'Failed to load test data');
        }
      } catch (error) {
        console.error('[DLDenoisingModule] Error loading test data:', error);
        this.validationDisplay.showError('Error', error.message);
        this.state.notify('error', `Failed to load test data: ${error.message}`);
      }
      return;
    }

    // Regular file selection - validate the file
    this.uploadedFile = fileInfo;
    await this.validateFile(fileInfo.path);
  }

  async onFileUploaded(file, uploadedFile) {
    console.log('[DLDenoisingModule] File uploaded:', uploadedFile);

    this.uploadedFile = {
      id: uploadedFile.id,
      name: uploadedFile.name || file.name,
      path: uploadedFile.path,
      isTestData: false
    };

    // Validate the uploaded file
    await this.validateFile(uploadedFile.path);
  }

  async validateFile(filePath) {
    console.log('[DLDenoisingModule] Validating file:', filePath);

    this.validationDisplay.showLoading('Validating file for DL denoising...');
    this.fileValidated = false;
    this.validationResult = null;

    try {
      const result = await this.api.validateFile(filePath);
      console.log('[DLDenoisingModule] Validation result:', result);

      this.validationResult = result;

      if (result.valid) {
        // Build details array
        const details = [
          { label: 'Filename', value: result.info?.filename || this.uploadedFile?.name },
          { label: 'Dimensions', value: `${result.info?.dimensions?.width} x ${result.info?.dimensions?.height}` },
          { label: 'Slices', value: result.info?.num_slices?.toString() },
          { label: 'Bit Depth', value: `${result.info?.bit_depth}-bit` },
          { label: 'File Size', value: result.info?.file_size_formatted }
        ];

        // Add warnings if any
        if (result.warnings && result.warnings.length > 0) {
          this.validationDisplay.showSuccess('File Valid (with warnings)', details);
          result.warnings.forEach(warning => {
            this.state.notify('warning', warning, 8000);
          });
        } else {
          this.validationDisplay.showSuccess('File Valid', details);
        }

        this.fileValidated = true;
      } else {
        // Show errors
        const errorMessages = result.errors?.join('; ') || 'Unknown validation error';
        this.validationDisplay.showError('Validation Failed', errorMessages);
        this.state.notify('error', errorMessages);
      }

    } catch (error) {
      console.error('[DLDenoisingModule] Validation error:', error);
      this.validationDisplay.showError('Validation Error', error.message);
      this.state.notify('error', `Validation failed: ${error.message}`);
    }

    this.updateNextButton();
  }

  updateNextButton() {
    const step1Next = document.getElementById('step1Next');
    if (step1Next) {
      // Both file and method must be selected
      step1Next.disabled = !(this.fileValidated && this.methodSelected);
    }
  }

  canNavigateToStep(stepNumber) {
    switch (stepNumber) {
      case 1: return true;
      case 2: return this.fileValidated && this.methodSelected;
      case 3: return this.configSaved;
      case 4: return this.trainingComplete;
      default: return false;
    }
  }

  goToStep(stepNumber) {
    super.goToStep(stepNumber);
    if (this.stepNavigator) {
      this.stepNavigator.update(stepNumber);
    }

    // Render Step 2 when navigating to it
    if (stepNumber === 2) {
      this.renderStep2Config();
    }

    // Initialize Step 3 when navigating to it
    if (stepNumber === 3) {
      this.initializeStep3();
    }
  }

  /**
   * Initialize Step 3 (Training/Denoising)
   */
  initializeStep3() {
    console.log('[DLDenoisingModule] Initializing Step 3...');

    // Initialize best val loss tracking
    this.bestValLoss = { n2v: Infinity, stage1: Infinity, stage2: Infinity };

    // Initialize collapsible section handlers
    this.initCollapsibleSections();

    // Charts will be initialized when training starts (after Chart.js is loaded)
    this.charts = { n2v: null, stage1: null, stage2: null };

    // Check if there's an ongoing training to resume
    this.checkTrainingStatus();
  }

  /**
   * Initialize collapsible section toggle functionality
   */
  initCollapsibleSections() {
    const headers = document.querySelectorAll('.collapsible-header');
    headers.forEach(header => {
      header.addEventListener('click', () => {
        const section = header.closest('.collapsible-section');
        const icon = header.querySelector('.collapsible-icon');
        const body = section.querySelector('.collapsible-body');

        if (section.classList.contains('expanded')) {
          section.classList.remove('expanded');
          section.classList.add('collapsed');
          icon.textContent = '▶';
          body.style.display = 'none';
        } else {
          section.classList.remove('collapsed');
          section.classList.add('expanded');
          icon.textContent = '▼';
          body.style.display = 'block';
        }
      });
    });
  }

  /**
   * Initialize Chart.js and create charts
   */
  async initializeCharts() {
    // Load Chart.js from CDN if not already loaded
    if (!window.Chart) {
      await new Promise((resolve, reject) => {
        if (window.Chart) {
          resolve();
          return;
        }
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js';
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
    }

    // Chart configuration
    const chartConfig = (canvasId) => ({
      type: 'line',
      data: {
        labels: [],
        datasets: [
          {
            label: 'Train Loss',
            data: [],
            borderColor: '#4A90E2',
            backgroundColor: 'rgba(74, 144, 226, 0.1)',
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.1,
            fill: false
          },
          {
            label: 'Val Loss',
            data: [],
            borderColor: '#E24A4A',
            backgroundColor: 'rgba(226, 74, 74, 0.1)',
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.1,
            fill: false
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 0 },
        plugins: {
          legend: { display: true, position: 'bottom', labels: { boxWidth: 12, padding: 8 } },
          tooltip: { mode: 'index', intersect: false }
        },
        scales: {
          x: {
            display: true,
            title: { display: true, text: 'Epoch', color: '#666' },
            grid: { color: 'rgba(0, 0, 0, 0.05)' }
          },
          y: {
            display: true,
            title: { display: true, text: 'Loss', color: '#666' },
            grid: { color: 'rgba(0, 0, 0, 0.05)' },
            ticks: { callback: (v) => v.toFixed(4) }
          }
        }
      }
    });

    // Create charts for the current method
    if (this.selectedMethod === 'n2v') {
      const canvas = document.getElementById('n2vLossChart');
      if (canvas) {
        this.charts.n2v = new Chart(canvas.getContext('2d'), chartConfig('n2vLossChart'));
      }
    } else {
      // autoStructN2V - create stage 1 and stage 2 charts
      const stage1Canvas = document.getElementById('stage1LossChart');
      if (stage1Canvas) {
        this.charts.stage1 = new Chart(stage1Canvas.getContext('2d'), chartConfig('stage1LossChart'));
      }
      const stage2Canvas = document.getElementById('stage2LossChart');
      if (stage2Canvas) {
        this.charts.stage2 = new Chart(stage2Canvas.getContext('2d'), chartConfig('stage2LossChart'));
      }
    }
  }

  /**
   * Add point to a chart
   */
  addChartPoint(chartKey, epoch, trainLoss, valLoss) {
    const chart = this.charts[chartKey];
    if (!chart) return;

    chart.data.labels.push(epoch);
    chart.data.datasets[0].data.push(trainLoss);
    chart.data.datasets[1].data.push(valLoss);
    chart.update('none');
  }

  /**
   * Check if there's an ongoing training to resume
   */
  async checkTrainingStatus() {
    if (!this.trainingId) {
      // Check StateManager for saved training ID
      const savedTrainingId = this.state.get(`modules.denoising-dl.trainingId`);
      if (savedTrainingId) {
        this.trainingId = savedTrainingId;
      }
    }

    if (this.trainingId) {
      try {
        const status = await this.api.getTrainingStatus(this.trainingId);
        if (status.status === 'running') {
          // Resume training UI
          this.showTrainingInProgress();
          this.connectToTrainingSocket();
        } else if (status.status === 'completed') {
          // Show results
          this.showTrainingComplete(status);
        }
      } catch (error) {
        console.error('[DLDenoisingModule] Error checking training status:', error);
      }
    }
  }

  nextStep() {
    if (this.currentStep === 1) {
      if (!this.fileValidated) {
        this.state.notify('error', 'Please select a file first');
        return;
      }
      if (!this.methodSelected) {
        this.state.notify('error', 'Please select a denoising method');
        return;
      }
    }

    // Save config when leaving Step 2
    if (this.currentStep === 2) {
      this.saveConfig();
      this.configSaved = true;
    }

    super.nextStep();
  }

  /**
   * Render Step 2 configuration UI
   */
  renderStep2Config() {
    console.log('[DLDenoisingModule] Rendering Step 2 config for method:', this.selectedMethod);

    // Update method mode label
    const methodLabel = document.getElementById('methodModeLabel');
    if (methodLabel) {
      const isAutoStruct = this.selectedMethod === 'autostructn2v';
      methodLabel.innerHTML = isAutoStruct
        ? '<strong>(autoStructN2V - Two Stage Training)</strong>'
        : '<strong>(N2V - Single Stage Training)</strong>';
    }

    // Load preset config if not already loaded
    if (!this.trainingConfig.stage1.patch_size) {
      this.applyPreset(this.currentPreset);
    }

    // Update preset description
    this.updatePresetDescription();

    // Render configuration columns
    this.renderConfigColumns();

    // Show/hide mask extractor section
    const maskSection = document.getElementById('maskExtractorSection');
    if (maskSection) {
      if (this.selectedMethod === 'autostructn2v') {
        maskSection.style.display = 'block';
        this.renderMaskExtractorConfig();
      } else {
        maskSection.style.display = 'none';
      }
    }
  }

  /**
   * Render the configuration columns (single or dual)
   */
  renderConfigColumns() {
    const container = document.getElementById('configColumnsContainer');
    if (!container) return;

    const isDualColumn = this.selectedMethod === 'autostructn2v';

    if (isDualColumn) {
      // autoStructN2V: Two-column layout per spec 3.3.2
      // Each column has its own config form with Advanced Options inside
      container.innerHTML = `
        <div class="config-columns dual-column">
          <div class="config-column stage1-column">
            <div class="column-header">
              <h4>STAGE 1</h4>
            </div>
            <div class="column-content" id="stage1ConfigContent">
              ${this.renderStageConfigForm('stage1')}
            </div>
          </div>

          <div class="config-column stage2-column">
            <div class="column-header">
              <h4>STAGE 2</h4>
            </div>
            <div class="column-content" id="stage2ConfigContent">
              ${this.renderStageConfigForm('stage2')}
            </div>
          </div>
        </div>
      `;
    } else {
      // N2V: Single column layout matching segmentation module
      container.innerHTML = this.renderN2VConfigForm();
    }

    // Set up input change listeners
    this.setupConfigInputListeners();
  }

  /**
   * Render N2V configuration form (single column, per spec 3.3.1)
   */
  renderN2VConfigForm() {
    const config = this.trainingConfig.stage1 || {};

    return `
      <div class="config-form" id="stage1ConfigContent" data-stage="stage1">
        <div class="config-group">
          <h3>Dataset Configuration</h3>
          <div class="form-field">
            <label for="stage1_patch_size">Patch Size</label>
            <select id="stage1_patch_size" data-param="patch_size">
              <option value="32" ${config.patch_size === 32 ? 'selected' : ''}>32</option>
              <option value="48" ${config.patch_size === 48 ? 'selected' : ''}>48</option>
              <option value="64" ${config.patch_size === 64 || !config.patch_size ? 'selected' : ''}>64</option>
              <option value="96" ${config.patch_size === 96 ? 'selected' : ''}>96</option>
              <option value="128" ${config.patch_size === 128 ? 'selected' : ''}>128</option>
            </select>
          </div>
          <div class="form-field">
            <label for="stage1_patches_per_image">Patches per Image</label>
            <input type="number" id="stage1_patches_per_image" data-param="patches_per_image"
                   value="${config.patches_per_image || 100}" min="50" max="500" step="10">
          </div>
          <div class="form-field">
            <label for="stage1_batch_size">Batch Size</label>
            <select id="stage1_batch_size" data-param="batch_size">
              <option value="1" ${config.batch_size === 1 ? 'selected' : ''}>1</option>
              <option value="2" ${config.batch_size === 2 ? 'selected' : ''}>2</option>
              <option value="4" ${config.batch_size === 4 ? 'selected' : ''}>4</option>
              <option value="8" ${config.batch_size === 8 || !config.batch_size ? 'selected' : ''}>8</option>
              <option value="16" ${config.batch_size === 16 ? 'selected' : ''}>16</option>
              <option value="32" ${config.batch_size === 32 ? 'selected' : ''}>32</option>
            </select>
          </div>
          <div class="form-field">
            <label for="stage1_mask_percentage">Mask Percentage (%)</label>
            <input type="number" id="stage1_mask_percentage" data-param="mask_percentage"
                   value="${config.mask_percentage || 15}" min="5" max="30" step="1">
          </div>
          <div class="form-field checkbox-field">
            <input type="checkbox" id="stage1_use_augmentation" data-param="use_augmentation"
                   ${config.use_augmentation !== false ? 'checked' : ''}>
            <label for="stage1_use_augmentation">Apply Data Augmentation</label>
          </div>
        </div>

        <div class="config-group">
          <h3>Model Architecture</h3>
          <div class="form-field">
            <label for="stage1_features">Number of Features</label>
            <select id="stage1_features" data-param="features">
              <option value="32" ${config.features === 32 ? 'selected' : ''}>32</option>
              <option value="48" ${config.features === 48 ? 'selected' : ''}>48</option>
              <option value="64" ${config.features === 64 || !config.features ? 'selected' : ''}>64</option>
              <option value="96" ${config.features === 96 ? 'selected' : ''}>96</option>
              <option value="128" ${config.features === 128 ? 'selected' : ''}>128</option>
            </select>
          </div>
          <div class="form-field">
            <label for="stage1_num_layers">Number of Layers</label>
            <select id="stage1_num_layers" data-param="num_layers">
              <option value="2" ${config.num_layers === 2 ? 'selected' : ''}>2</option>
              <option value="3" ${config.num_layers === 3 ? 'selected' : ''}>3</option>
              <option value="4" ${config.num_layers === 4 || !config.num_layers ? 'selected' : ''}>4</option>
            </select>
          </div>
        </div>

        <div class="config-group">
          <h3>Training Parameters</h3>
          <div class="form-field">
            <label for="stage1_learning_rate">Learning Rate</label>
            <select id="stage1_learning_rate" data-param="learning_rate">
              <option value="0.00001" ${config.learning_rate === 0.00001 ? 'selected' : ''}>1e-5</option>
              <option value="0.00005" ${config.learning_rate === 0.00005 ? 'selected' : ''}>5e-5</option>
              <option value="0.0001" ${config.learning_rate === 0.0001 || !config.learning_rate ? 'selected' : ''}>1e-4</option>
              <option value="0.0002" ${config.learning_rate === 0.0002 ? 'selected' : ''}>2e-4</option>
            </select>
          </div>
          <div class="form-field">
            <label for="stage1_epochs">Number of Epochs</label>
            <input type="number" id="stage1_epochs" data-param="epochs"
                   value="${config.epochs || 100}" min="10" max="500" step="10">
          </div>
          <div class="form-field checkbox-field">
            <input type="checkbox" id="stage1_early_stopping" data-param="early_stopping"
                   ${config.early_stopping !== false ? 'checked' : ''}>
            <label for="stage1_early_stopping">Early Stopping</label>
          </div>
          <div class="form-field">
            <label for="stage1_early_stopping_patience">Early Stopping Patience</label>
            <input type="number" id="stage1_early_stopping_patience" data-param="early_stopping_patience"
                   value="${config.early_stopping_patience || 10}" min="5" max="50" step="5"
                   ${config.early_stopping === false ? 'disabled' : ''}>
          </div>
        </div>

        <div class="config-group collapsible-group">
          <div class="collapsible-header" data-toggle="stage1_advanced_body">
            <h3>
              <span class="collapsible-icon">▶</span>
              Advanced Options
            </h3>
          </div>
          <div class="collapsible-body" id="stage1_advanced_body" style="display: none;">
            <div class="form-field checkbox-field">
              <input type="checkbox" id="stage1_use_resize_conv" data-param="use_resize_conv"
                     ${config.use_resize_conv !== false ? 'checked' : ''}>
              <label for="stage1_use_resize_conv">Resize Convolution</label>
            </div>
            <div class="form-field">
              <label for="stage1_upsampling_mode">Upsampling Mode</label>
              <select id="stage1_upsampling_mode" data-param="upsampling_mode">
                <option value="bilinear" ${config.upsampling_mode === 'bilinear' || !config.upsampling_mode ? 'selected' : ''}>Bilinear</option>
                <option value="nearest" ${config.upsampling_mode === 'nearest' ? 'selected' : ''}>Nearest</option>
                <option value="bicubic" ${config.upsampling_mode === 'bicubic' ? 'selected' : ''}>Bicubic</option>
              </select>
            </div>
            <div class="form-field">
              <label for="stage1_masking_strategy">Masking Strategy</label>
              <select id="stage1_masking_strategy" data-param="masking_strategy">
                <option value="0" ${config.masking_strategy === 0 || config.masking_strategy === undefined ? 'selected' : ''}>Local Mean</option>
                <option value="1" ${config.masking_strategy === 1 ? 'selected' : ''}>Zeros</option>
                <option value="2" ${config.masking_strategy === 2 ? 'selected' : ''}>Random</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render a stage configuration form for autoStructN2V (per spec 3.3.2)
   * Uses same layout as N2V - one parameter per line, with collapsible Advanced Options
   */
  renderStageConfigForm(stage) {
    const config = this.trainingConfig[stage] || {};
    const isStage1 = stage === 'stage1';

    return `
      <div class="config-form" data-stage="${stage}">
        <div class="config-group">
          <h3>Dataset Configuration</h3>
          <div class="form-field">
            <label for="${stage}_patch_size">Patch Size</label>
            <select id="${stage}_patch_size" data-param="patch_size">
              <option value="32" ${config.patch_size === 32 ? 'selected' : ''}>32</option>
              <option value="48" ${config.patch_size === 48 ? 'selected' : ''}>48</option>
              <option value="64" ${config.patch_size === 64 || !config.patch_size ? 'selected' : ''}>64</option>
              <option value="96" ${config.patch_size === 96 ? 'selected' : ''}>96</option>
              <option value="128" ${config.patch_size === 128 ? 'selected' : ''}>128</option>
            </select>
          </div>
          <div class="form-field">
            <label for="${stage}_patches_per_image">Patches per Image</label>
            <input type="number" id="${stage}_patches_per_image" data-param="patches_per_image"
                   value="${config.patches_per_image || (isStage1 ? 100 : 200)}" min="50" max="500" step="10">
          </div>
          <div class="form-field">
            <label for="${stage}_batch_size">Batch Size</label>
            <select id="${stage}_batch_size" data-param="batch_size">
              <option value="1" ${config.batch_size === 1 ? 'selected' : ''}>1</option>
              <option value="2" ${config.batch_size === 2 ? 'selected' : ''}>2</option>
              <option value="4" ${config.batch_size === 4 ? 'selected' : ''}>4</option>
              <option value="8" ${config.batch_size === 8 || !config.batch_size ? 'selected' : ''}>8</option>
              <option value="16" ${config.batch_size === 16 ? 'selected' : ''}>16</option>
              <option value="32" ${config.batch_size === 32 ? 'selected' : ''}>32</option>
            </select>
          </div>
          <div class="form-field">
            <label for="${stage}_mask_percentage">Mask Percentage (%)</label>
            <input type="number" id="${stage}_mask_percentage" data-param="mask_percentage"
                   value="${config.mask_percentage || (isStage1 ? 15 : 10)}" min="5" max="30" step="1">
          </div>
          <div class="form-field checkbox-field">
            <input type="checkbox" id="${stage}_use_augmentation" data-param="use_augmentation"
                   ${config.use_augmentation !== false ? 'checked' : ''}>
            <label for="${stage}_use_augmentation">Apply Data Augmentation</label>
          </div>
        </div>

        <div class="config-group">
          <h3>Model Architecture</h3>
          <div class="form-field">
            <label for="${stage}_features">Number of Features</label>
            <select id="${stage}_features" data-param="features">
              <option value="32" ${config.features === 32 ? 'selected' : ''}>32</option>
              <option value="48" ${config.features === 48 ? 'selected' : ''}>48</option>
              <option value="64" ${config.features === 64 || !config.features ? 'selected' : ''}>64</option>
              <option value="96" ${config.features === 96 ? 'selected' : ''}>96</option>
              <option value="128" ${config.features === 128 ? 'selected' : ''}>128</option>
            </select>
          </div>
          <div class="form-field">
            <label for="${stage}_num_layers">Number of Layers</label>
            <select id="${stage}_num_layers" data-param="num_layers">
              <option value="2" ${config.num_layers === 2 ? 'selected' : ''}>2</option>
              <option value="3" ${config.num_layers === 3 ? 'selected' : ''}>3</option>
              <option value="4" ${config.num_layers === 4 || !config.num_layers ? 'selected' : ''}>4</option>
              <option value="5" ${config.num_layers === 5 ? 'selected' : ''}>5</option>
            </select>
          </div>
        </div>

        <div class="config-group">
          <h3>Training Parameters</h3>
          <div class="form-field">
            <label for="${stage}_learning_rate">Learning Rate</label>
            <select id="${stage}_learning_rate" data-param="learning_rate">
              <option value="0.00001" ${config.learning_rate === 0.00001 ? 'selected' : ''}>1e-5</option>
              <option value="0.00005" ${config.learning_rate === 0.00005 ? 'selected' : ''}>5e-5</option>
              <option value="0.0001" ${config.learning_rate === 0.0001 || !config.learning_rate ? 'selected' : ''}>1e-4</option>
              <option value="0.0002" ${config.learning_rate === 0.0002 ? 'selected' : ''}>2e-4</option>
            </select>
          </div>
          <div class="form-field">
            <label for="${stage}_epochs">Number of Epochs</label>
            <input type="number" id="${stage}_epochs" data-param="epochs"
                   value="${config.epochs || 100}" min="10" max="500" step="10">
          </div>
          <div class="form-field checkbox-field">
            <input type="checkbox" id="${stage}_early_stopping" data-param="early_stopping"
                   ${config.early_stopping !== false ? 'checked' : ''}>
            <label for="${stage}_early_stopping">Early Stopping</label>
          </div>
          <div class="form-field">
            <label for="${stage}_early_stopping_patience">Early Stopping Patience</label>
            <input type="number" id="${stage}_early_stopping_patience" data-param="early_stopping_patience"
                   value="${config.early_stopping_patience || 10}" min="5" max="50" step="5"
                   ${config.early_stopping === false ? 'disabled' : ''}>
          </div>
        </div>

        <div class="config-group collapsible-group">
          <div class="collapsible-header" data-toggle="${stage}_advanced_body">
            <h3>
              <span class="collapsible-icon">▶</span>
              Advanced Options
            </h3>
          </div>
          <div class="collapsible-body" id="${stage}_advanced_body" style="display: none;">
            ${isStage1 ? `
            <div class="form-field checkbox-field">
              <input type="checkbox" id="${stage}_use_roi" data-param="use_roi"
                     ${config.use_roi !== false ? 'checked' : ''}>
              <label for="${stage}_use_roi">ROI Selection</label>
            </div>
            <div class="form-field">
              <label for="${stage}_roi_threshold">ROI Threshold</label>
              <input type="number" id="${stage}_roi_threshold" data-param="roi_threshold"
                     value="${config.roi_threshold || 0.5}" min="0.3" max="0.7" step="0.1"
                     ${config.use_roi === false ? 'disabled' : ''}>
            </div>
            ` : ''}
            <div class="form-field checkbox-field">
              <input type="checkbox" id="${stage}_use_resize_conv" data-param="use_resize_conv"
                     ${config.use_resize_conv !== false ? 'checked' : ''}>
              <label for="${stage}_use_resize_conv">Resize Convolution</label>
            </div>
            <div class="form-field">
              <label for="${stage}_upsampling_mode">Upsampling Mode</label>
              <select id="${stage}_upsampling_mode" data-param="upsampling_mode">
                <option value="bilinear" ${config.upsampling_mode === 'bilinear' || !config.upsampling_mode ? 'selected' : ''}>Bilinear</option>
                <option value="nearest" ${config.upsampling_mode === 'nearest' ? 'selected' : ''}>Nearest</option>
                <option value="bicubic" ${config.upsampling_mode === 'bicubic' ? 'selected' : ''}>Bicubic</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render mask extractor configuration (autoStructN2V only)
   * Uses same structure as stage config forms for visual consistency
   */
  renderMaskExtractorConfig() {
    const container = document.getElementById('maskExtractorSection');
    if (!container) return;

    const config = this.trainingConfig.maskExtractor || {};

    container.innerHTML = `
      <div class="config-form mask-extractor-form">
        <div class="config-group collapsible-group">
          <div class="collapsible-header" data-toggle="maskExtractorBody">
            <h3>
              <span class="collapsible-icon">▶</span>
              Mask Extractor Configuration
            </h3>
          </div>
          <div class="collapsible-body" id="maskExtractorBody" style="display: none;">
            <p class="section-desc">
              Configure how structural noise patterns are detected between Stage 1 and Stage 2.
            </p>
            <div class="form-field checkbox-field">
              <input type="checkbox" id="mask_adaptive_thresholding" data-param="adaptive_thresholding"
                     ${config.adaptive_thresholding !== false ? 'checked' : ''}>
              <label for="mask_adaptive_thresholding">Adaptive Thresholding</label>
            </div>
            <div class="form-field">
              <label for="mask_base_percentile">Base Percentile</label>
              <input type="number" id="mask_base_percentile" data-param="base_percentile"
                     value="${config.base_percentile || 50}" min="30" max="70" step="5">
              <span class="field-hint">Threshold for noise detection (30-70)</span>
            </div>
            <div class="form-field">
              <label for="mask_percentile_decay">Percentile Decay</label>
              <input type="number" id="mask_percentile_decay" data-param="percentile_decay"
                     value="${config.percentile_decay || 1.15}" min="1.0" max="1.3" step="0.05">
              <span class="field-hint">Decay rate for adaptive threshold</span>
            </div>
            <div class="form-field">
              <label for="mask_max_masked_pixels">Max Masked Pixels (%)</label>
              <input type="number" id="mask_max_masked_pixels" data-param="max_masked_pixels"
                     value="${config.max_masked_pixels || 30}" min="10" max="40" step="5">
              <span class="field-hint">Maximum percentage of pixels to mask</span>
            </div>
          </div>
        </div>
      </div>
    `;

    // Set up collapsible toggle
    this.setupCollapsibleToggles();
    // Set up input listeners for mask config
    this.setupMaskConfigListeners();
  }

  /**
   * Set up collapsible section toggles
   * Only adds listeners to elements that haven't been initialized yet
   */
  setupCollapsibleToggles() {
    document.querySelectorAll('[data-toggle]:not([data-toggle-initialized])').forEach(header => {
      // Mark as initialized to prevent duplicate listeners
      header.setAttribute('data-toggle-initialized', 'true');

      header.addEventListener('click', () => {
        const bodyId = header.getAttribute('data-toggle');
        const body = document.getElementById(bodyId);
        const icon = header.querySelector('.collapsible-icon');

        if (body) {
          const isVisible = body.style.display !== 'none';
          body.style.display = isVisible ? 'none' : 'block';
          if (icon) icon.textContent = isVisible ? '▶' : '▼';
        }
      });
    });
  }

  /**
   * Set up config input change listeners
   */
  setupConfigInputListeners() {
    // Stage 1 inputs
    document.querySelectorAll('#stage1ConfigContent [data-param]').forEach(input => {
      input.addEventListener('change', (e) => this.onConfigInputChange('stage1', e.target));
    });

    // Stage 2 inputs (if present)
    document.querySelectorAll('#stage2ConfigContent [data-param]').forEach(input => {
      input.addEventListener('change', (e) => this.onConfigInputChange('stage2', e.target));
    });

    // Early stopping toggle logic
    ['stage1', 'stage2'].forEach(stage => {
      const toggle = document.getElementById(`${stage}_early_stopping`);
      const patience = document.getElementById(`${stage}_early_stopping_patience`);
      if (toggle && patience) {
        toggle.addEventListener('change', () => {
          patience.disabled = !toggle.checked;
        });
      }
    });

    // Set up collapsible toggles
    this.setupCollapsibleToggles();
  }

  /**
   * Set up mask extractor config listeners
   */
  setupMaskConfigListeners() {
    document.querySelectorAll('#maskExtractorSection [data-param]').forEach(input => {
      input.addEventListener('change', (e) => this.onConfigInputChange('maskExtractor', e.target));
    });
  }

  /**
   * Handle config input change
   */
  onConfigInputChange(stage, input) {
    const param = input.getAttribute('data-param');
    let value;

    if (input.type === 'checkbox') {
      value = input.checked;
    } else if (input.type === 'number') {
      value = parseFloat(input.value);
    } else {
      value = parseInt(input.value) || input.value;
    }

    this.trainingConfig[stage][param] = value;
    console.log(`[DLDenoisingModule] Config updated: ${stage}.${param} =`, value);
  }

  /**
   * Handle preset change
   */
  onPresetChange(presetName) {
    console.log('[DLDenoisingModule] Preset changed to:', presetName);
    this.currentPreset = presetName;
    this.applyPreset(presetName);
    this.updatePresetDescription();
    this.renderConfigColumns();

    // Re-render mask extractor if visible
    if (this.selectedMethod === 'autostructn2v') {
      this.renderMaskExtractorConfig();
    }
  }

  /**
   * Apply a preset configuration
   */
  applyPreset(presetName) {
    const preset = this.presets?.[presetName];
    if (!preset) {
      console.warn('[DLDenoisingModule] Preset not found:', presetName);
      return;
    }

    this.trainingConfig.stage1 = { ...preset.stage1 };
    this.trainingConfig.stage2 = { ...preset.stage2 };
    this.trainingConfig.maskExtractor = { ...preset.maskExtractor };

    console.log('[DLDenoisingModule] Applied preset:', presetName);
  }

  /**
   * Update preset description text
   */
  updatePresetDescription() {
    const descEl = document.getElementById('presetDescription');
    if (!descEl) return;

    const preset = this.presets?.[this.currentPreset];
    if (preset) {
      descEl.textContent = preset.description || '';
    }
  }

  /**
   * Save current configuration
   */
  saveConfig() {
    // Read all current values from the form
    this.readConfigFromForm('stage1');
    if (this.selectedMethod === 'autostructn2v') {
      this.readConfigFromForm('stage2');
      this.readMaskConfigFromForm();
    }

    console.log('[DLDenoisingModule] Configuration after reading from form:', JSON.stringify(this.trainingConfig, null, 2));
  }

  /**
   * Read configuration values from form inputs
   */
  readConfigFromForm(stage) {
    const container = document.getElementById(`${stage}ConfigContent`);
    if (!container) {
      console.warn(`[DLDenoisingModule] Container not found: ${stage}ConfigContent`);
      return;
    }

    const inputs = container.querySelectorAll('[data-param]');
    console.log(`[DLDenoisingModule] Found ${inputs.length} inputs in ${stage}ConfigContent`);

    inputs.forEach(input => {
      const param = input.getAttribute('data-param');
      let value;

      if (input.type === 'checkbox') {
        value = input.checked;
      } else if (input.type === 'number') {
        value = parseFloat(input.value);
      } else if (input.tagName === 'SELECT') {
        // Handle select elements - parse numeric values
        const rawValue = input.value;
        const numValue = parseFloat(rawValue);
        value = isNaN(numValue) ? rawValue : numValue;
      } else {
        value = parseInt(input.value) || input.value;
      }

      this.trainingConfig[stage][param] = value;
    });
  }

  /**
   * Read mask extractor configuration from form
   */
  readMaskConfigFromForm() {
    const container = document.getElementById('maskExtractorSection');
    if (!container) return;

    container.querySelectorAll('[data-param]').forEach(input => {
      const param = input.getAttribute('data-param');
      let value;

      if (input.type === 'checkbox') {
        value = input.checked;
      } else if (input.type === 'number') {
        value = parseFloat(input.value);
      } else {
        value = input.value;
      }

      this.trainingConfig.maskExtractor[param] = value;
    });
  }

  // ==================== TRAINING METHODS ====================

  /**
   * Start the denoising training process
   */
  async startTraining() {
    console.log('[DLDenoisingModule] Starting training...');

    if (!this.uploadedFile || !this.selectedMethod) {
      this.state.notify('error', 'Please select a file and method first');
      return;
    }

    // Read all current form values before starting training
    this.saveConfig();

    console.log('[DLDenoisingModule] Training config:', JSON.stringify(this.trainingConfig, null, 2));

    // Prepare training configuration in the format expected by backend
    // Backend expects: { method, config, inputPath }
    const trainingConfig = {
      method: this.selectedMethod,
      inputPath: this.uploadedFile.path,
      config: {
        stage1: this.trainingConfig.stage1,
        stage2: this.selectedMethod === 'autostructn2v' ? this.trainingConfig.stage2 : null,
        maskExtractor: this.selectedMethod === 'autostructn2v' ? this.trainingConfig.maskExtractor : null
      }
    };

    try {
      // Update UI to show training in progress
      this.showTrainingInProgress();

      // Start training via API
      const result = await this.api.startTraining(trainingConfig);

      if (result.success) {
        this.trainingId = result.trainingId;

        // Save training ID to state for resume capability
        this.state.update(`modules.denoising-dl.trainingId`, this.trainingId);

        // Connect to Socket.IO for progress updates
        this.connectToTrainingSocket();

        // Start the training progress component
        if (this.trainingProgress) {
          this.trainingProgress.start();
        }

        this.state.notify('info', 'Training started. This may take several minutes.');
      } else {
        throw new Error(result.error || 'Failed to start training');
      }
    } catch (error) {
      console.error('[DLDenoisingModule] Error starting training:', error);
      this.state.notify('error', `Failed to start training: ${error.message}`);
      this.showTrainingReady();

      if (this.trainingProgress) {
        this.trainingProgress.fail(error.message);
      }
    }
  }

  /**
   * Connect to Socket.IO for training progress updates
   */
  connectToTrainingSocket() {
    if (!this.trainingId) {
      console.error('[DLDenoisingModule] No training ID for socket connection');
      return;
    }

    // Get or create socket connection
    if (!this.socket) {
      // Use existing socket connection from workspace or create new one
      if (window.io) {
        this.socket = window.io();
      } else {
        console.error('[DLDenoisingModule] Socket.IO not available');
        return;
      }
    }

    console.log('[DLDenoisingModule] Connecting to training socket room:', `denoising-${this.trainingId}`);

    // Join training room
    this.socket.emit('join-denoising', this.trainingId);
    this.socketConnected = true;

    // Set up event handlers
    this.setupSocketHandlers();
  }

  /**
   * Set up Socket.IO event handlers
   */
  setupSocketHandlers() {
    if (!this.socket) return;

    // Remove existing listeners to prevent duplicates
    this.socket.off('denoising-init-progress');
    this.socket.off('denoising-data-progress');
    this.socket.off('denoising-stage1-progress');
    this.socket.off('denoising-stage1-complete');
    this.socket.off('denoising-mask-progress');
    this.socket.off('denoising-mask-complete');
    this.socket.off('denoising-stage2-progress');
    this.socket.off('denoising-stage2-complete');
    this.socket.off('denoising-cleanup-progress');
    this.socket.off('denoising-complete-complete');
    this.socket.off('denoising-training-complete');
    this.socket.off('denoising-error');

    // Init progress (device setup, GPU check)
    this.socket.on('denoising-init-progress', (data) => {
      console.log('[DLDenoisingModule] Init progress:', data);
      this.handleInitProgress(data);
    });

    // Data progress (extracting stack, splitting data)
    this.socket.on('denoising-data-progress', (data) => {
      console.log('[DLDenoisingModule] Data progress:', data);
      this.handleDataProgress(data);
    });

    // Stage 1 progress
    this.socket.on('denoising-stage1-progress', (data) => {
      console.log('[DLDenoisingModule] Stage 1 progress:', data);
      this.handleStage1Progress(data);
    });

    // Stage 1 complete
    this.socket.on('denoising-stage1-complete', (data) => {
      console.log('[DLDenoisingModule] Stage 1 complete:', data);
      this.handleStage1Complete(data);
    });

    // Mask extraction progress (autoStructN2V only)
    this.socket.on('denoising-mask-progress', (data) => {
      console.log('[DLDenoisingModule] Mask progress:', data);
      this.handleMaskProgress(data);
    });

    // Mask extraction complete
    this.socket.on('denoising-mask-complete', (data) => {
      console.log('[DLDenoisingModule] Mask complete:', data);
      this.handleMaskComplete(data);
    });

    // Stage 2 progress (autoStructN2V only)
    this.socket.on('denoising-stage2-progress', (data) => {
      console.log('[DLDenoisingModule] Stage 2 progress:', data);
      this.handleStage2Progress(data);
    });

    // Stage 2 complete
    this.socket.on('denoising-stage2-complete', (data) => {
      console.log('[DLDenoisingModule] Stage 2 complete:', data);
      this.handleStage2Complete(data);
    });

    // Cleanup progress
    this.socket.on('denoising-cleanup-progress', (data) => {
      console.log('[DLDenoisingModule] Cleanup progress:', data);
      this.handleCleanupProgress(data);
    });

    // Final result (when Python script emits complete stage result)
    this.socket.on('denoising-complete-complete', (data) => {
      console.log('[DLDenoisingModule] Complete result:', data);
      this.handleCompleteResult(data);
    });

    // Training process complete (from backend when process exits)
    this.socket.on('denoising-training-complete', (data) => {
      console.log('[DLDenoisingModule] Training process complete:', data);
      this.handleTrainingComplete(data);
    });

    // Training error
    this.socket.on('denoising-error', (data) => {
      console.error('[DLDenoisingModule] Training error:', data);
      this.handleTrainingError(data);
    });
  }

  /**
   * Handle init progress (device setup, GPU detection)
   */
  handleInitProgress(data) {
    console.log('[DLDenoisingModule] Device:', data.device, 'GPU available:', data.gpuAvailable);

    if (this.trainingProgress) {
      // Update status to show initialization complete
      this.trainingProgress.updateStatus('Preparing data...');
    }

    this.state.notify('info', `Training initialized on ${data.device.toUpperCase()}`);
  }

  /**
   * Handle data preparation progress (extracting stack, splitting)
   */
  handleDataProgress(data) {
    if (this.trainingProgress) {
      if (data.status === 'extracting_stack') {
        const msg = data.current && data.total
          ? `Extracting TIFF stack: ${data.current}/${data.total}`
          : 'Extracting TIFF stack...';
        this.trainingProgress.updateStatus(msg);
      } else if (data.status === 'extraction_complete') {
        this.trainingProgress.updateStatus(`Extracted ${data.numSlices} slices`);
      } else if (data.status === 'splitting') {
        this.trainingProgress.updateStatus('Splitting dataset...');
      }
    }
  }

  /**
   * Handle complete result (final output info from Python)
   */
  handleCompleteResult(data) {
    console.log('[DLDenoisingModule] Final result:', data);

    // Store output files info
    this.trainingResult = {
      trainingId: data.training_id,
      method: data.method,
      stagesRun: data.stagesRun,
      outputFiles: data.outputFiles
    };

    // Update results display
    if (this.resultsDisplay) {
      this.resultsDisplay.setResults(this.trainingResult);
    }
  }

  /**
   * Handle Stage 1 progress update
   */
  handleStage1Progress(data) {
    // Determine prefix based on method
    const prefix = this.selectedMethod === 'n2v' ? 'n2v' : 'stage1';

    // Update progress bar
    const progressPercent = data.totalEpochs > 0 ? (data.epoch / data.totalEpochs) * 100 : 0;
    const progressFill = document.getElementById(`${prefix}ProgressFill`);
    if (progressFill) {
      progressFill.style.width = `${progressPercent}%`;
    }

    // Update epoch counter
    const currentEpoch = document.getElementById(`${prefix}CurrentEpoch`);
    const totalEpochs = document.getElementById(`${prefix}TotalEpochs`);
    if (currentEpoch) currentEpoch.textContent = data.epoch || 0;
    if (totalEpochs) totalEpochs.textContent = data.totalEpochs || 0;

    // Update status text
    const statusText = document.getElementById(`${prefix}StatusText`);
    if (statusText) {
      statusText.textContent = 'Training...';
    }

    // Update metrics
    const trainLoss = document.getElementById(`${prefix}TrainLoss`);
    const valLoss = document.getElementById(`${prefix}ValLoss`);
    const bestValLoss = document.getElementById(`${prefix}BestValLoss`);

    if (trainLoss && data.trainLoss != null) {
      trainLoss.textContent = data.trainLoss.toFixed(6);
    }
    if (valLoss && data.valLoss != null) {
      valLoss.textContent = data.valLoss.toFixed(6);
    }

    // Track and update best validation loss
    if (data.valLoss != null && data.valLoss > 0) {
      const lossKey = this.selectedMethod === 'n2v' ? 'n2v' : 'stage1';
      if (data.valLoss < this.bestValLoss[lossKey]) {
        this.bestValLoss[lossKey] = data.valLoss;
      }
      if (bestValLoss && this.bestValLoss[lossKey] !== Infinity) {
        bestValLoss.textContent = this.bestValLoss[lossKey].toFixed(6);
      }
    }

    // Update loss chart
    const chartKey = this.selectedMethod === 'n2v' ? 'n2v' : 'stage1';
    if (data.epoch && data.trainLoss != null) {
      this.addChartPoint(chartKey, data.epoch, data.trainLoss, data.valLoss);
    }
  }

  /**
   * Handle Stage 1 completion
   */
  handleStage1Complete(data) {
    const prefix = this.selectedMethod === 'n2v' ? 'n2v' : 'stage1';

    // Update status badge
    this.updateStageStatus(prefix, 'completed', 'Complete');

    // Update status text
    const statusText = document.getElementById(`${prefix}StatusText`);
    if (statusText) {
      statusText.textContent = 'Stage 1 training complete!';
    }

    // Update progress bar to 100%
    const progressFill = document.getElementById(`${prefix}ProgressFill`);
    if (progressFill) {
      progressFill.style.width = '100%';
    }

    // For N2V-only, we're essentially done (just cleanup remaining)
    if (this.selectedMethod === 'n2v') {
      this.state.notify('success', 'N2V training complete, finalizing output...');
    } else {
      // For autoStructN2V, update mask status to show it's starting
      this.updateStageStatus('mask', 'training', 'Extracting...');
    }
  }

  /**
   * Handle mask extraction progress
   */
  handleMaskProgress(data) {
    // Update mask status
    this.updateStageStatus('mask', 'training', 'Extracting mask...');
  }

  /**
   * Handle mask extraction completion
   */
  handleMaskComplete(data) {
    // Update mask status
    this.updateStageStatus('mask', 'completed', 'Complete');

    // Initialize mask UI for autoStructN2V
    if (this.selectedMethod === 'autostructn2v') {
      this.initializeMaskUI();

      // Load mask data from .npy file for visualization
      const maskData = this._createMaskGrid(data.kernelSize, data.activePixels, data.pattern);
      this.updateMaskVisualization({
        mask: maskData,
        kernelSize: data.kernelSize,
        activePixels: data.activePixels,
        pattern: data.pattern,
        isEmpty: data.isEmpty
      });

      // Show mask action buttons
      const maskActions = document.getElementById('maskActions');
      if (maskActions) {
        maskActions.style.display = 'block';
      }
    }
  }

  /**
   * Create a mask grid representation for visualization
   * This is a simplified representation - actual mask loaded from file
   */
  _createMaskGrid(kernelSize, activePixels, pattern) {
    const size = kernelSize || 11;
    const grid = [];

    for (let i = 0; i < size; i++) {
      const row = [];
      for (let j = 0; j < size; j++) {
        row.push(false);
      }
      grid.push(row);
    }

    // Create a simple pattern based on active pixels count
    const center = Math.floor(size / 2);

    if (pattern === 'cross' || pattern === 'plus') {
      // Horizontal and vertical lines
      for (let i = 0; i < size; i++) {
        grid[center][i] = true;
        grid[i][center] = true;
      }
    } else if (pattern === 'diagonal') {
      // Diagonal lines
      for (let i = 0; i < size; i++) {
        if (i < size) grid[i][i] = true;
        if (size - 1 - i >= 0) grid[i][size - 1 - i] = true;
      }
    } else {
      // Random-ish pattern based on active pixel count
      let count = 0;
      const maxPixels = activePixels || 10;

      // Start from center and spread out
      for (let r = 0; r <= center && count < maxPixels; r++) {
        for (let dx = -r; dx <= r && count < maxPixels; dx++) {
          for (let dy = -r; dy <= r && count < maxPixels; dy++) {
            if (Math.abs(dx) === r || Math.abs(dy) === r) {
              const x = center + dx;
              const y = center + dy;
              if (x >= 0 && x < size && y >= 0 && y < size && !grid[x][y]) {
                if (Math.random() < 0.5 || r === 0) {
                  grid[x][y] = true;
                  count++;
                }
              }
            }
          }
        }
      }
    }

    return grid;
  }

  /**
   * Handle Stage 2 progress update
   */
  handleStage2Progress(data) {
    // Update progress bar
    const progressPercent = data.totalEpochs > 0 ? (data.epoch / data.totalEpochs) * 100 : 0;
    const progressFill = document.getElementById('stage2ProgressFill');
    if (progressFill) {
      progressFill.style.width = `${progressPercent}%`;
    }

    // Update epoch counter
    const currentEpoch = document.getElementById('stage2CurrentEpoch');
    const totalEpochs = document.getElementById('stage2TotalEpochs');
    if (currentEpoch) currentEpoch.textContent = data.epoch || 0;
    if (totalEpochs) totalEpochs.textContent = data.totalEpochs || 0;

    // Update status text
    const statusText = document.getElementById('stage2StatusText');
    if (statusText) {
      statusText.textContent = 'Training...';
    }

    // Update metrics
    const trainLoss = document.getElementById('stage2TrainLoss');
    const valLoss = document.getElementById('stage2ValLoss');
    const bestValLoss = document.getElementById('stage2BestValLoss');

    if (trainLoss && data.trainLoss != null) {
      trainLoss.textContent = data.trainLoss.toFixed(6);
    }
    if (valLoss && data.valLoss != null) {
      valLoss.textContent = data.valLoss.toFixed(6);
    }

    // Track and update best validation loss
    if (data.valLoss != null && data.valLoss > 0) {
      if (data.valLoss < this.bestValLoss.stage2) {
        this.bestValLoss.stage2 = data.valLoss;
      }
      if (bestValLoss && this.bestValLoss.stage2 !== Infinity) {
        bestValLoss.textContent = this.bestValLoss.stage2.toFixed(6);
      }
    }

    // Update stage 2 loss chart
    if (data.epoch && data.trainLoss != null) {
      this.addChartPoint('stage2', data.epoch, data.trainLoss, data.valLoss);
    }
  }

  /**
   * Handle Stage 2 completion
   */
  handleStage2Complete(data) {
    // Update status badge
    this.updateStageStatus('stage2', 'completed', 'Complete');

    // Update status text
    const statusText = document.getElementById('stage2StatusText');
    if (statusText) {
      statusText.textContent = 'Stage 2 training complete!';
    }

    // Update progress bar to 100%
    const progressFill = document.getElementById('stage2ProgressFill');
    if (progressFill) {
      progressFill.style.width = '100%';
    }

    this.state.notify('success', 'Stage 2 training complete, finalizing output...');
  }

  /**
   * Handle cleanup progress
   */
  handleCleanupProgress(data) {
    // For cleanup, just show a notification
    this.state.notify('info', 'Cleaning up temporary files...');
  }

  /**
   * Handle training completion
   */
  handleTrainingComplete(data) {
    console.log('[DLDenoisingModule] Training complete with data:', data);

    // Merge with existing trainingResult (which has outputFiles from handleCompleteResult)
    // Don't overwrite - the denoising-training-complete event doesn't include outputFiles
    this.trainingResult = {
      ...this.trainingResult,
      ...data,
      // Preserve outputFiles from handleCompleteResult if not in new data
      outputFiles: data.outputFiles || this.trainingResult?.outputFiles
    };
    this.trainingComplete = true;

    // Show results section
    this.showTrainingComplete(this.trainingResult);

    // Enable next step button
    const step3Next = document.getElementById('step3Next');
    if (step3Next) {
      step3Next.disabled = false;
    }

    // Clear saved training ID from state (training is done)
    this.state.update(`modules.denoising-dl.trainingId`, null);

    // Disconnect socket
    this.disconnectSocket();

    this.state.notify('success', 'Denoising complete! Your images are ready.');
  }

  /**
   * Handle training error
   */
  handleTrainingError(data) {
    const errorMessage = data.error || data.message || 'Unknown error occurred';

    if (this.trainingProgress) {
      this.trainingProgress.fail(errorMessage);
    }

    this.state.notify('error', `Training failed: ${errorMessage}`);

    // Show error state
    this.showTrainingReady();

    // Clear saved training ID
    this.state.update(`modules.denoising-dl.trainingId`, null);

    // Disconnect socket
    this.disconnectSocket();
  }

  /**
   * Cancel ongoing training
   */
  async cancelTraining() {
    if (!this.trainingId) return;

    try {
      await this.api.cancelTraining(this.trainingId);
      this.state.notify('info', 'Training cancelled');

      if (this.trainingProgress) {
        this.trainingProgress.reset();
      }

      this.showTrainingReady();
      this.disconnectSocket();

      // Clear training ID
      this.trainingId = null;
      this.state.update(`modules.denoising-dl.trainingId`, null);
    } catch (error) {
      console.error('[DLDenoisingModule] Error cancelling training:', error);
      this.state.notify('error', 'Failed to cancel training');
    }
  }

  /**
   * Disconnect from Socket.IO
   */
  disconnectSocket() {
    if (this.socket && this.socketConnected) {
      this.socket.emit('leave-denoising', this.trainingId);
      this.socketConnected = false;
    }
  }

  // ==================== UI STATE METHODS ====================

  /**
   * Show training ready state (reset UI to initial state)
   */
  showTrainingReady() {
    const startSection = document.getElementById('startTrainingSection');
    const n2vSection = document.getElementById('n2vTrainingSection');
    const autoStructSection = document.getElementById('autoStructTrainingSection');

    // Show start button, hide training sections
    if (startSection) startSection.style.display = 'block';
    if (n2vSection) n2vSection.style.display = 'none';
    if (autoStructSection) autoStructSection.style.display = 'none';

    // Reset best val loss tracking
    this.bestValLoss = { n2v: Infinity, stage1: Infinity, stage2: Infinity };

    // Destroy and reset charts
    if (this.charts) {
      Object.keys(this.charts).forEach(key => {
        if (this.charts[key]) {
          this.charts[key].destroy();
          this.charts[key] = null;
        }
      });
    }

    // Reset completion sections
    const n2vComplete = document.getElementById('n2vCompleteSection');
    const autoStructResults = document.getElementById('autoStructResultsSection');
    const maskActions = document.getElementById('maskActions');
    if (n2vComplete) n2vComplete.style.display = 'none';
    if (autoStructResults) autoStructResults.style.display = 'none';
    if (maskActions) maskActions.style.display = 'none';

    // Reset status badges
    this.updateStageStatus('n2v', 'pending', 'Initializing...');
    this.updateStageStatus('stage1', 'pending', 'Pending');
    this.updateStageStatus('mask', 'pending', 'Pending');
    this.updateStageStatus('stage2', 'pending', 'Pending');

    // Reset progress bars and download buttons
    ['n2v', 'stage1', 'stage2'].forEach(prefix => {
      const fill = document.getElementById(`${prefix}ProgressFill`);
      if (fill) fill.style.width = '0%';
      const current = document.getElementById(`${prefix}CurrentEpoch`);
      if (current) current.textContent = '0';
      const total = document.getElementById(`${prefix}TotalEpochs`);
      if (total) total.textContent = '0';
      const trainLoss = document.getElementById(`${prefix}TrainLoss`);
      if (trainLoss) trainLoss.textContent = '--';
      const valLoss = document.getElementById(`${prefix}ValLoss`);
      if (valLoss) valLoss.textContent = '--';
      const bestValLoss = document.getElementById(`${prefix}BestValLoss`);
      if (bestValLoss) bestValLoss.textContent = '--';
      // Hide download buttons
      const downloadButtons = document.getElementById(`${prefix}DownloadButtons`);
      if (downloadButtons) downloadButtons.style.display = 'none';
      // Reset status text style
      const statusText = document.getElementById(`${prefix}StatusText`);
      if (statusText) {
        statusText.style.color = '';
        statusText.style.fontWeight = '';
      }
    });
  }

  /**
   * Download denoised images
   */
  async downloadDenoised(stage) {
    if (!this.trainingResult || !this.trainingResult.outputFiles) {
      this.state.notify('error', 'No results available for download');
      return;
    }

    const stackKey = `${stage}_stack`;
    const filePath = this.trainingResult.outputFiles[stackKey];

    if (!filePath) {
      this.state.notify('error', `No ${stage} output file found`);
      return;
    }

    try {
      // Download via API
      const response = await fetch(`/api/dl-denoising/download?path=${encodeURIComponent(filePath)}`);
      if (!response.ok) throw new Error('Download failed');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filePath.split('/').pop();
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('[DLDenoisingModule] Error downloading:', error);
      this.state.notify('error', `Failed to download: ${error.message}`);
    }
  }

  /**
   * Download trained model
   */
  async downloadModel(stage) {
    if (!this.trainingResult || !this.trainingResult.outputFiles) {
      this.state.notify('error', 'No model available for download');
      return;
    }

    const modelKey = `${stage}_model`;
    const filePath = this.trainingResult.outputFiles[modelKey];

    if (!filePath) {
      this.state.notify('error', `No ${stage} model file found`);
      return;
    }

    try {
      const response = await fetch(`/api/dl-denoising/download?path=${encodeURIComponent(filePath)}`);
      if (!response.ok) throw new Error('Download failed');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filePath.split('/').pop();
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('[DLDenoisingModule] Error downloading model:', error);
      this.state.notify('error', `Failed to download model: ${error.message}`);
    }
  }

  /**
   * Show training in progress state
   */
  async showTrainingInProgress() {
    const startSection = document.getElementById('startTrainingSection');
    const n2vSection = document.getElementById('n2vTrainingSection');
    const autoStructSection = document.getElementById('autoStructTrainingSection');

    // Hide start button
    if (startSection) startSection.style.display = 'none';

    // Show the correct training section based on method
    if (this.selectedMethod === 'n2v') {
      if (n2vSection) n2vSection.style.display = 'block';
      if (autoStructSection) autoStructSection.style.display = 'none';
      // Update status
      this.updateStageStatus('n2v', 'training', 'Training...');
    } else {
      if (n2vSection) n2vSection.style.display = 'none';
      if (autoStructSection) autoStructSection.style.display = 'block';
      // Update status for autoStructN2V
      this.updateStageStatus('stage1', 'training', 'Training...');
      this.updateStageStatus('mask', 'pending', 'Pending');
      this.updateStageStatus('stage2', 'pending', 'Pending');
    }

    // Initialize charts
    await this.initializeCharts();
  }

  /**
   * Update stage status badge
   */
  updateStageStatus(stage, status, text) {
    const statusEl = document.getElementById(`${stage}StageStatus`);
    if (statusEl) {
      statusEl.textContent = text;
      statusEl.className = `stage-status ${status}`;
    }
  }

  /**
   * Show training complete state for N2V
   */
  showN2VComplete(data) {
    // Update status badge
    this.updateStageStatus('n2v', 'completed', 'Complete');

    // Update status text
    const statusText = document.getElementById('n2vStatusText');
    if (statusText) {
      statusText.textContent = 'Training completed successfully!';
      statusText.style.color = '#50C878';
      statusText.style.fontWeight = '600';
    }

    // Show download buttons in progress section
    const downloadButtons = document.getElementById('n2vDownloadButtons');
    if (downloadButtons) {
      downloadButtons.style.display = 'flex';
    }

    // Store results for download
    this.trainingResult = data;

    // Enable next button
    const nextBtn = document.getElementById('step3Next');
    if (nextBtn) nextBtn.disabled = false;
  }

  /**
   * Show training complete state for autoStructN2V
   */
  showAutoStructComplete(data) {
    // Update final status
    this.updateStageStatus('stage2', 'completed', 'Complete');

    // Update status text
    const statusText = document.getElementById('stage2StatusText');
    if (statusText) {
      statusText.textContent = 'Training completed successfully!';
      statusText.style.color = '#50C878';
      statusText.style.fontWeight = '600';
    }

    // Show download buttons in progress section
    const downloadButtons = document.getElementById('stage2DownloadButtons');
    if (downloadButtons) {
      downloadButtons.style.display = 'flex';
    }

    // Store results for download
    this.trainingResult = data;

    // Enable next button
    const nextBtn = document.getElementById('step3Next');
    if (nextBtn) nextBtn.disabled = false;
  }

  /**
   * Show training complete state (generic handler)
   */
  showTrainingComplete(data) {
    if (this.selectedMethod === 'n2v') {
      this.showN2VComplete(data);
    } else {
      this.showAutoStructComplete(data);
    }
  }

  // ==================== RESULT METHODS ====================

  /**
   * Download result for a specific stage
   */
  async downloadResult(stage) {
    if (!this.trainingResult || !this.trainingResult.outputFiles) {
      this.state.notify('error', 'No results available for download');
      return;
    }

    const stackKey = `${stage}_stack`;
    const filePath = this.trainingResult.outputFiles[stackKey];

    if (!filePath) {
      this.state.notify('error', `No ${stage} output file found`);
      return;
    }

    try {
      await this.api.downloadFile(filePath);
    } catch (error) {
      console.error('[DLDenoisingModule] Error downloading result:', error);
      this.state.notify('error', `Failed to download: ${error.message}`);
    }
  }

  /**
   * Download all results
   */
  async downloadAllResults() {
    if (!this.trainingResult || !this.trainingResult.outputFiles) {
      this.state.notify('error', 'No results available for download');
      return;
    }

    const files = this.trainingResult.outputFiles;
    const downloadPromises = [];

    // Download TIFF stacks
    if (files.stage1_stack) {
      downloadPromises.push(this.api.downloadFile(files.stage1_stack));
    }
    if (files.stage2_stack) {
      downloadPromises.push(this.api.downloadFile(files.stage2_stack));
    }

    // Download model files
    if (files.stage1_model) {
      downloadPromises.push(this.api.downloadFile(files.stage1_model));
    }
    if (files.stage2_model) {
      downloadPromises.push(this.api.downloadFile(files.stage2_model));
    }
    if (files.config) {
      downloadPromises.push(this.api.downloadFile(files.config));
    }

    try {
      await Promise.all(downloadPromises);
      this.state.notify('success', 'All files downloaded');
    } catch (error) {
      console.error('[DLDenoisingModule] Error downloading all results:', error);
      this.state.notify('error', `Download failed: ${error.message}`);
    }
  }

  /**
   * Open denoised images in Image Viewer module
   * @param {string} stage - 'stage1' or 'stage2'
   */
  openInImageViewer(stage) {
    if (!this.trainingResult || !this.trainingResult.outputFiles) {
      this.state.notify('error', 'No results available');
      return;
    }

    const stackKey = `${stage}_stack`;
    const filePath = this.trainingResult.outputFiles[stackKey];

    if (!filePath) {
      this.state.notify('error', `No ${stage} output file found`);
      return;
    }

    // Store denoising result in StateManager for Image Viewer to consume
    const denoisingData = {
      type: 'denoising_dl_result',
      trainingId: this.trainingId,
      outputPath: filePath,
      stage: stage,
      method: this.selectedMethod,
      timestamp: Date.now()
    };

    this.state.update('modules.denoising-dl.viewerFile', denoisingData);

    // Navigate to Image Viewer module
    window.workspace.loadModule('imageviewer');
  }

  /**
   * View result in image viewer (legacy alias)
   */
  viewInViewer(stage) {
    this.openInImageViewer(stage);
  }

  viewResults() {
    // Open the primary result in viewer
    const stage = this.selectedMethod === 'autostructn2v' ? 'stage2' : 'stage1';
    this.openInImageViewer(stage);
  }

  /**
   * Start a new analysis - reset everything and go back to step 1
   */
  startNewAnalysis() {
    console.log('[DLDenoisingModule] Starting new analysis...');

    // Destroy charts if they exist
    if (this.charts) {
      Object.values(this.charts).forEach(chart => {
        if (chart && typeof chart.destroy === 'function') {
          chart.destroy();
        }
      });
      this.charts = { n2v: null, stage1: null, stage2: null };
    }

    // Reset best val loss tracking
    this.bestValLoss = { n2v: Infinity, stage1: Infinity, stage2: Infinity };

    // Disconnect any active socket connections
    this.disconnectSocket();

    // Clear state manager entries
    this.state.update('modules.denoising-dl.trainingId', null);
    this.state.update('modules.denoising-dl.viewerFile', null);

    // Reset step 3 UI - training sections
    const startSection = document.getElementById('startTrainingSection');
    const n2vSection = document.getElementById('n2vTrainingSection');
    const autoStructSection = document.getElementById('autoStructTrainingSection');

    if (startSection) startSection.style.display = 'block';
    if (n2vSection) n2vSection.style.display = 'none';
    if (autoStructSection) autoStructSection.style.display = 'none';

    // Reset training progress UI for all stages
    ['n2v', 'stage1', 'stage2'].forEach(prefix => {
      this.resetTrainingStageUI(prefix);
    });

    // Reset step 3 next button
    const step3Next = document.getElementById('step3Next');
    if (step3Next) step3Next.disabled = true;

    // Hide mask section if visible
    const maskSection = document.getElementById('interimMaskSection');
    if (maskSection) maskSection.style.display = 'none';

    // Use the existing reset() method which properly handles file selector and validation
    this.reset();

    this.state.notify('info', 'Ready for new analysis');
  }

  /**
   * Reset training stage UI elements for a given prefix (n2v, stage1, stage2)
   */
  resetTrainingStageUI(prefix) {
    // Reset progress bar
    const progressFill = document.getElementById(`${prefix}ProgressFill`);
    if (progressFill) progressFill.style.width = '0%';

    // Reset epoch counters
    const currentEpoch = document.getElementById(`${prefix}CurrentEpoch`);
    if (currentEpoch) currentEpoch.textContent = '0';

    const totalEpochs = document.getElementById(`${prefix}TotalEpochs`);
    if (totalEpochs) totalEpochs.textContent = '0';

    // Reset status text
    const statusText = document.getElementById(`${prefix}StatusText`);
    if (statusText) {
      statusText.textContent = prefix === 'n2v' ? 'Preparing training data...' :
                               prefix === 'stage1' ? 'Waiting to start...' :
                               'Waiting for Stage 1 and mask approval...';
      statusText.style.color = '';
      statusText.style.fontWeight = '';
    }

    // Reset metrics
    const trainLoss = document.getElementById(`${prefix}TrainLoss`);
    if (trainLoss) trainLoss.textContent = '--';

    const valLoss = document.getElementById(`${prefix}ValLoss`);
    if (valLoss) valLoss.textContent = '--';

    const bestValLoss = document.getElementById(`${prefix}BestValLoss`);
    if (bestValLoss) bestValLoss.textContent = '--';

    // Hide download buttons
    const downloadButtons = document.getElementById(`${prefix}DownloadButtons`);
    if (downloadButtons) downloadButtons.style.display = 'none';

    // Reset stage status badge if exists
    const stageStatus = document.getElementById(`${prefix}StageStatus`);
    if (stageStatus) {
      stageStatus.textContent = 'Pending';
      stageStatus.className = 'stage-status pending';
    }
  }

  // ==================== MASK UI METHODS (autoStructN2V) ====================

  /**
   * Initialize mask visualization components
   * Called when mask extraction completes
   */
  initializeMaskUI() {
    console.log('[DLDenoisingModule] Initializing mask UI...');

    // Show interim mask section
    const maskSection = document.getElementById('interimMaskSection');
    if (maskSection) {
      maskSection.style.display = 'block';
    }

    // Initialize mask visualization
    const vizContainer = document.getElementById('maskVisualizationContainer');
    if (vizContainer) {
      this.maskVisualization = new MaskVisualization({
        containerId: 'maskVisualizationContainer'
      });
      vizContainer.innerHTML = this.maskVisualization.render();
    }

    // Initialize mask parameter panel
    const paramContainer = document.getElementById('maskParameterContainer');
    if (paramContainer) {
      this.maskParameterPanel = new MaskParameterPanel({
        containerId: 'maskParameterContainer',
        parameters: this.trainingConfig.maskExtractor,
        onRegenerateMask: () => this.regenerateMask(),
        onParameterChange: (name, value) => this.updateMaskParameter(name, value)
      });
      paramContainer.innerHTML = this.maskParameterPanel.render();
    }
  }

  /**
   * Update mask visualization with new data
   */
  updateMaskVisualization(data) {
    this.maskData = data;

    if (this.maskVisualization) {
      this.maskVisualization.setMaskData(data);
      this.maskVisualization.refresh();
    }

    // Show/hide approve button based on mask state
    const approveBtn = document.getElementById('approveMaskBtn');
    if (approveBtn) {
      approveBtn.style.display = data.isEmpty ? 'none' : 'inline-block';
    }
  }

  /**
   * Toggle mask parameters panel
   */
  toggleMaskParameters() {
    if (this.maskParameterPanel) {
      this.maskParameterPanel.toggle();
    }
  }

  /**
   * Show mask parameters panel (from warning)
   */
  showMaskParameters() {
    if (this.maskParameterPanel) {
      this.maskParameterPanel.expand();
    }
  }

  /**
   * Update a mask parameter
   */
  updateMaskParameter(name, value) {
    console.log('[DLDenoisingModule] Updating mask parameter:', name, value);

    // Update local config
    this.trainingConfig.maskExtractor[name] = value;

    // Update parameter panel
    if (this.maskParameterPanel) {
      this.maskParameterPanel.updateParameter(name, value);
    }
  }

  /**
   * Reset mask parameters to defaults
   */
  resetMaskParameters() {
    this.trainingConfig.maskExtractor = {
      adaptive_thresholding: true,
      base_percentile: 50,
      percentile_decay: 1.15,
      max_masked_pixels: 25
    };

    if (this.maskParameterPanel) {
      this.maskParameterPanel.resetToDefaults();
    }
  }

  /**
   * Regenerate mask with current parameters
   */
  async regenerateMask() {
    if (!this.trainingId) {
      this.state.notify('error', 'No active training session');
      return;
    }

    console.log('[DLDenoisingModule] Regenerating mask with params:', this.trainingConfig.maskExtractor);

    if (this.maskParameterPanel) {
      this.maskParameterPanel.setRegenerating(true);
    }

    try {
      const result = await this.api.regenerateMask(
        this.trainingId,
        this.trainingConfig.maskExtractor
      );

      if (result.success) {
        this.updateMaskVisualization(result.mask);
        this.state.notify('success', 'Mask regenerated');
      } else {
        throw new Error(result.error || 'Failed to regenerate mask');
      }
    } catch (error) {
      console.error('[DLDenoisingModule] Error regenerating mask:', error);
      this.state.notify('error', `Failed to regenerate mask: ${error.message}`);
    } finally {
      if (this.maskParameterPanel) {
        this.maskParameterPanel.setRegenerating(false);
      }
    }
  }

  /**
   * Approve current mask and continue to Stage 2
   */
  approveMask() {
    console.log('[DLDenoisingModule] Mask approved, continuing to Stage 2...');

    // Hide mask action buttons
    const maskActions = document.getElementById('maskActions');
    if (maskActions) {
      maskActions.style.display = 'none';
    }

    // Update stage 2 status
    this.updateStageStatus('stage2', 'training', 'Training...');

    // Update status text
    const statusText = document.getElementById('stage2StatusText');
    if (statusText) {
      statusText.textContent = 'Starting Stage 2 training...';
    }

    // Stage 2 will automatically start from the backend
    // The Socket.IO handler will update the UI
    this.state.notify('info', 'Mask approved. Stage 2 training starting...');
  }

  /**
   * Skip Stage 2 and use N2V results
   */
  skipStage2() {
    console.log('[DLDenoisingModule] Skipping Stage 2, using N2V results');

    // Hide mask action buttons
    const maskActions = document.getElementById('maskActions');
    if (maskActions) {
      maskActions.style.display = 'none';
    }

    // Update stage 2 status to skipped
    this.updateStageStatus('stage2', 'skipped', 'Skipped');

    // Show results section with Stage 1 only
    const resultsSection = document.getElementById('autoStructResultsSection');
    if (resultsSection) {
      resultsSection.style.display = 'block';
    }

    this.state.notify('info', 'Stage 2 skipped. Using N2V results.');

    // The training should complete with just Stage 1 results
  }

  reset() {
    console.log('[DLDenoisingModule] Resetting module...');

    this.fileValidated = false;
    this.methodSelected = false;
    this.configSaved = false;
    this.trainingComplete = false;
    this.uploadedFile = null;
    this.selectedFile = null;
    this.selectedMethod = null;
    this.validationResult = null;
    this.trainingId = null;
    this.trainingResult = null;
    this.inferenceResult = null;

    // Re-initialize training config with empty objects (will be populated by applyPreset)
    this.trainingConfig = {
      stage1: {},
      stage2: {},
      maskExtractor: {}
    };
    this.currentPreset = 'balanced';

    // Reset UI
    const step1Next = document.getElementById('step1Next');
    if (step1Next) step1Next.disabled = true;

    // Clear method selection
    document.querySelectorAll('input[name="dl-method"]').forEach(radio => {
      radio.checked = false;
    });

    // Clear validation display
    if (this.validationDisplay) {
      this.validationDisplay.reset();
      this.validationDisplay.hide();
    }
    const validationContainer = document.getElementById('validationResult');
    if (validationContainer) {
      validationContainer.innerHTML = '';
      validationContainer.style.display = 'none';
    }

    // Reset file selector
    if (this.fileSelector) {
      this.fileSelector.clearSelection();
      this.fileSelector.refresh();
    }

    // Also reset the internal selected file reference
    this.uploadedFile = null;

    this.goToStep(1);
  }

  async deactivate() {
    console.log('[DLDenoisingModule] Deactivating...');

    // Clean up global references
    try { delete window.dlDenoisingModule; } catch (e) { window.dlDenoisingModule = undefined; }

    await super.deactivate();

    console.log('[DLDenoisingModule] Deactivated');
  }
}

export default DLDenoisingModule;
