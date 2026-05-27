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
      percentile_decay: 1.035,
      max_masked_pixels: 25,
      ...options.parameters
    };

    // State
    this.isRegenerating = false;
  }

  /**
   * Render the component
   */
  render() {
    return `
      <div class="mask-parameter-panel" id="${this.containerId}">
        <div class="panel-header">
          <span class="panel-title">Mask Parameters</span>
        </div>

        <div class="panel-body">
          <p class="panel-description">
            Adjust these parameters if the detected pattern doesn't match the structured noise in your images.
          </p>

          <div class="parameter-group">
            <div class="parameter-row checkbox-row">
              <input type="checkbox" id="slider_adaptive_thresholding"
                     ${this.parameters.adaptive_thresholding ? 'checked' : ''}
                     onchange="window.dlDenoisingModule?.updateMaskParameter('adaptive_thresholding', this.checked)">
              <label for="slider_adaptive_thresholding">Adaptive Thresholding</label>
              <span class="param-hint">Automatically adjust threshold based on noise characteristics</span>
            </div>

            <div class="parameter-row">
              <label for="slider_base_percentile">Base Percentile</label>
              <div class="slider-container">
                <input type="range" id="slider_base_percentile"
                       min="30" max="70" step="1"
                       value="${this.parameters.base_percentile}"
                       oninput="window.dlDenoisingModule?.updateMaskParameter('base_percentile', parseInt(this.value))">
                <span class="slider-value">${this.parameters.base_percentile}%</span>
              </div>
              <span class="param-hint">Higher = more selective (fewer active pixels)</span>
            </div>

            <div class="parameter-row">
              <label for="slider_percentile_decay">Percentile Decay</label>
              <div class="slider-container">
                <input type="range" id="slider_percentile_decay"
                       min="1.0" max="1.5" step="0.005"
                       value="${this.parameters.percentile_decay}"
                       oninput="window.dlDenoisingModule?.updateMaskParameter('percentile_decay', parseFloat(this.value))">
                <span class="slider-value">${this.parameters.percentile_decay.toFixed(3)}</span>
              </div>
              <span class="param-hint">Controls how threshold changes across the kernel</span>
            </div>

            <div class="parameter-row">
              <label for="slider_max_masked_pixels">Max Masked Pixels</label>
              <div class="slider-container">
                <input type="range" id="slider_max_masked_pixels"
                       min="5" max="50" step="1"
                       value="${this.parameters.max_masked_pixels}"
                       oninput="window.dlDenoisingModule?.updateMaskParameter('max_masked_pixels', parseInt(this.value))">
                <span class="slider-value">${this.parameters.max_masked_pixels}</span>
              </div>
              <span class="param-hint">Maximum number of active pixels in the mask</span>
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
   * Update a single parameter (internal state update only)
   * Note: Does NOT call onParameterChange to avoid recursion, since HTML
   * slider events already call updateMaskParameter directly.
   * @param {string} name - Parameter name
   * @param {*} value - Parameter value
   */
  updateParameter(name, value) {
    this.parameters[name] = value;

    // Update slider value display
    // The span.slider-value is the next sibling of the input element
    // Use 'slider_' prefix to avoid conflict with ConfigHandler's 'mask_' IDs
    const inputId = `slider_${name}`;
    const input = document.getElementById(inputId);

    if (!input) {
      console.warn(`[MaskParameterPanel] Input element #${inputId} not found`);
      return;
    }

    // The slider-value span is immediately after the input
    const valueDisplay = input.nextElementSibling;

    if (valueDisplay && valueDisplay.classList.contains('slider-value')) {
      if (name === 'percentile_decay') {
        valueDisplay.textContent = value.toFixed(3);
      } else if (name === 'base_percentile') {
        valueDisplay.textContent = `${value}%`;
      } else {
        // max_masked_pixels and others: just show the number
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
   * Reset parameters to defaults
   */
  resetToDefaults() {
    this.parameters = {
      adaptive_thresholding: true,
      base_percentile: 50,
      percentile_decay: 1.035,
      max_masked_pixels: 25
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
   * Used when mask is approved and Stage 2 training starts
   * @param {boolean} disabled
   */
  setDisabled(disabled) {
    const controlIds = [
      'slider_adaptive_thresholding',
      'slider_base_percentile',
      'slider_percentile_decay',
      'slider_max_masked_pixels'
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
