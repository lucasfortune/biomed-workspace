/**
 * MaskVisualization Component
 *
 * Renders the structural noise mask as a visual pixel grid.
 * Shows active pixels (those that will be masked during Stage 2 training).
 */

class MaskVisualization {
  /**
   * @param {Object} options - Configuration options
   * @param {string} options.containerId - ID of container element
   * @param {function} options.onRegenerateMask - Callback when regenerate is requested
   */
  constructor(options = {}) {
    this.containerId = options.containerId;
    this.onRegenerateMask = options.onRegenerateMask;

    // Mask data
    this.maskData = null;
    this.kernelSize = 0;
    this.activePixels = 0;
    this.pattern = '';
    this.isEmpty = false;
  }

  /**
   * Render the component
   */
  render() {
    if (!this.maskData) {
      return `
        <div class="mask-visualization" id="${this.containerId}">
          <div class="mask-loading">
            <div class="spinner"></div>
            <p>Extracting structural noise pattern...</p>
          </div>
        </div>
      `;
    }

    const gridHtml = this._renderGrid();
    const statsHtml = this._renderStats();
    const warningHtml = this.isEmpty ? this._renderEmptyWarning() : '';

    return `
      <div class="mask-visualization" id="${this.containerId}">
        <div class="mask-header">
          <h4>Structural Noise Pattern</h4>
          <p class="mask-subtitle">
            This pattern represents the detected structured noise in your images.
            Active pixels (purple) will be masked during Stage 2 training.
          </p>
        </div>

        <div class="mask-content">
          <div class="mask-grid-container">
            ${gridHtml}
          </div>
          <div class="mask-stats-container">
            ${statsHtml}
          </div>
        </div>

        ${warningHtml}
      </div>
    `;
  }

  /**
   * Render the mask as a pixel grid
   */
  _renderGrid() {
    if (!this.maskData || !Array.isArray(this.maskData)) {
      return '<div class="mask-grid-placeholder">No mask data</div>';
    }

    const size = this.kernelSize || this.maskData.length;
    const cellSize = Math.min(24, Math.floor(200 / size));

    let gridHtml = `<div class="mask-grid" style="grid-template-columns: repeat(${size}, ${cellSize}px);">`;

    for (let i = 0; i < size; i++) {
      for (let j = 0; j < size; j++) {
        const isActive = this.maskData[i] && this.maskData[i][j];
        const isCenter = i === Math.floor(size / 2) && j === Math.floor(size / 2);

        let cellClass = 'mask-cell';
        if (isActive) cellClass += ' active';
        if (isCenter) cellClass += ' center';

        gridHtml += `<div class="${cellClass}" style="width: ${cellSize}px; height: ${cellSize}px;"></div>`;
      }
    }

    gridHtml += '</div>';
    return gridHtml;
  }

  /**
   * Render mask statistics
   */
  _renderStats() {
    return `
      <div class="mask-stats">
        <div class="stat-item">
          <span class="stat-label">Kernel Size</span>
          <span class="stat-value">${this.kernelSize} × ${this.kernelSize}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Active Pixels</span>
          <span class="stat-value">${this.activePixels}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Pattern Type</span>
          <span class="stat-value">${this.pattern || 'Custom'}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Coverage</span>
          <span class="stat-value">${this._calculateCoverage()}%</span>
        </div>
      </div>

      <div class="mask-legend">
        <div class="legend-item">
          <span class="legend-color active"></span>
          <span class="legend-text">Active (masked)</span>
        </div>
        <div class="legend-item">
          <span class="legend-color inactive"></span>
          <span class="legend-text">Inactive</span>
        </div>
        <div class="legend-item">
          <span class="legend-color center"></span>
          <span class="legend-text">Center pixel</span>
        </div>
      </div>
    `;
  }

  /**
   * Render empty mask warning
   */
  _renderEmptyWarning() {
    return `
      <div class="mask-warning">
        <div class="warning-icon">⚠️</div>
        <div class="warning-content">
          <h5>Low Structural Noise Detected</h5>
          <p>
            The detected structural noise pattern has very few active pixels.
            This may indicate that your images don't have significant structured noise,
            or the detection parameters need adjustment.
          </p>
          <div class="warning-actions">
            <button class="btn secondary small" onclick="window.dlDenoisingModule?.skipStage2()">
              Use N2V Results (Skip Stage 2)
            </button>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Calculate coverage percentage
   */
  _calculateCoverage() {
    if (!this.kernelSize) return 0;
    const totalPixels = this.kernelSize * this.kernelSize;
    return ((this.activePixels / totalPixels) * 100).toFixed(1);
  }

  /**
   * Set mask data
   * @param {Object} data - Mask data from backend
   */
  setMaskData(data) {
    this.maskData = data.mask || data.maskData || null;
    this.kernelSize = data.kernelSize || (this.maskData ? this.maskData.length : 0);
    this.activePixels = data.activePixels || 0;
    this.pattern = data.pattern || '';
    this.isEmpty = data.isEmpty || false;
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

  /**
   * Show loading state
   */
  showLoading() {
    this.maskData = null;
    this.refresh();
  }
}

export default MaskVisualization;
