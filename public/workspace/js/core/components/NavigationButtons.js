/**
 * NavigationButtons Component
 *
 * Wires up a Previous/Next `.navigation-buttons` row that the module has
 * already written into its own step markup (see the template module): the
 * component finds the two buttons by id and manages their handlers, labels,
 * enabled and visible state.
 *
 * Usage:
 * ```javascript
 * // In render(), inside the step:
 * // <div class="navigation-buttons">
 * //   <button id="step2Back" class="btn secondary">Back</button>
 * //   <button id="step2Next" class="btn">Next</button>
 * // </div>
 *
 * const navButtons = new NavigationButtons({
 *   previousId: 'step2Back',
 *   nextId: 'step2Next',
 *   onPrevious: () => module.previousStep(),
 *   onNext: () => module.nextStep(),
 *   nextDisabled: true
 * });
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
   * @param {string} [config.previousLabel='Previous'] - Starting label (see setPreviousLabel)
   * @param {string} [config.nextLabel='Next'] - Starting label (see setNextLabel)
   * @param {boolean} [config.showPrevious=true] - Starting visibility (see setPreviousVisible)
   * @param {boolean} [config.showNext=true] - Starting visibility (see setNextVisible)
   * @param {boolean} [config.previousDisabled=false] - Starting disabled state (see setPreviousEnabled)
   * @param {boolean} [config.nextDisabled=false] - Starting disabled state (see setNextEnabled)
   * @param {string} [config.previousId='nav-btn-previous'] - ID of the previous button in the markup
   * @param {string} [config.nextId='nav-btn-next'] - ID of the next button in the markup
   *
   * The label / visible / disabled options only seed the component's own
   * bookkeeping - the initial markup is the module's, so set `disabled` and
   * the labels there and use the setters to change them afterwards.
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
   * Initialize the component: find the buttons in the module's markup and
   * attach the handlers. Call after render() has put the step HTML in the DOM.
   * @param {HTMLElement} container - The element containing the buttons
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
