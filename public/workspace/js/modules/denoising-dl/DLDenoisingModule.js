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
import { icon } from '/workspace/js/core/icons.js';
import { StepNavigator, FileSelector, ValidationDisplay }
  from '/workspace/js/core/components/index.js';
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

    // Parameter validation state
    this.configValid = true;

    // Collapsible sections for config
    this.configSections = {};

    // Training components
    this.trainingProgress = null;
    this.lossChart = null;
    this.resultsDisplay = null;

    // Chart instance and best loss tracking (one routed training run)
    this.charts = { train: null };
    this.bestValLoss = { train: Infinity };

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
    this._onActionClick = this._onActionClick.bind(this);
    this._onParamInput = this._onParamInput.bind(this);
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
        icon: 'folder',
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

    // One delegated click handler for every [data-action] button in the module
    this.container.removeEventListener('click', this._onActionClick);
    this.container.addEventListener('click', this._onActionClick);
    for (const type of ['input', 'change']) {
      this.container.removeEventListener(type, this._onParamInput);
      this.container.addEventListener(type, this._onParamInput);
    }

    // Legacy global reference (kept for console debugging / external callers)
    window.dlDenoisingModule = this;

    // Check for active training session that can be resumed
    await this.checkForActiveSession();

    console.log('[DLDenoisingModule] Initialization complete');
  }

  /**
   * Delegated input/change handler for the mask-parameter controls
   * (data-mask-param="name" data-parse="float|int|string"); ranges report
   * on `input`, selects on `change`.
   * @param {Event} event
   */
  _onParamInput(event) {
    const el = event.target;
    if (!el || !el.dataset || !el.dataset.maskParam) return;
    if (el.tagName === 'SELECT' && event.type !== 'change') return;
    if (el.type === 'range' && event.type !== 'input') return;
    const raw = el.value;
    const value = el.dataset.parse === 'float' ? parseFloat(raw)
      : el.dataset.parse === 'int' ? parseInt(raw, 10)
      : raw;
    this.updateMaskParameter(el.dataset.maskParam, value);
  }

  /**
   * Delegated click handler: maps [data-action] buttons to module methods.
   * Replaces the inline onclick attributes the templates used to carry.
   * @param {MouseEvent} event
   */
  _onActionClick(event) {
    const target = event.target.closest('[data-action]');
    if (!target || !this.container?.contains(target)) return;

    const action = target.dataset.action;

    switch (action) {
      case 'startTraining':
        this.startTraining();
        break;
      case 'cancelTraining':
        this.progressHandler?.cancelTraining();
        break;
      case 'approveMask':
        this.approveMask();
        break;
      case 'skipStage2':
        this.skipStage2();
        break;
      case 'openInImageViewer':
        this.openInImageViewer('result');
        break;
      case 'viewInViewer':
        this.viewInViewer();
        break;
      case 'startNewAnalysis':
        this.startNewAnalysis();
        break;
      case 'downloadResult':
        this.downloadResult();
        break;
      case 'downloadAllResults':
        this.downloadAllResults();
        break;
      case 'goToStep': {
        const step = parseInt(target.dataset.step, 10);
        if (!Number.isNaN(step)) this.goToStep(step);
        break;
      }
      case 'resetMaskParameters':
        this.resetMaskParameters();
        break;
      case 'regenerateMask':
        this.regenerateMask();
        break;
      case 'switchMaskSlice': {
        const index = parseInt(target.dataset.index, 10);
        if (!Number.isNaN(index)) this.maskVisualization?.switchSlice(index);
        break;
      }
      default:
        console.warn('[DLDenoisingModule] Unknown data-action:', action);
    }
  }

  /**
   * Check for active training session in localStorage and prompt user
   */
  async checkForActiveSession() {
    const TrainingSessionPersistence = window.TrainingSessionPersistence;
    const ResumeDialog = window.ResumeDialog;

    if (!TrainingSessionPersistence || !ResumeDialog) {
      console.warn('[DLDenoisingModule] TrainingSessionPersistence or ResumeDialog not available');
      return;
    }

    const session = TrainingSessionPersistence.load();
    if (!session) return;

    // Only handle sessions for this module
    if (session.moduleType !== 'denoising-dl') {
      console.log('[DLDenoisingModule] Active session belongs to different module:', session.moduleType);
      return;
    }

    console.log('[DLDenoisingModule] Found active training session:', session);

    // Check if session is stale (no progress for 10+ minutes)
    if (TrainingSessionPersistence.isStale(10)) {
      console.log('[DLDenoisingModule] Session appears stale, offering force cleanup option');
    }

    // Show resume dialog
    const choice = await ResumeDialog.show({
      moduleType: session.moduleType,
      trainingId: session.trainingId,
      startedAt: session.startedAt,
      stage: session.stage
    });

    if (choice === 'resume') {
      await this.resumeTrainingSession(session);
    } else {
      await this.cleanupAndStartFresh(session);
    }
  }

  /**
   * Resume an active training session
   * @param {Object} session - Session data from localStorage
   */
  async resumeTrainingSession(session) {
    console.log('[DLDenoisingModule] Resuming training session:', session.trainingId);

    // Set training ID
    this.trainingId = session.trainingId;
    this.state.update(`modules.denoising-dl.trainingId`, this.trainingId);

    // Restore method from config if available (needed for correct chart initialization)
    if (session.config && session.config.method) {
      this.selectedMethod = session.config.method;
      console.log('[DLDenoisingModule] Restored method from session config:', this.selectedMethod);
    }

    // Navigate to step 3 (training)
    this.goToStep(3);

    // Show training in progress UI (will create correct charts based on selectedMethod)
    await this.showTrainingInProgress();

    // Small delay to ensure DOM and charts are ready
    await new Promise(resolve => setTimeout(resolve, 100));

    // Connect to socket to receive progress updates
    this.connectToTrainingSocket();

    // Fetch current status from backend
    try {
      const status = await this.api.getTrainingStatus(this.trainingId);
      console.log('[DLDenoisingModule] Current training status:', status);

      if (status.success) {
        // Restore chart data from history if available
        await this.restoreFromHistory(status);

        if (status.status === 'completed') {
          // Training finished while we were away
          this.showTrainingCompleteResumed(status);
          TrainingSessionPersistence.clearAll();
          this.state.notify('info', 'Training completed. You can proceed to inference.');
        } else if (status.status === 'failed') {
          // Training failed
          this.state.notify('error', 'Training failed while you were away.');
          TrainingSessionPersistence.clearAll();
          this.showTrainingReady();
        } else if (status.status === 'unknown') {
          // Session not in server memory - likely completed or server restarted
          this.showTrainingCompleteResumed(status);
          TrainingSessionPersistence.clearAll();
          this.state.notify('info', 'Previous training session found. You can proceed to inference.');
        } else if (status.status === 'paused' || status.status === 'paused_at_mask') {
          // Paused at mask approval
          this.state.notify('info', 'Training resumed - awaiting mask approval.');
        } else if (status.status === 'running' || status.status === 'training') {
          // Still running - chart data already restored above
          this.state.notify('success', 'Reconnected to training session.');
        } else {
          // Unknown status, assume may still be running
          this.state.notify('info', 'Reconnected to training session.');
        }
      }
    } catch (error) {
      console.error('[DLDenoisingModule] Error fetching training status:', error);
      // Even on error, assume training may have completed
      this.showTrainingCompleteResumed();
      TrainingSessionPersistence.clearAll();
      this.state.notify('info', 'Previous training session found. You can proceed to inference.');
    }
  }

  /**
   * Restore UI state from backend status history
   * @param {Object} status - Training status from backend
   */
  async restoreFromHistory(status) {
    // Determine the method from session data
    const method = status.method || 'n2v';
    this.selectedMethod = method;

    // Wait for DOM to settle after showTrainingInProgress
    await new Promise(resolve => setTimeout(resolve, 100));

    // Initialize charts if not already done
    await this.chartHandler.initializeCharts();

    // Restore the single routed training history
    const trainHistory = status.trainHistory || [];
    if (trainHistory.length > 0) {
      this.chartHandler.restoreChartsFromHistory('train', trainHistory);

      const lastPoint = trainHistory[trainHistory.length - 1];
      const totalEpochs = status.session?.train?.totalEpochs || lastPoint.epoch;

      const currentEpochEl = document.getElementById('trainCurrentEpoch');
      const totalEpochsEl = document.getElementById('trainTotalEpochs');
      if (currentEpochEl) currentEpochEl.textContent = lastPoint.epoch;
      if (totalEpochsEl) totalEpochsEl.textContent = totalEpochs;

      // Update progress bar
      const progressFill = document.getElementById('trainProgressFill');
      if (progressFill) {
        const percent = totalEpochs > 0 ? (lastPoint.epoch / totalEpochs) * 100 : 0;
        progressFill.style.width = `${percent}%`;
      }

      // Update loss values
      const trainLossEl = document.getElementById('trainTrainLoss');
      const valLossEl = document.getElementById('trainValLoss');
      if (trainLossEl && lastPoint.trainLoss != null) {
        trainLossEl.textContent = lastPoint.trainLoss.toFixed(6);
      }
      if (valLossEl && lastPoint.valLoss != null) {
        valLossEl.textContent = lastPoint.valLoss.toFixed(6);
      }
    }

    // Restore the mask/route panel for autoStructN2V sessions
    const mask = status.session?.mask;
    if (method === 'autostructn2v' && mask?.maskArray) {
      this.initializeMaskUI();
      this.maskHandler.renderRouteDecision(mask);
      this.updateMaskVisualization({
        mask: mask.maskArray.map(row => row.map(val => Boolean(val))),
        kernelSize: mask.kernelSize,
        kernelHeight: mask.kernelHeight,
        kernelWidth: mask.kernelWidth,
        activePixels: mask.activePixels,
        pattern: mask.pattern,
        isEmpty: mask.isEmpty,
        branch: mask.branch
      });
      if (status.status === 'paused_at_mask') {
        const maskActions = document.getElementById('maskActions');
        if (maskActions) maskActions.style.display = 'block';
        this.uiStateHandler.updateStageStatus('mask', 'completed', 'Awaiting Approval');
      }
    }
    if (status.session?.train?.branch) {
      this.setTrainSectionBranch(status.session.train.branch);
    }

    console.log('[DLDenoisingModule] Restored history:', trainHistory.length, 'points');
  }

  /**
   * Update the training section title to name the branch that trains
   * @param {string} branch - 'n2v' or 'structn2v'
   */
  setTrainSectionBranch(branch) {
    const title = document.getElementById('trainSectionTitle');
    if (title && branch) {
      title.textContent = branch === 'structn2v'
        ? 'Model Training - StructN2V (discovered mask)'
        : 'Model Training - Plain N2V';
    }
  }

  /**
   * Show training complete UI when resuming a completed session
   * This is different from showTrainingComplete() which expects result data
   * @param {Object} status - Training status from backend (optional)
   */
  showTrainingCompleteResumed(status = {}) {
    const maskApprovalSection = document.getElementById('maskApprovalSection');
    const trainSection = document.getElementById('trainSection');

    // Determine method from status or use stored method
    const method = status.method || this.selectedMethod || 'n2v';
    this.selectedMethod = method;

    if (trainSection) trainSection.style.display = 'block';
    if (maskApprovalSection) {
      maskApprovalSection.style.display = method === 'autostructn2v' ? 'block' : 'none';
    }

    // Update epoch display from history if available
    const trainHistory = status.trainHistory || [];
    if (trainHistory.length > 0) {
      const lastPoint = trainHistory[trainHistory.length - 1];
      const totalEpochs = status.session?.train?.totalEpochs || lastPoint.epoch;

      const currentEpochEl = document.getElementById('trainCurrentEpoch');
      const totalEpochsEl = document.getElementById('trainTotalEpochs');
      if (currentEpochEl) currentEpochEl.textContent = lastPoint.epoch;
      if (totalEpochsEl) totalEpochsEl.textContent = totalEpochs;

      // Update progress bar to 100%
      const progressFill = document.getElementById('trainProgressFill');
      if (progressFill) progressFill.style.width = '100%';
    }

    if (method === 'autostructn2v') {
      this.uiStateHandler.updateStageStatus('mask', 'completed', 'Complete');
    }
    this.uiStateHandler.updateStageStatus('train', 'completed', 'Complete');

    // Nav row: Start hidden, Cancel hidden, Next enabled
    this.uiStateHandler.setJobButtons('finished');

    // Mark training as complete
    this.trainingComplete = true;
  }

  /**
   * Clean up active session and start fresh
   * @param {Object} session - Session data from localStorage
   */
  async cleanupAndStartFresh(session) {
    console.log('[DLDenoisingModule] Cleaning up and starting fresh');

    try {
      // Cancel the training on the backend
      await this.api.cancelTraining(session.trainingId);
      this.state.notify('info', 'Previous training cancelled. Ready to start new training.');
    } catch (error) {
      console.error('[DLDenoisingModule] Error cancelling training:', error);
      // Still clear local state even if backend cancel fails
    }

    // Clear localStorage
    TrainingSessionPersistence.clearAll();

    // Reset UI state
    this.trainingId = null;
    this.state.update(`modules.denoising-dl.trainingId`, null);
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

    // Preset selector
    document.getElementById('presetSelector')?.addEventListener('change', (e) => {
      this.onPresetChange(e.target.value);
    });

    // Workflow section toggle handlers
    document.querySelectorAll('.workflow-header').forEach(header => {
      header.addEventListener('click', (e) => {
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
          <span class="gpu-status-icon">${icon('check')}</span>
          <span class="gpu-status-text">
            GPU Available: ${result.device_name || 'CUDA Device'}
            <span class="gpu-status-detail">${result.memory_total_formatted || ''} VRAM</span>
          </span>
        `;
      } else {
        statusEl.className = 'gpu-status unavailable';
        statusEl.innerHTML = `
          <span class="gpu-status-icon">${icon('warning')}</span>
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
        <span class="gpu-status-icon">${icon('info')}</span>
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
   * Show training complete state
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
    this.configValid = true;

    // Clean up parameter validation
    if (this.configHandler) {
      this.configHandler.destroyValidation();
    }

    // Reset UI
    const step1Next = document.getElementById('step1Next');
    if (step1Next) step1Next.disabled = true;

    // Clear method selection
    document.querySelectorAll('input[name="dl-method"]').forEach(radio => {
      radio.checked = false;
    });

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

  async deactivate() {
    console.log('[DLDenoisingModule] Deactivating...');

    // Disconnect socket and remove all listeners to prevent memory leaks
    if (this.progressHandler) {
      this.progressHandler.disconnectSocket();
    }

    // Remove the delegated action handler
    if (this.container) {
      this.container.removeEventListener('click', this._onActionClick);
      this.container.removeEventListener('input', this._onParamInput);
      this.container.removeEventListener('change', this._onParamInput);
    }

    // Clean up global references
    try { delete window.dlDenoisingModule; } catch (e) { window.dlDenoisingModule = undefined; }

    // Clean up parameter validation
    if (this.configHandler) {
      this.configHandler.destroyValidation();
    }

    // The module instance is cached by ModuleLoader, so wipe every field the
    // next visit must not inherit. The DOM still exists here (super.deactivate
    // clears the container afterwards), so the DOM-touching resets are safe.
    // NOTE: localStorage training-session persistence is deliberately left
    // untouched so an in-flight run can still be resumed on the next visit.
    this.resetForLeave();

    await super.deactivate();

    console.log('[DLDenoisingModule] Deactivated');
  }

  /**
   * Full reset applied when leaving the module, so the next activation starts
   * on Step 1 with nothing selected.
   */
  resetForLeave() {
    // Step 3 UI (hides mask/train sections, destroys charts, resets badges,
    // progress bar and the nav-row job buttons)
    if (this.uiStateHandler) {
      this.uiStateHandler.showTrainingReady();
    }

    // Step 4 / inference state
    if (this.inferenceHandler) {
      if (this.inferenceHandler.socket) {
        this.inferenceHandler.socket.disconnect();
        this.inferenceHandler.socket = null;
      }
      this.inferenceHandler.resetInferenceState();
      this.inferenceHandler.inferenceFileSelector = null;
      this.inferenceHandler.inferenceValidationDisplay = null;
    }

    // Import workflow state (selectors, chosen files, validation results)
    if (this.fileHandler) {
      this.fileHandler.destroyImportSelectors();
      this.fileHandler.importFiles = { config: null, stage1Model: null, stage2Model: null };
      this.fileHandler.importValidation = {
        config: { valid: false, result: null },
        stage1: { valid: false, result: null },
        stage2: { valid: false, result: null }
      };
      this.fileHandler.parsedConfig = null;
    }

    // Mask components / data
    this.maskVisualization = null;
    this.maskParameterPanel = null;
    this.maskData = null;

    // Training/results components
    this.trainingProgress = null;
    this.resultsDisplay = null;
    this.lossChart = null;
    this.charts = { train: null };
    this.bestValLoss = { train: Infinity };
    this.gpuInfo = null;
    this.presets = null;
    this.parameterRanges = null;
    this.configSections = {};
    this.autoApproveEnabled = false;

    // Flags, selected file, method, config and result ids
    this.reset();

    // Components are rebuilt by initialize() on the next activation
    this.fileSelector = null;
    this.validationDisplay = null;
    this.stepNavigator = null;

    // BaseModule.deactivate() also resets this, set it here so a caller that
    // only calls resetForLeave() ends up on Step 1 too
    this.currentStep = 1;
  }
}

export default DLDenoisingModule;
