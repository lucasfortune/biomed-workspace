/**
 * MaskParameterPanel Component
 *
 * Controls for adjusting the routed extractor's parameters and regenerating
 * the mask + routing decision (runs in seconds on the raw stack).
 */

class MaskParameterPanel {
  /**
   * @param {Object} options - Configuration options
   * @param {string} options.containerId - ID of container element
   * @param {Object} options.parameters - Initial parameter values
   * @param {function} options.onRegenerateMask - Callback when regenerate is clicked
   * @param {function} options.onParameterChange - Callback when parameter changes
   */
  constructor(options = {}) {
    this.containerId = options.containerId;
    this.onRegenerateMask = options.onRegenerateMask;
    this.onParameterChange = options.onParameterChange;

    // Default parameters (published defaults; bg_side comes from the run config)
    this.parameters = {
      bg_side: 'light',
      rho_floor: 0.05,
      spine_thresh: 8.0,
      max_pixels: null,
      ...options.parameters
    };
    if (!this.parameters.bg_side) this.parameters.bg_side = 'light';

    // State
    this.isRegenerating = false;
  }

  /**
   * Render the component
   */
  render() {
    const maxPixelsValue = this.parameters.max_pixels != null ? this.parameters.max_pixels : 50;
    const maxPixelsLabel = this.parameters.max_pixels != null ? String(this.parameters.max_pixels) : 'no cap';
    return `
      <div class="mask-parameter-panel" id="${this.containerId}">
        <div class="panel-header">
          <span class="panel-title">Extractor Parameters</span>
        </div>

        <div class="panel-body">
          <p class="panel-description">
            Adjust these if the discovered mask doesn't match the structured
            noise you see, then regenerate (takes seconds; the routing
            decision is re-evaluated too).
          </p>

          <div class="parameter-group">
            <div class="parameter-row">
              <label for="slider_bg_side">Background Side</label>
              <div class="slider-container">
                <select id="slider_bg_side"
                        data-mask-param="bg_side" data-parse="string">
                  <option value="light" ${this.parameters.bg_side === 'light' ? 'selected' : ''}>Light (dense EM)</option>
                  <option value="dark" ${this.parameters.bg_side === 'dark' ? 'selected' : ''}>Dark (fluorescence-like)</option>
                  <option value="off" ${this.parameters.bg_side === 'off' ? 'selected' : ''}>Off (flatness-only)</option>
                </select>
              </div>
              <span class="param-hint">Which intensity side of the images is background</span>
            </div>

            <div class="parameter-row">
              <label for="slider_rho_floor">Correlation Floor</label>
              <div class="slider-container">
                <input type="range" class="range-slider" id="slider_rho_floor"
                       min="0" max="0.15" step="0.005"
                       value="${this.parameters.rho_floor != null ? this.parameters.rho_floor : 0.05}"
                       data-mask-param="rho_floor" data-parse="float">
                <span class="slider-value">${(this.parameters.rho_floor != null ? this.parameters.rho_floor : 0.05).toFixed(3)}</span>
              </div>
              <span class="param-hint">Drop mask pixels whose noise correlation is below this (0 disables)</span>
            </div>

            <div class="parameter-row">
              <label for="slider_spine_thresh">Significance |z|</label>
              <div class="slider-container">
                <input type="range" class="range-slider" id="slider_spine_thresh"
                       min="4" max="12" step="0.5"
                       value="${this.parameters.spine_thresh != null ? this.parameters.spine_thresh : 8}"
                       data-mask-param="spine_thresh" data-parse="float">
                <span class="slider-value">${(this.parameters.spine_thresh != null ? this.parameters.spine_thresh : 8).toFixed(1)}</span>
              </div>
              <span class="param-hint">Certainty required for a correlation feature to enter the mask</span>
            </div>

            <div class="parameter-row">
              <label for="slider_max_pixels">Max Masked Pixels</label>
              <div class="slider-container">
                <input type="range" class="range-slider" id="slider_max_pixels"
                       min="5" max="50" step="1"
                       value="${maxPixelsValue}"
                       data-mask-param="max_pixels" data-parse="int">
                <span class="slider-value">${maxPixelsLabel}</span>
              </div>
              <span class="param-hint">Cap on active mask pixels (Reset restores: no cap)</span>
            </div>
          </div>

          <div class="panel-actions">
            <button class="btn secondary" data-action="resetMaskParameters"
                    ${this.isRegenerating ? 'disabled' : ''}>
              Reset to Defaults
            </button>
            <button class="btn primary" data-action="regenerateMask"
                    ${this.isRegenerating ? 'disabled' : ''}>
              ${this.isRegenerating ? '<span class="spinner small"></span> Regenerating...' : 'Regenerate Mask'}
            </button>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Set parameter values
   * @param {Object} params - Parameter values
   */
  setParameters(params) {
    this.parameters = { ...this.parameters, ...params };
  }

  /**
   * Update a single parameter (internal state update only)
   * Note: Does NOT call onParameterChange to avoid recursion, since the
   * module's delegated input/change listener (data-mask-param) already
   * calls updateMaskParameter directly.
   * @param {string} name - Parameter name
   * @param {*} value - Parameter value
   */
  updateParameter(name, value) {
    this.parameters[name] = value;

    // Update slider value display
    const inputId = `slider_${name}`;
    const input = document.getElementById(inputId);

    if (!input) {
      console.warn(`[MaskParameterPanel] Input element #${inputId} not found`);
      return;
    }

    // The slider-value span is immediately after the input
    const valueDisplay = input.nextElementSibling;

    if (valueDisplay && valueDisplay.classList.contains('slider-value')) {
      if (name === 'rho_floor') {
        valueDisplay.textContent = value.toFixed(3);
      } else if (name === 'spine_thresh') {
        valueDisplay.textContent = value.toFixed(1);
      } else {
        valueDisplay.textContent = String(value);
      }
    }
  }

  /**
   * Get current parameters
   */
  getParameters() {
    return { ...this.parameters };
  }

  /**
   * Reset parameters to the published defaults (keeps bg_side)
   */
  resetToDefaults() {
    this.parameters = {
      bg_side: this.parameters.bg_side,
      rho_floor: 0.05,
      spine_thresh: 8.0,
      max_pixels: null
    };
    this.refresh();
  }

  /**
   * Set regenerating state
   * @param {boolean} isRegenerating
   */
  setRegenerating(isRegenerating) {
    this.isRegenerating = isRegenerating;
    this.refresh();
  }

  /**
   * Set disabled state for all interactive controls
   * Used when the mask is approved and training starts
   * @param {boolean} disabled
   */
  setDisabled(disabled) {
    const controlIds = [
      'slider_bg_side',
      'slider_rho_floor',
      'slider_spine_thresh',
      'slider_max_pixels'
    ];

    // Disable all input controls
    controlIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.disabled = disabled;
    });

    // Disable buttons
    const container = document.getElementById(this.containerId);
    if (container) {
      const buttons = container.querySelectorAll('button');
      buttons.forEach(btn => btn.disabled = disabled);

      // Visual feedback via CSS class
      container.classList.toggle('disabled', disabled);
    }
  }

  /**
   * Refresh the display
   */
  refresh() {
    const container = document.getElementById(this.containerId);
    if (container) {
      container.outerHTML = this.render();
    }
  }
}

export default MaskParameterPanel;
