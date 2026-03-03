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
import ExitWarningDialog from '/workspace/js/core/components/ExitWarningDialog.js';
import DLDenoisingAPI from './DLDenoisingAPI.js';
import CollapsibleSection from './components/CollapsibleSection.js';
import TrainingProgress from './components/TrainingProgress.js';
import LossChart from './components/LossChart.js';
import ResultsDisplay from './components/ResultsDisplay.js';

// Templates
import Templates from './templates/Templates.js';

// Handlers
import ChartHandler from './handlers/ChartHandler.js';
import UIStateHandler from './handlers/UIStateHandler.js';
import ConfigHandler from './handlers/ConfigHandler.js';
import FileHandler from './handlers/FileHandler.js';
import NavigationHandler from './handlers/NavigationHandler.js';
import MaskHandler from './handlers/MaskHandler.js';
import ProgressHandler from './handlers/ProgressHandler.js';
import TrainingHandler from './handlers/TrainingHandler.js';
import ResultsHandler from './handlers/ResultsHandler.js';
import InferenceHandler from './handlers/InferenceHandler.js';

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

    // Handlers
    this.chartHandler = new ChartHandler(this);
    this.uiStateHandler = new UIStateHandler(this);
    this.configHandler = new ConfigHandler(this);
    this.fileHandler = new FileHandler(this);
    this.navigationHandler = new NavigationHandler(this);
    this.maskHandler = new MaskHandler(this);
    this.progressHandler = new ProgressHandler(this);
    this.trainingHandler = new TrainingHandler(this);
    this.resultsHandler = new ResultsHandler(this);
    this.inferenceHandler = new InferenceHandler(this);

    // Step condition flags
    this.fileValidated = false;
    this.methodSelected = false;
    this.configSaved = false;
    this.trainingComplete = false;

    // Workflow mode: 'train' or 'import'
    this.workflowMode = null;

    // Import validation state
    this.importValidated = false;
    this.importedModelConfig = null;

    // Component references
    this.stepNavigator = null;
    this.validationDisplay = null;
    this.fileSelector = null;

    // Module state
    this.uploadedFile = null;
    this.selectedMethod = null; // 'n2v' or 'autostructn2v'
    this.selectedMode = '2d'; // '2d' or '2.5d'
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

    // Auto-approve toggle state (for autoStructN2V mask approval)
    this.autoApproveEnabled = false;

    // Bind methods
    this.onFileSelected = this.onFileSelected.bind(this);
    this.onFileUploaded = this.onFileUploaded.bind(this);
    this.onMethodChange = this.onMethodChange.bind(this);
    this.onPresetChange = this.onPresetChange.bind(this);
    this.startTraining = this.startTraining.bind(this);
  }

  render() {
    this.container.innerHTML = Templates.renderModule(
      () => this.renderHeader(),
      () => this.renderStepNav()
    );
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
        fileType: 'uploads',  // New metadata system: uploads category
        filterTags: ['raw'],  // Filter to raw images only
        title: 'Input Image Stack',
        icon: '📁',
        helpIconHtml: Templates.renderHelpIcon('denoising-dl.step1.input'),
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
   * Delegated to ConfigHandler
   */
  async loadPresets() {
    return this.configHandler.loadPresets();
  }

  /**
   * Get fallback default presets
   * Delegated to ConfigHandler
   */
  getDefaultPresets() {
    return this.configHandler.getDefaultPresets();
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

    // Mode toggle (2D / 2.5D)
    const modeToggle = document.getElementById('mode-toggle');
    if (modeToggle) {
      modeToggle.addEventListener('change', (e) => this.onModeChange(e.target.checked ? '2.5d' : '2d'));
    }

    // Preset selector
    document.getElementById('presetSelector')?.addEventListener('change', (e) => {
      this.onPresetChange(e.target.value);
    });

    // Workflow section toggle handlers
    document.querySelectorAll('.workflow-header').forEach(header => {
      header.addEventListener('click', (e) => {
        if (e.target.closest('.help-icon') || e.target.closest('.mode-toggle-section')) return;
        const workflow = header.dataset.workflow;
        if (workflow) {
          this.fileHandler.onWorkflowSectionToggle(workflow);
        }
      });
    });

    // Auto-approve toggle (for autoStructN2V mask approval)
    const autoApproveToggle = document.getElementById('autoApproveToggle');
    if (autoApproveToggle) {
      autoApproveToggle.addEventListener('change', (e) => {
        this.autoApproveEnabled = e.target.checked;
        console.log('[DLDenoisingModule] Auto-approve:', this.autoApproveEnabled ? 'enabled' : 'disabled');
      });
    }
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

  /**
   * Handle method change
   * Delegated to FileHandler
   */
  onMethodChange(method) {
    return this.fileHandler.onMethodChange(method);
  }

  /**
   * Handle mode change (2D / 2.5D)
   * @param {string} mode - '2d' or '2.5d'
   */
  onModeChange(mode) {
    console.log('[DLDenoisingModule] Mode changed to:', mode);
    this.selectedMode = mode;

    // Update mode label styling
    const leftLabel = document.querySelector('.mode-label-left');
    const rightLabel = document.querySelector('.mode-label-right');
    if (leftLabel && rightLabel) {
      leftLabel.classList.toggle('active', mode === '2d');
      rightLabel.classList.toggle('active', mode === '2.5d');
    }

    // Re-validate file if one is already selected (check stack depth for 2.5D)
    if (this.fileHandler) {
      this.fileHandler.onModeChange(mode);
    }
  }

  /**
   * Handle file selection
   * Delegated to FileHandler
   */
  async onFileSelected(fileInfo) {
    return this.fileHandler.onFileSelected(fileInfo);
  }

  /**
   * Handle file upload
   * Delegated to FileHandler
   */
  async onFileUploaded(file, uploadedFile) {
    return this.fileHandler.onFileUploaded(file, uploadedFile);
  }

  /**
   * Validate file for DL denoising
   * Delegated to FileHandler
   */
  async validateFile(filePath) {
    return this.fileHandler.validateFile(filePath);
  }

  /**
   * Update Next button state
   * Delegated to FileHandler
   */
  updateNextButton() {
    return this.fileHandler.updateNextButton();
  }

  /**
   * Check if navigation to a step is allowed
   * Delegated to NavigationHandler
   */
  canNavigateToStep(stepNumber) {
    return this.navigationHandler.canNavigateToStep(stepNumber);
  }

  /**
   * Navigate to a specific step
   * Delegated to NavigationHandler
   */
  goToStep(stepNumber) {
    return this.navigationHandler.goToStep(stepNumber);
  }

  /**
   * Initialize Step 3 (Training/Denoising)
   * Delegated to NavigationHandler
   */
  initializeStep3() {
    return this.navigationHandler.initializeStep3();
  }

  /**
   * Initialize collapsible section toggle functionality
   * Delegated to NavigationHandler
   */
  initCollapsibleSections() {
    return this.navigationHandler.initCollapsibleSections();
  }

  /**
   * Initialize Chart.js and create charts
   * Delegated to ChartHandler
   */
  async initializeCharts() {
    return this.chartHandler.initializeCharts();
  }

  /**
   * Add point to a chart
   * Delegated to ChartHandler
   */
  addChartPoint(chartKey, epoch, trainLoss, valLoss) {
    return this.chartHandler.addChartPoint(chartKey, epoch, trainLoss, valLoss);
  }

  /**
   * Check if there's an ongoing training to resume
   * Delegated to NavigationHandler
   */
  async checkTrainingStatus() {
    return this.navigationHandler.checkTrainingStatus();
  }

  /**
   * Navigate to next step with validation
   * Delegated to NavigationHandler
   */
  nextStep() {
    return this.navigationHandler.nextStep();
  }

  /**
   * Navigate to previous step
   * Delegated to NavigationHandler
   */
  previousStep() {
    return this.navigationHandler.previousStep();
  }

  /**
   * Render Step 2 configuration UI
   * Delegated to ConfigHandler
   */
  renderStep2Config() {
    return this.configHandler.renderStep2Config();
  }

  /**
   * Render the configuration columns (single or dual)
   * Delegated to ConfigHandler
   */
  renderConfigColumns() {
    return this.configHandler.renderConfigColumns();
  }

  /**
   * Render N2V configuration form
   * Delegated to ConfigHandler
   */
  renderN2VConfigForm() {
    return this.configHandler.renderN2VConfigForm();
  }

  /**
   * Render stage configuration form for autoStructN2V
   * Delegated to ConfigHandler
   */
  renderStageConfigForm(stage) {
    return this.configHandler.renderStageConfigForm(stage);
  }

  /**
   * Render mask extractor configuration
   * Delegated to ConfigHandler
   */
  renderMaskExtractorConfig() {
    return this.configHandler.renderMaskExtractorConfig();
  }

  /**
   * Set up collapsible section toggles
   * Delegated to ConfigHandler
   */
  setupCollapsibleToggles() {
    return this.configHandler.setupCollapsibleToggles();
  }

  /**
   * Set up config input change listeners
   * Delegated to ConfigHandler
   */
  setupConfigInputListeners() {
    return this.configHandler.setupConfigInputListeners();
  }

  /**
   * Set up mask extractor config listeners
   * Delegated to ConfigHandler
   */
  setupMaskConfigListeners() {
    return this.configHandler.setupMaskConfigListeners();
  }

  /**
   * Handle config input change
   * Delegated to ConfigHandler
   */
  onConfigInputChange(stage, input) {
    return this.configHandler.onConfigInputChange(stage, input);
  }

  /**
   * Handle preset change
   * Delegated to ConfigHandler
   */
  onPresetChange(presetName) {
    return this.configHandler.onPresetChange(presetName);
  }

  /**
   * Apply a preset configuration
   * Delegated to ConfigHandler
   */
  applyPreset(presetName) {
    return this.configHandler.applyPreset(presetName);
  }

  /**
   * Update preset description text
   * Delegated to ConfigHandler
   */
  updatePresetDescription() {
    return this.configHandler.updatePresetDescription();
  }

  /**
   * Save current configuration
   * Delegated to ConfigHandler
   */
  saveConfig() {
    return this.configHandler.saveConfig();
  }

  /**
   * Read configuration values from form inputs
   * Delegated to ConfigHandler
   */
  readConfigFromForm(stage) {
    return this.configHandler.readConfigFromForm(stage);
  }

  /**
   * Read mask extractor configuration from form
   * Delegated to ConfigHandler
   */
  readMaskConfigFromForm() {
    return this.configHandler.readMaskConfigFromForm();
  }

  // ==================== TRAINING METHODS ====================
  // Delegated to TrainingHandler

  /**
   * Start the denoising training process
   * Delegated to TrainingHandler
   */
  async startTraining() {
    return this.trainingHandler.startTraining();
  }

  // ==================== SOCKET/PROGRESS METHODS ====================
  // Delegated to ProgressHandler

  /**
   * Connect to Socket.IO for training progress updates
   * Delegated to ProgressHandler
   */
  connectToTrainingSocket() {
    return this.progressHandler.connectToTrainingSocket();
  }

  /**
   * Set up Socket.IO event handlers
   * Delegated to ProgressHandler
   */
  setupSocketHandlers() {
    return this.progressHandler.setupSocketHandlers();
  }

  /**
   * Disconnect from Socket.IO
   * Delegated to ProgressHandler
   */
  disconnectSocket() {
    return this.progressHandler.disconnectSocket();
  }

  /**
   * Cancel ongoing training
   * Delegated to ProgressHandler
   */
  async cancelTraining() {
    return this.progressHandler.cancelTraining();
  }

  // ==================== UI STATE METHODS ====================
  // Delegated to UIStateHandler

  /**
   * Show training ready state (reset UI to initial state)
   * Delegated to UIStateHandler
   */
  showTrainingReady() {
    return this.uiStateHandler.showTrainingReady();
  }

  /**
   * Download denoised images
   * Delegated to ResultsHandler
   */
  async downloadDenoised(stage) {
    return this.resultsHandler.downloadDenoised(stage);
  }

  /**
   * Download trained model
   * Delegated to ResultsHandler
   */
  async downloadModel(stage) {
    return this.resultsHandler.downloadModel(stage);
  }

  /**
   * Show training in progress state
   * Delegated to UIStateHandler
   */
  async showTrainingInProgress() {
    return this.uiStateHandler.showTrainingInProgress();
  }

  /**
   * Update stage status badge
   * Delegated to UIStateHandler
   */
  updateStageStatus(stage, status, text) {
    return this.uiStateHandler.updateStageStatus(stage, status, text);
  }

  /**
   * Show training complete state for N2V
   * Delegated to UIStateHandler
   */
  showN2VComplete(data) {
    return this.uiStateHandler.showN2VComplete(data);
  }

  /**
   * Show training complete state for autoStructN2V
   * Delegated to UIStateHandler
   */
  showAutoStructComplete(data) {
    return this.uiStateHandler.showAutoStructComplete(data);
  }

  /**
   * Show training complete state (generic handler)
   * Delegated to UIStateHandler
   */
  showTrainingComplete(data) {
    return this.uiStateHandler.showTrainingComplete(data);
  }

  // ==================== RESULT METHODS ====================
  // Delegated to ResultsHandler

  /**
   * Download result for a specific stage
   * Delegated to ResultsHandler
   */
  async downloadResult(stage) {
    return this.resultsHandler.downloadResult(stage);
  }

  /**
   * Download all results
   * Delegated to ResultsHandler
   */
  async downloadAllResults() {
    return this.resultsHandler.downloadAllResults();
  }

  /**
   * Open denoised images in Image Viewer module
   * Delegated to ResultsHandler
   */
  openInImageViewer(stage) {
    return this.resultsHandler.openInImageViewer(stage);
  }

  /**
   * View result in image viewer (legacy alias)
   * Delegated to ResultsHandler
   */
  viewInViewer(stage) {
    return this.resultsHandler.viewInViewer(stage);
  }

  /**
   * View results - opens the primary result in viewer
   * Delegated to ResultsHandler
   */
  viewResults() {
    return this.resultsHandler.viewResults();
  }

  /**
   * Start a new analysis - reset everything and go back to step 1
   * Delegated to ResultsHandler
   */
  startNewAnalysis() {
    return this.resultsHandler.startNewAnalysis();
  }

  /**
   * Reset training stage UI elements for a given prefix (n2v, stage1, stage2)
   * Delegated to UIStateHandler
   */
  resetTrainingStageUI(prefix) {
    return this.uiStateHandler.resetTrainingStageUI(prefix);
  }

  // ==================== MASK UI METHODS (autoStructN2V) ====================
  // Delegated to MaskHandler

  /**
   * Initialize mask visualization components
   * Delegated to MaskHandler
   */
  initializeMaskUI() {
    return this.maskHandler.initializeMaskUI();
  }

  /**
   * Update mask visualization with new data
   * Delegated to MaskHandler
   */
  updateMaskVisualization(data) {
    return this.maskHandler.updateMaskVisualization(data);
  }

  /**
   * Update a mask parameter
   * Delegated to MaskHandler
   */
  updateMaskParameter(name, value) {
    return this.maskHandler.updateMaskParameter(name, value);
  }

  /**
   * Reset mask parameters to defaults
   * Delegated to MaskHandler
   */
  resetMaskParameters() {
    return this.maskHandler.resetMaskParameters();
  }

  /**
   * Regenerate mask with current parameters
   * Delegated to MaskHandler
   */
  async regenerateMask() {
    return this.maskHandler.regenerateMask();
  }

  /**
   * Approve current mask and continue to Stage 2
   * Delegated to MaskHandler
   */
  approveMask() {
    return this.maskHandler.approveMask();
  }

  /**
   * Skip Stage 2 and use N2V results
   * Delegated to MaskHandler
   */
  skipStage2() {
    return this.maskHandler.skipStage2();
  }

  reset() {
    console.log('[DLDenoisingModule] Resetting module...');

    this.fileValidated = false;
    this.methodSelected = false;
    this.configSaved = false;
    this.trainingComplete = false;
    this.workflowMode = null;
    this.importValidated = false;
    this.importedModelConfig = null;
    this.uploadedFile = null;
    this.selectedFile = null;
    this.selectedMethod = null;
    this.selectedMode = '2d';
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

    // Reset mode toggle to 2D
    const modeToggle = document.getElementById('mode-toggle');
    if (modeToggle) modeToggle.checked = false;
    const leftLabel = document.querySelector('.mode-label-left');
    const rightLabel = document.querySelector('.mode-label-right');
    if (leftLabel) leftLabel.classList.add('active');
    if (rightLabel) rightLabel.classList.remove('active');

    // Reset auto-approve toggle
    this.autoApproveEnabled = false;
    const autoApproveToggle = document.getElementById('autoApproveToggle');
    if (autoApproveToggle) {
      autoApproveToggle.checked = false;
      autoApproveToggle.disabled = false;
    }
    const autoApproveContainer = document.getElementById('autoApproveContainer');
    if (autoApproveContainer) {
      autoApproveContainer.classList.remove('disabled');
    }

    // Hide workflow selection section and reset workflow sections
    const workflowSection = document.getElementById('workflowSelectionSection');
    if (workflowSection) {
      workflowSection.style.display = 'none';
    }
    document.querySelectorAll('.workflow-section').forEach(section => {
      section.classList.remove('active');
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

  /**
   * Update auto-approve toggle enabled/disabled state
   * @param {boolean} enabled - Whether the toggle should be interactive
   */
  updateAutoApproveToggleState(enabled) {
    const toggle = document.getElementById('autoApproveToggle');
    const container = document.getElementById('autoApproveContainer');
    if (toggle) {
      toggle.disabled = !enabled;
    }
    if (container) {
      container.classList.toggle('disabled', !enabled);
    }
  }

  /**
   * Called by ModuleLoader before deactivation.
   * If training is in progress, shows a warning dialog.
   * @returns {boolean} false to block deactivation, true to allow
   */
  async beforeDeactivate() {
    if (this.trainingId && !this.trainingComplete) {
      const shouldLeave = await ExitWarningDialog.show();
      if (!shouldLeave) {
        return false; // Stay in module
      }
      // User confirmed leaving - cancel training
      await this.cancelTraining();
    }
    return true;
  }

  async deactivate() {
    console.log('[DLDenoisingModule] Deactivating...');

    // Remove beforeunload handler
    this._removeBeforeUnloadHandler();

    // Disconnect socket and remove all listeners to prevent memory leaks
    if (this.progressHandler) {
      this.progressHandler.disconnectSocket();
    }

    // Clean up global references
    try { delete window.dlDenoisingModule; } catch (e) { window.dlDenoisingModule = undefined; }

    // Reset all module state for fresh start on next activation
    this.fileValidated = false;
    this.methodSelected = false;
    this.configSaved = false;
    this.trainingComplete = false;
    this.workflowMode = null;
    this.importValidated = false;
    this.importedModelConfig = null;
    this.uploadedFile = null;
    this.selectedMethod = null;
    this.selectedMode = '2d';
    this.validationResult = null;
    this.trainingId = null;
    this.trainingResult = null;
    this.inferenceResult = null;
    this.autoApproveEnabled = false;
    this.charts = { n2v: null, stage1: null, stage2: null };
    this.bestValLoss = { n2v: Infinity, stage1: Infinity, stage2: Infinity };

    await super.deactivate();

    console.log('[DLDenoisingModule] Deactivated');
  }

  // ===========================================================================
  // BEFOREUNLOAD HANDLER (tab close protection during training)
  // ===========================================================================

  _addBeforeUnloadHandler() {
    if (!this._beforeUnloadHandler) {
      this._beforeUnloadHandler = (e) => {
        e.preventDefault();
        e.returnValue = '';
      };
    }
    window.addEventListener('beforeunload', this._beforeUnloadHandler);
  }

  _removeBeforeUnloadHandler() {
    if (this._beforeUnloadHandler) {
      window.removeEventListener('beforeunload', this._beforeUnloadHandler);
    }
  }
}

export default DLDenoisingModule;
