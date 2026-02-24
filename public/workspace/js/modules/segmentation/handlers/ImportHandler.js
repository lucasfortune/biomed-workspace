/**
 * ImportHandler.js - Model Import Functionality for Segmentation Module
 *
 * Handles pretrained model import, validation, and session storage.
 * Extracted from SegmentationModule.js for better maintainability.
 */

import { FileSelector } from '/workspace/js/core/components/index.js';
import Templates from '../templates/Templates.js';
import SegmentationAPI from '../SegmentationAPI.js';

class ImportHandler {
  /**
   * @param {SegmentationModule} module - Reference to the parent module
   */
  constructor(module) {
    this.module = module;
  }

  /**
   * Initialize import model FileSelectors
   */
  async initializeImportSelectors() {
    const importContent = document.getElementById('importModelContent');
    if (!importContent) return;

    // Check if already initialized
    if (this.module.importSelectorsInitialized) return;

    console.log('[ImportHandler] Initializing import selectors...');

    // Fetch recent training results
    let recentResults = [];
    try {
      const api = new SegmentationAPI();
      const result = await api.getRecentTrainingResults();
      if (result.success) {
        recentResults = result.results || [];
        console.log('[ImportHandler] Recent results:', recentResults);
      }
    } catch (error) {
      console.error('[ImportHandler] Error fetching recent results:', error);
    }

    // Render import section HTML with placeholder containers
    importContent.innerHTML = this.renderImportSectionContent();

    // Initialize Config FileSelector
    const configContainer = document.getElementById('importConfigSelector');
    if (configContainer) {
      this.module.importSelectors.config = new FileSelector({
        id: 'import_config',
        fileType: 'models',
        filterTags: ['config', 'segmentation'],
        title: 'Training Configuration',
        icon: '⚙️',
        helpIconHtml: Templates.renderHelpIcon('segmentation.step1.config-file'),
        showTestData: false,
        accept: '.json',
        stateManager: this.module.state,
        recentResults: this.filterRecentResultsForConfig(recentResults),
        onSelect: (fileInfo) => this.onImportFileSelected('config', fileInfo)
      });
      configContainer.innerHTML = this.module.importSelectors.config.render();
      this.module.importSelectors.config.init();
    }

    // Initialize Model FileSelector
    const modelContainer = document.getElementById('importModelSelector');
    if (modelContainer) {
      this.module.importSelectors.model = new FileSelector({
        id: 'import_model',
        fileType: 'models',
        title: 'Model Weights',
        icon: '🧠',
        helpIconHtml: Templates.renderHelpIcon('segmentation.step1.model-file'),
        showTestData: false,
        accept: '.pth',
        stateManager: this.module.state,
        recentResults: this.filterRecentResultsForModel(recentResults),
        onSelect: (fileInfo) => this.onImportFileSelected('model', fileInfo)
      });
      modelContainer.innerHTML = this.module.importSelectors.model.render();
      this.module.importSelectors.model.init();
    }

    this.module.importSelectorsInitialized = true;
    console.log('[ImportHandler] Import selectors initialized');
  }

  /**
   * Render import model section HTML with placeholder containers for FileSelectors
   */
  renderImportSectionContent() {
    return `
      <div class="section-card-inner">
        <div id="importConfigSelector"></div>
        <div id="importModelSelector"></div>
        <div id="importValidationResult" class="validation-result"></div>
      </div>
    `;
  }

  /**
   * Filter recent results for config file selector
   * @param {Array} results - Recent training results
   * @returns {Array} Formatted options for config selector
   */
  filterRecentResultsForConfig(results) {
    return results.map(r => ({
      label: `Training ${r.trainingId.substring(0, 8)}... (${r.isTestData ? 'Test Data' : 'Custom'})`,
      value: r.configPath,
      trainingId: r.trainingId
    }));
  }

  /**
   * Filter recent results for model file selector
   * @param {Array} results - Recent training results
   * @returns {Array} Formatted options for model selector
   */
  filterRecentResultsForModel(results) {
    return results.map(r => ({
      label: `Training ${r.trainingId.substring(0, 8)}... (${r.isTestData ? 'Test Data' : 'Custom'})`,
      value: r.modelPath,
      trainingId: r.trainingId
    }));
  }

  /**
   * Handle import file selection
   * @param {string} field - 'model' or 'config'
   * @param {Object|null} fileInfo - Selected file info
   */
  async onImportFileSelected(field, fileInfo) {
    console.log(`[ImportHandler] Import file selected for ${field}:`, fileInfo);

    this.module.importFiles[field] = fileInfo;

    if (!fileInfo) {
      // File deselected
      this.module.importValidation[field] = { valid: false, result: null };
      this.updateImportValidationDisplay(field);
      this.checkOverallImportValidation();
      return;
    }

    // Show loading state
    this.updateImportValidationDisplay(field, 'loading');

    // Check if both files are now selected
    if (this.module.importFiles.model && this.module.importFiles.config) {
      try {
        // Validate both files together
        const api = new SegmentationAPI();
        const result = await api.validateImportedModel(
          this.module.importFiles.model.path || this.module.importFiles.model.value,
          this.module.importFiles.config.path || this.module.importFiles.config.value
        );

        console.log('[ImportHandler] Validation result:', result);

        if (result.success && result.valid) {
          this.module.importValidation.model = { valid: true, result };
          this.module.importValidation.config = { valid: true, result };
          this.module.importedModelConfig = result.configData;
        } else {
          this.module.importValidation.model = { valid: false, result };
          this.module.importValidation.config = { valid: false, result };
        }

        this.updateImportValidationDisplay('model');
        this.updateImportValidationDisplay('config');
      } catch (error) {
        console.error(`[ImportHandler] Import validation error:`, error);
        this.module.importValidation[field] = { valid: false, result: { errors: [error.message] } };
        this.updateImportValidationDisplay(field);
      }
    }

    this.checkOverallImportValidation();
  }

