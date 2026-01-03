/**
 * MaskVisualization Component
 *
 * Renders the structural noise mask as a visual pixel grid.
 * Shows active pixels (those that will be masked during Stage 2 training).
 * Supports both 2D masks (single slice) and 3D masks (triplet for 2.5D mode).
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
    this.maskData = null;      // Current 2D mask to display
    this.maskData3D = null;    // Full 3D mask data (for 2.5D mode)
    this.kernelSize = 0;
    this.activePixels = 0;
    this.pattern = '';
    this.isEmpty = false;

    // 3D mask state (for 2.5D mode)
    this.is3D = false;
    this.activeSlice = 1;      // Default to center slice (index 1)
    this.sliceLabels = ['Z-1 (above)', 'Z (center)', 'Z+1 (below)'];
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

    const tabsHtml = this.is3D ? this._renderTabs() : '';
    const gridHtml = this._renderGrid();
    const statsHtml = this._renderStats();
    const warningHtml = this.isEmpty ? this._renderEmptyWarning() : '';

    const modeLabel = this.is3D ? '2.5D Triplet Mask' : '2D Mask';
    const subtitle = this.is3D
      ? 'This 3-slice pattern represents structured noise across the Z-axis triplet. Each tab shows the mask for a different slice position.'
      : 'This pattern represents the detected structured noise in your images. Active pixels (purple) will be masked during Stage 2 training.';

    return `
      <div class="mask-visualization" id="${this.containerId}">
        <div class="mask-header">
          <h4>Structural Noise Pattern <span class="mask-mode-badge">${modeLabel}</span></h4>
          <p class="mask-subtitle">${subtitle}</p>
        </div>

        ${tabsHtml}

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
   * Render tabs for 3D mask navigation (2.5D mode)
   */
  _renderTabs() {
    return `
      <div class="mask-tabs">
        ${this.sliceLabels.map((label, i) => `
          <button class="mask-tab ${i === this.activeSlice ? 'active' : ''}"
                  data-slice-index="${i}"
                  onclick="window.dlDenoisingModule?.maskVisualization?.switchSlice(${i})">
            ${label}
          </button>
        `).join('')}
      </div>
    `;
  }

  /**
   * Switch to a different slice in 3D mask view
   * @param {number} sliceIndex - Index of slice (0, 1, or 2)
   */
  switchSlice(sliceIndex) {
    if (!this.is3D || !this.maskData3D) return;
    if (sliceIndex < 0 || sliceIndex >= this.maskData3D.length) return;

    this.activeSlice = sliceIndex;
    this.maskData = this.maskData3D[sliceIndex];
    this._updateActivePixelCount();
    this.refresh();
  }

  /**
   * Update active pixel count for current slice
   */
  _updateActivePixelCount() {
    if (!this.maskData) {
      this.activePixels = 0;
      return;
    }

    let count = 0;
    for (let i = 0; i < this.maskData.length; i++) {
      for (let j = 0; j < this.maskData[i].length; j++) {
        if (this.maskData[i][j]) count++;
      }
    }
    this.activePixels = count;
  }

  /**
   * Set mask data
   * @param {Object} data - Mask data from backend
   */
  setMaskData(data) {
    const mask = data.mask || data.maskData || null;

    // Detect 3D mask (array of 3 2D arrays for 2.5D mode)
    if (mask && Array.isArray(mask) && mask.length === 3 &&
        Array.isArray(mask[0]) && Array.isArray(mask[0][0])) {
      // 3D mask detected
      this.is3D = true;
      this.maskData3D = mask;
      this.activeSlice = 1;  // Default to center slice
      this.maskData = mask[1];  // Show center slice by default
      this.kernelSize = data.kernelSize || this.maskData.length;
    } else {
      // 2D mask
      this.is3D = false;
      this.maskData3D = null;
      this.maskData = mask;
      this.kernelSize = data.kernelSize || (this.maskData ? this.maskData.length : 0);
    }

    this.activePixels = data.activePixels || 0;
    this.pattern = data.pattern || '';
    this.isEmpty = data.isEmpty || false;

    // Recalculate active pixels for current slice if not provided
    if (!data.activePixels && this.maskData) {
      this._updateActivePixelCount();
    }
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
