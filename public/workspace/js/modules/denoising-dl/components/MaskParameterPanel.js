/**
 * MaskParameterPanel Component
 *
 * Controls for adjusting mask extraction parameters and regenerating the mask.
 * Used for fine-tuning structural noise detection in autoStructN2V.
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

    // Default parameters
    this.parameters = {
      adaptive_thresholding: true,
      base_percentile: 50,
      percentile_decay: 1.15,
      max_masked_pixels: 25,
      ...options.parameters
    };

    // State
    this.isRegenerating = false;
    this.isExpanded = false;
  }

  /**
   * Render the component
   */
  render() {
    return `
      <div class="mask-parameter-panel ${this.isExpanded ? 'expanded' : ''}" id="${this.containerId}">
        <div class="panel-header" onclick="window.dlDenoisingModule?.toggleMaskParameters()">
          <span class="panel-icon">${this.isExpanded ? '▼' : '▶'}</span>
          <span class="panel-title">Mask Parameters</span>
          <span class="panel-hint">Click to ${this.isExpanded ? 'hide' : 'adjust'}</span>
        </div>

        <div class="panel-body" style="display: ${this.isExpanded ? 'block' : 'none'};">
          <p class="panel-description">
            Adjust these parameters if the detected pattern doesn't match the structured noise in your images.
          </p>

          <div class="parameter-group">
            <div class="parameter-row checkbox-row">
              <input type="checkbox" id="mask_adaptive_thresholding"
                     ${this.parameters.adaptive_thresholding ? 'checked' : ''}
                     onchange="window.dlDenoisingModule?.updateMaskParameter('adaptive_thresholding', this.checked)">
              <label for="mask_adaptive_thresholding">Adaptive Thresholding</label>
              <span class="param-hint">Automatically adjust threshold based on noise characteristics</span>
            </div>

            <div class="parameter-row">
              <label for="mask_base_percentile">Base Percentile</label>
              <div class="slider-container">
                <input type="range" id="mask_base_percentile"
                       min="30" max="70" step="5"
                       value="${this.parameters.base_percentile}"
                       onchange="window.dlDenoisingModule?.updateMaskParameter('base_percentile', parseInt(this.value))">
                <span class="slider-value">${this.parameters.base_percentile}</span>
              </div>
              <span class="param-hint">Higher = more selective (fewer active pixels)</span>
            </div>

            <div class="parameter-row">
              <label for="mask_percentile_decay">Percentile Decay</label>
              <div class="slider-container">
                <input type="range" id="mask_percentile_decay"
                       min="1.0" max="1.3" step="0.05"
                       value="${this.parameters.percentile_decay}"
                       onchange="window.dlDenoisingModule?.updateMaskParameter('percentile_decay', parseFloat(this.value))">
                <span class="slider-value">${this.parameters.percentile_decay.toFixed(2)}</span>
              </div>
              <span class="param-hint">Controls how threshold changes across the kernel</span>
            </div>

            <div class="parameter-row">
              <label for="mask_max_masked_pixels">Max Masked Pixels (%)</label>
              <div class="slider-container">
                <input type="range" id="mask_max_masked_pixels"
                       min="10" max="40" step="5"
                       value="${this.parameters.max_masked_pixels}"
                       onchange="window.dlDenoisingModule?.updateMaskParameter('max_masked_pixels', parseInt(this.value))">
                <span class="slider-value">${this.parameters.max_masked_pixels}%</span>
              </div>
              <span class="param-hint">Maximum percentage of kernel pixels that can be active</span>
            </div>
          </div>

          <div class="panel-actions">
            <button class="btn secondary" onclick="window.dlDenoisingModule?.resetMaskParameters()"
                    ${this.isRegenerating ? 'disabled' : ''}>
              Reset to Defaults
            </button>
            <button class="btn primary" onclick="window.dlDenoisingModule?.regenerateMask()"
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
   * Update a single parameter
   * @param {string} name - Parameter name
   * @param {*} value - Parameter value
   */
  updateParameter(name, value) {
    this.parameters[name] = value;

    // Update slider value display
    const valueDisplay = document.querySelector(`#mask_${name}`)?.parentElement?.querySelector('.slider-value');
    if (valueDisplay) {
      if (name === 'percentile_decay') {
        valueDisplay.textContent = value.toFixed(2);
      } else if (name === 'max_masked_pixels') {
        valueDisplay.textContent = `${value}%`;
      } else {
        valueDisplay.textContent = value;
      }
    }

    if (this.onParameterChange) {
      this.onParameterChange(name, value);
    }
  }

  /**
   * Get current parameters
   */
  getParameters() {
    return { ...this.parameters };
  }

  /**
   * Reset parameters to defaults
   */
  resetToDefaults() {
    this.parameters = {
      adaptive_thresholding: true,
      base_percentile: 50,
      percentile_decay: 1.15,
      max_masked_pixels: 25
    };
    this.refresh();
  }

  /**
   * Toggle expanded state
   */
  toggle() {
    this.isExpanded = !this.isExpanded;
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
   * Expand the panel
   */
  expand() {
    this.isExpanded = true;
    this.refresh();
  }

  /**
   * Collapse the panel
   */
  collapse() {
    this.isExpanded = false;
    this.refresh();
  }

  /**
   * Initialize the component
   */
  init() {
    // No additional initialization needed
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
