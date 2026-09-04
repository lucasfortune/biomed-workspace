/**
 * FileHandler.js - File Management for DL Denoising Module
 *
 * Handles file selection, upload, validation, and method selection.
 */

import { FileSelector, ValidationDisplay } from '/workspace/js/core/components/index.js';
import Templates from '../templates/Templates.js';

class FileHandler {
  /**
   * @param {DLDenoisingModule} module - Reference to the parent module
   */
  constructor(module) {
    this.module = module;

    // Import state - single config, model per stage
    this.importSelectors = {
      config: null,        // Shared config file selector
      stage1Model: null,   // Stage 1 model selector
      stage2Model: null    // Stage 2 model selector (autoStructN2V only)
    };

    // Import file selection state
    this.importFiles = {
      config: null,        // Shared config file
      stage1Model: null,   // Stage 1 model file
      stage2Model: null    // Stage 2 model file (autoStructN2V only)
    };

    // Import validation state
    this.importValidation = {
      config: { valid: false, result: null },   // Config validation
      stage1: { valid: false, result: null },   // Stage 1 model validation
      stage2: { valid: false, result: null }    // Stage 2 model validation
    };

    // Parsed config data (loaded from config file)
    this.parsedConfig = null;
  }

  /**
   * Handle denoising method change
   * @param {string} method - Selected method ('n2v' or 'autostructn2v')
   */
  onMethodChange(method) {
    console.log('[FileHandler] Method changed:', method);
    this.module.selectedMethod = method;
    this.module.methodSelected = true;

    // Show workflow selection section when method is selected
    const workflowSection = document.getElementById('workflowSelectionSection');
    if (workflowSection) {
      workflowSection.style.display = 'block';
    }

    // Update import section content based on method (placeholder for Phase 7.3)
    this.updateImportSectionContent(method);

    this.updateNextButton();
  }

  /**
   * Handle workflow section toggle (train vs import)
   * @param {string} workflow - 'train' or 'import'
   */
  onWorkflowSectionToggle(workflow) {
    console.log('[FileHandler] Workflow section toggled:', workflow);

    const trainSection = document.getElementById('trainFromScratchSection');
    const importSection = document.getElementById('importModelSection');

    if (!trainSection || !importSection) {
      console.warn('[FileHandler] Workflow sections not found');
      return;
    }

    // Mutually exclusive toggle - opening one closes the other
    if (workflow === 'train') {
      const isAlreadyActive = trainSection.classList.contains('active');
      importSection.classList.remove('active');

      if (isAlreadyActive) {
        // Clicking active section closes it
        trainSection.classList.remove('active');
        this.module.workflowMode = null;
      } else {
        trainSection.classList.add('active');
        this.module.workflowMode = 'train';
      }
    } else if (workflow === 'import') {
      const isAlreadyActive = importSection.classList.contains('active');
      trainSection.classList.remove('active');

      if (isAlreadyActive) {
        // Clicking active section closes it
        importSection.classList.remove('active');
        this.module.workflowMode = null;
      } else {
        importSection.classList.add('active');
        this.module.workflowMode = 'import';
      }
    }

    console.log('[FileHandler] Workflow mode set to:', this.module.workflowMode);
    this.updateNextButton();
  }

  /**
   * Update import section content based on selected method
   * @param {string} method - 'n2v' or 'autostructn2v'
   */
  updateImportSectionContent(method) {
    const importContent = document.getElementById('importModelContent');
    if (!importContent) return;

    // Clear previous selectors
    this.destroyImportSelectors();

    // Reset import state
    this.importFiles = {
      config: null,
      stage1Model: null,
      stage2Model: null
    };
    this.importValidation = {
      config: { valid: false, result: null },
      stage1: { valid: false, result: null },
      stage2: { valid: false, result: null }
    };
    this.parsedConfig = null;
    this.module.importValidated = false;

    // Render appropriate template
    if (method === 'n2v') {
      importContent.innerHTML = Templates.renderN2VImportSection();
    } else if (method === 'autostructn2v') {
      importContent.innerHTML = Templates.renderAutoStructN2VImportSection();
    }

    // Initialize FileSelectors after content is rendered
    // Delay to ensure DOM is ready
    setTimeout(() => this.initializeImportSelectors(method), 0);
  }

