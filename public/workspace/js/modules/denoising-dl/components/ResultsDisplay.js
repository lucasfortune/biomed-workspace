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

    const isAutoStruct = this.method === 'autostructn2v';
    const outputFiles = this.results.outputFiles || {};

    return `
      <div class="results-display" id="${this.containerId}">
        <div class="results-header">
          <div class="success-icon">&#10003;</div>
          <div class="results-title">
            <h3>Denoising Complete!</h3>
            <p>Your images have been successfully denoised.</p>
          </div>
        </div>

        <div class="results-info-box">
          <span class="info-icon">&#9432;</span>
          <span class="info-text">
            Step 4 (Process Additional Images) is <strong>OPTIONAL</strong>.
            Your denoised results are ready below.
          </span>
        </div>

        <!-- Stage 1 Results -->
        ${this._renderStageResults('stage1', outputFiles, isAutoStruct)}

        <!-- Stage 2 Results (autoStructN2V only) -->
        ${isAutoStruct && outputFiles.stage2_stack ? this._renderStageResults('stage2', outputFiles, true) : ''}

        <!-- Model Files -->
        <div class="results-section model-files">
          <h4>Trained Model</h4>
          <p class="section-desc">The trained model can be used to process additional images in Step 4.</p>
          <div class="model-info">
            ${outputFiles.stage1_model ? `
              <div class="file-item">
                <span class="file-icon">&#128190;</span>
                <span class="file-name">${this._getFilename(outputFiles.stage1_model)}</span>
              </div>
            ` : ''}
            ${outputFiles.stage2_model ? `
              <div class="file-item">
                <span class="file-icon">&#128190;</span>
                <span class="file-name">${this._getFilename(outputFiles.stage2_model)}</span>
              </div>
            ` : ''}
            ${outputFiles.config ? `
              <div class="file-item">
                <span class="file-icon">&#128196;</span>
                <span class="file-name">${this._getFilename(outputFiles.config)}</span>
              </div>
            ` : ''}
            ${outputFiles.structural_mask ? `
              <div class="file-item">
                <span class="file-icon">&#128200;</span>
                <span class="file-name">${this._getFilename(outputFiles.structural_mask)}</span>
              </div>
            ` : ''}
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="results-actions">
          <button class="btn secondary" onclick="window.dlDenoisingModule?.downloadAllResults()">
            <span class="btn-icon">&#128229;</span>
            Download All Results
          </button>
          <button class="btn" onclick="window.dlDenoisingModule?.goToStep(4)">
            <span class="btn-icon">&#10132;</span>
            Process Additional Images (Optional)
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Render results for a stage
   */
  _renderStageResults(stage, outputFiles, isAutoStruct) {
    const stackKey = `${stage}_stack`;
    const sliceCountKey = `${stage}_slice_count`;

    if (!outputFiles[stackKey]) return '';

    const stackPath = outputFiles[stackKey];
    const sliceCount = outputFiles[sliceCountKey] || 'Unknown';
    const filename = this._getFilename(stackPath);

    const isRecommended = isAutoStruct && stage === 'stage2';
    const stageLabel = stage === 'stage1'
      ? (isAutoStruct ? 'Stage 1 (N2V)' : 'N2V Denoised')
      : 'Stage 2 (Struct-N2V)';

    return `
      <div class="results-section ${stage}-results ${isRecommended ? 'recommended' : ''}">
        <div class="section-header">
          <h4>${stageLabel}</h4>
          ${isRecommended ? '<span class="recommended-badge">Recommended</span>' : ''}
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
          <button class="btn small" onclick="window.dlDenoisingModule?.downloadResult('${stage}')">
            <span class="btn-icon">&#128229;</span>
            Download
          </button>
          <button class="btn small secondary" onclick="window.dlDenoisingModule?.viewInViewer('${stage}')">
            <span class="btn-icon">&#128065;</span>
            View in Viewer
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
