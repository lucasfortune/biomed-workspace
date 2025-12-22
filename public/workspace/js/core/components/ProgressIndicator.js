/**
 * ProgressIndicator Component
 *
 * Displays a progress bar with optional label and percentage.
 * Two variants: 'small' (4px height) and 'large' (24px height with label).
 *
 * Usage:
 * ```javascript
 * const progress = new ProgressIndicator({
 *   id: 'trainingProgress',
 *   type: 'large',
 *   label: 'Training Progress',
 *   showPercentage: true
 * });
 *
 * container.innerHTML = progress.render();
 * progress.init(container);
 *
 * // Update progress
 * progress.setProgress(50);
 * progress.setLabel('Epoch 5 of 10');
 * ```
 */
class ProgressIndicator {
  /**
   * Create a ProgressIndicator
   * @param {object} config - Configuration options
   * @param {string} [config.id] - Unique identifier
   * @param {string} [config.type='large'] - 'small' or 'large'
   * @param {string} [config.label=''] - Label text (for large type)
   * @param {boolean} [config.showPercentage=true] - Show percentage text
   * @param {number} [config.initialProgress=0] - Initial progress (0-100)
   */
  constructor(config = {}) {
    this.id = config.id || `progress-${Date.now()}`;
    this.type = config.type || 'large';
    this.label = config.label || '';
    this.showPercentage = config.showPercentage !== false;
    this.progress = config.initialProgress || 0;
    this.container = null;
  }

  /**
   * Render the progress indicator HTML
   * @returns {string} HTML string
   */
  render() {
    if (this.type === 'small') {
      return this.renderSmall();
    }
    return this.renderLarge();
  }

  /**
   * Render small progress bar (4px height)
   * @returns {string} HTML string
   */
  renderSmall() {
    return `
      <div class="progress-bar" data-component="progress-indicator" data-progress-id="${this.id}">
        <div class="progress-fill" id="${this.id}-fill" style="width: ${this.progress}%"></div>
      </div>
    `;
  }

  /**
   * Render large progress bar (24px height with label)
   * @returns {string} HTML string
   */
  renderLarge() {
    return `
      <div class="training-progress" data-component="progress-indicator" data-progress-id="${this.id}">
        ${this.label ? `
          <div class="progress-header" style="display: flex; justify-content: space-between; margin-bottom: 8px;">
            <span id="${this.id}-label">${this.label}</span>
            ${this.showPercentage ? `<span id="${this.id}-percent">${Math.round(this.progress)}%</span>` : ''}
          </div>
        ` : ''}
        <div class="training-progress-bar">
          <div class="training-progress-fill" id="${this.id}-fill" style="width: ${this.progress}%"></div>
        </div>
      </div>
    `;
  }

  /**
   * Initialize the component
   * @param {HTMLElement} container - Parent container
   */
  init(container) {
    this.container = container;
  }

  /**
   * Set the progress value
   * @param {number} percent - Progress percentage (0-100)
   */
  setProgress(percent) {
    this.progress = Math.max(0, Math.min(100, percent));

    const fill = document.getElementById(`${this.id}-fill`);
    if (fill) {
      fill.style.width = `${this.progress}%`;
    }

    if (this.showPercentage) {
      const percentEl = document.getElementById(`${this.id}-percent`);
      if (percentEl) {
        percentEl.textContent = `${Math.round(this.progress)}%`;
      }
    }
  }

  /**
   * Set the label text
   * @param {string} label - Label text
   */
  setLabel(label) {
    this.label = label;
    const labelEl = document.getElementById(`${this.id}-label`);
    if (labelEl) {
      labelEl.textContent = label;
    }
  }

  /**
   * Get the current progress
   * @returns {number}
   */
  getProgress() {
    return this.progress;
  }

  /**
   * Reset progress to 0
   */
  reset() {
    this.setProgress(0);
  }

  /**
   * Set progress to complete (100%)
   */
  complete() {
    this.setProgress(100);
  }

  /**
   * Increment progress by a given amount
   * @param {number} amount - Amount to increment
   */
  increment(amount = 1) {
    this.setProgress(this.progress + amount);
  }
}

// Export for ES6 modules
export default ProgressIndicator;

// Also make available globally
if (typeof window !== 'undefined') {
  window.ProgressIndicator = ProgressIndicator;
}