  /**
   * Destroy existing import selectors
   */
  destroyImportSelectors() {
    for (const key of Object.keys(this.importSelectors)) {
      if (this.importSelectors[key]) {
        // FileSelector doesn't have a destroy method, just null it
        this.importSelectors[key] = null;
      }
    }
  }

  /**
   * Initialize FileSelectors for import section
   * @param {string} method - 'n2v' or 'autostructn2v'
   */
  async initializeImportSelectors(method) {
    // Fetch recent results for the optgroup
    let recentResults = [];
    try {
      const result = await this.module.api.getRecentResults();
      if (result.success) {
        recentResults = result.results || [];
      }
    } catch (error) {
      console.error('[FileHandler] Error fetching recent results:', error);
    }

    // Shared Config Selector
    const configContainer = document.getElementById('importConfigSelector');
    if (configContainer) {
      this.importSelectors.config = new FileSelector({
        id: 'import_config',
        fileType: 'models',
        filterTags: ['config', 'denoising'],
        title: 'Training Configuration',
        icon: 'settings',
        helpIconHtml: Templates.renderHelpIcon('denoising-dl.step1.import.config'),
        accept: '.json',
        stateManager: this.module.state,
        recentResults: this.filterRecentResultsForConfig(recentResults),
        onSelect: (fileInfo) => this.onImportFileSelected('config', fileInfo)
      });
      configContainer.innerHTML = this.importSelectors.config.render();
      this.importSelectors.config.init();
    }

    // Model selector. Routed checkpoints (new trainings) are a single model
    // for both methods; the legacy Stage 2 selector below only serves old
    // two-stage model pairs.
    const stage1Title = 'Model Weights';
    const stage1ModelContainer = document.getElementById('importStage1ModelSelector');
    if (stage1ModelContainer) {
      this.importSelectors.stage1Model = new FileSelector({
        id: 'import_stage1_model',
        fileType: 'models',
        title: stage1Title,
        icon: 'model',
        helpIconHtml: Templates.renderHelpIcon('denoising-dl.step1.import.model'),
        accept: '.pth',
        stateManager: this.module.state,
        recentResults: this.filterRecentResultsForStage(recentResults, 'stage1', 'model'),
        onSelect: (fileInfo) => this.onImportFileSelected('stage1Model', fileInfo)
      });
      stage1ModelContainer.innerHTML = this.importSelectors.stage1Model.render();
      this.importSelectors.stage1Model.init();
    }

    // For autoStructN2V, also add Stage 2 model selector
    if (method === 'autostructn2v') {
      const stage2ModelContainer = document.getElementById('importStage2ModelSelector');
      if (stage2ModelContainer) {
        this.importSelectors.stage2Model = new FileSelector({
          id: 'import_stage2_model',
          fileType: 'models',
          title: 'Legacy Stage 2 Model (optional; old two-stage runs only)',
          icon: 'model',
          helpIconHtml: '',
          accept: '.pth',
          stateManager: this.module.state,
          recentResults: this.filterRecentResultsForStage(recentResults, 'stage2', 'model'),
          onSelect: (fileInfo) => this.onImportFileSelected('stage2Model', fileInfo)
        });
        stage2ModelContainer.innerHTML = this.importSelectors.stage2Model.render();
        this.importSelectors.stage2Model.init();
      }
    }
  }

  /**
   * Filter recent results for config files
   * @param {Array} results - Recent training results
   * @returns {Array} Filtered options for FileSelector
   */
  filterRecentResultsForConfig(results) {
    const options = [];

    for (const result of results) {
      // Config path is at the training level, not stage level
      const configPath = result.configPath;
      if (!configPath) continue;

      // Create a readable label
      const date = new Date(result.completedAt);
      const dateStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
      const methodLabel = result.method === 'autostructn2v' ? 'autoStructN2V' : 'N2V';

      options.push({
        value: configPath,
        label: `${methodLabel} - ${dateStr}`,
        path: configPath,
        trainingId: result.trainingId
      });
    }

    return options;
  }

