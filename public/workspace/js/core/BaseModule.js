/**
 * BaseModule - Abstract base class for all workspace modules
 *
 * Provides common functionality:
 * - Lifecycle management (activate, deactivate, cleanup)
 * - Step-based navigation with conditional logic
 * - CSS and script loading utilities
 * - Loading overlay management
 * - Progress bar and step indicator updates
 *
 * Usage:
 * ```javascript
 * import BaseModule from '/workspace/js/core/BaseModule.js';
 *
 * class MyModule extends BaseModule {
 *   constructor(stateManager) {
 *     super(stateManager, {
 *       id: 'mymodule',
 *       name: 'My Module',
 *       cssPath: '/workspace/js/modules/mymodule/css/mymodule.css',
 *       steps: [
 *         { id: 'upload', name: 'Data Upload', canNavigate: true },
 *         { id: 'process', name: 'Process', canNavigate: (m) => m.hasData }
 *       ]
 *     });
 *   }
 *
 *   render() {
 *     // Required: Render module UI
 *   }
 *
 *   async initialize() {
 *     // Optional: Called after render
 *   }
 * }
 * ```
 */
class BaseModule {
  /**
   * Create a new module instance
   * @param {object} stateManager - The global StateManager instance
   * @param {object} config - Module configuration
   * @param {string} config.id - Unique module identifier
   * @param {string} config.name - Display name for the module
   * @param {string} [config.cssPath] - Path to module CSS file
   * @param {Array} [config.steps] - Step configuration array
   */
  constructor(stateManager, config = {}) {
    if (new.target === BaseModule) {
      throw new Error('BaseModule is abstract and cannot be instantiated directly');
    }

    this.state = stateManager;
    this.container = null;
    this.currentStep = 1;
    this.dependenciesLoaded = false;
    this.cssLoaded = false;

    // Module configuration
    this.config = {
      id: config.id || 'unknown',
      name: config.name || 'Unknown Module',
      cssPath: config.cssPath || null,
      steps: config.steps || [{ id: 'default', name: 'Default', canNavigate: true }],
      ...config
    };

    // Bind methods to preserve 'this' context
    this.activate = this.activate.bind(this);
    this.deactivate = this.deactivate.bind(this);
    this.goToStep = this.goToStep.bind(this);
    this.nextStep = this.nextStep.bind(this);
    this.previousStep = this.previousStep.bind(this);
  }

  // =============================================================================
  // LIFECYCLE METHODS
  // =============================================================================

