/**
 * DualColumnConfig Component
 *
 * A responsive two-column layout for Stage 1 / Stage 2 configuration.
 * Includes a "Copy Stage 1 to Stage 2" button for convenience.
 */

class DualColumnConfig {
  /**
   * @param {Object} options
   * @param {string} options.id - Unique identifier
   * @param {boolean} options.dualColumn - Whether to show dual columns (autoStructN2V)
   * @param {Object} options.stage1Content - Content for Stage 1 column
   * @param {Object} options.stage2Content - Content for Stage 2 column
   * @param {Function} options.onCopyToStage2 - Callback when copy button clicked
   */
  constructor(options) {
    this.id = options.id || 'dual-config';
    this.dualColumn = options.dualColumn !== false;
    this.stage1Content = options.stage1Content || '';
    this.stage2Content = options.stage2Content || '';
    this.onCopyToStage2 = options.onCopyToStage2;
  }

  /**
   * Render the dual column layout
   */
  render() {
    if (!this.dualColumn) {
      // Single column mode (N2V)
      return `
        <div class="config-columns single-column" id="${this.id}">
          <div class="config-column stage1-column">
            <div class="column-header">
              <h4>Training Configuration</h4>
            </div>
            <div class="column-content">
              ${this.stage1Content}
            </div>
          </div>
        </div>
      `;
    }

    // Dual column mode (autoStructN2V)
    return `
      <div class="config-columns dual-column" id="${this.id}">
        <div class="config-column stage1-column">
          <div class="column-header">
            <h4>Stage 1 Configuration</h4>
            <span class="column-subtitle">Initial denoising (random noise)</span>
          </div>
          <div class="column-content">
            ${this.stage1Content}
          </div>
        </div>

        <div class="config-column-divider">
          <button type="button" class="copy-config-btn" id="${this.id}-copy-btn" title="Copy Stage 1 settings to Stage 2">
            <span class="copy-icon">→</span>
            <span class="copy-text">Copy to Stage 2</span>
          </button>
        </div>

        <div class="config-column stage2-column">
          <div class="column-header">
            <h4>Stage 2 Configuration</h4>
            <span class="column-subtitle">Structured noise removal</span>
          </div>
          <div class="column-content">
            ${this.stage2Content}
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Initialize event listeners
   */
  init() {
    const copyBtn = document.getElementById(`${this.id}-copy-btn`);
    if (copyBtn && this.onCopyToStage2) {
      copyBtn.addEventListener('click', () => {
        this.onCopyToStage2();
        // Visual feedback
        copyBtn.classList.add('copied');
        setTimeout(() => copyBtn.classList.remove('copied'), 1000);
      });
    }
  }

  /**
   * Update to single or dual column mode
   * @param {boolean} dualColumn - Whether to use dual column
   */
  setDualColumn(dualColumn) {
    this.dualColumn = dualColumn;
  }

  /**
   * Update stage 1 content
   * @param {string} content - HTML content
   */
  setStage1Content(content) {
    this.stage1Content = content;
    const column = document.querySelector(`#${this.id} .stage1-column .column-content`);
    if (column) {
      column.innerHTML = content;
    }
  }

  /**
   * Update stage 2 content
   * @param {string} content - HTML content
   */
  setStage2Content(content) {
    this.stage2Content = content;
    const column = document.querySelector(`#${this.id} .stage2-column .column-content`);
    if (column) {
      column.innerHTML = content;
    }
  }
}

export default DualColumnConfig;
