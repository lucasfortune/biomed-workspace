/**
 * ResultsDisplay Component
 *
 * Shows denoising results after training completion including:
 * - Denoised TIFF stack info
 * - Download buttons
 * - View in Image Viewer option
 * - Navigation to optional Step 4
 */

class ResultsDisplay {
  /**
   * @param {Object} options - Configuration options
   * @param {string} options.containerId - ID of container element
   * @param {string} options.method - 'n2v' or 'autostructn2v'
   * @param {function} options.onDownload - Callback for download action
   * @param {function} options.onViewInViewer - Callback for view in viewer action
   * @param {function} options.onProcessMore - Callback for process more images
   */
  constructor(options = {}) {
    this.containerId = options.containerId;
    this.method = options.method || 'n2v';
    this.onDownload = options.onDownload;
    this.onViewInViewer = options.onViewInViewer;
    this.onProcessMore = options.onProcessMore;

    // Results data
    this.results = null;
  }

  /**
   * Render the component
   */
  render() {
    if (!this.results) {
      return `
        <div class="results-display" id="${this.containerId}">
          <p class="no-results">No results available yet.</p>
        </div>
      `;
    }

    const outputFiles = this.results.outputFiles || {};
    const branch = this.results.branch;
    const branchLabel = branch === 'structn2v'
      ? 'StructN2V (discovered mask)'
      : (branch === 'n2v' ? 'Plain N2V' : null);

    return `
      <div class="results-display section-card success-card" id="${this.containerId}">
        <div class="success-header">
          <span class="success-icon">&#10003;</span>
          <span class="success-title">Denoising Complete!</span>
        </div>
        <p class="results-subtitle">Your images have been successfully denoised${branchLabel ? ` (${branchLabel})` : ''}.</p>

        <div class="results-info-box">
          <span class="info-icon">&#9432;</span>
          <span class="info-text">
            Step 4 (Process Additional Images) is <strong>OPTIONAL</strong>.
            Your denoised results are ready below.
          </span>
        </div>

        ${this._renderDenoisedResult(outputFiles)}

        <!-- Model & Run Files -->
        <div class="results-section model-files">
          <h4>Trained Model & Run Artifacts</h4>
          <p class="section-desc">The trained model can be used to process additional images in Step 4.</p>
          <div class="model-info">
            ${outputFiles.model ? `
              <div class="file-item">
                <span class="file-icon">&#128190;</span>
                <span class="file-name">${this._getFilename(outputFiles.model)}</span>
              </div>
            ` : ''}
            ${outputFiles.config ? `
              <div class="file-item">
                <span class="file-icon">&#128196;</span>
                <span class="file-name">${this._getFilename(outputFiles.config)}</span>
              </div>
            ` : ''}
            ${outputFiles.routed_mask ? `
              <div class="file-item">
                <span class="file-icon">&#128200;</span>
                <span class="file-name">${this._getFilename(outputFiles.routed_mask)}</span>
              </div>
            ` : ''}
            ${outputFiles.route_decision ? `
              <div class="file-item">
                <span class="file-icon">&#129517;</span>
                <span class="file-name">${this._getFilename(outputFiles.route_decision)}</span>
              </div>
            ` : ''}
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="results-actions success-actions">
          <button class="btn secondary" data-action="downloadAllResults">
            <span class="btn-glyph">&#128229;</span>
            Download All Results
          </button>
          <button class="btn" data-action="goToStep" data-step="4">
            <span class="btn-glyph">&#10132;</span>
            Process Additional Images (Optional)
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Render the denoised result stack section
   */
  _renderDenoisedResult(outputFiles) {
    if (!outputFiles.denoised_stack) return '';

    const stackPath = outputFiles.denoised_stack;
    const sliceCount = outputFiles.slice_count || 'Unknown';
    const filename = this._getFilename(stackPath);

    return `
      <div class="results-section denoised-results recommended">
        <div class="section-header">
          <h4>Denoised Stack</h4>
        </div>

        <div class="stack-info">
          <div class="stack-preview">
            <div class="preview-placeholder">
              <span class="preview-icon">&#128247;</span>
              <span class="preview-text">TIFF Stack</span>
            </div>
          </div>
          <div class="stack-details">
            <div class="detail-row">
              <span class="detail-label">Filename:</span>
              <span class="detail-value">${filename}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Slices:</span>
              <span class="detail-value">${sliceCount}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Path:</span>
              <span class="detail-value path">${stackPath}</span>
            </div>
          </div>
        </div>

        <div class="stack-actions">
          <button class="btn small" data-action="downloadResult">
            <span class="btn-glyph">&#128229;</span>
            Download
          </button>
          <button class="btn small secondary" data-action="viewInViewer">
            <span class="btn-glyph">&#128065;</span>
            Open in Image Viewer
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Extract filename from path
   */
  _getFilename(path) {
    if (!path) return '';
    return path.split('/').pop().split('\\').pop();
  }

  /**
   * Set results data
   */
  setResults(results) {
    this.results = results;
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

export default ResultsDisplay;