  /**
   * Filter recent results for a specific stage model
   * @param {Array} results - Recent training results
   * @param {string} stage - 'stage1' or 'stage2'
   * @param {string} fileType - 'model' (config no longer used here)
   * @returns {Array} Filtered options for FileSelector
   */
  filterRecentResultsForStage(results, stage, fileType) {
    const options = [];

    for (const result of results) {
      // Routed sessions expose one model under `model`; legacy shapes kept
      // stage1/stage2 sub-objects. The Stage 2 selector only matches legacy.
      const stageData = stage === 'stage1'
        ? (result.model || result.stage1)
        : result.stage2;
      if (!stageData) continue;

      const filePath = stageData.modelPath;
      if (!filePath) continue;

      // Create a readable label
      const date = new Date(result.completedAt);
      const dateStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
      const methodLabel = result.method === 'autostructn2v' ? 'autoStructN2V' : 'N2V';

      options.push({
        value: filePath,
        label: `${methodLabel} - ${dateStr}`,
        path: filePath,
        trainingId: result.trainingId
      });
    }

    return options;
  }

  /**
   * Handle import file selection
   * @param {string} field - Field name (config, stage1Model, stage2Model)
   * @param {Object|null} fileInfo - Selected file info or null
   */
  async onImportFileSelected(field, fileInfo) {
    console.log(`[FileHandler] Import file selected for ${field}:`, fileInfo);

    this.importFiles[field] = fileInfo;

    if (field === 'config') {
      // Config file selected - validate and parse it
      if (fileInfo) {
        await this.validateAndParseConfig(fileInfo);
      } else {
        // Config deselected - clear config validation and re-validate models
        this.importValidation.config = { valid: false, result: null };
        this.parsedConfig = null;
        this.updateConfigValidationDisplay();
        // Re-validate models without config
        await this.revalidateModels();
      }
    } else if (field === 'stage1Model') {
      // Stage 1 model selected - validate against config
      if (fileInfo && this.importValidation.config.valid) {
        await this.validateModel('stage1', fileInfo);
      } else {
        this.importValidation.stage1 = { valid: false, result: null };
        this.updateModelValidationDisplay('stage1');
      }
    } else if (field === 'stage2Model') {
      // Stage 2 model selected - validate against config
      if (fileInfo && this.importValidation.config.valid) {
        await this.validateModel('stage2', fileInfo);
      } else {
        this.importValidation.stage2 = { valid: false, result: null };
        this.updateModelValidationDisplay('stage2');
      }
    }

    // Update overall import validation and Next button
    this.checkOverallImportValidation();
    this.updateNextButton();
  }

  /**
   * Re-validate models after config change
   */
  async revalidateModels() {
    if (this.importFiles.stage1Model && this.importValidation.config.valid) {
      await this.validateModel('stage1', this.importFiles.stage1Model);
    } else {
      this.importValidation.stage1 = { valid: false, result: null };
      this.updateModelValidationDisplay('stage1');
    }

    if (this.importFiles.stage2Model && this.importValidation.config.valid) {
      await this.validateModel('stage2', this.importFiles.stage2Model);
    } else {
      this.importValidation.stage2 = { valid: false, result: null };
      this.updateModelValidationDisplay('stage2');
    }
  }

  /**
   * Validate and parse the config file
   * @param {Object} fileInfo - Config file info
   */
  async validateAndParseConfig(fileInfo) {
    const validationEl = document.getElementById('importConfigValidation');
    if (validationEl) {
      validationEl.innerHTML = '<div class="validation-loading">Validating config...</div>';
    }

    try {
      // Call backend to validate and parse the config file
      const result = await this.module.api.validateConfig(fileInfo.path);

      if (result.success && result.valid) {
        this.importValidation.config = { valid: true, result: result };
        this.parsedConfig = result.configData;
        this.updateConfigValidationDisplay();

        // Re-validate any already selected models
        await this.revalidateModels();
      } else {
        this.importValidation.config = { valid: false, result: result };
        this.parsedConfig = null;
        this.updateConfigValidationDisplay();
      }
    } catch (error) {
      console.error('[FileHandler] Error validating config:', error);
      this.importValidation.config = {
        valid: false,
        result: { errors: [error.message] }
      };
      this.parsedConfig = null;
      this.updateConfigValidationDisplay();
    }
  }

