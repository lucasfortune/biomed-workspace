/**
 * DLDenoisingModule - Deep Learning Image Denoising
 *
 * Provides N2V (Noise2Void) and autoStructN2V denoising for TIFF stacks.
 * Uses self-supervised learning - no clean training data required.
 *
 * Workflow:
 * 1. Data Selection - Choose input image and denoising method
 * 2. Configure - Set training parameters
 * 3. Training - Train denoising model with real-time progress
 * 4. Inference - Apply trained model to denoise images
 */

import BaseModule from '/workspace/js/core/BaseModule.js';
import { StepNavigator, FileSelector, ValidationDisplay }
  from '/workspace/js/core/components/index.js';
import DLDenoisingAPI from './DLDenoisingAPI.js';
import CollapsibleSection from './components/CollapsibleSection.js';

class DLDenoisingModule extends BaseModule {

  constructor(stateManager) {
    super(stateManager, {
      id: 'denoising-dl',
      name: 'Deep Learning Denoising',
      cssPath: '/workspace/js/modules/denoising-dl/css/dl-denoising.css',
      steps: [
        { id: 'data', name: 'Data Selection' },
        { id: 'configure', name: 'Configure' },
        { id: 'training', name: 'Training' },
        { id: 'inference', name: 'Inference' }
      ]
    });

    // API client
    this.api = new DLDenoisingAPI();

    // Step condition flags
    this.fileValidated = false;
    this.methodSelected = false;
    this.configSaved = false;
    this.trainingComplete = false;

    // Component references
    this.stepNavigator = null;
    this.validationDisplay = null;
    this.fileSelector = null;

    // Module state
    this.uploadedFile = null;
    this.selectedMethod = null; // 'n2v' or 'autostructn2v'
    this.gpuInfo = null;
    this.validationResult = null;
    this.trainingId = null;
    this.trainingResult = null;
    this.inferenceResult = null;

    // Presets and parameter ranges (loaded from backend)
    this.presets = null;
    this.parameterRanges = null;
    this.currentPreset = 'balanced';

    // Training configuration
    this.trainingConfig = {
      stage1: {},
      stage2: {},
      maskExtractor: {}
    };

    // Collapsible sections for config
    this.configSections = {};

    // Bind methods
    this.onFileSelected = this.onFileSelected.bind(this);
    this.onFileUploaded = this.onFileUploaded.bind(this);
    this.onMethodChange = this.onMethodChange.bind(this);
    this.onPresetChange = this.onPresetChange.bind(this);
  }

  render() {
    this.container.innerHTML = `
      <div class="dl-denoising-module module-container">
        ${this.renderHeader()}
        ${this.renderStepNav()}

        <div class="step-contents">
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
                <span class="gpu-status-icon">⏳</span>
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

          <!-- Step 3: Training (placeholder for Phases 4-6) -->
          <div id="step3" class="step-content">
            <div class="step-inner">
              <h3>Training</h3>
              <p class="step-description">
                Train the denoising model on your image data.
              </p>

              <div class="section-card placeholder-section">
                <div class="placeholder-icon">🧠</div>
                <div class="placeholder-text">
                  Training functionality will be implemented in Phases 4-6.
                  <br><br>
                  This will include real-time progress tracking, loss charts,
                  and for autoStructN2V, mask visualization.
                </div>
              </div>

              <div class="navigation-buttons">
                <button id="step3Back" class="btn secondary">Back</button>
                <button id="step3Next" class="btn" disabled>Next: Inference</button>
              </div>
            </div>
          </div>

          <!-- Step 4: Inference (placeholder for Phase 7) -->
          <div id="step4" class="step-content">
            <div class="step-inner">
              <h3>Inference</h3>
              <p class="step-description">
                Apply the trained model to denoise images.
              </p>

              <div class="section-card placeholder-section">
                <div class="placeholder-icon">🔬</div>
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
        </div>
      </div>
    `;
  }

  async initialize() {
    console.log('[DLDenoisingModule] Initializing components...');

    // Initialize StepNavigator
    this.stepNavigator = new StepNavigator({
      steps: this.config.steps,
      currentStep: this.currentStep,
      onStepClick: (stepNum) => this.goToStep(stepNum),
      canNavigate: (stepNum) => this.canNavigateToStep(stepNum)
    });
    this.stepNavigator.init(this.container);

    // Initialize ValidationDisplay
    this.validationDisplay = new ValidationDisplay('validationResult');

    // Initialize FileSelector
    const fileSelectorContainer = document.getElementById('fileSelectorContainer');
    if (fileSelectorContainer) {
      this.fileSelector = new FileSelector({
        id: 'dl_denoising_input',
        fileType: 'raw_images',
        title: 'Input Image Stack',
        icon: '📁',
        showTestData: true,
        testDataOptions: [
          {
            value: 'denoising_test_data',
            label: 'Test Dataset - Denoising'
          }
        ],
        stateManager: this.state,
        onSelect: this.onFileSelected,
        onUpload: this.onFileUploaded
      });
      fileSelectorContainer.innerHTML = this.fileSelector.render();
      this.fileSelector.init();
    }

    // Set up event listeners
    this.setupEventListeners();

    // Check GPU availability
    await this.checkGPU();

    // Load configuration presets
    await this.loadPresets();

    // Expose global for onclick handlers
    window.dlDenoisingModule = this;

    console.log('[DLDenoisingModule] Initialization complete');
  }

