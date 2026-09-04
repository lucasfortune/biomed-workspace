/**
 * SegmentationModule - Complete U-Net Segmentation Pipeline
 * Extends BaseModule for consistent lifecycle and step navigation.
 */

import BaseModule from '/workspace/js/core/BaseModule.js';
import { StepNavigator, FileSelector, ValidationDisplay } from '/workspace/js/core/components/index.js';
import TrainingSessionPersistence from '/workspace/js/services/TrainingSessionPersistence.js';
import ParameterValidator from '/workspace/js/core/utils/ParameterValidator.js';
import FormValidationController from '/workspace/js/core/utils/FormValidationController.js';
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

    // Parameter validation
    this.imageDimensions = null;
    this.paramValidator = null;
    this.formValidationController = null;

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

      // Check for resume
      await this.stateHandler.checkForResume();

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

    // Set up back button handler (the DOM is rebuilt on every activate, so
    // a plain listener never accumulates duplicates)
    const backButton = document.getElementById('backToHub');
    if (backButton) {
      backButton.addEventListener('click', () => window.workspace.returnToHub());
    }

    // Initialize Socket.IO
    this.initializeSocketConnection();

    // Note: Charts are initialized in goToStep(3) or resumeTrainingSession()
    // to ensure they're created when the canvas is visible

    // Set up event listeners
    this.setupEventListeners();

    // Load helper scripts
    await this.loadHelperScripts();

    // Update progress bar (using StepNavigator)
    if (this.stepNavigator) {
      this.stepNavigator.update(this.currentStep);
    }

    // Check for active training session that can be resumed
    await this.checkForActiveSession();

    console.log('[SegmentationModule] Initialization complete');
  }

  /**
   * Check for active training session in localStorage and prompt user
   */
  async checkForActiveSession() {
    console.log('[SegmentationModule] Checking for active session...');
    console.log('[SegmentationModule] Current state:', {
      currentStep: this.currentStep,
      currentTrainingId: this.currentTrainingId
    });

    const ResumeDialog = window.ResumeDialog;

    if (!TrainingSessionPersistence || !ResumeDialog) {
      console.warn('[SegmentationModule] TrainingSessionPersistence or ResumeDialog not available');
      return;
    }

    const session = TrainingSessionPersistence.load();
    console.log('[SegmentationModule] Loaded session from localStorage:', session);

    if (!session) {
      console.log('[SegmentationModule] No active session in localStorage');
      return;
    }

    // Only handle sessions for this module
    if (session.moduleType !== 'segmentation') {
      console.log('[SegmentationModule] Active session belongs to different module:', session.moduleType);
      return;
    }

    console.log('[SegmentationModule] Found active training session, showing dialog:', session);

    // Show resume dialog
    const choice = await ResumeDialog.show({
      moduleType: session.moduleType,
      trainingId: session.trainingId,
      startedAt: session.startedAt,
      stage: session.stage
    });

    console.log('[SegmentationModule] User chose:', choice);

    // Set flag to prevent checkForResume() from restoring step
    // (we handle navigation here based on user's choice)
    this._resumedViaDialog = true;

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
    console.log('[SegmentationModule] Resuming training session:', session.trainingId);

    // Set training ID
    this.currentTrainingId = session.trainingId;

    // Navigate to step 3 (training) - this triggers chart initialization after 50ms
    this.goToStep(3);

    // Wait for DOM to be fully ready after step change
    await new Promise(resolve => setTimeout(resolve, 100));

    // Show training in progress UI (Start hidden, Cancel shown)
    this.applyTrainingUIState('running');

    // Ensure charts are initialized (goToStep should have done this, but be safe)
    this.initializeCharts();
    console.log('[SegmentationModule] Charts after init:', { loss: !!this.lossChart, dice: !!this.diceChart });

    // Join training room
    if (this.socket) {
      this.socket.emit('join-training', session.trainingId);
    } else {
      console.warn('[SegmentationModule] Socket not available for joining training room');
    }

    // Fetch current status from backend
    try {
      const status = await this.api.getTrainingStatus(session.trainingId);

      if (status.success) {
        // Restore charts from history if available
        if (status.history && status.history.length > 0) {
          this.restoreChartsFromHistory(status.history);
        }

        // Update epoch counter from status
        if (status.current_epoch != null && status.total_epochs != null) {
          const currentEpochEl = document.getElementById('currentEpoch');
          const totalEpochsEl = document.getElementById('totalEpochs');
          if (currentEpochEl) currentEpochEl.textContent = status.current_epoch;
          if (totalEpochsEl) totalEpochsEl.textContent = status.total_epochs;
          const progress = status.total_epochs > 0 ? (status.current_epoch / status.total_epochs) * 100 : 0;
          const progressFill = document.getElementById('trainingProgressFill');
          if (progressFill) progressFill.style.width = `${progress}%`;
        }

        if (status.status === 'completed') {
          // Training finished while we were away
          this.showTrainingCompleteUI(status);
          TrainingSessionPersistence.clearAll();
          this.state.notify('info', 'Training completed. You can proceed to inference.');
        } else if (status.status === 'failed') {
          // Training failed
          this.state.notify('error', 'Training failed while you were away.');
          TrainingSessionPersistence.clearAll();
          // Failed while away: keep the message, offer Start again
          this.applyTrainingUIState('failed');
        } else if (status.status === 'unknown') {
          // Session not in server memory - server may have restarted
          // DON'T clear localStorage or hide epoch counter - training might still be running
          // We're already connected to Socket.IO, so we'll receive updates if training is active
          this.state.notify('info', 'Reconnecting to training session...');

          // Show the epoch counter with a "reconnecting" state
          const epochInfo = document.querySelector('.epoch-info');
          if (epochInfo) {
            epochInfo.style.display = 'block';
          }
          const statusText = document.getElementById('trainingStatusText');
          if (statusText) {
            statusText.textContent = 'Reconnecting...';
          }

          // Start polling as backup to Socket.IO
          if (typeof startTrainingPolling === 'function') {
            startTrainingPolling();
          }

          // If we receive Socket.IO updates within 5 seconds, training is still running
          // If not, assume training completed or was cancelled
          setTimeout(() => {
            // Check if we've received any updates (currentEpoch would be > 0)
            const currentEpochEl = document.getElementById('currentEpoch');
            const epochValue = parseInt(currentEpochEl?.textContent || '0');

            if (epochValue > 0) {
              // Received updates - training is running
              const statusTextEl = document.getElementById('trainingStatusText');
              if (statusTextEl) {
                statusTextEl.textContent = 'Training in progress...';
                this.setTrainingStatusTone(null, statusTextEl);
              }
              this.state.notify('success', 'Reconnected to running training.');
            } else {
              // No updates received - training likely completed or server restarted
              // Enable the Next button so user can proceed to inference
              this.trainingComplete = true;
              const trainingNextBtn = document.getElementById('trainingNextBtn');
              if (trainingNextBtn) trainingNextBtn.disabled = false;

              const statusTextEl = document.getElementById('trainingStatusText');
              if (statusTextEl) {
                statusTextEl.textContent = 'Training session status unclear';
                this.setTrainingStatusTone('warning', statusTextEl);
              }

              TrainingSessionPersistence.clearAll();
              this.state.notify('warning', 'Could not reconnect to training. If training completed, proceed to Inference.');
            }
          }, 5000);
        } else if (status.status === 'training') {
          // Still running - chart data already restored above
          this.state.notify('success', 'Reconnected to training session.');
        } else {
          // Unknown status, assume it might still be running
          this.state.notify('info', 'Reconnected to training session.');
        }
      }
    } catch (error) {
      console.error('[SegmentationModule] Error fetching training status:', error);
      // On error, don't hide the epoch counter - training might still be running
      // The Socket.IO connection will provide updates if training is active
      this.state.notify('warning', 'Could not check training status. Waiting for updates...');

      // Show epoch counter
      const epochInfo = document.querySelector('.epoch-info');
      if (epochInfo) {
        epochInfo.style.display = 'block';
      }

      // Start polling as backup to Socket.IO
      if (typeof startTrainingPolling === 'function') {
        startTrainingPolling();
      }

      // Wait 5 seconds and check if we received any Socket.IO updates
      setTimeout(() => {
        const currentEpochEl = document.getElementById('currentEpoch');
        const epochValue = parseInt(currentEpochEl?.textContent || '0');

        if (epochValue > 0) {
          // Received updates - training is running
          this.state.notify('success', 'Reconnected to running training.');
        } else {
          // No updates - assume training completed
          this.trainingComplete = true;
          const trainingNextBtn = document.getElementById('trainingNextBtn');
          if (trainingNextBtn) trainingNextBtn.disabled = false;

          TrainingSessionPersistence.clearAll();
          this.state.notify('info', 'Training session state unclear. You can proceed to inference if training completed.');
        }
      }, 5000);
    }
  }

  /**
   * Restore charts from training history
   * @param {Array} history - Array of {epoch, train_loss, val_loss, train_dice, val_dice}
   */
  restoreChartsFromHistory(history) {
    if (!history || history.length === 0) return;

    // Make sure charts are initialized
    if (!this.lossChart || !this.diceChart) {
      console.warn('[SegmentationModule] Charts not initialized, cannot restore history');
      return;
    }

    // Clear existing chart data
    this.lossChart.data.labels = [];
    this.lossChart.data.datasets[0].data = [];
    this.lossChart.data.datasets[1].data = [];
    this.diceChart.data.labels = [];
    this.diceChart.data.datasets[0].data = [];
    this.diceChart.data.datasets[1].data = [];

    // Add all historical data points (only valid ones with epoch > 0)
    let addedCount = 0;
    for (const point of history) {
      if (point.epoch != null && point.epoch > 0) {
        // Loss chart - require valid loss values
        if (point.train_loss != null && point.val_loss != null) {
          this.lossChart.data.labels.push(point.epoch);
          this.lossChart.data.datasets[0].data.push(point.train_loss);
          this.lossChart.data.datasets[1].data.push(point.val_loss);
          addedCount++;
        }
        // Dice chart - require valid dice values
        if (point.train_dice != null && point.val_dice != null) {
          this.diceChart.data.labels.push(point.epoch);
          this.diceChart.data.datasets[0].data.push(point.train_dice);
          this.diceChart.data.datasets[1].data.push(point.val_dice);
        }
      }
    }

    // Update charts
    this.lossChart.update();
    this.diceChart.update();

    console.log('[SegmentationModule] Charts restored with', addedCount, 'valid data points from', history.length, 'history entries');
  }

  /**
   * Set the tone of the step-3 status line. The colour lives in CSS
   * (.training-status-text.is-warning / .is-success); passing no tone
   * clears both classes so the line falls back to the default colour.
   * @param {'warning'|'success'|null} [tone]
   * @param {HTMLElement} [el] - Defaults to #trainingStatusText
   */
  setTrainingStatusTone(tone = null, el = null) {
    const target = el || document.getElementById('trainingStatusText');
    if (!target) return;
    target.classList.remove('is-warning', 'is-success');
    if (tone) target.classList.add(`is-${tone}`);
  }

  /**
   * Apply one of the training UI states to step 3. Exactly one enabled red
   * action is visible at a time (Start is swapped for Cancel while a run is
   * active, and stays hidden once the run has succeeded).
   *   'idle'     - ready message shown, Start enabled, Cancel hidden
   *   'running'  - progress shown, Start hidden, Cancel shown
   *   'finished' - progress shown, Start stays hidden, Cancel hidden
   *   'failed'   - progress (with the failure message) stays visible,
   *                Start shown again, Cancel hidden
   * @param {'idle'|'running'|'finished'|'failed'} mode
   */
  applyTrainingUIState(mode) {
    const actionContent = document.getElementById('trainingActionContent');
    const progressContent = document.getElementById('trainingProgressContent');
    const startBtn = document.getElementById('startTrainingBtn');
    const cancelBtn = document.getElementById('cancelTrainingBtn');

    const idle = mode === 'idle';
    const running = mode === 'running';
    const failed = mode === 'failed';

    if (actionContent) actionContent.style.display = idle ? 'block' : 'none';
    if (progressContent) progressContent.style.display = idle ? 'none' : 'block';

    if (startBtn) {
      startBtn.style.display = (idle || failed) ? '' : 'none';
      if (idle || failed) startBtn.disabled = false;
    }
    if (cancelBtn) cancelBtn.style.display = running ? '' : 'none';

    console.log('[SegmentationModule] Training UI state:', mode);
  }

  /**
   * Show training complete UI state
   * @param {Object} status - Optional status object with history and epoch info
   */
  showTrainingCompleteUI(status = {}) {
    // Progress stays visible; Start stays hidden and Cancel is hidden
    this.applyTrainingUIState('finished');

    // Update status text and progress bar
    const statusText = document.getElementById('trainingStatusText');
    if (statusText) {
      statusText.textContent = 'Training complete!';
      this.setTrainingStatusTone('success', statusText);
    }

    const progressFill = document.getElementById('trainingProgressFill');
    if (progressFill) progressFill.style.width = '100%';

    // Show epoch counter with final values if we have history
    const epochInfo = document.querySelector('.epoch-info');
    if (status.history && status.history.length > 0) {
      const lastEpoch = status.history[status.history.length - 1].epoch;
      const totalEpochs = status.total_epochs || lastEpoch;
      document.getElementById('currentEpoch').textContent = lastEpoch;
      document.getElementById('totalEpochs').textContent = totalEpochs;
      if (epochInfo) epochInfo.style.display = 'block';
    } else if (status.current_epoch && status.total_epochs) {
      document.getElementById('currentEpoch').textContent = status.current_epoch;
      document.getElementById('totalEpochs').textContent = status.total_epochs;
      if (epochInfo) epochInfo.style.display = 'block';
    } else {
      // Hide epoch counter if we don't have the data
      if (epochInfo) epochInfo.style.display = 'none';
    }

    const stageStatus = document.getElementById('trainingStageStatus');
    if (stageStatus) {
      stageStatus.textContent = 'Complete';
      stageStatus.className = 'stage-status completed';
    }

    // Enable navigation buttons
    const nextBtn = document.getElementById('trainingNextBtn');
    if (nextBtn) nextBtn.disabled = false;
    const backBtn = document.getElementById('trainingBackBtn');
    if (backBtn) backBtn.disabled = false;

    // Update module state
    this.trainingComplete = true;

    // Update helper script state if loaded (for step navigation)
    if (typeof window.stepStates !== 'undefined') {
      window.stepStates[3] = window.stepStates[3] || {};
      window.stepStates[3].completed = true;
      window.stepStates[3].trainingCompleted = true;
      window.stepStates[4] = window.stepStates[4] || {};
      window.stepStates[4].canNavigate = true;
    }
    if (typeof window.processStates !== 'undefined') {
      window.processStates.trainingInProgress = false;
    }
    if (typeof window.markStepCompleted === 'function') {
      window.markStepCompleted(3);
    }

    // Update step navigator if available
    if (this.stepNavigator) {
      this.stepNavigator.update(this.currentStep);
    }
  }

  /**
   * Clean up active session and start fresh
   * @param {Object} session - Session data from localStorage
   */
  async cleanupAndStartFresh(session) {
    console.log('[SegmentationModule] Cleaning up and starting fresh');

    try {
      // Cancel the training on the backend
      await this.api.cancelTraining(session.trainingId);
      this.state.notify('info', 'Previous training cancelled. Ready to start new training.');
    } catch (error) {
      console.error('[SegmentationModule] Error cancelling training:', error);
      // Still clear local state even if backend cancel fails
    }

    // Clear localStorage
    TrainingSessionPersistence.clearAll();

    // Reset UI state
    this.currentTrainingId = null;
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
    this.stateHandler.saveState();
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

      // Clear localStorage session - training is done
      TrainingSessionPersistence.clearAll();

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
   * Read the chart palette from the CSS design tokens on :root so the
   * canvas-drawn charts follow the active (light/dark) theme.
   * @returns {{trainLoss: string, valLoss: string, trainDice: string, valDice: string, grid: string, label: string}}
   */
  readChartPalette() {
    const styles = getComputedStyle(document.documentElement);
    const token = (name, fallback) => {
      const value = styles.getPropertyValue(name).trim();
      return value || fallback;
    };
    return {
      trainLoss: token('--module-primary', '#EB1F17'),
      valLoss: token('--module-info', '#17A2B8'),
      trainDice: token('--module-success', '#1DA924'),
      valDice: token('--module-text-secondary', '#6C757D'),
      grid: token('--module-border', '#DEE2E6'),
      label: token('--module-text-secondary', '#6C757D')
    };
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

    // Chart.js draws on a canvas, so the palette is read from the design
    // tokens once, at creation time (a theme switch after that keeps the
    // colours of the running chart until it is re-created).
    //   Training Loss  -> --module-primary        (red, the module accent)
    //   Validation Loss-> --module-info           (teal, the "other" series)
    //   Training Dice  -> --module-success        (green)
    //   Validation Dice-> --module-text-secondary (grey, the muted partner)
    //   grid           -> --module-border, labels -> --module-text-secondary
    const palette = this.readChartPalette();

    // Loss chart
    this.lossChart = new Chart(lossCanvas.getContext('2d'), {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          {
            label: 'Training Loss',
            data: [],
            borderColor: palette.trainLoss,
            backgroundColor: palette.trainLoss,
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 4,
            tension: 0.1,
            fill: false
          },
          {
            label: 'Validation Loss',
            data: [],
            borderColor: palette.valLoss,
            backgroundColor: palette.valLoss,
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
            position: 'top',
            labels: { color: palette.label }
          }
        },
        scales: {
          x: {
            grid: { color: palette.grid },
            ticks: { color: palette.label }
          },
          y: {
            beginAtZero: true,
            grid: { color: palette.grid },
            ticks: { color: palette.label }
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
            borderColor: palette.trainDice,
            backgroundColor: palette.trainDice,
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 4,
            tension: 0.1,
            fill: false
          },
          {
            label: 'Validation Dice',
            data: [],
            borderColor: palette.valDice,
            backgroundColor: palette.valDice,
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
            position: 'top',
            labels: { color: palette.label }
          }
        },
        scales: {
          x: {
            grid: { color: palette.grid },
            ticks: { color: palette.label }
          },
          y: {
            beginAtZero: true,
            max: 1,
            grid: { color: palette.grid },
            ticks: { color: palette.label }
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
    // Small helper: the DOM is rebuilt by render() on every activate, so a
    // plain addEventListener never accumulates duplicate handlers.
    const on = (id, handler) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', handler);
    };

    // Workflow section toggle handlers (delegated on the stable section
    // wrapper so the headers can be re-rendered freely)
    const workflowSection = document.querySelector('.workflow-selection-section');
    if (workflowSection) {
      workflowSection.addEventListener('click', (event) => {
        const header = event.target.closest('.workflow-header');
        if (!header || !workflowSection.contains(header)) return;
        const workflow = header.dataset.workflow;
        if (workflow) {
          this.onWorkflowSectionToggle(workflow);
        }
      });
    }

    // Step 1: Navigation
    on('step1Next', () => this.handleStep1Next());

    // Step 2: Configuration
    on('step2Back', () => this.goToStep(1));
    on('step2Next', () => this.configureAndProceed());

    // Step 3: Training
    on('startTrainingBtn', () => this.startTraining());
    on('cancelTrainingBtn', () => this.cancelTraining());
    on('trainingBackBtn', () => this.goToStep(2));
    on('trainingNextBtn', () => this.goToStep(4));

    // Step 4: Inference
    on('runInferenceBtn', () => this.runInference());
    on('step4Back', () => this.goToStep(3));

    // Step 4 Completion: Image Viewer and Reset
    on('openInViewerBtn', () => this.openInImageViewer());
    on('resetWorkflowBtn', () => this.resetWorkflow());

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
      // Initialize parameter validation for config form
      this._initConfigValidation();
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
      // Re-run compatibility check on entry (in case model/file changed)
      this._validateInferenceCompatibility();
    }

    // Scroll step contents container to top when changing steps
    const stepContentsContainer = document.querySelector('.segmentation-module .step-contents');
    if (stepContentsContainer) {
      stepContentsContainer.scrollTop = 0;
    }

    // Save state to persist current step
    this.stateHandler.saveState();
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
   * Initialize parameter validation on the config form (step 2)
   */
  _initConfigValidation() {
    if (this.formValidationController) {
      this.formValidationController.destroy();
    }

    this.paramValidator = new ParameterValidator(this.imageDimensions);
    const step2Next = document.getElementById('step2Next');

    this.formValidationController = new FormValidationController(this.paramValidator, {
      onValidationChange: (allValid) => {
        if (step2Next) step2Next.disabled = !allValid;
      }
    });

    const configForm = document.querySelector('.segmentation-module .config-form');
    if (configForm) {
      this.formValidationController.attachTo(configForm);
    }

    // Patch size: must be <= min(image width, height) AND divisible by 2^num_layers
    // (otherwise an odd intermediate dim breaks the U-Net's decoder skip connections)
    this.formValidationController.addFieldRule('patchSize', (value) => {
      const layersEl = document.getElementById('numLayers');
      const layers = layersEl ? parseInt(layersEl.value) : null;
      return this.paramValidator.validatePatchSize(parseInt(value), {
        overlapTilePad: 0,
        numLayers: layers
      });
    });

    // Numeric range rules
    this.formValidationController.addFieldRule('patchesPerImage', (value) => {
      return this.paramValidator.validateRange(parseInt(value), 1, 100, 'Patches per image');
    });
    this.formValidationController.addFieldRule('numLayers', (value) => {
      return this.paramValidator.validateRange(parseInt(value), 2, 6, 'Number of layers');
    });
    this.formValidationController.addFieldRule('numEpochs', (value) => {
      return this.paramValidator.validateRange(parseInt(value), 10, 500, 'Number of epochs');
    });

    // Disable patch size options exceeding image dimensions
    const maxPatch = this.paramValidator.getMaxPatchSize();
    if (maxPatch != null) {
      this.formValidationController.updateSelectOptions('patchSize', maxPatch);
    }

    // Run initial validation
    this.formValidationController.validateAll();
  }

  /**
   * Verify the inference TIFF's slice dimensions are compatible with the
   * active model's U-Net depth. An odd intermediate spatial dim collapses
   * to a mismatch like "upsampled=30x30 vs skip=31x31" at run time, so we
   * pre-check min(w,h) % 2^num_layers === 0 and block inference if not.
   *
   * Bails out (does not block) when we don't know num_layers or dimensions —
   * we don't want to gate users when the metadata is simply unavailable.
   */
  _validateInferenceCompatibility() {
    const runInferenceBtn = document.getElementById('runInferenceBtn');
    const dims = this.inferenceDimensions;
    const numLayers = this.importedModelConfig?.num_layers
      ?? this.trainingConfig?.num_layers
      ?? null;

    // Clear any prior warning
    const warningId = 'inferenceCompatibilityWarning';
    const existing = document.getElementById(warningId);
    if (existing) existing.remove();

    if (!dims || numLayers == null) return;

    const minDim = Math.min(dims.width, dims.height);
    const divisor = Math.pow(2, numLayers);
    const remainder = minDim % divisor;

    if (remainder === 0) {
      // Compatible — make sure the button is enabled (file is present).
      if (runInferenceBtn && this.uploadedFiles.inference_data) {
        runInferenceBtn.disabled = false;
      }
      return;
    }

    const message =
      `Inference image (${dims.width}x${dims.height}) is incompatible with the ` +
      `model's depth: smallest dimension ${minDim} is not divisible by ${divisor} ` +
      `(2^${numLayers} layers). The U-Net decoder will fail with a shape mismatch.`;

    if (runInferenceBtn) runInferenceBtn.disabled = true;

    // Inline warning under the file selector so the user sees it in context.
    const warningSlot = document.getElementById('inferenceWarningSlot');
    if (warningSlot) {
      const warning = document.createElement('div');
      warning.id = warningId;
      warning.className = 'inference-compatibility-warning';
      warning.textContent = message;
      warningSlot.appendChild(warning);
    }

    this.state.notify('error', message, 8000);
  }

  /**
   * Configure training and proceed to step 3
   */
  async configureAndProceed() {
    // Check parameter validation before proceeding
    if (this.formValidationController && !this.formValidationController.isValid()) {
      this.state.notify('error', 'Please fix invalid parameters before continuing');
      return;
    }

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
        // Persist config so inference-step validation can read num_layers
        this.trainingConfig = config;

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

    // Check global training lock
    const lockOwner = TrainingSessionPersistence.getLockOwner();
    if (lockOwner && lockOwner.moduleType !== 'segmentation') {
      const ownerName = TrainingSessionPersistence.getModuleName(lockOwner.moduleType);
      this.state.notify('error', `Training already in progress in ${ownerName} module. Please wait for it to complete or cancel it first.`);
      return;
    }

    try {
      // Switch to the running state: Start hidden, Cancel shown
      this.applyTrainingUIState('running');

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

        // Acquire global training lock
        TrainingSessionPersistence.acquireLock('segmentation', result.training_id);

        // Save session to localStorage for persistence across page refresh
        TrainingSessionPersistence.save({
          moduleType: 'segmentation',
          trainingId: result.training_id,
          stage: 'training',
          config: this.trainingConfig || {},
          status: 'running'
        });

        // Save state to persist training ID
        this.stateHandler.saveState();

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
        // Clear localStorage session
        TrainingSessionPersistence.clearAll();

        // Reset UI (Start available again)
        this.applyTrainingUIState('idle');

        // Reset progress display
        const progressFill = document.getElementById('trainingProgressFill');
        if (progressFill) progressFill.style.width = '0%';
        document.getElementById('currentEpoch').textContent = '0';
        document.getElementById('trainingStatusText').textContent = 'Training cancelled';
        this.setTrainingStatusTone(null);

        // Clear training ID
        this.currentTrainingId = null;
        this.stateHandler.saveState();

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

        // Save state to persist inference ID
        this.stateHandler.saveState();

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
    const confirmed = confirm('Start a new run? This resets the current workflow. Your workspace files will be preserved.');

    if (confirmed) {
      console.log('[SegmentationModule] Resetting workflow (frontend only)...');

      // Clear training session persistence (localStorage) - MUST be first to prevent reconnect attempts
      TrainingSessionPersistence.clearAll();

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

      // Clear cached dimensions / model config used by inference-side validation
      this.inferenceDimensions = null;
      this.imageDimensions = null;
      this.trainingConfig = null;
      this.importedModelConfig = null;

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

      // Clear parameter validation
      if (this.formValidationController) {
        this.formValidationController.destroy();
        this.formValidationController = null;
      }
      this.imageDimensions = null;

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

      this.state.notify('success', 'Ready for a new run');
      this.goToStep(1);

      // Note: Do NOT call initialize() here - it would add duplicate event listeners
      // and trigger checkForActiveSession() which tries to reconnect to old training
    }
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
    this.applyTrainingUIState('idle');

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
      this.setTrainingStatusTone(null, trainingStatusText);
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

    // Clear intervals (both module and handler)
    if (this.trainingPollInterval) {
      clearInterval(this.trainingPollInterval);
      this.trainingPollInterval = null;
    }

    // Cleanup handlers
    if (this.trainingHandler) {
      this.trainingHandler.cleanup();
    }

    // Cleanup parameter validation
    if (this.formValidationController) {
      this.formValidationController.destroy();
      this.formValidationController = null;
    }

    // Reset step to 1 so next activate starts fresh
    // (localStorage session will still trigger resume dialog)
    this.currentStep = 1;

    // Clear training ID so resume check works correctly
    // (the actual training ID is stored in localStorage, not here)
    this.currentTrainingId = null;
    this.currentInferenceId = null;

    // Clear the resume flag
    this._resumedViaDialog = false;

    // Reset selected files
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

    // Reset workflow mode + imported model state
    this.workflowMode = null;
    this.importSelectors = { model: null, config: null };
    this.importSelectorsInitialized = false;
    this.importFiles = { model: null, config: null };
    this.importValidation = {
      model: { valid: false, result: null },
      config: { valid: false, result: null }
    };
    this.importValidated = false;
    this.importedModelConfig = null;

    // Reset cached configuration / dimensions used by validation
    this.trainingConfig = null;
    this.imageDimensions = null;
    this.inferenceDimensions = null;
    this.paramValidator = null;

    // Clear inference result shared with the Image Viewer
    if (typeof window !== 'undefined') {
      window.inferenceResult = null;
      window.importedModelInfo = null;
    }

    // Drop component references (they are rebuilt by render()/initialize())
    this.rawImageSelector = null;
    this.annotationsSelector = null;
    this.inferenceSelector = null;
    this.stepNavigator = null;
    this.validationDisplay = null;

    // Clear the persisted module state so the next visit starts on step 1
    // with nothing selected. The localStorage training session used by the
    // resume dialog (TrainingSessionPersistence) is deliberately untouched.
    this.state.update('modules.segmentation.currentStep', 1);
    this.state.update('modules.segmentation.uploadedFiles', this.uploadedFiles);
    this.state.update('modules.segmentation.currentTrainingId', null);
    this.state.update('modules.segmentation.currentInferenceId', null);
    this.state.update('modules.segmentation.currentTask', null);
    this.state.update('modules.segmentation.filesValidated', false);
    this.state.update('modules.segmentation.configSaved', false);
    this.state.update('modules.segmentation.trainingComplete', false);
    this.state.update('modules.segmentation.hasImportedModel', false);
    this.state.update('modules.segmentation.workflowMode', null);
    this.state.update('modules.segmentation.importFiles', this.importFiles);
    this.state.update('modules.segmentation.importValidated', false);
    this.state.update('modules.segmentation.importedModelConfig', null);

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
