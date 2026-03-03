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
      <div class="segmentation-module">
        <!-- Module Header (using BaseModule helper) -->
        ${renderHeader()}

        <!-- Step Navigation (using BaseModule helper) -->
        ${renderStepNav()}

        <!-- Main Content Area -->
        <div class="main-content">
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
        <h2>Step 1: Training Data or Model Selection</h2>
        <p>Either upload training data to train a new model, or import a previously trained model.</p>

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
              <!-- 2D / 2.5D Mode Toggle (right-aligned in header) -->
              <div class="mode-toggle-section" id="segModeToggleSection">
                <div class="mode-toggle-container">
                  <span class="mode-label mode-label-left active">2D</span>
                  <label class="mode-toggle-switch">
                    <input type="checkbox" id="seg-mode-toggle">
                    <span class="mode-toggle-slider"></span>
                  </label>
                  <span class="mode-label mode-label-right">2.5D</span>
                  ${this.renderHelpIcon('segmentation.step1.mode')}
                </div>
              </div>
            </div>
            <div class="workflow-body">
              <div class="section-card-inner">
                <!-- FileSelector components will be inserted here -->
                <div id="rawImagesSelectorContainer"></div>
                <div id="annotationsSelectorContainer"></div>

                <!-- Direction-Aware Detection (auto-shown when direction volume found) -->
                <div id="directionAwareSection" style="display: none;">
                  <div class="filament-annotation-row">
                    <label class="checkbox-inline">
                      <input type="checkbox" id="useFilamentAnnotations" checked>
                      <span>Use filament annotations</span>
                    </label>
                    <span class="filament-info-text" id="directionVolumeInfo"></span>
                  </div>
                </div>

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
    `;
  }

  /**
   * Render Step 2: Configuration
   */
  static renderStep2() {
    return `
      <!-- Step 2: Configuration -->
      <div class="step-content" id="step2">
        <h2>Step 2: Training Configuration</h2>
        <p>Configure your model and training parameters.</p>

        <div class="config-form">
          <div class="config-group">
            <h3>Dataset Configuration</h3>
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
            <h3>Model Architecture</h3>
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
            <h3>Training Parameters</h3>
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

          <!-- Direction-Aware Training Config (visible when filament annotations active) -->
          <div class="config-group" id="directionConfigGroup" style="display: none;">
            <h3>Direction-Aware Training</h3>
            <div class="form-field">
              <label for="contextSlices">Input Slices${this.renderHelpIcon('segmentation.config.context-slices')}</label>
              <select id="contextSlices">
                <option value="3" selected>3</option>
                <option value="5">5</option>
                <option value="7">7</option>
              </select>
            </div>
            <div class="form-field">
              <label for="alpha">Alpha (orientation weight)${this.renderHelpIcon('segmentation.config.alpha')}</label>
              <input type="number" id="alpha" value="1.0" min="0" max="10" step="0.1">
            </div>
            <div class="form-field">
              <label for="lambdaDir">Lambda Dir (direction loss weight)${this.renderHelpIcon('segmentation.config.lambda-dir')}</label>
              <input type="number" id="lambdaDir" value="0.3" min="0" max="5" step="0.05">
            </div>
          </div>

          <!-- Context Slices Only (visible when 2.5D mode without direction volume) -->
          <div class="config-group" id="contextSlicesOnlyGroup" style="display: none;">
            <h3>2.5D Configuration</h3>
            <div class="form-field">
              <label for="contextSlicesOnly">Input Slices${this.renderHelpIcon('segmentation.config.context-slices')}</label>
              <select id="contextSlicesOnly">
                <option value="3" selected>3</option>
                <option value="5">5</option>
                <option value="7">7</option>
              </select>
            </div>
          </div>
        </div>

        <div class="navigation-buttons">
          <button class="btn secondary" id="step2Back">Previous</button>
          <button class="btn" id="step2Next">Next: Training</button>
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
        <h2>Step 3: Training Progress ${this.renderHelpIcon('segmentation.step3')}</h2>

        <!-- Training Container: Shows button initially, then progress -->
        <div class="training-status">
          <!-- Initial state: Show start button -->
          <div id="trainingActionContent" class="training-start-section">
            <h3 class="training-title">Ready to Train Your Model</h3>
            <p class="training-subtitle">
              Your configuration has been saved. Click below to start training your U-Net model.
            </p>
            <button class="btn btn-large primary" id="startTrainingBtn">
              <span class="btn-icon">&#9658;</span>
              Start Training
            </button>
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
            <button class="btn btn-danger" id="cancelTrainingBtn" style="margin-top: 16px;">
              Cancel Training
            </button>
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
          <!-- Direction sub-loss metrics (hidden by default, shown during direction-aware training) -->
          <div class="metric-card direction-metric" id="trainSegLossCard" style="display: none;">
            <div class="metric-value" id="trainSegLoss">--</div>
            <div class="metric-label">Train Seg Loss</div>
          </div>
          <div class="metric-card direction-metric" id="trainDirLossCard" style="display: none;">
            <div class="metric-value" id="trainDirLoss">--</div>
            <div class="metric-label">Train Dir Loss</div>
          </div>
          <div class="metric-card direction-metric" id="valSegLossCard" style="display: none;">
            <div class="metric-value" id="valSegLoss">--</div>
            <div class="metric-label">Val Seg Loss</div>
          </div>
          <div class="metric-card direction-metric" id="valDirLossCard" style="display: none;">
            <div class="metric-value" id="valDirLoss">--</div>
            <div class="metric-label">Val Dir Loss</div>
          </div>
        </div>

        <div class="charts-container">
          <div class="chart-container">
            <h4>Loss Curves ${this.renderHelpIcon('segmentation.step3.loss-curves')}</h4>
            <div style="position: relative; height: 220px; margin-top: 40px;">
              <canvas id="lossChart"></canvas>
            </div>
          </div>
          <div class="chart-container">
            <h4>Dice Score ${this.renderHelpIcon('segmentation.step3.dice-score')}</h4>
            <div style="position: relative; height: 220px; margin-top: 40px;">
              <canvas id="diceChart"></canvas>
            </div>
          </div>
        </div>

        <div class="navigation-buttons">
          <button class="btn secondary" id="trainingBackBtn">Previous</button>
          <button class="btn" id="trainingNextBtn" disabled>Next: Inference</button>
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
        <h2>Step 4: Run Inference ${this.renderHelpIcon('segmentation.step4')}</h2>

        <div class="model-info">
          <h3>Trained Model Ready</h3>
          <p>Your model has been trained successfully. Select data below to run segmentation.</p>
        </div>

        <div class="inference-section" style="margin-top: 30px;">
          <!-- FileSelector component will be inserted here -->
          <div id="inferenceSelectorContainer"></div>

          <button class="btn" id="runInferenceBtn" disabled style="margin-top: 20px;">
            Run Segmentation
          </button>

          <!-- Inference Progress Display -->
          <div id="inferenceProgressContainer" style="display: none; margin-top: 25px; padding: 20px; background: #f6f8fa; border-radius: 8px; border: 1px solid #d1d5da;">
            <h4 style="margin: 0 0 15px 0; font-size: 16px; color: #24292e;">Running Inference...</h4>

            <div style="margin-bottom: 12px;">
              <div style="display: flex; justify-content: space-between; margin-bottom: 5px; font-size: 14px; color: #586069;">
                <span>Progress: <span id="currentSlice">0</span> / <span id="totalSlices">0</span> slices</span>
                <span id="inferenceProgressPercent">0%</span>
              </div>
              <div style="width: 100%; height: 8px; background: #e1e4e8; border-radius: 4px; overflow: hidden;">
                <div id="inferenceProgressBar" style="width: 0%; height: 100%; background: var(--accent-primary, #EB1F17); transition: width 0.3s; border-radius: 4px;"></div>
              </div>
            </div>

            <div style="font-size: 13px; color: #586069;">
              <span id="inferenceStatusText">Processing your data...</span>
            </div>
          </div>

          <!-- Inference Completion Section -->
          <div id="inferenceCompletionSection" class="completion-section" style="display: none; margin-top: 25px; padding: 25px; background: var(--bg-secondary); border-radius: 12px; border: 1px solid var(--success-color); text-align: center;">
            <h4 style="margin: 0 0 10px 0; font-size: 20px; color: var(--text-primary);">Segmentation Complete</h4>
            <p style="margin: 0 0 20px 0; font-size: 14px; color: var(--text-secondary);">Your segmentation results are ready. View them in the Image Viewer or start a new analysis.</p>
            <div class="completion-actions" style="display: flex; gap: 12px; justify-content: center; flex-wrap: wrap;">
              <button class="btn" id="openInViewerBtn" style="background: var(--accent-primary); color: var(--text-on-accent);">Open in Image Viewer</button>
              <button class="btn secondary" id="resetWorkflowBtn">Start New Analysis</button>
            </div>
          </div>
        </div>

        <div class="navigation-buttons">
          <button class="btn secondary" id="step4Back">Previous</button>
          <div></div>
        </div>
      </div>
    `;
  }
}

export default Templates;