  /**
   * Load configuration presets from backend
   */
  async loadPresets() {
    try {
      const result = await this.api.getPresets();
      if (result.success) {
        this.presets = result.presets;
        this.parameterRanges = result.parameterRanges;
        this.currentPreset = result.defaults?.preset || 'balanced';
        console.log('[DLDenoisingModule] Presets loaded:', Object.keys(this.presets));
      }
    } catch (error) {
      console.error('[DLDenoisingModule] Error loading presets:', error);
      // Use fallback defaults
      this.presets = this.getDefaultPresets();
    }
  }

  /**
   * Get fallback default presets (matches spec section 5.2)
   */
  getDefaultPresets() {
    return {
      balanced: {
        name: 'Balanced',
        description: 'Good balance between training time and quality.',
        stage1: {
          patch_size: 32,
          patches_per_image: 100,
          batch_size: 4,
          mask_percentage: 15,
          use_augmentation: true,
          features: 64,
          num_layers: 2,
          learning_rate: 0.0001,
          epochs: 100,
          early_stopping: true,
          early_stopping_patience: 10,
          use_roi: true,
          roi_threshold: 0.5,
          use_resize_conv: true,
          upsampling_mode: 'bilinear',
          masking_strategy: 0
        },
        stage2: {
          patch_size: 64,
          patches_per_image: 200,
          batch_size: 2,
          mask_percentage: 10,
          use_augmentation: true,
          features: 64,
          num_layers: 3,
          learning_rate: 0.00001,
          epochs: 100,
          early_stopping: true,
          early_stopping_patience: 10,
          use_resize_conv: true,
          upsampling_mode: 'bilinear'
        },
        maskExtractor: {
          adaptive_thresholding: true,
          base_percentile: 50,
          percentile_decay: 1.15,
          max_masked_pixels: 25
        }
      }
    };
  }

  setupEventListeners() {
    // Back to Hub
    const backButton = document.getElementById('backToHub');
    if (backButton) {
      backButton.addEventListener('click', () => window.workspace.returnToHub());
    }

    // Step navigation buttons
    document.getElementById('step1Next')?.addEventListener('click', () => this.nextStep());
    document.getElementById('step2Back')?.addEventListener('click', () => this.previousStep());
    document.getElementById('step2Next')?.addEventListener('click', () => this.nextStep());
    document.getElementById('step3Back')?.addEventListener('click', () => this.previousStep());
    document.getElementById('step3Next')?.addEventListener('click', () => this.nextStep());
    document.getElementById('step4Back')?.addEventListener('click', () => this.previousStep());
    document.getElementById('step4Finish')?.addEventListener('click', () => this.viewResults());

    // Method selector
    document.querySelectorAll('input[name="dl-method"]').forEach(radio => {
      radio.addEventListener('change', (e) => this.onMethodChange(e.target.value));
    });

    // Preset selector
    document.getElementById('presetSelector')?.addEventListener('change', (e) => {
      this.onPresetChange(e.target.value);
    });
  }

  async checkGPU() {
    const statusEl = document.getElementById('gpuStatus');
    if (!statusEl) return;

    try {
      const result = await this.api.checkGPU();
      this.gpuInfo = result;

      if (result.available) {
        statusEl.className = 'gpu-status available';
        statusEl.innerHTML = `
          <span class="gpu-status-icon">✓</span>
          <span class="gpu-status-text">
            GPU Available: ${result.device_name || 'CUDA Device'}
            <span class="gpu-status-detail">${result.memory_total_formatted || ''} VRAM</span>
          </span>
        `;
      } else {
        statusEl.className = 'gpu-status unavailable';
        statusEl.innerHTML = `
          <span class="gpu-status-icon">⚠️</span>
          <span class="gpu-status-text">
            No GPU detected - Training will use CPU
            <span class="gpu-status-detail">This may be significantly slower (10-50x)</span>
          </span>
        `;
      }
    } catch (error) {
      console.error('[DLDenoisingModule] Error checking GPU:', error);
      statusEl.className = 'gpu-status unavailable';
      statusEl.innerHTML = `
        <span class="gpu-status-icon">❓</span>
        <span class="gpu-status-text">Could not determine GPU status</span>
      `;
    }
  }

  onMethodChange(method) {
    console.log('[DLDenoisingModule] Method changed:', method);
    this.selectedMethod = method;
    this.methodSelected = true;
    this.updateNextButton();
  }

