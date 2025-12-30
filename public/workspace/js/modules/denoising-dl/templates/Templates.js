/**
 * Templates.js - HTML Templates for DL Denoising Module
 *
 * Contains all HTML template rendering for the module's UI.
 * Extracted from DLDenoisingModule.js for better maintainability.
 */

class Templates {
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
          <h3>Select Image Data & Method</h3>
          <p class="step-description">
            Choose a TIFF stack to denoise and select your denoising method.
            Deep learning denoising uses self-supervised learning - no clean reference images needed.
          </p>

          <!-- GPU Status -->
          <div id="gpuStatus" class="gpu-status">
            <span class="gpu-status-icon">&#8987;</span>
            <span class="gpu-status-text">Checking GPU availability...</span>
          </div>

          <!-- File Selection -->
          <div class="section-card">
            <h4>Input Image</h4>
            <div id="fileSelectorContainer"></div>
            <div id="validationResult"></div>
          </div>

          <!-- Method Selection -->
          <div class="section-card">
            <div class="method-selector">
              <h4>Denoising Method</h4>
              <label class="method-option">
                <input type="radio" name="dl-method" value="n2v">
                <span class="method-content">
                  <span class="method-name">
                    Noise2Void (N2V)
                    <span class="method-badge recommended">Recommended</span>
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
                    <span class="method-badge advanced">Advanced</span>
                  </span>
                  <span class="method-desc">
                    Two-stage training with automatic structured noise detection.
                    Best for periodic artifacts, scan lines, or camera-specific patterns.
                  </span>
                </span>
              </label>
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
          <h3>Run Denoising</h3>
          <p class="step-description">
            Train the denoising model on your image data. The training process will
            denoise your images - results are available once training completes.
          </p>

          <!-- Start Training Button (shown when not training) -->
          <div id="startTrainingSection" class="training-start-section">
            <button id="startTrainingBtn" class="btn primary large" onclick="window.dlDenoisingModule?.startTraining()">
              <span class="btn-icon">&#9658;</span>
              Start Denoising
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
                <h5>Loss Curves</h5>
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
                  <div class="metric-label">Best Val Loss</div>
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
              <h5>Loss Curves</h5>
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
                <div class="metric-label">Best Val Loss</div>
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
              <h5>Loss Curves</h5>
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
                <div class="metric-label">Best Val Loss</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render Step 4: Inference
   */
  static renderStep4() {
    return `
      <!-- Step 4: Inference (placeholder for Phase 7) -->
      <div id="step4" class="step-content">
        <div class="step-inner">
          <h3>Inference</h3>
          <p class="step-description">
            Apply the trained model to denoise images.
          </p>

          <div class="section-card placeholder-section">
            <div class="placeholder-icon">&#128300;</div>
            <div class="placeholder-text">
              Inference functionality will be implemented in Phase 7.
              <br><br>
              This will allow you to apply the trained model to your
              training data or upload new images for denoising.
            </div>
          </div>

          <div class="navigation-buttons">
            <button id="step4Back" class="btn secondary">Back</button>
            <button id="step4Finish" class="btn" disabled>View Results</button>
          </div>
        </div>
      </div>
    `;
  }
}

export default Templates;
