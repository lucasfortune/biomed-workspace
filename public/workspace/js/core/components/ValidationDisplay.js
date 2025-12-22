/**
 * ValidationDisplay Component
 *
 * Displays validation messages with success, error, info, or warning styling.
 * Supports detailed information display with title and detail rows.
 *
 * Usage:
 * ```javascript
 * const validation = new ValidationDisplay('validationContainer');
 *
 * // Show success
 * validation.showSuccess('Validation Passed', [
 *   { label: 'Dimensions', value: '512x512' },
 *   { label: 'Slices', value: '100' }
 * ]);
 *
 * // Show error
 * validation.showError('Validation Failed', 'File format not supported');
 *
 * // Hide
 * validation.hide();
 * ```
 */
class ValidationDisplay {
  /**
   * Create a ValidationDisplay
   * @param {string} containerId - The ID of the container element
   */
  constructor(containerId) {
    this.containerId = containerId;
    this.container = null;
  }

  /**
   * Get or find the container element
   * @returns {HTMLElement|null}
   */
  getContainer() {
    if (!this.container) {
      this.container = document.getElementById(this.containerId);
    }
    return this.container;
  }

  /**
   * Show a validation message
   * @param {string} type - Message type: 'success', 'error', 'info', 'warning'
   * @param {string} title - The title/header text
   * @param {string|Array} details - Message string or array of {label, value} objects
   */
  show(type, title, details = null) {
    const container = this.getContainer();
    if (!container) {
      console.warn(`[ValidationDisplay] Container not found: ${this.containerId}`);
      return;
    }

    const icons = {
      success: '&#10003;',
      error: '&#10007;',
      info: '&#8505;',
      warning: '&#9888;'
    };

    const icon = icons[type] || '';

    let detailsHtml = '';
    if (details) {
      if (typeof details === 'string') {
        detailsHtml = `<p class="validation-message">${details}</p>`;
      } else if (Array.isArray(details)) {
        detailsHtml = `
          <div class="validation-details">
            ${details.map(item => `
              <div class="detail-row">
                <span>${item.label}:</span>
                <span>${item.value}</span>
              </div>
            `).join('')}
          </div>
        `;
      }
    }

    container.innerHTML = `
      <div class="validation-${type}" data-component="validation-display">
        <div class="validation-header">
          <span class="validation-icon">${icon}</span>
          ${title}
        </div>
        ${detailsHtml}
      </div>
    `;

    container.style.display = 'block';
  }

  /**
   * Show a success message
   * @param {string} title - The title text
   * @param {string|Array} [details] - Optional details
   */
  showSuccess(title, details = null) {
    this.show('success', title, details);
  }

  /**
   * Show an error message
   * @param {string} title - The title text
   * @param {string|Array} [details] - Optional details
   */
  showError(title, details = null) {
    this.show('error', title, details);
  }

  /**
   * Show an info message
   * @param {string} title - The title text
   * @param {string|Array} [details] - Optional details
   */
  showInfo(title, details = null) {
    this.show('info', title, details);
  }

  /**
   * Show a warning message
   * @param {string} title - The title text
   * @param {string|Array} [details] - Optional details
   */
  showWarning(title, details = null) {
    this.show('warning', title, details);
  }

  /**
   * Show a loading state
   * @param {string} [message='Validating...'] - Loading message
   */
  showLoading(message = 'Validating...') {
    const container = this.getContainer();
    if (!container) return;

    container.innerHTML = `
      <div class="validation-loading" data-component="validation-display">
        <span class="spinner-small"></span>
        <span>${message}</span>
      </div>
    `;

    container.style.display = 'block';
  }

  /**
   * Hide the validation display
   */
  hide() {
    const container = this.getContainer();
    if (!container) return;

    container.innerHTML = '';
    container.style.display = 'none';
  }

  /**
   * Clear the container reference (useful when DOM is rebuilt)
   */
  reset() {
    this.container = null;
  }

  /**
   * Render an empty container placeholder
   * @returns {string} HTML string
   */
  static renderContainer(id) {
    return `<div id="${id}" class="validation-container" style="display: none;"></div>`;
  }
}

// Export for ES6 modules
export default ValidationDisplay;

// Also make available globally
if (typeof window !== 'undefined') {
  window.ValidationDisplay = ValidationDisplay;
}
