/**
 * Templates.js - HTML Templates for DL Denoising Module
 *
 * Contains all HTML template rendering for the module's UI.
 * Extracted from DLDenoisingModule.js for better maintainability.
 */

class Templates {
  /**
   * Render a help icon with the given article ID
   * @param {string} articleId - The info article ID to link to
   * @returns {string} HTML for the help icon
   */
  static renderHelpIcon(articleId) {
    return `<span class="help-icon" data-info-id="${articleId}" title="Click for help">
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z"/>
      </svg>
    </span>`;
  }

  /**
   * Render the complete module HTML
   * @param {Function} renderHeader - Function to render module header
   * @param {Function} renderStepNav - Function to render step navigation
   * @returns {string} Complete module HTML
   */
  static renderModule(renderHeader, renderStepNav) {
    return `
      <div class="dl-denoising-module module-container">
        ${renderHeader()}
        ${renderStepNav()}

        <div class="step-contents">
          ${this.renderStep1()}
          ${this.renderStep2()}
          ${this.renderStep3()}
          ${this.renderStep4()}
        </div>
      </div>
    `;
  }

  /**
   * Render Step 1: Data Selection
   */
  static renderStep1() {
    return `
      <!-- Step 1: Data Selection -->
      <div id="step1" class="step-content active">
        <div class="step-inner">
          <h3>Select Method & Data</h3>
          <p class="step-description">
            First select your denoising method, then choose to train from scratch or import a previously trained model.
          </p>

          <!-- GPU Status -->
          <div id="gpuStatus" class="gpu-status">
            <span class="gpu-status-icon">&#8987;</span>
            <span class="gpu-status-text">Checking GPU availability...</span>
          </div>

          <!-- Method Selection (always visible at top) -->
          <div class="section-card method-section">
            <div class="method-selector">
              <div class="section-header">
                <h4>1. Select Denoising Method</h4>
                ${this.renderHelpIcon('denoising-dl.step1.method')}
                <div class="mode-toggle-container">
                  <span class="mode-label mode-label-left active">2D</span>
                  <label class="mode-toggle-switch">
                    <input type="checkbox" id="mode-toggle">
                    <span class="mode-toggle-slider"></span>
                  </label>
                  <span class="mode-label mode-label-right">2.5D</span>
                  ${this.renderHelpIcon('denoising-dl.step1.mode')}
                </div>
              </div>
              <label class="method-option">
                <input type="radio" name="dl-method" value="n2v">
                <span class="method-content">
                  <span class="method-name">
                    Noise2Void (N2V)
                  </span>
                  <span class="method-desc">
                    Fast single-stage training. Best for random, uncorrelated noise (Gaussian, Poisson).
                    Ideal for most microscopy images.
                  </span>
                </span>
              </label>
              <label class="method-option">
                <input type="radio" name="dl-method" value="autostructn2v">
                <span class="method-content">
                  <span class="method-name">
                    autoStructN2V
                  </span>
                  <span class="method-desc">
                    Two-stage training with automatic structured noise analysis.
                    Best for periodic tomography artifacts, scan lines, or camera-specific patterns.
                  </span>
                </span>
              </label>
            </div>
          </div>

          <!-- Workflow Selection Section -->
          <div id="workflowSelectionSection" class="workflow-selection-section" style="display: none;">
            <div class="section-header">
              <h4>2. Choose Workflow</h4>
              ${this.renderHelpIcon('denoising-dl.step1.workflow')}
            </div>
            <p class="workflow-hint">Select one of the options below. Opening one will close the other.</p>

            <!-- Train from Scratch Section (collapsible) -->
            <div class="workflow-section" id="trainFromScratchSection">
              <div class="workflow-header" data-workflow="train">
                <span class="workflow-icon">&#9654;</span>
                <div class="workflow-header-content">
                  <span class="workflow-title">Train from Scratch</span>
                  <span class="workflow-subtitle">Upload images to train a new denoising model</span>
                </div>
              </div>
              <div class="workflow-body">
                <div class="section-card-inner">
                  <div id="fileSelectorContainer"></div>
                  <div id="validationResult"></div>
                </div>
              </div>
            </div>

            <!-- Import Previously Trained Section (collapsible) -->
            <div class="workflow-section" id="importModelSection">
              <div class="workflow-header" data-workflow="import">
                <span class="workflow-icon">&#9654;</span>
                <div class="workflow-header-content">
                  <span class="workflow-title">Import Previously Trained Model</span>
                  <span class="workflow-subtitle">Use an existing model to process new images</span>
                </div>
              </div>
              <div class="workflow-body">
                <div id="importModelContent">
                  <!-- Content will be populated based on method selection -->
                  <div class="import-placeholder">
                    <p>Import functionality will be populated after method selection.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="navigation-buttons">
            <div></div>
            <button id="step1Next" class="btn" disabled>Next: Configure</button>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render Step 2: Configuration
   */
  static renderStep2() {
    return `
      <!-- Step 2: Configuration -->
      <div id="step2" class="step-content">
        <div class="step-inner">
          <h3>Configure Training</h3>
          <p class="step-description">
            Select a preset or customize training parameters.
            <span id="methodModeLabel"></span>
          </p>

          <!-- Preset Selector -->
          <div class="section-card preset-section">
            <div class="preset-header">
              <h4>Configuration Preset</h4>
              <select id="presetSelector" class="preset-dropdown">
                <option value="fast">Fast - Quick training, lower quality</option>
                <option value="balanced" selected>Balanced - Recommended for most cases</option>
                <option value="high_quality">High Quality - Best results, longer training</option>
              </select>
            </div>
            <p id="presetDescription" class="preset-desc"></p>
          </div>

          <!-- Configuration Columns Container -->
          <div id="configColumnsContainer"></div>

          <!-- Mask Extractor Config (autoStructN2V only) -->
          <div id="maskExtractorSection" style="display: none;"></div>

          <div class="navigation-buttons">
            <button id="step2Back" class="btn secondary">Back</button>
            <button id="step2Next" class="btn">Next: Training</button>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render Step 3: Training/Denoising
   */
  static renderStep3() {
    return `
      <!-- Step 3: Run Denoising -->
      <div id="step3" class="step-content">
        <div class="step-inner">
          <div class="section-header step-title-header">
            <h3>Run Denoising</h3>
            ${this.renderHelpIcon('denoising-dl.step3.overview')}
          </div>
          <p class="step-description">
            Train the denoising model on your image data. The training process will
            denoise your images - results are available once training completes.
          </p>

          <!-- Start Training Button (shown when not training) -->
          <div id="startTrainingSection" class="training-start-section">
            <button id="startTrainingBtn" class="btn btn-danger" onclick="window.dlDenoisingModule?.startTraining()">
              <span class="btn-icon">&#9658;</span>
              Start Denoising
            </button>
            <button id="cancelTrainingBtn" class="btn btn-danger" onclick="window.dlDenoisingModule?.progressHandler?.cancelTraining()" style="display: none; margin-bottom: 12px;">
              Cancel Training
            </button>
          </div>

          ${this.renderN2VTrainingSection()}
          ${this.renderAutoStructTrainingSection()}

          <div class="navigation-buttons">
            <button id="step3Back" class="btn secondary">Back</button>
            <button id="step3Next" class="btn" disabled>Process Additional Images (Optional)</button>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render N2V Training Section (single stage)
   */
  static renderN2VTrainingSection() {
    return `
      <!-- N2V Training Section (single stage) -->
      <div id="n2vTrainingSection" class="training-stage-section" style="display: none;">
        <div class="collapsible-section expanded">
          <div class="collapsible-header" data-section="n2vTraining">
            <span class="collapsible-icon">&#9660;</span>
            <h4>Training Progress</h4>
            <span class="stage-status" id="n2vStageStatus">Initializing...</span>
          </div>
          <div class="collapsible-body" id="n2vTrainingBody">
            <!-- Progress Bar with Download Buttons -->
            <div class="training-status" id="n2vProgressStatus">
              <div class="status-text" id="n2vStatusText">Preparing training data...</div>
              <div class="training-progress">
                <div class="progress-header-row">
                  <span class="epoch-info">Epoch <span id="n2vCurrentEpoch">0</span> of <span id="n2vTotalEpochs">0</span></span>
                  <div class="download-buttons" id="n2vDownloadButtons" style="display: none;">
                    <button class="btn primary small" onclick="window.dlDenoisingModule?.openInImageViewer('stage1')">
                      Open in Viewer
                    </button>
                    <button class="btn secondary small" onclick="window.dlDenoisingModule?.startNewAnalysis()">
                      Start new Analysis
                    </button>
                  </div>
                </div>
                <div class="training-progress-bar">
                  <div class="training-progress-fill" id="n2vProgressFill"></div>
                </div>
              </div>
            </div>

            <!-- Chart + Metrics Grid -->
            <div class="training-display-grid">
              <div class="chart-container">
                <div class="section-header chart-header">
                  <h5>Loss Curves</h5>
                  ${this.renderHelpIcon('denoising-dl.step3.loss')}
                </div>
                <div class="chart-wrapper">
                  <canvas id="n2vLossChart"></canvas>
                </div>
              </div>
              <div class="metrics-stack">
                <div class="metric-card">
                  <div class="metric-value" id="n2vTrainLoss">--</div>
                  <div class="metric-label">Training Loss</div>
                </div>
                <div class="metric-card">
                  <div class="metric-value" id="n2vValLoss">--</div>
                  <div class="metric-label">Validation Loss</div>
                </div>
                <div class="metric-card best-metric">
                  <div class="metric-value" id="n2vBestValLoss">--</div>
                  <div class="metric-label-row">
                    <span class="metric-label">Best Val Loss</span>
                    ${this.renderHelpIcon('denoising-dl.step3.best-val-loss')}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render autoStructN2V Training Sections (multi-stage)
   */
  static renderAutoStructTrainingSection() {
    return `
      <!-- autoStructN2V Training Sections (multi-stage) -->
      <div id="autoStructTrainingSection" style="display: none;">

        ${this.renderStage1Section()}
        ${this.renderMaskSection()}
        ${this.renderStage2Section()}

      </div>
    `;
  }

  /**
   * Render Stage 1 Section
   */
  static renderStage1Section() {
    return `
      <!-- Stage 1 Section -->
      <div class="collapsible-section expanded" id="stage1Section">
        <div class="collapsible-header" data-section="stage1Training">
          <span class="collapsible-icon">&#9660;</span>
          <h4>Stage 1: N2V Training</h4>
          <span class="stage-status" id="stage1StageStatus">Pending</span>
        </div>
        <div class="collapsible-body" id="stage1TrainingBody">
          <!-- Progress Bar -->
          <div class="training-status" id="stage1ProgressStatus">
            <div class="status-text" id="stage1StatusText">Waiting to start...</div>
            <div class="training-progress">
              <div class="progress-header-row">
                <span class="epoch-info">Epoch <span id="stage1CurrentEpoch">0</span> of <span id="stage1TotalEpochs">0</span></span>
                <div class="download-buttons" id="stage1DownloadButtons" style="display: none;">
                  <button class="btn secondary small" onclick="window.dlDenoisingModule?.openInImageViewer('stage1')">
                    Open Stage 1 in Viewer
                  </button>
                </div>
              </div>
              <div class="training-progress-bar">
                <div class="training-progress-fill" id="stage1ProgressFill"></div>
              </div>
            </div>
          </div>

          <!-- Chart + Metrics Grid -->
          <div class="training-display-grid">
            <div class="chart-container">
              <div class="section-header chart-header">
                <h5>Loss Curves</h5>
                ${this.renderHelpIcon('denoising-dl.step3.loss')}
              </div>
              <div class="chart-wrapper">
                <canvas id="stage1LossChart"></canvas>
              </div>
            </div>
            <div class="metrics-stack">
              <div class="metric-card">
                <div class="metric-value" id="stage1TrainLoss">--</div>
                <div class="metric-label">Training Loss</div>
              </div>
              <div class="metric-card">
                <div class="metric-value" id="stage1ValLoss">--</div>
                <div class="metric-label">Validation Loss</div>
              </div>
              <div class="metric-card best-metric">
                <div class="metric-value" id="stage1BestValLoss">--</div>
                <div class="metric-label-row">
                  <span class="metric-label">Best Val Loss</span>
                  ${this.renderHelpIcon('denoising-dl.step3.best-val-loss')}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render Mask Extraction Section
   */
  static renderMaskSection() {
    return `
      <!-- Mask Extraction Section -->
      <div class="collapsible-section expanded" id="maskSection">
        <div class="collapsible-header" data-section="maskExtraction">
          <span class="collapsible-icon">&#9660;</span>
          <h4>Mask Extraction</h4>
          <div class="auto-approve-toggle-container" id="autoApproveContainer">
            <label class="auto-approve-toggle" title="Automatically approve mask and start Stage 2">
              <input type="checkbox" id="autoApproveToggle" />
              <span class="auto-approve-slider"></span>
            </label>
            <span class="auto-approve-label">Auto-approve</span>
          </div>
          <span class="stage-status" id="maskStageStatus">Pending</span>
        </div>
        <div class="collapsible-body" id="maskExtractionBody">
          <div class="mask-section-content">
            <div id="maskVisualizationContainer"></div>
            <div id="maskParameterContainer"></div>
          </div>
          <div class="mask-actions" id="maskActions" style="display: none;">
            <button class="btn primary" id="approveMaskBtn" onclick="window.dlDenoisingModule?.approveMask()">
              Approve & Continue to Stage 2
            </button>
            <button class="btn secondary" onclick="window.dlDenoisingModule?.skipStage2()">
              Skip Stage 2
            </button>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render Stage 2 Section
   */
  static renderStage2Section() {
    return `
      <!-- Stage 2 Section -->
      <div class="collapsible-section expanded" id="stage2Section">
        <div class="collapsible-header" data-section="stage2Training">
          <span class="collapsible-icon">&#9660;</span>
          <h4>Stage 2: Struct-N2V Training</h4>
          <span class="stage-status" id="stage2StageStatus">Pending</span>
        </div>
        <div class="collapsible-body" id="stage2TrainingBody">
          <!-- Progress Bar -->
          <div class="training-status" id="stage2ProgressStatus">
            <div class="status-text" id="stage2StatusText">Waiting for Stage 1 and mask approval...</div>
            <div class="training-progress">
              <div class="progress-header-row">
                <span class="epoch-info">Epoch <span id="stage2CurrentEpoch">0</span> of <span id="stage2TotalEpochs">0</span></span>
                <div class="download-buttons" id="stage2DownloadButtons" style="display: none;">
                  <button class="btn primary small" onclick="window.dlDenoisingModule?.openInImageViewer('stage2')">
                    Open in Viewer
                  </button>
                  <button class="btn secondary small" onclick="window.dlDenoisingModule?.startNewAnalysis()">
                    Start new Analysis
                  </button>
                </div>
              </div>
              <div class="training-progress-bar">
                <div class="training-progress-fill" id="stage2ProgressFill"></div>
              </div>
            </div>
          </div>

          <!-- Chart + Metrics Grid -->
          <div class="training-display-grid">
            <div class="chart-container">
              <div class="section-header chart-header">
                <h5>Loss Curves</h5>
                ${this.renderHelpIcon('denoising-dl.step3.loss')}
              </div>
              <div class="chart-wrapper">
                <canvas id="stage2LossChart"></canvas>
              </div>
            </div>
            <div class="metrics-stack">
              <div class="metric-card">
                <div class="metric-value" id="stage2TrainLoss">--</div>
                <div class="metric-label">Training Loss</div>
              </div>
              <div class="metric-card">
                <div class="metric-value" id="stage2ValLoss">--</div>
                <div class="metric-label">Validation Loss</div>
              </div>
              <div class="metric-card best-metric">
                <div class="metric-value" id="stage2BestValLoss">--</div>
                <div class="metric-label-row">
                  <span class="metric-label">Best Val Loss</span>
                  ${this.renderHelpIcon('denoising-dl.step3.best-val-loss')}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render import model section content for N2V (single stage)
   * @returns {string} HTML for N2V import section
   */
  static renderN2VImportSection() {
    return `
      <div class="section-card-inner">
        <div id="importConfigSelector"></div>
        <div id="importStage1ModelSelector"></div>
        <div id="importValidationResult" class="validation-result"></div>
      </div>
    `;
  }

  /**
   * Render import model section content for autoStructN2V (two stages)
   * @returns {string} HTML for autoStructN2V import section
   */
  static renderAutoStructN2VImportSection() {
    return `
      <div class="section-card-inner">
        <div id="importConfigSelector"></div>
        <div id="importStage1ModelSelector"></div>
        <div id="importStage2ModelSelector"></div>
        <div id="importValidationResult" class="validation-result"></div>
      </div>
    `;
  }

  /**
   * Render Step 4: Inference / Additional Processing
   */
  static renderStep4() {
    return `
      <!-- Step 4: Inference / Additional Processing -->
      <div id="step4" class="step-content">
        <div class="step-inner">
          <div class="section-header step-title-header">
            <h3>Process Additional Data</h3>
            ${this.renderHelpIcon('denoising-dl.step4.overview')}
          </div>
          <p class="step-description">
            Apply the trained model to denoise additional images.
          </p>

          <!-- Model Info Section -->
          <div id="inferenceModelInfo" class="section-card model-info-card">
            <h4>Model Information</h4>
            <div id="modelInfoContent" class="model-info-content">
              <!-- Populated dynamically -->
            </div>
          </div>

          <!-- Input Selection Section -->
          <div class="section-card">
            <div id="inferenceFileSelectorContainer"></div>
            <div id="inferenceValidationResult"></div>
          </div>

          <!-- Process Button -->
          <div id="inferenceActions" class="inference-actions">
            <button id="processDataBtn" class="btn primary" disabled>
              Process Data
            </button>
          </div>

          <!-- Progress Section (hidden initially) -->
          <div id="inferenceProgressSection" class="section-card" style="display: none;">
            <h4>Processing Progress</h4>
            <div class="inference-progress">
              <div id="inferenceStatusText" class="inference-status">Initializing...</div>
              <div class="progress-bar-container">
                <div id="inferenceProgressBar" class="progress-bar" style="width: 0%"></div>
              </div>
              <div id="inferenceProgressText" class="progress-text">0%</div>
            </div>
          </div>

          <!-- Success Section (hidden initially) -->
          <div id="inferenceSuccessSection" class="section-card success-card" style="display: none;">
            <div class="success-header">
              <span class="success-icon">✓</span>
              <span class="success-title">Processing Complete!</span>
            </div>
            <div id="inferenceResultInfo" class="result-info">
              <!-- Populated dynamically -->
            </div>
            <div class="success-actions">
              <button id="openInViewerBtn" class="btn primary">Open in Image Viewer</button>
              <button id="processMoreBtn" class="btn secondary">Process More</button>
            </div>
          </div>

          <div class="navigation-buttons">
            <button id="step4Back" class="btn secondary">Back</button>
            <button id="step4Finish" class="btn" style="display: none;">Done</button>
          </div>
        </div>
      </div>
    `;
  }
}

export default Templates;