  async onFileSelected(fileInfo) {
    console.log('[DLDenoisingModule] File selected:', fileInfo);

    if (!fileInfo) {
      // Deselection
      this.uploadedFile = null;
      this.fileValidated = false;
      this.validationResult = null;
      this.updateNextButton();
      return;
    }

    // Handle test data - load it via API endpoint
    if (fileInfo.isTestData) {
      try {
        this.validationDisplay.showLoading('Loading test data...');

        const result = await this.api.loadTestData();

        if (result.success && result.file) {
          this.uploadedFile = {
            id: result.file.id,
            name: result.file.name,
            path: result.file.path,
            isTestData: true
          };

          // Validate the test data file
          await this.validateFile(result.file.path);
        } else {
          throw new Error(result.error || 'Failed to load test data');
        }
      } catch (error) {
        console.error('[DLDenoisingModule] Error loading test data:', error);
        this.validationDisplay.showError('Error', error.message);
        this.state.notify('error', `Failed to load test data: ${error.message}`);
      }
      return;
    }

    // Regular file selection - validate the file
    this.uploadedFile = fileInfo;
    await this.validateFile(fileInfo.path);
  }

  async onFileUploaded(file, uploadedFile) {
    console.log('[DLDenoisingModule] File uploaded:', uploadedFile);

    this.uploadedFile = {
      id: uploadedFile.id,
      name: uploadedFile.name || file.name,
      path: uploadedFile.path,
      isTestData: false
    };

    // Validate the uploaded file
    await this.validateFile(uploadedFile.path);
  }

  async validateFile(filePath) {
    console.log('[DLDenoisingModule] Validating file:', filePath);

    this.validationDisplay.showLoading('Validating file for DL denoising...');
    this.fileValidated = false;
    this.validationResult = null;

    try {
      const result = await this.api.validateFile(filePath);
      console.log('[DLDenoisingModule] Validation result:', result);

      this.validationResult = result;

      if (result.valid) {
        // Build details array
        const details = [
          { label: 'Filename', value: result.info?.filename || this.uploadedFile?.name },
          { label: 'Dimensions', value: `${result.info?.dimensions?.width} x ${result.info?.dimensions?.height}` },
          { label: 'Slices', value: result.info?.num_slices?.toString() },
          { label: 'Bit Depth', value: `${result.info?.bit_depth}-bit` },
          { label: 'File Size', value: result.info?.file_size_formatted }
        ];

        // Add warnings if any
        if (result.warnings && result.warnings.length > 0) {
          this.validationDisplay.showSuccess('File Valid (with warnings)', details);
          result.warnings.forEach(warning => {
            this.state.notify('warning', warning, 8000);
          });
        } else {
          this.validationDisplay.showSuccess('File Valid', details);
        }

        this.fileValidated = true;
      } else {
        // Show errors
        const errorMessages = result.errors?.join('; ') || 'Unknown validation error';
        this.validationDisplay.showError('Validation Failed', errorMessages);
        this.state.notify('error', errorMessages);
      }

    } catch (error) {
      console.error('[DLDenoisingModule] Validation error:', error);
      this.validationDisplay.showError('Validation Error', error.message);
      this.state.notify('error', `Validation failed: ${error.message}`);
    }

    this.updateNextButton();
  }

  updateNextButton() {
    const step1Next = document.getElementById('step1Next');
    if (step1Next) {
      // Both file and method must be selected
      step1Next.disabled = !(this.fileValidated && this.methodSelected);
    }
  }

  canNavigateToStep(stepNumber) {
    switch (stepNumber) {
      case 1: return true;
      case 2: return this.fileValidated && this.methodSelected;
      case 3: return this.configSaved;
      case 4: return this.trainingComplete;
      default: return false;
    }
  }

  goToStep(stepNumber) {
    super.goToStep(stepNumber);
    if (this.stepNavigator) {
      this.stepNavigator.update(stepNumber);
    }

    // Render Step 2 when navigating to it
    if (stepNumber === 2) {
      this.renderStep2Config();
    }
  }

  nextStep() {
    if (this.currentStep === 1) {
      if (!this.fileValidated) {
        this.state.notify('error', 'Please select a file first');
        return;
      }
      if (!this.methodSelected) {
        this.state.notify('error', 'Please select a denoising method');
        return;
      }
    }

    // Save config when leaving Step 2
    if (this.currentStep === 2) {
      this.saveConfig();
      this.configSaved = true;
    }

    super.nextStep();
  }

  /**
   * Render Step 2 configuration UI
   */
  renderStep2Config() {
    console.log('[DLDenoisingModule] Rendering Step 2 config for method:', this.selectedMethod);

    // Update method mode label
    const methodLabel = document.getElementById('methodModeLabel');
    if (methodLabel) {
      const isAutoStruct = this.selectedMethod === 'autostructn2v';
      methodLabel.innerHTML = isAutoStruct
        ? '<strong>(autoStructN2V - Two Stage Training)</strong>'
        : '<strong>(N2V - Single Stage Training)</strong>';
    }

    // Load preset config if not already loaded
    if (!this.trainingConfig.stage1.patch_size) {
      this.applyPreset(this.currentPreset);
    }

    // Update preset description
    this.updatePresetDescription();

    // Render configuration columns
    this.renderConfigColumns();

    // Show/hide mask extractor section
    const maskSection = document.getElementById('maskExtractorSection');
    if (maskSection) {
      if (this.selectedMethod === 'autostructn2v') {
        maskSection.style.display = 'block';
        this.renderMaskExtractorConfig();
      } else {
        maskSection.style.display = 'none';
      }
    }
  }

