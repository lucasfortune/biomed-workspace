/**
 * NavigationButtons Component
 *
 * Renders Previous/Next navigation buttons with configurable labels and states.
 *
 * Usage:
 * ```javascript
 * const navButtons = new NavigationButtons({
 *   onPrevious: () => module.previousStep(),
 *   onNext: () => module.nextStep(),
 *   previousLabel: 'Back',
 *   nextLabel: 'Continue',
 *   nextDisabled: true
 * });
 *
 * container.innerHTML = navButtons.render();
 * navButtons.init(container);
 *
 * // Later, enable the next button
 * navButtons.setNextEnabled(true);
 * ```
 */
class NavigationButtons {
  /**
   * Create NavigationButtons
   * @param {object} config - Configuration options
   * @param {Function} [config.onPrevious] - Callback for previous button click
   * @param {Function} [config.onNext] - Callback for next button click
   * @param {string} [config.previousLabel='Previous'] - Previous button label
   * @param {string} [config.nextLabel='Next'] - Next button label
   * @param {boolean} [config.showPrevious=true] - Show previous button
   * @param {boolean} [config.showNext=true] - Show next button
   * @param {boolean} [config.previousDisabled=false] - Disable previous button
   * @param {boolean} [config.nextDisabled=false] - Disable next button
   * @param {string} [config.previousId] - Custom ID for previous button
   * @param {string} [config.nextId] - Custom ID for next button
   */
  constructor(config = {}) {
    this.onPrevious = config.onPrevious || null;
    this.onNext = config.onNext || null;
    this.previousLabel = config.previousLabel || 'Previous';
    this.nextLabel = config.nextLabel || 'Next';
    this.showPrevious = config.showPrevious !== false;
    this.showNext = config.showNext !== false;
    this.previousDisabled = config.previousDisabled || false;
    this.nextDisabled = config.nextDisabled || false;
    this.previousId = config.previousId || 'nav-btn-previous';
    this.nextId = config.nextId || 'nav-btn-next';
    this.container = null;
  }

  /**
   * Render the navigation buttons HTML
   * @returns {string} HTML string
   */
  render() {
    const previousHtml = this.showPrevious
      ? `<button class="btn secondary" id="${this.previousId}" ${this.previousDisabled ? 'disabled' : ''}>
           ${this.previousLabel}
         </button>`
      : '<div></div>';

    const nextHtml = this.showNext
      ? `<button class="btn" id="${this.nextId}" ${this.nextDisabled ? 'disabled' : ''}>
           ${this.nextLabel}
         </button>`
      : '<div></div>';

    return `
      <div class="navigation-buttons" data-component="navigation-buttons">
        ${previousHtml}
        ${nextHtml}
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
   * Attach click event listeners
   */
  attachEventListeners() {
    if (!this.container) return;

    const previousBtn = this.container.querySelector(`#${this.previousId}`);
    const nextBtn = this.container.querySelector(`#${this.nextId}`);

    if (previousBtn && this.onPrevious) {
      previousBtn.addEventListener('click', (e) => {
        if (!previousBtn.disabled) {
          this.onPrevious(e);
        }
      });
    }

    if (nextBtn && this.onNext) {
      nextBtn.addEventListener('click', (e) => {
        if (!nextBtn.disabled) {
          this.onNext(e);
        }
      });
    }
  }

  /**
   * Get the previous button element
   * @returns {HTMLElement|null}
   */
  getPreviousButton() {
    return this.container?.querySelector(`#${this.previousId}`);
  }

  /**
   * Get the next button element
   * @returns {HTMLElement|null}
   */
  getNextButton() {
    return this.container?.querySelector(`#${this.nextId}`);
  }

  /**
   * Enable or disable the previous button
   * @param {boolean} enabled
   */
  setPreviousEnabled(enabled) {
    this.previousDisabled = !enabled;
    const btn = this.getPreviousButton();
    if (btn) {
      btn.disabled = !enabled;
    }
  }

  /**
   * Enable or disable the next button
   * @param {boolean} enabled
   */
  setNextEnabled(enabled) {
    this.nextDisabled = !enabled;
    const btn = this.getNextButton();
    if (btn) {
      btn.disabled = !enabled;
    }
  }

  /**
   * Show or hide the previous button
   * @param {boolean} visible
   */
  setPreviousVisible(visible) {
    this.showPrevious = visible;
    const btn = this.getPreviousButton();
    if (btn) {
      btn.style.display = visible ? '' : 'none';
    }
  }

  /**
   * Show or hide the next button
   * @param {boolean} visible
   */
  setNextVisible(visible) {
    this.showNext = visible;
    const btn = this.getNextButton();
    if (btn) {
      btn.style.display = visible ? '' : 'none';
    }
  }

  /**
   * Update the previous button label
   * @param {string} label
   */
  setPreviousLabel(label) {
    this.previousLabel = label;
    const btn = this.getPreviousButton();
    if (btn) {
      btn.textContent = label;
    }
  }

  /**
   * Update the next button label
   * @param {string} label
   */
  setNextLabel(label) {
    this.nextLabel = label;
    const btn = this.getNextButton();
    if (btn) {
      btn.textContent = label;
    }
  }
}

// Export for ES6 modules
export default NavigationButtons;

// Also make available globally
if (typeof window !== 'undefined') {
  window.NavigationButtons = NavigationButtons;
}
