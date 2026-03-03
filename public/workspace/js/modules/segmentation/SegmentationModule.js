/**
 * SegmentationModule - Complete U-Net Segmentation Pipeline
 * Extends BaseModule for consistent lifecycle and step navigation.
 */

import BaseModule from '/workspace/js/core/BaseModule.js';
import { StepNavigator, FileSelector, ValidationDisplay } from '/workspace/js/core/components/index.js';
import ExitWarningDialog from '/workspace/js/core/components/ExitWarningDialog.js';
import SegmentationAPI from './SegmentationAPI.js';
import Templates from './templates/Templates.js';
import TrainingHandler from './handlers/TrainingHandler.js';
import InferenceHandler from './handlers/InferenceHandler.js';
import ChartHandler from './handlers/ChartHandler.js';
import NavigationHandler from './handlers/NavigationHandler.js';
import FileHandler from './handlers/FileHandler.js';
import ImportHandler from './handlers/ImportHandler.js';
import StateHandler from './handlers/StateHandler.js';

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

    // API client
    this.api = new SegmentationAPI();

    // Handlers (ES6 class pattern)
    this.trainingHandler = new TrainingHandler(this);
    this.inferenceHandler = new InferenceHandler(this);
    this.chartHandler = new ChartHandler(this);
    this.navigationHandler = new NavigationHandler(this);
    this.fileHandler = new FileHandler(this);
    this.importHandler = new ImportHandler(this);
    this.stateHandler = new StateHandler(this);

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

    // Workflow mode: 'train' or 'import'
    this.workflowMode = null;

    // Import-specific state
    this.importSelectors = { model: null, config: null };
    this.importSelectorsInitialized = false;
    this.importFiles = {
      model: null,
      config: null
    };
    this.importValidation = {
      model: { valid: false, result: null },
      config: { valid: false, result: null }
    };
    this.importValidated = false;
    this.importedModelConfig = null;

    // Direction-aware / 2.5D state
    this.selectedMode = '2d';
    this.directionVolumePath = null;
    this.useFilamentAnnotations = false;
    this.isDirectionAwareTraining = false;

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

      // Note: Loading overlay is handled by ModuleLoader via ui.loading state
      // No need to call this.showLoading() here - it would create a duplicate

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

      console.log('[SegmentationModule] Activation complete');

    } catch (error) {
      console.error('[SegmentationModule] Activation error:', error);
      this.state.notify('error', `Failed to activate segmentation module: ${error.message}`);
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
   * Render a help icon that opens the Info Panel
   * Delegates to Templates for consistency
   * @param {string} articleId - The article ID to display when clicked
   * @returns {string} HTML string for the help icon
   */
  renderHelpIcon(articleId) {
    return Templates.renderHelpIcon(articleId);
  }

  /**
   * Render the complete segmentation UI
   * Delegates to Templates for maintainability
   */
  render() {
    this.container.innerHTML = Templates.renderModule(
      () => this.renderHeader(),
      () => this.renderStepNav()
    );
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

    // Set up back button handler (use onclick to prevent duplicate handlers)
    const backButton = document.getElementById('backToHub');
    if (backButton) {
      backButton.onclick = () => workspace.returnToHub();
    }

    // Initialize Socket.IO
    this.initializeSocketConnection();

    // Note: Charts are initialized in goToStep(3)
    // to ensure they're created when the canvas is visible

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
    // Only load utils.js for helper functions (showLoading, hideLoading, showError)
    // Other scripts (navigation, training, inference, charts) are now ES6 handler classes
    const regularScripts = [
      '/workspace/js/modules/segmentation/handlers/utils.js'
    ];

    // Load regular scripts
    for (const scriptSrc of regularScripts) {
      if (!document.querySelector(`script[src="${scriptSrc}"]`)) {
        await this.loadScript(scriptSrc, false);
      }
    }

    // Set up global function bridges for handlers that need them
    this.setupGlobalBridges();

    // Initialize FileSelectors via handler
    await this.fileHandler.initializeFileSelectors();

    console.log('[SegmentationModule] Helper scripts loaded');
  }

  /**
   * Set up global function bridges for backwards compatibility
   * These bridge global function calls to handler methods
   */
  setupGlobalBridges() {
    // Bridge updateCharts to chartHandler
    window.updateCharts = (epoch, metrics) => {
      if (this.chartHandler) {
        this.chartHandler.updateCharts(epoch, metrics);
      }
    };

    // Bridge startTrainingPolling (used by some resume logic)
    window.startTrainingPolling = () => {
      if (this.trainingHandler) {
        this.trainingHandler.startTrainingPolling();
      }
    };

    // Note: stepStates, processStates, markStepCompleted, updateNavigationButtons
    // are already set up by NavigationHandler.js import
  }

  // ===========================================================================
  // FILE HANDLING (delegated to FileHandler)
  // ===========================================================================

  /**
   * Display validation results using ValidationDisplay component
   * Delegates to fileHandler but also accessible directly for backwards compatibility
   */
  displayValidationResults(validation) {
    this.fileHandler.displayValidationResults(validation);
  }

  /**
   * Display validation error using ValidationDisplay component
   */
  displayValidationError(errorMessage) {
    this.fileHandler.displayValidationError(errorMessage);
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

  // ===========================================================================
  // WORKFLOW TOGGLE LOGIC
  // ===========================================================================

  /**
   * Handle workflow section toggle (train vs import)
   * @param {string} workflow - 'train' or 'import'
   */
  onWorkflowSectionToggle(workflow) {
    const trainSection = document.getElementById('trainFromScratchSection');
    const importSection = document.getElementById('importModelSection');

    if (!trainSection || !importSection) return;

    if (workflow === 'train') {
      const isActive = trainSection.classList.contains('active');
      importSection.classList.remove('active');
      trainSection.classList.toggle('active', !isActive);
      this.workflowMode = !isActive ? 'train' : null;
    } else if (workflow === 'import') {
      const isActive = importSection.classList.contains('active');
      trainSection.classList.remove('active');
      importSection.classList.toggle('active', !isActive);
      this.workflowMode = !isActive ? 'import' : null;

      // Initialize import selectors when first opened
      if (this.workflowMode === 'import') {
        this.importHandler.initializeImportSelectors();
      }
    }

    this.updateStep1NextButton();
  }

  /**
   * Update Step 1 Next button state based on workflow mode
   */
  updateStep1NextButton() {
    const step1Next = document.getElementById('step1Next');
    if (!step1Next) return;

    if (!this.workflowMode) {
      step1Next.disabled = true;
      step1Next.textContent = 'Next: Configuration';
      return;
    }

    if (this.workflowMode === 'train') {
      step1Next.disabled = !this.filesValidated;
      step1Next.textContent = 'Next: Configuration';
    } else if (this.workflowMode === 'import') {
      step1Next.disabled = !this.importValidated;
      step1Next.textContent = 'Next: Run Inference';
    }
  }

  /**
   * Handle Step 1 Next button click
   */
  async handleStep1Next() {
    if (this.workflowMode === 'train') {
      this.goToStep(2); // Go to Configuration
    } else if (this.workflowMode === 'import') {
      // Set hasImportedModel flag
      this.hasImportedModel = true;
      // Set global for NavigationHandler compatibility
      window.importedModelInfo = this.importedModelConfig || true;
      // Store imported model in session
      await this.importHandler.storeImportedModelInSession();
      // Skip to Step 4
      this.goToStep(4);
    }
  }

  // ===========================================================================
  // IMPORT MODEL FUNCTIONALITY (delegated to ImportHandler)
  // ===========================================================================

  /**
   * Initialize Socket.IO connection
   */
  initializeSocketConnection() {
    if (this.socket) {
      this.socket.disconnect();
    }

    this.socket = io();

    // Training progress - use handler
    this.socket.on('training-progress', (data) => {
      console.log('[SegmentationModule] Training progress:', data);
      this.trainingHandler.updateTrainingProgress(data);
    });

    // Training complete - use handler
    this.socket.on('training-complete', (data) => {
      console.log('[SegmentationModule] Training complete:', data);

      // Mark training as complete for step navigation
      this.trainingComplete = true;

      // Remove beforeunload handler since training is done
      this._removeBeforeUnloadHandler();

      this.trainingHandler.onTrainingComplete(data);
    });

    // Inference progress - use handler
    this.socket.on('inference-progress', (data) => {
      console.log('[SegmentationModule] Inference progress:', data);
      this.inferenceHandler.updateInferenceProgress(data);
    });

    // Inference complete - use handler
    this.socket.on('inference-complete', (data) => {
      console.log('[SegmentationModule] Inference complete:', data);
      this.inferenceHandler.onInferenceComplete(data);
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

    // Destroy existing charts if they exist (they might reference stale DOM elements)
    // This ensures fresh charts are created on the current canvas elements
    if (this.lossChart) {
      try {
        this.lossChart.destroy();
      } catch (e) {
        console.warn('[SegmentationModule] Error destroying loss chart:', e);
      }
      this.lossChart = null;
    }
    if (this.diceChart) {
      try {
        this.diceChart.destroy();
      } catch (e) {
        console.warn('[SegmentationModule] Error destroying dice chart:', e);
      }
      this.diceChart = null;
    }

    console.log('[SegmentationModule] Initializing charts');

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
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 4,
            tension: 0.1,
            fill: false
          },
          {
            label: 'Validation Loss',
            data: [],
            borderColor: '#36A2EB',
            backgroundColor: 'rgba(54, 162, 235, 0.1)',
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 4,
            tension: 0.1,
            fill: false
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
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 4,
            tension: 0.1,
            fill: false
          },
          {
            label: 'Validation Dice',
            data: [],
            borderColor: '#9966FF',
            backgroundColor: 'rgba(153, 102, 255, 0.1)',
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 4,
            tension: 0.1,
            fill: false
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
  }

  /**
   * Set up event listeners
   */
  setupEventListeners() {
    // Workflow section toggle handlers
    // Use onclick instead of addEventListener to prevent duplicate handlers
    document.querySelectorAll('.workflow-header').forEach(header => {
      header.onclick = (e) => {
        // Don't toggle section when clicking help icons or mode toggle
        if (e.target.closest('.help-icon') || e.target.closest('.mode-toggle-section')) return;
        const workflow = header.dataset.workflow;
        if (workflow) {
          this.onWorkflowSectionToggle(workflow);
        }
      };
    });

    // Step 1: Navigation
    const step1Next = document.getElementById('step1Next');
    if (step1Next) {
      step1Next.onclick = () => this.handleStep1Next();
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

    const cancelTrainingBtn = document.getElementById('cancelTrainingBtn');
    if (cancelTrainingBtn) {
      cancelTrainingBtn.onclick = () => this.cancelTraining();
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

    // Set up direction-aware / mode toggle listeners
    this.fileHandler.setupDirectionListeners();

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

      // Show/hide direction config groups based on mode
      const directionConfigGroup = document.getElementById('directionConfigGroup');
      const contextSlicesOnlyGroup = document.getElementById('contextSlicesOnlyGroup');
      if (directionConfigGroup) {
        directionConfigGroup.style.display = this.useFilamentAnnotations ? 'block' : 'none';
      }
      if (contextSlicesOnlyGroup) {
        contextSlicesOnlyGroup.style.display =
          (this.selectedMode === '2.5d' && !this.useFilamentAnnotations) ? 'block' : 'none';
      }
    } else if (stepNumber === 3) {
      // Step 3: Initialize charts now that canvas is visible
      // Use setTimeout to ensure DOM is fully rendered after step visibility change
      setTimeout(() => this.initializeCharts(), 50);

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

    // Add mode and mode-specific parameters
    if (this.useFilamentAnnotations && this.directionVolumePath) {
      // Direction-aware 2.5D mode
      config.mode = 'direction_aware';
      config.direction_volume_path = this.directionVolumePath;
      config.context_slices = parseInt(document.getElementById('contextSlices').value);
      config.alpha = parseFloat(document.getElementById('alpha').value);
      config.lambda_dir = parseFloat(document.getElementById('lambdaDir').value);
      this.isDirectionAwareTraining = true;
    } else if (this.selectedMode === '2.5d') {
      // 2.5D without direction volume
      config.mode = '2.5d';
      config.context_slices = parseInt(document.getElementById('contextSlicesOnly').value);
      this.isDirectionAwareTraining = false;
    } else {
      // Standard 2D mode
      config.mode = '2d';
      this.isDirectionAwareTraining = false;
    }

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

        // Register beforeunload handler to warn on tab close during training
        this._addBeforeUnloadHandler();

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
   * Cancel ongoing training
   */
  async cancelTraining() {
    if (!this.currentTrainingId) {
      this.state.notify('warning', 'No active training to cancel');
      return;
    }

    try {
      const result = await this.api.cancelTraining(this.currentTrainingId);

      if (result.success) {
        // Remove beforeunload handler
        this._removeBeforeUnloadHandler();

        // Reset UI
        const trainingActionContent = document.getElementById('trainingActionContent');
        const trainingProgressContent = document.getElementById('trainingProgressContent');

        if (trainingActionContent) trainingActionContent.style.display = 'block';
        if (trainingProgressContent) trainingProgressContent.style.display = 'none';

        // Reset progress display
        const progressFill = document.getElementById('trainingProgressFill');
        if (progressFill) progressFill.style.width = '0%';
        document.getElementById('currentEpoch').textContent = '0';
        document.getElementById('trainingStatusText').textContent = 'Training cancelled';

        // Clear training ID
        this.currentTrainingId = null;

        this.state.notify('info', 'Training cancelled');
      } else {
        throw new Error(result.error || 'Failed to cancel training');
      }
    } catch (error) {
      console.error('[SegmentationModule] Error cancelling training:', error);
      this.state.notify('error', `Failed to cancel training: ${error.message}`);
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

      // Lineage tracking: include input file IDs if available
      if (this.uploadedFiles.inference_data && this.uploadedFiles.inference_data.id) {
        requestBody.inputFileIds = [this.uploadedFiles.inference_data.id];
        console.log('[SegmentationModule] Including inputFileIds for lineage:', requestBody.inputFileIds);
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
   * Reset entire workflow (frontend only - files are preserved in workspace)
   */
  async resetWorkflow() {
      console.log('[SegmentationModule] Resetting workflow (frontend only)...');

      // Remove beforeunload handler
      this._removeBeforeUnloadHandler();

      // Clear global inference result and imported model info
      if (typeof window.inferenceResult !== 'undefined') {
        window.inferenceResult = null;
      }
      window.importedModelInfo = null;

      // Destroy existing charts before reinitializing
      if (this.lossChart) {
        this.lossChart.destroy();
        this.lossChart = null;
      }
      if (this.diceChart) {
        this.diceChart.destroy();
        this.diceChart = null;
      }
      if (this.chartHandler) {
        this.chartHandler.directionDatasetsEnabled = false;
      }

      // Reset uploaded files (frontend reference only)
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

      // Reset direction-aware state
      this.selectedMode = '2d';
      this.directionVolumePath = null;
      this.useFilamentAnnotations = false;
      this.isDirectionAwareTraining = false;

      // Reset direction-aware UI
      const dirAwareSection = document.getElementById('directionAwareSection');
      if (dirAwareSection) dirAwareSection.style.display = 'none';
      const toggleSection = document.getElementById('segModeToggleSection');
      if (toggleSection) toggleSection.classList.remove('disabled');
      const modeToggle = document.getElementById('seg-mode-toggle');
      if (modeToggle) modeToggle.checked = false;
      const dirConfigGroup = document.getElementById('directionConfigGroup');
      if (dirConfigGroup) dirConfigGroup.style.display = 'none';
      const ctxOnlyGroup = document.getElementById('contextSlicesOnlyGroup');
      if (ctxOnlyGroup) ctxOnlyGroup.style.display = 'none';

      // Reset direction metric cards
      ['trainSegLossCard', 'trainDirLossCard', 'valSegLossCard', 'valDirLossCard'].forEach(id => {
        const card = document.getElementById(id);
        if (card) card.style.display = 'none';
      });

      // Reset workflow mode and collapse workflow sections (Step 1)
      this.workflowMode = null;
      const trainSection = document.getElementById('trainFromScratchSection');
      const importSection = document.getElementById('importModelSection');
      if (trainSection) trainSection.classList.remove('active');
      if (importSection) importSection.classList.remove('active');

      // Reset configuration to defaults (Step 2)
      this.resetConfigToDefaults();

      // Reset training UI state
      this.resetTrainingUIState();

      // Reset inference UI state
      this.resetInferenceUIState();

      // Clear validation display on Step 1
      if (this.validationDisplay) {
        this.validationDisplay.hide();
      }

      // Clear file selector selections and refresh
      if (this.rawImageSelector) {
        this.rawImageSelector.clearSelection();
        await this.rawImageSelector.refresh();
      }

      if (this.annotationsSelector) {
        this.annotationsSelector.clearSelection();
        await this.annotationsSelector.refresh();
      }

      if (this.inferenceSelector) {
        this.inferenceSelector.clearSelection();
        await this.inferenceSelector.refresh();
      }

      // Update step navigator
      if (this.stepNavigator) {
        this.stepNavigator.update(1);
      }

      this.state.notify('success', 'Ready for new analysis');
      this.goToStep(1);

      // Note: Do NOT call initialize() here - it would add duplicate event listeners
  }

  /**
   * Reset configuration form to default values
   */
  resetConfigToDefaults() {
    // Dataset Configuration
    const patchSize = document.getElementById('patchSize');
    const patchesPerImage = document.getElementById('patchesPerImage');
    const batchSize = document.getElementById('batchSize');
    const augmentation = document.getElementById('augmentation');

    if (patchSize) patchSize.value = '64';
    if (patchesPerImage) patchesPerImage.value = '50';
    if (batchSize) batchSize.value = '8';
    if (augmentation) augmentation.checked = true;

    // Model Architecture
    const numFeatures = document.getElementById('numFeatures');
    const numLayers = document.getElementById('numLayers');

    if (numFeatures) numFeatures.value = '64';
    if (numLayers) numLayers.value = '4';

    // Training Parameters
    const learningRate = document.getElementById('learningRate');
    const numEpochs = document.getElementById('numEpochs');

    if (learningRate) learningRate.value = '0.001';
    if (numEpochs) numEpochs.value = '100';

    console.log('[SegmentationModule] Configuration reset to defaults');
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

    // Hide inference completion section (the "Segmentation Complete" success message)
    const inferenceCompletionSection = document.getElementById('inferenceCompletionSection');
    if (inferenceCompletionSection) {
      inferenceCompletionSection.style.display = 'none';
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

  // ===========================================================================
  // STATE MANAGEMENT (delegated to StateHandler)
  // ===========================================================================

  /**
   * Called by ModuleLoader before deactivation.
   * If training is in progress, shows a warning dialog.
   * @returns {boolean} false to block deactivation, true to allow
   */
  async beforeDeactivate() {
    if (this.currentTrainingId && !this.trainingComplete) {
      const shouldLeave = await ExitWarningDialog.show();
      if (!shouldLeave) {
        return false; // Stay in module
      }
      // User confirmed leaving - cancel training
      await this.cancelTraining();
    }
    return true;
  }

  /**
   * Deactivate the module
   */
  async deactivate() {
    console.log('[SegmentationModule] Deactivating...');

    // Remove beforeunload handler
    this._removeBeforeUnloadHandler();

    // Disconnect Socket.IO
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }

    // Destroy charts and reset chart handler state
    if (this.lossChart) {
      this.lossChart.destroy();
      this.lossChart = null;
    }

    if (this.diceChart) {
      this.diceChart.destroy();
      this.diceChart = null;
    }

    if (this.chartHandler) {
      this.chartHandler.directionDatasetsEnabled = false;
    }

    // Clear intervals (both module and handler)
    if (this.trainingPollInterval) {
      clearInterval(this.trainingPollInterval);
      this.trainingPollInterval = null;
    }

    // Cleanup handlers
    if (this.trainingHandler) {
      this.trainingHandler.cleanup();
    }

    // Reset all module state for fresh start on next activation
    this.currentStep = 1;
    this.currentTrainingId = null;
    this.currentInferenceId = null;
    this.filesValidated = false;
    this.configSaved = false;
    this.trainingComplete = false;
    this.hasImportedModel = false;
    this.workflowMode = null;
    this.importValidated = false;
    this.importedModelConfig = null;
    this.uploadedFiles = { raw_images: null, annotations: null, inference_data: null };
    this.selectedMode = '2d';
    this.directionVolumePath = null;
    this.useFilamentAnnotations = false;
    this.isDirectionAwareTraining = false;

    // Clear container
    if (this.container) {
      this.container.innerHTML = '';
    }

    console.log('[SegmentationModule] Deactivation complete');
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
