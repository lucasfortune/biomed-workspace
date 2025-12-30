/**
 * NavigationHandler.js - Step Navigation for DL Denoising Module
 *
 * Handles step navigation logic, step initialization, and training status checks.
 */

class NavigationHandler {
  /**
   * @param {DLDenoisingModule} module - Reference to the parent module
   */
  constructor(module) {
    this.module = module;
  }

  /**
   * Check if navigation to a step is allowed
   * @param {number} stepNumber - Step number to check
   * @returns {boolean} Whether navigation is allowed
   */
  canNavigateToStep(stepNumber) {
    switch (stepNumber) {
      case 1: return true;
      case 2: return this.module.fileValidated && this.module.methodSelected;
      case 3: return this.module.configSaved;
      case 4: return this.module.trainingComplete;
      default: return false;
    }
  }

  /**
   * Navigate to a specific step
   * @param {number} stepNumber - Step to navigate to
   */
  goToStep(stepNumber) {
    // Call parent class method via module
    this.module.constructor.prototype.__proto__.goToStep.call(this.module, stepNumber);

    if (this.module.stepNavigator) {
      this.module.stepNavigator.update(stepNumber);
    }

    // Render Step 2 when navigating to it
    if (stepNumber === 2) {
      this.module.renderStep2Config();
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
    console.log('[NavigationHandler] Initializing Step 3...');

    // Initialize best val loss tracking
    this.module.bestValLoss = { n2v: Infinity, stage1: Infinity, stage2: Infinity };

    // Initialize collapsible section handlers
    this.initCollapsibleSections();

    // Charts will be initialized when training starts (after Chart.js is loaded)
    this.module.charts = { n2v: null, stage1: null, stage2: null };

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
          icon.textContent = '\u25B6';
          body.style.display = 'none';
        } else {
          section.classList.remove('collapsed');
          section.classList.add('expanded');
          icon.textContent = '\u25BC';
          body.style.display = 'block';
        }
      });
    });
  }

  /**
   * Check if there's an ongoing training to resume
   */
  async checkTrainingStatus() {
    if (!this.module.trainingId) {
      // Check StateManager for saved training ID
      const savedTrainingId = this.module.state.get(`modules.denoising-dl.trainingId`);
      if (savedTrainingId) {
        this.module.trainingId = savedTrainingId;
      }
    }

    if (this.module.trainingId) {
      try {
        const status = await this.module.api.getTrainingStatus(this.module.trainingId);
        if (status.status === 'running') {
          // Resume training UI
          this.module.showTrainingInProgress();
          this.module.connectToTrainingSocket();
        } else if (status.status === 'completed') {
          // Show results
          this.module.showTrainingComplete(status);
        }
      } catch (error) {
        console.error('[NavigationHandler] Error checking training status:', error);
      }
    }
  }

  /**
   * Navigate to next step with validation
   */
  nextStep() {
    if (this.module.currentStep === 1) {
      if (!this.module.fileValidated) {
        this.module.state.notify('error', 'Please select a file first');
        return;
      }
      if (!this.module.methodSelected) {
        this.module.state.notify('error', 'Please select a denoising method');
        return;
      }
    }

    // Save config when leaving Step 2
    if (this.module.currentStep === 2) {
      this.module.saveConfig();
      this.module.configSaved = true;
    }

    // Call parent class method via module
    this.module.constructor.prototype.__proto__.nextStep.call(this.module);
  }
}

export default NavigationHandler;
