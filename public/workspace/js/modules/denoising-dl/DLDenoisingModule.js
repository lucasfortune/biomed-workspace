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

    // Training configuration (will be populated in Phase 3)
    this.trainingConfig = {
      stage1: {},
      stage2: {},
      maskExtractor: {}
    };

    // Bind methods
    this.onFileSelected = this.onFileSelected.bind(this);
    this.onFileUploaded = this.onFileUploaded.bind(this);
    this.onMethodChange = this.onMethodChange.bind(this);
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

          <!-- Step 2: Configuration (placeholder for Phase 3) -->
          <div id="step2" class="step-content">
            <div class="step-inner">
              <h3>Configure Training</h3>
              <p class="step-description">
                Adjust training parameters or use a preset configuration.
              </p>

              <div class="section-card placeholder-section">
                <div class="placeholder-icon">⚙️</div>
                <div class="placeholder-text">
                  Configuration options will be implemented in Phase 3.
                  <br><br>
                  For now, click "Next" to proceed with default settings.
                </div>
              </div>

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

    // Expose global for onclick handlers
    window.dlDenoisingModule = this;

    console.log('[DLDenoisingModule] Initialization complete');
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

    // Update UI based on step
    if (stepNumber === 2) {
      this.configSaved = true; // For now, auto-save with defaults
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

    super.nextStep();
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