  /**
   * Render the configuration columns (single or dual)
   */
  renderConfigColumns() {
    const container = document.getElementById('configColumnsContainer');
    if (!container) return;

    const isDualColumn = this.selectedMethod === 'autostructn2v';

    if (isDualColumn) {
      // autoStructN2V: Two-column layout per spec 3.3.2
      // Each column has its own config form with Advanced Options inside
      container.innerHTML = `
        <div class="config-columns dual-column">
          <div class="config-column stage1-column">
            <div class="column-header">
              <h4>STAGE 1</h4>
            </div>
            <div class="column-content" id="stage1ConfigContent">
              ${this.renderStageConfigForm('stage1')}
            </div>
          </div>

          <div class="config-column stage2-column">
            <div class="column-header">
              <h4>STAGE 2</h4>
            </div>
            <div class="column-content" id="stage2ConfigContent">
              ${this.renderStageConfigForm('stage2')}
            </div>
          </div>
        </div>
      `;
    } else {
      // N2V: Single column layout matching segmentation module
      container.innerHTML = this.renderN2VConfigForm();
    }

    // Set up input change listeners
    this.setupConfigInputListeners();
  }

  /**
   * Render N2V configuration form (single column, per spec 3.3.1)
   */
  renderN2VConfigForm() {
    const config = this.trainingConfig.stage1 || {};

    return `
      <div class="config-form" data-stage="stage1">
        <div class="config-group">
          <h3>Dataset Configuration</h3>
          <div class="form-field">
            <label for="stage1_patch_size">Patch Size</label>
            <select id="stage1_patch_size" data-param="patch_size">
              <option value="32" ${config.patch_size === 32 ? 'selected' : ''}>32</option>
              <option value="48" ${config.patch_size === 48 ? 'selected' : ''}>48</option>
              <option value="64" ${config.patch_size === 64 || !config.patch_size ? 'selected' : ''}>64</option>
              <option value="96" ${config.patch_size === 96 ? 'selected' : ''}>96</option>
              <option value="128" ${config.patch_size === 128 ? 'selected' : ''}>128</option>
            </select>
          </div>
          <div class="form-field">
            <label for="stage1_patches_per_image">Patches per Image</label>
            <input type="number" id="stage1_patches_per_image" data-param="patches_per_image"
                   value="${config.patches_per_image || 100}" min="50" max="500" step="10">
          </div>
          <div class="form-field">
            <label for="stage1_batch_size">Batch Size</label>
            <select id="stage1_batch_size" data-param="batch_size">
              <option value="1" ${config.batch_size === 1 ? 'selected' : ''}>1</option>
              <option value="2" ${config.batch_size === 2 ? 'selected' : ''}>2</option>
              <option value="4" ${config.batch_size === 4 ? 'selected' : ''}>4</option>
              <option value="8" ${config.batch_size === 8 || !config.batch_size ? 'selected' : ''}>8</option>
              <option value="16" ${config.batch_size === 16 ? 'selected' : ''}>16</option>
              <option value="32" ${config.batch_size === 32 ? 'selected' : ''}>32</option>
            </select>
          </div>
          <div class="form-field">
            <label for="stage1_mask_percentage">Mask Percentage (%)</label>
            <input type="number" id="stage1_mask_percentage" data-param="mask_percentage"
                   value="${config.mask_percentage || 15}" min="5" max="30" step="1">
          </div>
          <div class="form-field checkbox-field">
            <input type="checkbox" id="stage1_use_augmentation" data-param="use_augmentation"
                   ${config.use_augmentation !== false ? 'checked' : ''}>
            <label for="stage1_use_augmentation">Apply Data Augmentation</label>
          </div>
        </div>

        <div class="config-group">
          <h3>Model Architecture</h3>
          <div class="form-field">
            <label for="stage1_features">Number of Features</label>
            <select id="stage1_features" data-param="features">
              <option value="32" ${config.features === 32 ? 'selected' : ''}>32</option>
              <option value="48" ${config.features === 48 ? 'selected' : ''}>48</option>
              <option value="64" ${config.features === 64 || !config.features ? 'selected' : ''}>64</option>
              <option value="96" ${config.features === 96 ? 'selected' : ''}>96</option>
              <option value="128" ${config.features === 128 ? 'selected' : ''}>128</option>
            </select>
          </div>
          <div class="form-field">
            <label for="stage1_num_layers">Number of Layers</label>
            <select id="stage1_num_layers" data-param="num_layers">
              <option value="2" ${config.num_layers === 2 ? 'selected' : ''}>2</option>
              <option value="3" ${config.num_layers === 3 ? 'selected' : ''}>3</option>
              <option value="4" ${config.num_layers === 4 || !config.num_layers ? 'selected' : ''}>4</option>
            </select>
          </div>
        </div>

        <div class="config-group">
          <h3>Training Parameters</h3>
          <div class="form-field">
            <label for="stage1_learning_rate">Learning Rate</label>
            <select id="stage1_learning_rate" data-param="learning_rate">
              <option value="0.00001" ${config.learning_rate === 0.00001 ? 'selected' : ''}>1e-5</option>
              <option value="0.00005" ${config.learning_rate === 0.00005 ? 'selected' : ''}>5e-5</option>
              <option value="0.0001" ${config.learning_rate === 0.0001 || !config.learning_rate ? 'selected' : ''}>1e-4</option>
              <option value="0.0002" ${config.learning_rate === 0.0002 ? 'selected' : ''}>2e-4</option>
            </select>
          </div>
          <div class="form-field">
            <label for="stage1_epochs">Number of Epochs</label>
            <input type="number" id="stage1_epochs" data-param="epochs"
                   value="${config.epochs || 100}" min="10" max="500" step="10">
          </div>
          <div class="form-field checkbox-field">
            <input type="checkbox" id="stage1_early_stopping" data-param="early_stopping"
                   ${config.early_stopping !== false ? 'checked' : ''}>
            <label for="stage1_early_stopping">Early Stopping</label>
          </div>
          <div class="form-field">
            <label for="stage1_early_stopping_patience">Early Stopping Patience</label>
            <input type="number" id="stage1_early_stopping_patience" data-param="early_stopping_patience"
                   value="${config.early_stopping_patience || 10}" min="5" max="50" step="5"
                   ${config.early_stopping === false ? 'disabled' : ''}>
          </div>
        </div>

        <div class="config-group collapsible-group">
          <div class="collapsible-header" data-toggle="stage1_advanced_body">
            <h3>
              <span class="collapsible-icon">▶</span>
              Advanced Options
            </h3>
          </div>
          <div class="collapsible-body" id="stage1_advanced_body" style="display: none;">
            <div class="form-field checkbox-field">
              <input type="checkbox" id="stage1_use_resize_conv" data-param="use_resize_conv"
                     ${config.use_resize_conv !== false ? 'checked' : ''}>
              <label for="stage1_use_resize_conv">Resize Convolution</label>
            </div>
            <div class="form-field">
              <label for="stage1_upsampling_mode">Upsampling Mode</label>
              <select id="stage1_upsampling_mode" data-param="upsampling_mode">
                <option value="bilinear" ${config.upsampling_mode === 'bilinear' || !config.upsampling_mode ? 'selected' : ''}>Bilinear</option>
                <option value="nearest" ${config.upsampling_mode === 'nearest' ? 'selected' : ''}>Nearest</option>
                <option value="bicubic" ${config.upsampling_mode === 'bicubic' ? 'selected' : ''}>Bicubic</option>
              </select>
            </div>
            <div class="form-field">
              <label for="stage1_masking_strategy">Masking Strategy</label>
              <select id="stage1_masking_strategy" data-param="masking_strategy">
                <option value="0" ${config.masking_strategy === 0 || config.masking_strategy === undefined ? 'selected' : ''}>Local Mean</option>
                <option value="1" ${config.masking_strategy === 1 ? 'selected' : ''}>Zeros</option>
                <option value="2" ${config.masking_strategy === 2 ? 'selected' : ''}>Random</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render a stage configuration form for autoStructN2V (per spec 3.3.2)
   * Uses same layout as N2V - one parameter per line, with collapsible Advanced Options
   */
  renderStageConfigForm(stage) {
    const config = this.trainingConfig[stage] || {};
    const isStage1 = stage === 'stage1';

    return `
      <div class="config-form" data-stage="${stage}">
        <div class="config-group">
          <h3>Dataset Configuration</h3>
          <div class="form-field">
            <label for="${stage}_patch_size">Patch Size</label>
            <select id="${stage}_patch_size" data-param="patch_size">
              <option value="32" ${config.patch_size === 32 ? 'selected' : ''}>32</option>
              <option value="48" ${config.patch_size === 48 ? 'selected' : ''}>48</option>
              <option value="64" ${config.patch_size === 64 || !config.patch_size ? 'selected' : ''}>64</option>
              <option value="96" ${config.patch_size === 96 ? 'selected' : ''}>96</option>
              <option value="128" ${config.patch_size === 128 ? 'selected' : ''}>128</option>
            </select>
          </div>
          <div class="form-field">
            <label for="${stage}_patches_per_image">Patches per Image</label>
            <input type="number" id="${stage}_patches_per_image" data-param="patches_per_image"
                   value="${config.patches_per_image || (isStage1 ? 100 : 200)}" min="50" max="500" step="10">
          </div>
          <div class="form-field">
            <label for="${stage}_batch_size">Batch Size</label>
            <select id="${stage}_batch_size" data-param="batch_size">
              <option value="1" ${config.batch_size === 1 ? 'selected' : ''}>1</option>
              <option value="2" ${config.batch_size === 2 ? 'selected' : ''}>2</option>
              <option value="4" ${config.batch_size === 4 ? 'selected' : ''}>4</option>
              <option value="8" ${config.batch_size === 8 || !config.batch_size ? 'selected' : ''}>8</option>
              <option value="16" ${config.batch_size === 16 ? 'selected' : ''}>16</option>
              <option value="32" ${config.batch_size === 32 ? 'selected' : ''}>32</option>
            </select>
          </div>
          <div class="form-field">
            <label for="${stage}_mask_percentage">Mask Percentage (%)</label>
            <input type="number" id="${stage}_mask_percentage" data-param="mask_percentage"
                   value="${config.mask_percentage || (isStage1 ? 15 : 10)}" min="5" max="30" step="1">
          </div>
          <div class="form-field checkbox-field">
            <input type="checkbox" id="${stage}_use_augmentation" data-param="use_augmentation"
                   ${config.use_augmentation !== false ? 'checked' : ''}>
            <label for="${stage}_use_augmentation">Apply Data Augmentation</label>
          </div>
        </div>

        <div class="config-group">
          <h3>Model Architecture</h3>
          <div class="form-field">
            <label for="${stage}_features">Number of Features</label>
            <select id="${stage}_features" data-param="features">
              <option value="32" ${config.features === 32 ? 'selected' : ''}>32</option>
              <option value="48" ${config.features === 48 ? 'selected' : ''}>48</option>
              <option value="64" ${config.features === 64 || !config.features ? 'selected' : ''}>64</option>
              <option value="96" ${config.features === 96 ? 'selected' : ''}>96</option>
              <option value="128" ${config.features === 128 ? 'selected' : ''}>128</option>
            </select>
          </div>
          <div class="form-field">
            <label for="${stage}_num_layers">Number of Layers</label>
            <select id="${stage}_num_layers" data-param="num_layers">
              <option value="2" ${config.num_layers === 2 ? 'selected' : ''}>2</option>
              <option value="3" ${config.num_layers === 3 ? 'selected' : ''}>3</option>
              <option value="4" ${config.num_layers === 4 || !config.num_layers ? 'selected' : ''}>4</option>
              <option value="5" ${config.num_layers === 5 ? 'selected' : ''}>5</option>
            </select>
          </div>
        </div>

        <div class="config-group">
          <h3>Training Parameters</h3>
          <div class="form-field">
            <label for="${stage}_learning_rate">Learning Rate</label>
            <select id="${stage}_learning_rate" data-param="learning_rate">
              <option value="0.00001" ${config.learning_rate === 0.00001 ? 'selected' : ''}>1e-5</option>
              <option value="0.00005" ${config.learning_rate === 0.00005 ? 'selected' : ''}>5e-5</option>
              <option value="0.0001" ${config.learning_rate === 0.0001 || !config.learning_rate ? 'selected' : ''}>1e-4</option>
              <option value="0.0002" ${config.learning_rate === 0.0002 ? 'selected' : ''}>2e-4</option>
            </select>
          </div>
          <div class="form-field">
            <label for="${stage}_epochs">Number of Epochs</label>
            <input type="number" id="${stage}_epochs" data-param="epochs"
                   value="${config.epochs || 100}" min="10" max="500" step="10">
          </div>
          <div class="form-field checkbox-field">
            <input type="checkbox" id="${stage}_early_stopping" data-param="early_stopping"
                   ${config.early_stopping !== false ? 'checked' : ''}>
            <label for="${stage}_early_stopping">Early Stopping</label>
          </div>
          <div class="form-field">
            <label for="${stage}_early_stopping_patience">Early Stopping Patience</label>
            <input type="number" id="${stage}_early_stopping_patience" data-param="early_stopping_patience"
                   value="${config.early_stopping_patience || 10}" min="5" max="50" step="5"
                   ${config.early_stopping === false ? 'disabled' : ''}>
          </div>
        </div>

        <div class="config-group collapsible-group">
          <div class="collapsible-header" data-toggle="${stage}_advanced_body">
            <h3>
              <span class="collapsible-icon">▶</span>
              Advanced Options
            </h3>
          </div>
          <div class="collapsible-body" id="${stage}_advanced_body" style="display: none;">
            ${isStage1 ? `
            <div class="form-field checkbox-field">
              <input type="checkbox" id="${stage}_use_roi" data-param="use_roi"
                     ${config.use_roi !== false ? 'checked' : ''}>
              <label for="${stage}_use_roi">ROI Selection</label>
            </div>
            <div class="form-field">
              <label for="${stage}_roi_threshold">ROI Threshold</label>
              <input type="number" id="${stage}_roi_threshold" data-param="roi_threshold"
                     value="${config.roi_threshold || 0.5}" min="0.3" max="0.7" step="0.1"
                     ${config.use_roi === false ? 'disabled' : ''}>
            </div>
            ` : ''}
            <div class="form-field checkbox-field">
              <input type="checkbox" id="${stage}_use_resize_conv" data-param="use_resize_conv"
                     ${config.use_resize_conv !== false ? 'checked' : ''}>
              <label for="${stage}_use_resize_conv">Resize Convolution</label>
            </div>
            <div class="form-field">
              <label for="${stage}_upsampling_mode">Upsampling Mode</label>
              <select id="${stage}_upsampling_mode" data-param="upsampling_mode">
                <option value="bilinear" ${config.upsampling_mode === 'bilinear' || !config.upsampling_mode ? 'selected' : ''}>Bilinear</option>
                <option value="nearest" ${config.upsampling_mode === 'nearest' ? 'selected' : ''}>Nearest</option>
                <option value="bicubic" ${config.upsampling_mode === 'bicubic' ? 'selected' : ''}>Bicubic</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render mask extractor configuration (autoStructN2V only)
   * Uses same structure as stage config forms for visual consistency
   */
  renderMaskExtractorConfig() {
    const container = document.getElementById('maskExtractorSection');
    if (!container) return;

    const config = this.trainingConfig.maskExtractor || {};

    container.innerHTML = `
      <div class="config-form mask-extractor-form">
        <div class="config-group collapsible-group">
          <div class="collapsible-header" data-toggle="maskExtractorBody">
            <h3>
              <span class="collapsible-icon">▶</span>
              Mask Extractor Configuration
            </h3>
          </div>
          <div class="collapsible-body" id="maskExtractorBody" style="display: none;">
            <p class="section-desc">
              Configure how structural noise patterns are detected between Stage 1 and Stage 2.
            </p>
            <div class="form-field checkbox-field">
              <input type="checkbox" id="mask_adaptive_thresholding" data-param="adaptive_thresholding"
                     ${config.adaptive_thresholding !== false ? 'checked' : ''}>
              <label for="mask_adaptive_thresholding">Adaptive Thresholding</label>
            </div>
            <div class="form-field">
              <label for="mask_base_percentile">Base Percentile</label>
              <input type="number" id="mask_base_percentile" data-param="base_percentile"
                     value="${config.base_percentile || 50}" min="30" max="70" step="5">
              <span class="field-hint">Threshold for noise detection (30-70)</span>
            </div>
            <div class="form-field">
              <label for="mask_percentile_decay">Percentile Decay</label>
              <input type="number" id="mask_percentile_decay" data-param="percentile_decay"
                     value="${config.percentile_decay || 1.15}" min="1.0" max="1.3" step="0.05">
              <span class="field-hint">Decay rate for adaptive threshold</span>
            </div>
            <div class="form-field">
              <label for="mask_max_masked_pixels">Max Masked Pixels (%)</label>
              <input type="number" id="mask_max_masked_pixels" data-param="max_masked_pixels"
                     value="${config.max_masked_pixels || 30}" min="10" max="40" step="5">
              <span class="field-hint">Maximum percentage of pixels to mask</span>
            </div>
          </div>
        </div>
      </div>
    `;

    // Set up collapsible toggle
    this.setupCollapsibleToggles();
    // Set up input listeners for mask config
    this.setupMaskConfigListeners();
  }

  /**
   * Set up collapsible section toggles
   * Only adds listeners to elements that haven't been initialized yet
   */
  setupCollapsibleToggles() {
    document.querySelectorAll('[data-toggle]:not([data-toggle-initialized])').forEach(header => {
      // Mark as initialized to prevent duplicate listeners
      header.setAttribute('data-toggle-initialized', 'true');

      header.addEventListener('click', () => {
        const bodyId = header.getAttribute('data-toggle');
        const body = document.getElementById(bodyId);
        const icon = header.querySelector('.collapsible-icon');

        if (body) {
          const isVisible = body.style.display !== 'none';
          body.style.display = isVisible ? 'none' : 'block';
          if (icon) icon.textContent = isVisible ? '▶' : '▼';
        }
      });
    });
  }

  /**
   * Set up config input change listeners
   */
  setupConfigInputListeners() {
    // Stage 1 inputs
    document.querySelectorAll('#stage1ConfigContent [data-param]').forEach(input => {
      input.addEventListener('change', (e) => this.onConfigInputChange('stage1', e.target));
    });

    // Stage 2 inputs (if present)
    document.querySelectorAll('#stage2ConfigContent [data-param]').forEach(input => {
      input.addEventListener('change', (e) => this.onConfigInputChange('stage2', e.target));
    });

    // Early stopping toggle logic
    ['stage1', 'stage2'].forEach(stage => {
      const toggle = document.getElementById(`${stage}_early_stopping`);
      const patience = document.getElementById(`${stage}_early_stopping_patience`);
      if (toggle && patience) {
        toggle.addEventListener('change', () => {
          patience.disabled = !toggle.checked;
        });
      }
    });

    // Set up collapsible toggles
    this.setupCollapsibleToggles();
  }

  /**
   * Set up mask extractor config listeners
   */
  setupMaskConfigListeners() {
    document.querySelectorAll('#maskExtractorSection [data-param]').forEach(input => {
      input.addEventListener('change', (e) => this.onConfigInputChange('maskExtractor', e.target));
    });
  }

  /**
   * Handle config input change
   */
  onConfigInputChange(stage, input) {
    const param = input.getAttribute('data-param');
    let value;

    if (input.type === 'checkbox') {
      value = input.checked;
    } else if (input.type === 'number') {
      value = parseFloat(input.value);
    } else {
      value = parseInt(input.value) || input.value;
    }

    this.trainingConfig[stage][param] = value;
    console.log(`[DLDenoisingModule] Config updated: ${stage}.${param} =`, value);
  }

  /**
   * Handle preset change
   */
  onPresetChange(presetName) {
    console.log('[DLDenoisingModule] Preset changed to:', presetName);
    this.currentPreset = presetName;
    this.applyPreset(presetName);
    this.updatePresetDescription();
    this.renderConfigColumns();

    // Re-render mask extractor if visible
    if (this.selectedMethod === 'autostructn2v') {
      this.renderMaskExtractorConfig();
    }
  }

  /**
   * Apply a preset configuration
   */
  applyPreset(presetName) {
    const preset = this.presets?.[presetName];
    if (!preset) {
      console.warn('[DLDenoisingModule] Preset not found:', presetName);
      return;
    }

    this.trainingConfig.stage1 = { ...preset.stage1 };
    this.trainingConfig.stage2 = { ...preset.stage2 };
    this.trainingConfig.maskExtractor = { ...preset.maskExtractor };

    console.log('[DLDenoisingModule] Applied preset:', presetName);
  }

  /**
   * Update preset description text
   */
  updatePresetDescription() {
    const descEl = document.getElementById('presetDescription');
    if (!descEl) return;

    const preset = this.presets?.[this.currentPreset];
    if (preset) {
      descEl.textContent = preset.description || '';
    }
  }

  /**
   * Save current configuration
   */
  saveConfig() {
    console.log('[DLDenoisingModule] Saving configuration:', this.trainingConfig);

    // Read all current values from the form
    this.readConfigFromForm('stage1');
    if (this.selectedMethod === 'autostructn2v') {
      this.readConfigFromForm('stage2');
      this.readMaskConfigFromForm();
    }
  }

  /**
   * Read configuration values from form inputs
   */
  readConfigFromForm(stage) {
    const container = document.getElementById(`${stage}ConfigContent`);
    if (!container) return;

    container.querySelectorAll('[data-param]').forEach(input => {
      const param = input.getAttribute('data-param');
      let value;

      if (input.type === 'checkbox') {
        value = input.checked;
      } else if (input.type === 'number') {
        value = parseFloat(input.value);
      } else {
        value = parseInt(input.value) || input.value;
      }

      this.trainingConfig[stage][param] = value;
    });
  }

  /**
   * Read mask extractor configuration from form
   */
  readMaskConfigFromForm() {
    const container = document.getElementById('maskExtractorSection');
    if (!container) return;

    container.querySelectorAll('[data-param]').forEach(input => {
      const param = input.getAttribute('data-param');
      let value;

      if (input.type === 'checkbox') {
        value = input.checked;
      } else if (input.type === 'number') {
        value = parseFloat(input.value);
      } else {
        value = input.value;
      }

      this.trainingConfig.maskExtractor[param] = value;
    });
  }

  viewResults() {
    // Placeholder for Phase 7
    this.state.notify('info', 'Results viewing will be implemented in Phase 7');
  }

  reset() {
    console.log('[DLDenoisingModule] Resetting module...');

    this.fileValidated = false;
    this.methodSelected = false;
    this.configSaved = false;
    this.trainingComplete = false;
    this.uploadedFile = null;
    this.selectedMethod = null;
    this.validationResult = null;
    this.trainingId = null;
    this.trainingResult = null;
    this.inferenceResult = null;

    // Reset UI
    const step1Next = document.getElementById('step1Next');
    if (step1Next) step1Next.disabled = true;

    // Clear method selection
    document.querySelectorAll('input[name="dl-method"]').forEach(radio => {
      radio.checked = false;
    });

    // Clear validation display
    if (this.validationDisplay) {
      this.validationDisplay.reset();
      this.validationDisplay.hide();
    }
    const validationContainer = document.getElementById('validationResult');
    if (validationContainer) {
      validationContainer.innerHTML = '';
      validationContainer.style.display = 'none';
    }

    // Reset file selector
    if (this.fileSelector) {
      this.fileSelector.hidePreview();
      this.fileSelector.selectedFile = null;
      this.fileSelector.refresh();
      const dropdown = document.getElementById(`${this.fileSelector.id}-select`);
      if (dropdown) {
        dropdown.value = '';
      }
    }

    this.goToStep(1);
  }

  async deactivate() {
    console.log('[DLDenoisingModule] Deactivating...');

    // Clean up global references
    try { delete window.dlDenoisingModule; } catch (e) { window.dlDenoisingModule = undefined; }

    await super.deactivate();

    console.log('[DLDenoisingModule] Deactivated');
  }
}

export default DLDenoisingModule;