  /**
   * Update import validation display for a field
   * @param {string} field - 'model' or 'config'
   * @param {string} [state] - 'loading' for loading state
   */
  updateImportValidationDisplay(field, state) {
    const containerId = field === 'model' ? 'importModelValidation' : 'importConfigValidation';
    const container = document.getElementById(containerId);
    if (!container) return;

    if (state === 'loading') {
      container.innerHTML = `<div class="import-validation-loading">⏳ Validating...</div>`;
      return;
    }

    const validation = this.module.importValidation[field];
    if (!validation || !this.module.importFiles[field]) {
      container.innerHTML = '';
      return;
    }

    if (validation.valid) {
      container.innerHTML = `<div class="import-validation-success">✓ Valid</div>`;
    } else if (validation.result?.errors) {
      container.innerHTML = `<div class="import-validation-error">✗ ${validation.result.errors.join(', ')}</div>`;
    }
  }

  /**
   * Check overall import validation and update UI
   */
  checkOverallImportValidation() {
    const modelValid = this.module.importValidation.model?.valid || false;
    const configValid = this.module.importValidation.config?.valid || false;

    this.module.importValidated = modelValid && configValid;

    // Update overall validation display
    const overallContainer = document.getElementById('importValidationResult');
    if (overallContainer) {
      if (this.module.importValidated) {
        const configInfo = this.module.importedModelConfig;
        const modeSummary = this._formatModeSummary(configInfo);
        overallContainer.innerHTML = `
          <div class="overall-import-validation success">
            <strong>✓ Model Ready for Inference</strong>
            <p style="margin: 8px 0 0 0; font-size: 13px; color: #28a745;">
              Features: ${configInfo?.features || 'N/A'} | Layers: ${configInfo?.num_layers || 'N/A'} | Classes: ${configInfo?.num_classes || 'N/A'}
            </p>
            ${modeSummary ? `<p style="margin: 4px 0 0 0; font-size: 13px; color: #28a745;">${modeSummary}</p>` : ''}
          </div>
        `;
      } else if (this.module.importFiles.model && this.module.importFiles.config) {
        const errors = this.module.importValidation.model?.result?.errors ||
                      this.module.importValidation.config?.result?.errors || [];
        if (errors.length > 0) {
          overallContainer.innerHTML = `
            <div class="overall-import-validation error">
              <strong>✗ Validation Failed</strong>
              <p style="margin: 8px 0 0 0; font-size: 13px;">${errors.join(', ')}</p>
            </div>
          `;
        } else {
          overallContainer.innerHTML = '';
        }
      } else {
        overallContainer.innerHTML = '';
      }
    }

    this.module.updateStep1NextButton();
    this.module.stateHandler.saveState();
  }

  /**
   * Store imported model info in session for inference
   */
  async storeImportedModelInSession() {
    try {
      const modelPath = this.module.importFiles.model?.path || this.module.importFiles.model?.value;
      const configPath = this.module.importFiles.config?.path || this.module.importFiles.config?.value;

      if (!modelPath || !configPath) {
        throw new Error('Model and config paths are required');
      }

      const api = new SegmentationAPI();
      const result = await api.storeImportedModel(modelPath, configPath);

      if (!result.success) {
        throw new Error(result.error || 'Failed to store imported model');
      }

      this.module.state.notify('success', 'Model imported successfully');
      console.log('[ImportHandler] Imported model stored in session');

    } catch (error) {
      console.error('[ImportHandler] Error storing imported model:', error);
      this.module.state.notify('error', `Import failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Format a human-readable mode summary from config data
   * @param {Object} configInfo - The config.json contents
   * @returns {string} Formatted summary or empty string
   */
  _formatModeSummary(configInfo) {
    if (!configInfo) return '';
    const mode = configInfo.mode;
    if (mode === 'direction_aware') {
      const cs = configInfo.context_slices || 3;
      const alpha = configInfo.alpha ?? 'N/A';
      const lambda = configInfo.lambda_dir ?? 'N/A';
      return `Mode: 2.5D Direction-Aware | Input Slices: ${cs} | Alpha: ${alpha} | Lambda Dir: ${lambda}`;
    } else if (mode === '2.5d') {
      const cs = configInfo.context_slices || 3;
      return `Mode: 2.5D | Input Slices: ${cs}`;
    } else if (mode === '2d') {
      return 'Mode: 2D';
    }
    // Fallback for models trained before mode field was added
    return '';
  }
}

export default ImportHandler;