  /**
   * Validate a model file against the parsed config
   * @param {string} stage - 'stage1' or 'stage2'
   * @param {Object} fileInfo - Model file info
   */
  async validateModel(stage, fileInfo) {
    const validationEl = document.getElementById(`import${stage.charAt(0).toUpperCase() + stage.slice(1)}Validation`);
    if (validationEl) {
      validationEl.innerHTML = '<div class="validation-loading">Validating model...</div>';
    }

    try {
      // Call backend to validate the model file
      const result = await this.module.api.validateModel(
        fileInfo.path,
        this.importFiles.config?.path,
        stage
      );

      this.importValidation[stage] = {
        valid: result.success && result.valid,
        result: result
      };

      this.updateModelValidationDisplay(stage);

    } catch (error) {
      console.error(`[FileHandler] Error validating ${stage} model:`, error);
      this.importValidation[stage] = {
        valid: false,
        result: { errors: [error.message] }
      };
      this.updateModelValidationDisplay(stage);
    }
  }

  /**
   * Update config validation display
   */
  updateConfigValidationDisplay() {
    // The import section is re-rendered on method change, so the display
    // is looked up fresh each time rather than cached
    const display = new ValidationDisplay('importConfigValidation');
    if (!display.getContainer()) return;

    const validation = this.importValidation.config;

    if (!validation.result) {
      display.hide();
      return;
    }

    if (validation.valid) {
      const configData = this.parsedConfig || {};
      const method = configData.method === 'autostructn2v' ? 'autoStructN2V' : 'N2V';
      const hasStage2 = configData.stage2 !== undefined;
      display.showSuccess(`Valid ${method} configuration`,
        hasStage2 ? 'Two-stage pipeline' : 'Single-stage pipeline');
    } else {
      const errors = validation.result.errors || ['Config validation failed'];
      display.showError('Invalid configuration', errors.join(', '));
    }
  }

  /**
   * Update model validation display for a stage
   * @param {string} stage - 'stage1' or 'stage2'
   */
  updateModelValidationDisplay(stage) {
    const stageCapitalized = stage.charAt(0).toUpperCase() + stage.slice(1);
    const display = new ValidationDisplay(`import${stageCapitalized}Validation`);
    if (!display.getContainer()) return;

    const validation = this.importValidation[stage];

    if (!validation.result) {
      // Check if config is valid - if not, show hint
      if (!this.importValidation.config.valid && this.importFiles[`${stage}Model`]) {
        display.showWarning('Select a valid config file first');
      } else {
        display.hide();
      }
      return;
    }

    if (validation.valid) {
      const info = validation.result.modelInfo || {};
      display.showSuccess('Valid model file', info.size ? `Size: ${info.size}` : null);
    } else {
      const errors = validation.result.errors || ['Model validation failed'];
      display.showError('Invalid model file', errors.join(', '));
    }
  }

  /**
   * Check overall import validation status
   */
  checkOverallImportValidation() {
    const method = this.module.selectedMethod;

    // Config must always be valid
    if (!this.importValidation.config.valid) {
      this.module.importValidated = false;
      console.log('[FileHandler] Overall import validated:', this.module.importValidated, '(config invalid)');
      return;
    }

    if (method === 'n2v' || method === 'autostructn2v') {
      // Config + the model file. Routed autoStructN2V checkpoints are a
      // SINGLE model; the legacy Stage 2 selector is optional and only used
      // for old two-stage model pairs (when provided AND valid, inference
      // runs the legacy sequential path).
      const stage2Provided = !!this.importFiles.stage2Model;
      this.module.importValidated = this.importValidation.stage1.valid &&
                                     (!stage2Provided || this.importValidation.stage2.valid);
    } else {
      this.module.importValidated = false;
    }

    console.log('[FileHandler] Overall import validated:', this.module.importValidated);
  }

