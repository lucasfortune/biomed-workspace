/**
 * StepNavigator Component
 *
 * Renders a step navigation bar with numbered step indicators and a progress bar.
 * Supports click navigation, active/completed/blocked states, and progress updates.
 *
 * Usage:
 * ```javascript
 * const stepNav = new StepNavigator({
 *   steps: [
 *     { id: 'upload', name: 'Data Upload' },
 *     { id: 'config', name: 'Configuration' },
 *     { id: 'process', name: 'Process' }
 *   ],
 *   currentStep: 1,
 *   onStepClick: (stepNumber) => module.goToStep(stepNumber)
 * });
 *
 * container.innerHTML = stepNav.render();
 * stepNav.init(container);
 *
 * // Later, update the current step
 * stepNav.update(2);
 * ```
 */
class StepNavigator {
  /**
   * Create a StepNavigator
   * @param {object} config - Configuration options
   * @param {Array} config.steps - Array of step objects with id and name
   * @param {number} [config.currentStep=1] - Current active step (1-indexed)
   * @param {Function} [config.onStepClick] - Callback when a step is clicked
   * @param {Function} [config.canNavigate] - Function to check if navigation is allowed
   */
  constructor(config = {}) {
    this.steps = config.steps || [];
    this.currentStep = config.currentStep || 1;
    this.onStepClick = config.onStepClick || null;
    this.canNavigate = config.canNavigate || (() => true);
    this.container = null;
  }

  /**
   * Render the step navigator HTML
   * @returns {string} HTML string
   */
  render() {
    const stepsHtml = this.steps.map((step, index) => {
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

    const progress = this.steps.length > 0
      ? (this.currentStep / this.steps.length) * 100
      : 0;

    return `
      <div class="step-nav" data-component="step-navigator">
        ${stepsHtml}
      </div>
      <div class="progress-bar">
        <div class="progress-fill" style="width: ${progress}%"></div>
      </div>
    `;
  }

  /**
   * Initialize the component after rendering
   * @param {HTMLElement} container - The container element
   */
  init(container) {
    this.container = container;
    this.attachEventListeners();
  }

  /**
   * Attach click event listeners to step elements
   */
  attachEventListeners() {
    if (!this.container) return;

    const stepElements = this.container.querySelectorAll('.step');
    stepElements.forEach((stepEl) => {
      stepEl.addEventListener('click', (e) => {
        const stepNumber = parseInt(stepEl.dataset.step, 10);

        // Check if navigation is allowed
        if (this.canNavigate(stepNumber)) {
          if (this.onStepClick) {
            this.onStepClick(stepNumber);
          }
        }
      });
    });
  }

  /**
   * Update the current step
   * @param {number} stepNumber - The new current step (1-indexed)
   */
  update(stepNumber) {
    this.currentStep = stepNumber;
    this.updateUI();
  }

  /**
   * Update the UI to reflect current state
   */
  updateUI() {
    if (!this.container) return;

    // Update step classes
    const stepElements = this.container.querySelectorAll('.step');
    stepElements.forEach((stepEl, index) => {
      const stepNum = index + 1;

      stepEl.classList.remove('active', 'completed', 'blocked');

      if (stepNum === this.currentStep) {
        stepEl.classList.add('active');
      } else if (stepNum < this.currentStep) {
        stepEl.classList.add('completed');
      } else if (!this.canNavigate(stepNum)) {
        stepEl.classList.add('blocked');
      }
    });

    // Update progress bar
    const progressFill = this.container.querySelector('.progress-fill');
    if (progressFill) {
      const progress = this.steps.length > 0
        ? (this.currentStep / this.steps.length) * 100
        : 0;
      progressFill.style.width = `${progress}%`;
    }
  }

  /**
   * Set the state of a specific step
   * @param {number} stepNumber - The step to update (1-indexed)
   * @param {string} state - The state: 'active', 'completed', 'blocked', or 'default'
   */
  setStepState(stepNumber, state) {
    if (!this.container) return;

    const stepEl = this.container.querySelector(`.step[data-step="${stepNumber}"]`);
    if (!stepEl) return;

    stepEl.classList.remove('active', 'completed', 'blocked');

    if (state !== 'default') {
      stepEl.classList.add(state);
    }
  }

  /**
   * Get the total number of steps
   * @returns {number}
   */
  get totalSteps() {
    return this.steps.length;
  }

  /**
   * Get the current progress percentage
   * @returns {number}
   */
  get progressPercent() {
    return this.steps.length > 0
      ? (this.currentStep / this.steps.length) * 100
      : 0;
  }
}

// Export for ES6 modules
export default StepNavigator;

// Also make available globally
if (typeof window !== 'undefined') {
  window.StepNavigator = StepNavigator;
}