  /**
   * Activate the module
   * Called when the module is loaded and should display
   */
  async activate() {
    console.log(`[${this.config.name}] Activating...`);

    try {
      // Get container
      this.container = document.getElementById('module-view');
      if (!this.container) {
        throw new Error('Module container not found');
      }

      // Show loading
      this.showLoading('Loading Module', `Preparing ${this.config.name}...`);

      // Load CSS if specified
      if (this.config.cssPath) {
        await this.loadCSS(this.config.cssPath, `${this.config.id}-module-css`);
      }

      // Load dependencies (override in subclass if needed)
      await this.loadDependencies();

      // Render the module UI (must be implemented by subclass)
      this.render();

      // Initialize after render (optional override in subclass)
      await this.initialize();

      // Hide loading
      this.hideLoading();

      console.log(`[${this.config.name}] Activation complete`);

    } catch (error) {
      console.error(`[${this.config.name}] Activation error:`, error);
      this.hideLoading();
      if (this.state?.notify) {
        this.state.notify('error', `Failed to activate ${this.config.name}: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Deactivate the module
   * Called when leaving the module, should clean up UI
   */
  async deactivate() {
    console.log(`[${this.config.name}] Deactivating...`);

    if (this.container) {
      this.container.innerHTML = '';
    }

    // Reset step
    this.currentStep = 1;
  }

  /**
   * Cleanup resources
   * Called when the module is being destroyed, release all resources
   */
  cleanup() {
    console.log(`[${this.config.name}] Cleaning up...`);
    // Override in subclass if needed
  }

  /**
   * Load external dependencies
   * Override in subclass to load scripts like Socket.IO, Chart.js, etc.
   */
  async loadDependencies() {
    // Override in subclass if needed
    return Promise.resolve();
  }

  /**
   * Render the module UI
   * Must be implemented by subclass
   */
  render() {
    throw new Error('render() must be implemented by subclass');
  }

  /**
   * Initialize after render
   * Called after render() to set up event listeners, etc.
   * Override in subclass if needed
   */
  async initialize() {
    // Override in subclass if needed
    return Promise.resolve();
  }

  // =============================================================================
  // STEP NAVIGATION
  // =============================================================================

  /**
   * Get the total number of steps
   * @returns {number}
   */
  get totalSteps() {
    return this.config.steps.length;
  }

  /**
   * Get step configuration by step number (1-indexed)
   * @param {number} stepNumber
   * @returns {object|null}
   */
  getStepConfig(stepNumber) {
    return this.config.steps[stepNumber - 1] || null;
  }

  /**
   * Check if navigation to a step is allowed
   * @param {number} stepNumber - The step to navigate to
   * @returns {boolean}
   */
  canNavigateToStep(stepNumber) {
    if (stepNumber < 1 || stepNumber > this.totalSteps) {
      return false;
    }

    const stepConfig = this.getStepConfig(stepNumber);
    if (!stepConfig) {
      return false;
    }

    // Check canNavigate - can be boolean or function
    if (typeof stepConfig.canNavigate === 'function') {
      return stepConfig.canNavigate(this);
    }

    return stepConfig.canNavigate !== false;
  }

  /**
   * Check if a step should be skipped
   * @param {number} stepNumber - The step to check
   * @returns {boolean}
   */
  shouldSkipStep(stepNumber) {
    const stepConfig = this.getStepConfig(stepNumber);
    if (!stepConfig) {
      return false;
    }

    // Check shouldSkip - can be boolean or function
    if (typeof stepConfig.shouldSkip === 'function') {
      return stepConfig.shouldSkip(this);
    }

    return stepConfig.shouldSkip === true;
  }

  /**
   * Get the message to show when navigation is blocked
   * @param {number} stepNumber
   * @returns {string}
   */
  getBlockedMessage(stepNumber) {
    const stepConfig = this.getStepConfig(stepNumber);
    return stepConfig?.blockedMessage || 'Cannot navigate to this step yet.';
  }

  /**
   * Navigate to a specific step
   * @param {number} stepNumber - The step to navigate to (1-indexed)
   * @returns {boolean} - Whether navigation was successful
   */
  goToStep(stepNumber) {
    // Validate step number
    if (stepNumber < 1 || stepNumber > this.totalSteps) {
      console.warn(`[${this.config.name}] Invalid step number: ${stepNumber}`);
      return false;
    }

    // Check if step should be skipped
    if (this.shouldSkipStep(stepNumber)) {
      console.log(`[${this.config.name}] Skipping step ${stepNumber}`);
      // Skip forward or backward based on direction
      if (stepNumber > this.currentStep) {
        return this.goToStep(stepNumber + 1);
      } else {
        return this.goToStep(stepNumber - 1);
      }
    }

    // Check if navigation is allowed
    if (!this.canNavigateToStep(stepNumber)) {
      const message = this.getBlockedMessage(stepNumber);
      console.warn(`[${this.config.name}] Cannot navigate to step ${stepNumber}: ${message}`);
      if (this.state?.notify) {
        this.state.notify('warning', message);
      }
      return false;
    }

    // Update current step
    const previousStep = this.currentStep;
    this.currentStep = stepNumber;

    // Update UI
    this.updateStepNavigation();
    this.updateStepContent();
    this.updateProgressBar();

    // Call step change hook
    this.onStepChange(previousStep, stepNumber);

    console.log(`[${this.config.name}] Navigated to step ${stepNumber}`);
    return true;
  }

  /**
   * Navigate to the next step
   * @returns {boolean} - Whether navigation was successful
   */
  nextStep() {
    if (this.currentStep >= this.totalSteps) {
      return false;
    }
    return this.goToStep(this.currentStep + 1);
  }

  /**
   * Navigate to the previous step
   * @returns {boolean} - Whether navigation was successful
   */
  previousStep() {
    if (this.currentStep <= 1) {
      return false;
    }
    return this.goToStep(this.currentStep - 1);
  }

  /**
   * Hook called when step changes
   * Override in subclass to handle step-specific logic
   * @param {number} previousStep
   * @param {number} newStep
   */
  onStepChange(previousStep, newStep) {
    // Override in subclass if needed
  }

  // =============================================================================
  // UI UPDATES
  // =============================================================================

  /**
   * Update step navigation indicators
   */
  updateStepNavigation() {
    const steps = this.container?.querySelectorAll('.step');
    if (!steps) return;

    steps.forEach((step, index) => {
      const stepNumber = index + 1;

      // Remove all state classes
      step.classList.remove('active', 'completed', 'blocked');

      if (stepNumber === this.currentStep) {
        step.classList.add('active');
      } else if (stepNumber < this.currentStep) {
        step.classList.add('completed');
      } else if (!this.canNavigateToStep(stepNumber)) {
        step.classList.add('blocked');
      }
    });
  }

  /**
   * Update step content visibility
   */
  updateStepContent() {
    const stepContents = this.container?.querySelectorAll('.step-content');
    if (!stepContents) return;

    stepContents.forEach((content, index) => {
      if (index + 1 === this.currentStep) {
        content.classList.add('active');
      } else {
        content.classList.remove('active');
      }
    });
  }

  /**
   * Update progress bar width
   */
  updateProgressBar() {
    const progressFill = this.container?.querySelector('.progress-fill');
    if (!progressFill) return;

    const progress = (this.currentStep / this.totalSteps) * 100;
    progressFill.style.width = `${progress}%`;
  }

  /**
   * Set up step navigation click handlers
   * Call this in initialize() to enable clicking on step indicators
   */
  setupStepClickHandlers() {
    const steps = this.container?.querySelectorAll('.step');
    if (!steps) return;

    steps.forEach((step, index) => {
      step.addEventListener('click', () => {
        const stepNumber = index + 1;
        this.goToStep(stepNumber);
      });
    });
  }

  // =============================================================================
  // LOADING UTILITIES
  // =============================================================================

  /**
   * Load CSS file dynamically
   * @param {string} href - CSS file URL
   * @param {string} [id] - Optional ID for the link element
   * @returns {Promise}
   */
  loadCSS(href, id = null) {
    return new Promise((resolve, reject) => {
      // Check if already loaded
      if (id && document.getElementById(id)) {
        resolve();
        return;
      }

      const link = document.createElement('link');
      if (id) link.id = id;
      link.rel = 'stylesheet';
      link.href = href;

      link.onload = () => {
        console.log(`[${this.config.name}] CSS loaded: ${href}`);
        resolve();
      };

      link.onerror = () => {
        console.error(`[${this.config.name}] Failed to load CSS: ${href}`);
        reject(new Error(`Failed to load CSS: ${href}`));
      };

      document.head.appendChild(link);
    });
  }

  /**
   * Load external script dynamically
   * @param {string} src - Script source URL
   * @param {boolean} [isModule=false] - Whether to load as ES6 module
   * @returns {Promise}
   */
  loadScript(src, isModule = false) {
    return new Promise((resolve, reject) => {
      // Check if already loaded (by src)
      const existing = document.querySelector(`script[src="${src}"]`);
      if (existing) {
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = src;
      if (isModule) {
        script.type = 'module';
      }

      script.onload = () => {
        console.log(`[${this.config.name}] Script loaded: ${src}`);
        resolve();
      };

      script.onerror = () => {
        console.error(`[${this.config.name}] Failed to load script: ${src}`);
        reject(new Error(`Failed to load script: ${src}`));
      };

      document.body.appendChild(script);
    });
  }

  /**
   * Show loading overlay
   * @param {string} title - Loading title
   * @param {string} [description] - Optional description
   */
  showLoading(title = 'Loading...', description = '') {
    // Check if already showing
    let overlay = document.querySelector('.module-loading-overlay');
    if (overlay) {
      // Update existing overlay
      const titleEl = overlay.querySelector('h3');
      const descEl = overlay.querySelector('p');
      if (titleEl) titleEl.textContent = title;
      if (descEl) descEl.textContent = description;
      return;
    }

    // Create new overlay
    overlay = document.createElement('div');
    overlay.className = 'module-loading-overlay loading-overlay';
    overlay.innerHTML = `
      <div class="loading-content">
        <div class="spinner"></div>
        <h3>${title}</h3>
        <p>${description}</p>
      </div>
    `;
    document.body.appendChild(overlay);
  }

  /**
   * Hide loading overlay
   */
  hideLoading() {
    const overlay = document.querySelector('.module-loading-overlay');
    if (overlay) {
      overlay.remove();
    }
  }

  // =============================================================================
  // UTILITY METHODS
  // =============================================================================

  /**
   * Render the common module header HTML
   * @param {string} [title] - Module title (defaults to config.name)
   * @param {string} [subtitle] - Optional subtitle
   * @returns {string} HTML string
   */
  renderHeader(title = null, subtitle = '') {
    const displayTitle = title || this.config.name;
    return `
      <div class="module-header">
        <button class="btn-back" id="backToHub">
          <span class="back-arrow">&larr;</span> Back to Hub
        </button>
        <h2>${displayTitle}</h2>
        <div class="header-spacer"></div>
      </div>
    `;
  }

  /**
   * Render the step navigation bar HTML
   * Progress bar is positioned above the step indicators,
   * and each step has a bottom border indicator.
   * @returns {string} HTML string
   */
  renderStepNav() {
    const stepsHtml = this.config.steps.map((step, index) => {
      const stepNumber = index + 1;
      const isActive = stepNumber === this.currentStep;
      const isCompleted = stepNumber < this.currentStep;

      let classes = 'step';
      if (isActive) classes += ' active';
      if (isCompleted) classes += ' completed';

      return `
        <div class="${classes}" data-step="${stepNumber}">
          <div class="step-number">${stepNumber}</div>
          <span>${step.name}</span>
        </div>
      `;
    }).join('');

    // Progress fills based on current step
    const progressPercent = (this.currentStep / this.totalSteps) * 100;

    return `
      <div class="progress-bar">
        <div class="progress-fill" style="width: ${progressPercent}%"></div>
      </div>
      <div class="step-nav">
        ${stepsHtml}
      </div>
    `;
  }

  /**
   * Render navigation buttons HTML
   * @param {object} options
   * @param {boolean} [options.showPrevious=true] - Show previous button
   * @param {boolean} [options.showNext=true] - Show next button
   * @param {string} [options.previousLabel='Previous'] - Previous button label
   * @param {string} [options.nextLabel='Next'] - Next button label
   * @param {boolean} [options.nextDisabled=false] - Disable next button
   * @param {string} [options.previousId] - Custom ID for previous button
   * @param {string} [options.nextId] - Custom ID for next button
   * @returns {string} HTML string
   */
  renderNavigationButtons(options = {}) {
    const {
      showPrevious = true,
      showNext = true,
      previousLabel = 'Previous',
      nextLabel = 'Next',
      nextDisabled = false,
      previousId = '',
      nextId = ''
    } = options;

    return `
      <div class="navigation-buttons">
        ${showPrevious ? `
          <button class="btn secondary" ${previousId ? `id="${previousId}"` : ''}>
            ${previousLabel}
          </button>
        ` : '<div></div>'}
        ${showNext ? `
          <button class="btn" ${nextId ? `id="${nextId}"` : ''} ${nextDisabled ? 'disabled' : ''}>
            ${nextLabel}
          </button>
        ` : '<div></div>'}
      </div>
    `;
  }

  /**
   * Save module state to global state manager
   * Override in subclass to persist module-specific state
   */
  saveState() {
    // Override in subclass
  }

  /**
   * Restore module state from global state manager
   * Override in subclass to restore module-specific state
   */
  restoreState() {
    // Override in subclass
  }
}

// Export for ES6 modules
export default BaseModule;

// Also make available globally for non-module scripts
if (typeof window !== 'undefined') {
  window.BaseModule = BaseModule;
}