  /**
   * Handle file selection from file selector component
   * @param {Object|null} fileInfo - Selected file info or null for deselection
   */
  async onFileSelected(fileInfo) {
    console.log('[FileHandler] File selected:', fileInfo);

    if (!fileInfo) {
      // Deselection
      this.module.uploadedFile = null;
      this.module.fileValidated = false;
      this.module.validationResult = null;
      this.updateNextButton();
      return;
    }

    // Regular file selection - validate the file
    this.module.uploadedFile = fileInfo;
    await this.validateFile(fileInfo.path);
  }

  /**
   * Handle file upload completion
   * @param {File} file - Original file object
   * @param {Object} uploadedFile - Upload result from server
   */
  async onFileUploaded(file, uploadedFile) {
    console.log('[FileHandler] File uploaded:', uploadedFile);

    this.module.uploadedFile = {
      id: uploadedFile.id,
      name: uploadedFile.name || file.name,
      path: uploadedFile.path
    };

    // Refresh workspace file browser
    if (window.workspace?.fileBrowser) {
      window.workspace.fileBrowser.refresh();
    }

    // Validate the uploaded file
    await this.validateFile(uploadedFile.path);
  }

  /**
   * Validate a file for DL denoising
   * @param {string} filePath - Path to the file to validate
   */
  async validateFile(filePath) {
    console.log('[FileHandler] Validating file:', filePath);

    this.module.validationDisplay.showLoading('Validating file for DL denoising...');
    this.module.fileValidated = false;
    this.module.validationResult = null;

    try {
      const result = await this.module.api.validateFile(filePath);
      console.log('[FileHandler] Validation result:', result);

      this.module.validationResult = result;

      if (result.valid) {
        // Build details array
        const details = [
          { label: 'Filename', value: result.info?.filename || this.module.uploadedFile?.name },
          { label: 'Dimensions', value: `${result.info?.dimensions?.width} x ${result.info?.dimensions?.height}` },
          { label: 'Slices', value: result.info?.num_slices?.toString() },
          { label: 'Bit Depth', value: `${result.info?.bit_depth}-bit` },
          { label: 'File Size', value: result.info?.file_size_formatted }
        ];

        // Add warnings if any
        if (result.warnings && result.warnings.length > 0) {
          this.module.validationDisplay.showSuccess('File Valid (with warnings)', details);
          result.warnings.forEach(warning => {
            this.module.state.notify('warning', warning, 8000);
          });
        } else {
          this.module.validationDisplay.showSuccess('File Valid', details);
        }

        this.module.fileValidated = true;
      } else {
        // Show errors
        const errorMessages = result.errors?.join('; ') || 'Unknown validation error';
        this.module.validationDisplay.showError('Validation Failed', errorMessages);
        this.module.state.notify('error', errorMessages);
      }

    } catch (error) {
      console.error('[FileHandler] Validation error:', error);
      this.module.validationDisplay.showError('Validation Error', error.message);
      this.module.state.notify('error', `Validation failed: ${error.message}`);
    }

    this.updateNextButton();
  }

  /**
   * Update the Next button state based on file, method, and workflow selection
   */
  updateNextButton() {
    const step1Next = document.getElementById('step1Next');
    if (!step1Next) return;

    // Method must be selected
    if (!this.module.methodSelected) {
      step1Next.disabled = true;
      return;
    }

    // Workflow must be selected
    if (!this.module.workflowMode) {
      step1Next.disabled = true;
      return;
    }

    // For train workflow: file must be validated
    if (this.module.workflowMode === 'train') {
      step1Next.disabled = !this.module.fileValidated;
      return;
    }

    // For import workflow: import must be validated
    if (this.module.workflowMode === 'import') {
      step1Next.disabled = !this.module.importValidated;
      return;
    }

    step1Next.disabled = true;
  }

  /**
   * Get imported model configuration for inference
   * @returns {Object|null} Import config with model paths
   */
  getImportConfig() {
    if (!this.module.importValidated) return null;

    const config = {
      method: this.module.selectedMethod,
      configPath: this.importFiles.config?.path,
      configData: this.parsedConfig,
      stage1: {
        modelPath: this.importFiles.stage1Model?.path
      }
    };

    if (this.module.selectedMethod === 'autostructn2v') {
      config.stage2 = {
        modelPath: this.importFiles.stage2Model?.path
      };
    }

    return config;
  }
}

export default FileHandler;
