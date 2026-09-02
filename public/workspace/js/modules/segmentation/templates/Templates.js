/**
 * Templates.js - HTML Templates for Segmentation Module
 *
 * Contains all HTML template rendering for the module's UI.
 * Extracted from SegmentationModule.js for better maintainability.
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
   * @param {Function} renderHeader - Function to render module header (from BaseModule)
   * @param {Function} renderStepNav - Function to render step navigation (from BaseModule)
   * @returns {string} Complete module HTML
   */
  static renderModule(renderHeader, renderStepNav) {
    return `
      <div class="segmentation-module module-container">
        <!-- Module Header (using BaseModule helper) -->
        ${renderHeader()}

        <!-- Step Navigation (using BaseModule helper) -->
        ${renderStepNav()}

        <!-- Step Contents -->
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
   * Render Step 1: Data Upload / Model Import
   */
  static renderStep1() {
    return `
      <!-- Step 1: Data Upload / Model Import -->
      <div class="step-content active" id="step1">
        <div class="step-inner">
          <h3>Training Data or Model</h3>
          <p class="step-description">Either upload training data to train a new model, or import a previously trained model.</p>

          <!-- Workflow Selection Section -->
          <div class="workflow-selection-section">
            <h4>Choose Workflow ${this.renderHelpIcon('segmentation.step1.workflow-choice')}</h4>
            <p class="workflow-hint">Select one option. Opening one will close the other.</p>

            <!-- Train from Scratch Section -->
            <div class="workflow-section" id="trainFromScratchSection">
              <div class="workflow-header" data-workflow="train">
                <span class="workflow-icon">&#9654;</span>
                <div class="workflow-header-content">
                  <span class="workflow-title">Train from Scratch</span>
                  <span class="workflow-subtitle">Upload training images and annotations</span>
                </div>
              </div>
              <div class="workflow-body">
                <div class="section-card-inner">
                  <!-- FileSelector components will be inserted here -->
                  <div id="rawImagesSelectorContainer"></div>
                  <div id="annotationsSelectorContainer"></div>
                  <div id="validationResult"></div>
                </div>
              </div>
            </div>

            <!-- Import Model Section -->
            <div class="workflow-section" id="importModelSection">
              <div class="workflow-header" data-workflow="import">
                <span class="workflow-icon">&#9654;</span>
                <div class="workflow-header-content">
                  <span class="workflow-title">Use Pretrained Model</span>
                  <span class="workflow-subtitle">Import a previously trained model for inference</span>
                </div>
              </div>
              <div class="workflow-body">
                <div id="importModelContent">
                  <!-- Import selectors will be initialized dynamically -->
                </div>
              </div>
            </div>
          </div>

          <div class="navigation-buttons">
            <div></div>
            <button class="btn" id="step1Next" disabled>Next: Configuration</button>
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
      <div class="step-content" id="step2">
        <div class="step-inner">
          <h3>Training Configuration</h3>
          <p class="step-description">Configure your model and training parameters.</p>

          <div class="config-form">
            <div class="config-group">
              <h4>Dataset Configuration</h4>
              <div class="form-field">
                <label for="patchSize">Patch Size${this.renderHelpIcon('segmentation.config.patch-size')}</label>
                <select id="patchSize">
                  <option value="32">32</option>
                  <option value="48">48</option>
                  <option value="64" selected>64</option>
                  <option value="96">96</option>
                  <option value="128">128</option>
                  <option value="256">256</option>
                </select>
              </div>
              <div class="form-field">
                <label for="patchesPerImage">Patches per Image${this.renderHelpIcon('segmentation.config.patches-per-image')}</label>
                <input type="number" id="patchesPerImage" value="50" min="1" max="100">
              </div>
              <div class="form-field">
                <label for="batchSize">Batch Size${this.renderHelpIcon('segmentation.config.batch-size')}</label>
                <select id="batchSize">
                  <option value="1">1</option>
                  <option value="2">2</option>
                  <option value="4">4</option>
                  <option value="8" selected>8</option>
                  <option value="16">16</option>
                  <option value="32">32</option>
                </select>
              </div>
              <div class="form-field checkbox-field">
                <input type="checkbox" id="augmentation" checked>
                <label for="augmentation">Apply Data Augmentation${this.renderHelpIcon('segmentation.config.augmentation')}</label>
              </div>
            </div>

            <div class="config-group">
              <h4>Model Architecture</h4>
              <div class="form-field">
                <label for="numFeatures">Number of Features${this.renderHelpIcon('segmentation.config.num-features')}</label>
                <select id="numFeatures">
                  <option value="32">32</option>
                  <option value="48">48</option>
                  <option value="64" selected>64</option>
                  <option value="96">96</option>
                  <option value="128">128</option>
                </select>
              </div>
              <div class="form-field">
                <label for="numLayers">Number of Layers${this.renderHelpIcon('segmentation.config.num-layers')}</label>
                <input type="number" id="numLayers" value="4" min="2" max="6">
              </div>
            </div>

            <div class="config-group">
              <h4>Training Parameters</h4>
              <div class="form-field">
                <label for="learningRate">Learning Rate${this.renderHelpIcon('segmentation.config.learning-rate')}</label>
                <select id="learningRate">
                  <option value="0.00001">1e-5</option>
                  <option value="0.00005">5e-5</option>
                  <option value="0.0001">1e-4</option>
                  <option value="0.0002">2e-4</option>
                  <option value="0.001" selected>1e-3</option>
                  <option value="0.002">2e-3</option>
                </select>
              </div>
              <div class="form-field">
                <label for="numEpochs">Number of Epochs${this.renderHelpIcon('segmentation.config.num-epochs')}</label>
                <input type="number" id="numEpochs" value="100" min="10" max="500">
              </div>
            </div>
          </div>

          <div class="navigation-buttons">
            <button class="btn secondary" id="step2Back">Back</button>
            <button class="btn" id="step2Next">Next: Training</button>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render Step 3: Training Progress
   */
  static renderStep3() {
    return `
      <!-- Step 3: Training Progress -->
      <div class="step-content" id="step3">
        <div class="step-inner">
          <h3>Training ${this.renderHelpIcon('segmentation.step3')}</h3>
          <p class="step-description">Start training and watch loss and Dice score evolve epoch by epoch.</p>

          <!-- Training Container: Shows the ready message initially, then progress -->
          <div class="training-status">
            <!-- Initial state -->
            <div id="trainingActionContent" class="training-start-section">
              <h4 class="training-title">Ready to Train Your Model</h4>
              <p class="training-subtitle">
                Your configuration has been saved. Use "Start Training" below to train your U-Net model.
              </p>
            </div>

            <!-- Training progress state: Hidden initially -->
            <div id="trainingProgressContent" style="display: none;">
              <div class="training-status-header">
                <h4 id="trainingStatusText">Training started... Preparing data...</h4>
                <span class="stage-status training" id="trainingStageStatus">Training</span>
              </div>
              <div class="training-progress">
                <div class="epoch-info">Epoch <span id="currentEpoch">0</span> of <span id="totalEpochs">0</span></div>
                <div class="training-progress-bar">
                  <div class="training-progress-fill" id="trainingProgressFill"></div>
                </div>
              </div>
            </div>
          </div>

          <div class="metrics-display">
            <div class="metric-card">
              <div class="metric-value" id="trainLoss">--</div>
              <div class="metric-label">Training Loss</div>
            </div>
            <div class="metric-card">
              <div class="metric-value" id="valLoss">--</div>
              <div class="metric-label">Validation Loss</div>
            </div>
            <div class="metric-card">
              <div class="metric-value" id="trainDice">--</div>
              <div class="metric-label">Training Dice</div>
            </div>
            <div class="metric-card">
              <div class="metric-value" id="valDice">--</div>
              <div class="metric-label">Validation Dice</div>
            </div>
          </div>

          <div class="charts-container">
            <div class="chart-container">
              <h4>Loss Curves ${this.renderHelpIcon('segmentation.step3.loss-curves')}</h4>
              <div class="chart-canvas-wrap">
                <canvas id="lossChart"></canvas>
              </div>
            </div>
            <div class="chart-container">
              <h4>Dice Score ${this.renderHelpIcon('segmentation.step3.dice-score')}</h4>
              <div class="chart-canvas-wrap">
                <canvas id="diceChart"></canvas>
              </div>
            </div>
          </div>

          <div class="navigation-buttons">
            <button class="btn secondary" id="trainingBackBtn">Back</button>
            <div class="nav-actions">
              <button class="btn danger" id="cancelTrainingBtn" style="display: none;">Cancel Training</button>
              <button class="btn primary" id="startTrainingBtn">
                <span class="btn-glyph">&#9658;</span>
                Start Training
              </button>
              <button class="btn" id="trainingNextBtn" disabled>Next: Inference</button>
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
      <!-- Step 4: Inference -->
      <div class="step-content" id="step4">
        <div class="step-inner">
          <h3>Run Inference ${this.renderHelpIcon('segmentation.step4')}</h3>
          <p class="step-description">Your model is ready. Select the data to segment and start the run.</p>

          <div class="inference-section">
            <!-- FileSelector component will be inserted here -->
            <div id="inferenceSelectorContainer"></div>

            <!-- Compatibility warnings are inserted here -->
            <div id="inferenceWarningSlot"></div>

            <!-- Inference Progress Display -->
            <div class="section-card" id="inferenceProgressContainer" style="display: none;">
              <h4>Running Inference...</h4>
              <div class="inference-progress-row">
                <span>Progress: <span id="currentSlice">0</span> / <span id="totalSlices">0</span> slices</span>
                <span id="inferenceProgressPercent">0%</span>
              </div>
              <div class="progress-bar-container">
                <div id="inferenceProgressBar" class="job-progress-fill" style="width: 0%"></div>
              </div>
              <div class="inference-status-line">
                <span id="inferenceStatusText">Processing your data...</span>
              </div>
            </div>

            <!-- Inference Completion Section -->
            <div class="section-card success-card" id="inferenceCompletionSection" style="display: none;">
              <div class="success-header">
                <span class="success-icon">&#10003;</span>
                <span class="success-title">Segmentation Complete</span>
              </div>
              <div class="validation-details" id="inferenceCompletionDetails">
                Your segmentation results are ready. View them in the Image Viewer or start a new run.
              </div>
              <div class="success-actions">
                <button class="btn primary" id="openInViewerBtn">Open in Image Viewer</button>
                <button class="btn secondary" id="resetWorkflowBtn">Start New Run</button>
              </div>
            </div>
          </div>

          <div class="navigation-buttons">
            <button class="btn secondary" id="step4Back">Back</button>
            <button class="btn primary" id="runInferenceBtn" disabled>
              <span class="btn-glyph">&#9658;</span>
              Run Segmentation
            </button>
          </div>
        </div>
      </div>
    `;
  }
}

export default Templates;
