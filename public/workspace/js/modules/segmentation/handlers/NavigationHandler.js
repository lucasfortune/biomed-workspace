/**
 * NavigationHandler.js - Navigation and Step State Management for Segmentation Module
 *
 * Manages step navigation and state for the segmentation workflow.
 * Converted from global functions to ES6 class for better maintainability.
 *
 * Key responsibilities:
 * - Step state tracking (completed, canNavigate, trainingStarted, etc.)
 * - Process state tracking (trainingInProgress, inferenceInProgress)
 * - Reset workflow with download options
 */

// Step state management system - exported for other handlers
export let stepStates = {
  1: { completed: false, canNavigate: true },
  2: { completed: false, canNavigate: false },
  3: { completed: false, canNavigate: false, trainingStarted: false, trainingCompleted: false },
  4: { completed: false, canNavigate: false }
};

export let processStates = {
  trainingInProgress: false,
  inferenceInProgress: false
};

// Also expose on window for backwards compatibility with legacy code
window.stepStates = stepStates;
window.processStates = processStates;

class NavigationHandler {
  /**
   * @param {SegmentationModule} module - Reference to the parent module
   */
  constructor(module) {
    this.module = module;
  }

  /**
   * Central function to handle step changes
   * @param {number} stepNumber - The step to navigate to (1-4)
   */
  setStep(stepNumber) {
    if (stepNumber < 1 || stepNumber > 4) return;

    // Delegate to module's goToStep method
    if (this.module.goToStep) {
      this.module.goToStep(stepNumber);
      return;
    }

    // Fallback: Direct DOM manipulation
    if (!this.canNavigateToStep(stepNumber)) {
      console.warn(`[NavigationHandler] Navigation to step ${stepNumber} is not allowed`);
      this.showNavigationError(stepNumber);
      return;
    }

    // Handle import mode navigation
    if (window.importedModelInfo && stepNumber < 4) {
      stepNumber = 4;
    }

    // Hide current step
    document.querySelector('.step-content.active')?.classList.remove('active');
    document.querySelector('.step.active')?.classList.remove('active');

    // Show new step
    document.querySelector(`[data-step="${stepNumber}"]`)?.classList.add('active');
    document.querySelector(`#step${stepNumber}`)?.classList.add('active');

    // Handle Step 3 specific UI
    if (stepNumber === 3) {
      const trainingAction = document.getElementById('trainingAction');
      const startTrainingBtn = document.getElementById('startTrainingBtn');

      if (stepStates[3].trainingStarted) {
        if (trainingAction) trainingAction.style.display = 'none';
        if (startTrainingBtn) startTrainingBtn.disabled = true;
      } else {
        if (trainingAction) trainingAction.style.display = 'block';
        if (startTrainingBtn) startTrainingBtn.disabled = false;
      }
    }

    // Update progress bar and navigation buttons
    this.updateProgressBar();
    this.updateNavigationButtons();

    window.scrollTo(0, 0);
  }

  /**
   * Navigate to the next step
   */
  nextStep() {
    // Delegate to module if available
    if (this.module.nextStep) {
      this.module.nextStep();
      return;
    }

    const currentStep = this.module.currentStep || 1;
    if (currentStep < 4) {
      // Special handling for Step 2 -> Step 3 transition
      if (currentStep === 2) {
        if (this.validateConfigurationLocally()) {
          this.markStepCompleted(2);
          this.setStep(currentStep + 1);
        } else {
          this.showError('Please fill out all training configuration parameters before proceeding.');
          return;
        }
      } else {
        this.setStep(currentStep + 1);
      }
    }
  }

  /**
   * Navigate to the previous step
   */
  previousStep() {
    // Delegate to module if available
    if (this.module.previousStep) {
      this.module.previousStep();
      return;
    }

    const currentStep = this.module.currentStep || 1;
    if (currentStep > 1) {
      this.setStep(currentStep - 1);
    }
  }

  /**
   * Check if navigation to a step is allowed
   * @param {number} stepNumber - The step to check (1-4)
   * @returns {boolean} True if navigation is allowed
   */
  canNavigateToStep(stepNumber) {
    if (stepNumber < 1 || stepNumber > 4) return false;

    // Handle imported model mode
    if (window.importedModelInfo && stepNumber < 4) {
      return stepNumber === 4;
    }

    return stepStates[stepNumber].canNavigate;
  }

  /**
   * Mark a step as completed and enable navigation to the next step
   * @param {number} stepNumber - The step to mark as completed (1-4)
   */
  markStepCompleted(stepNumber) {
    if (stepNumber >= 1 && stepNumber <= 4) {
      stepStates[stepNumber].completed = true;

      // Enable navigation to next step
      if (stepNumber < 4) {
        stepStates[stepNumber + 1].canNavigate = true;
      }

      // Update visual indicators
      this.updateStepVisualState(stepNumber);
    }
  }

  /**
   * Update the visual state of a step element (add completed class)
   * @param {number} stepNumber - The step to update
   */
  updateStepVisualState(stepNumber) {
    const stepElement = document.querySelector(`[data-step="${stepNumber}"]`);
    if (stepElement && stepStates[stepNumber].completed) {
      stepElement.classList.add('completed');
    }
  }

  /**
   * Reset all step and process states to initial values
   */
  resetStepStates() {
    stepStates[1] = { completed: false, canNavigate: true };
    stepStates[2] = { completed: false, canNavigate: false };
    stepStates[3] = { completed: false, canNavigate: false, trainingStarted: false, trainingCompleted: false };
    stepStates[4] = { completed: false, canNavigate: false };

    processStates.trainingInProgress = false;
    processStates.inferenceInProgress = false;

    // Update window references
    window.stepStates = stepStates;
    window.processStates = processStates;

    // Remove completed classes
    document.querySelectorAll('.step.completed').forEach(step => {
      step.classList.remove('completed');
    });
  }

  /**
   * Update navigation button states based on current step states
   */
  updateNavigationButtons() {
    // Update step 1 next button
    const step1Next = document.getElementById('step1Next');
    if (step1Next) {
      step1Next.disabled = !stepStates[2].canNavigate;
    }

    // Update training buttons
    const trainingNextBtn = document.getElementById('trainingNextBtn');
    const trainingBackBtn = document.getElementById('trainingBackBtn');

    if (trainingNextBtn) {
      trainingNextBtn.disabled = !stepStates[4].canNavigate;
    }

    if (trainingBackBtn) {
      trainingBackBtn.disabled = processStates.trainingInProgress;
    }
  }

  /**
   * Update progress bar display
   */
  updateProgressBar() {
    // Delegate to module if available
    if (this.module.updateProgressBar) {
      this.module.updateProgressBar();
    }
  }

  /**
   * Validate training configuration fields locally (client-side)
   * @returns {boolean} True if all required fields are valid
   */
  validateConfigurationLocally() {
    const requiredFields = [
      'patchSize',
      'patchesPerImage',
      'batchSize',
      'numFeatures',
      'numLayers',
      'learningRate',
      'numEpochs'
    ];

    for (const fieldId of requiredFields) {
      const element = document.getElementById(fieldId);
      if (!element || !element.value || element.value.trim() === '') {
        console.log(`[NavigationHandler] Missing or empty field: ${fieldId}`);
        return false;
      }

      const value = parseFloat(element.value);
      if (isNaN(value) || value <= 0) {
        console.log(`[NavigationHandler] Invalid numeric value for field: ${fieldId}`);
        return false;
      }
    }

    const augmentElement = document.getElementById('augmentation');
    if (!augmentElement) {
      console.log('[NavigationHandler] Missing augmentation checkbox');
      return false;
    }

    console.log('[NavigationHandler] All configuration fields validated successfully');
    return true;
  }

  /**
   * Display an error message explaining why navigation is blocked
   * @param {number} stepNumber - The step that was blocked
   */
  showNavigationError(stepNumber) {
    const reasons = {
      2: 'Please complete data upload first.',
      3: 'Please configure training parameters first.',
      4: 'Please complete model training first.'
    };

    const message = reasons[stepNumber] || 'This step is not yet available.';
    this.showError(message);
  }

  /**
   * Get the current step completion status
   * @returns {object} The stepStates object
   */
  getStepCompletionStatus() {
    return stepStates;
  }

  // Helper method for error display
  showError(message) {
    if (this.module.state) {
      this.module.state.notify('error', message, 5000);
    } else if (typeof window.showError === 'function') {
      window.showError(message);
    } else {
      console.error('[NavigationHandler]', message);
    }
  }
}

// Export global functions for backwards compatibility
window.markStepCompleted = function(stepNumber) {
  if (window.segmentationModule && window.segmentationModule.navigationHandler) {
    window.segmentationModule.navigationHandler.markStepCompleted(stepNumber);
  } else {
    // Fallback: direct state update
    if (stepNumber >= 1 && stepNumber <= 4) {
      stepStates[stepNumber].completed = true;
      if (stepNumber < 4) {
        stepStates[stepNumber + 1].canNavigate = true;
      }
    }
  }
};

window.canNavigateToStep = function(stepNumber) {
  if (window.segmentationModule && window.segmentationModule.navigationHandler) {
    return window.segmentationModule.navigationHandler.canNavigateToStep(stepNumber);
  }
  if (stepNumber < 1 || stepNumber > 4) return false;
  if (window.importedModelInfo && stepNumber < 4) return stepNumber === 4;
  return stepStates[stepNumber].canNavigate;
};

window.updateNavigationButtons = function() {
  if (window.segmentationModule && window.segmentationModule.navigationHandler) {
    window.segmentationModule.navigationHandler.updateNavigationButtons();
  } else {
    // Fallback: direct DOM update
    const step1Next = document.getElementById('step1Next');
    if (step1Next) step1Next.disabled = !stepStates[2].canNavigate;

    const trainingNextBtn = document.getElementById('trainingNextBtn');
    const trainingBackBtn = document.getElementById('trainingBackBtn');
    if (trainingNextBtn) trainingNextBtn.disabled = !stepStates[4].canNavigate;
    if (trainingBackBtn) trainingBackBtn.disabled = processStates.trainingInProgress;
  }
};

window.validateConfigurationLocally = function() {
  if (window.segmentationModule && window.segmentationModule.navigationHandler) {
    return window.segmentationModule.navigationHandler.validateConfigurationLocally();
  }
  return true; // Fallback
};

export default NavigationHandler;
