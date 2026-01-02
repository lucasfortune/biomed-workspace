/**
 * FilterDenoisingModule - Filter-based image denoising
 *
 * Provides Gaussian and Non-Local Means (NLM) denoising for TIFF stacks.
 * Extends BaseModule framework for consistent UI and navigation.
 */

import BaseModule from '/workspace/js/core/BaseModule.js';
import { StepNavigator, FileSelector, ValidationDisplay }
  from '/workspace/js/core/components/index.js';

class FilterDenoisingModule extends BaseModule {

  constructor(stateManager) {
    super(stateManager, {
      id: 'denoising-filter',
      name: 'Filter-Based Denoising',
      cssPath: '/workspace/js/modules/denoising-filter/css/filter-denoising.css',
      steps: [
        { id: 'upload', name: 'Data Selection' },
        { id: 'configure', name: 'Configure' },
        { id: 'process', name: 'Process' }
      ]
    });

    // Step condition flags
    this.filesValidated = false;
    this.configSaved = false;
    this.processingComplete = false;

    // Component references
    this.stepNavigator = null;
    this.validationDisplay = null;
    this.fileSelector = null;

    // Module state
    this.uploadedFile = null;
    this.selectedMethod = 'gaussian';
    this.parameters = {
      gaussian: { sigma: 1.5, kernel_size: 5 },
      nlm: { h: 10, template_window: 7, search_window: 21 }
    };
    this.processingResult = null;

    // Bind methods
    this.onFileSelected = this.onFileSelected.bind(this);
    this.onFileUploaded = this.onFileUploaded.bind(this);
    this.startProcessing = this.startProcessing.bind(this);

    // Event listener references for cleanup
    this.eventListeners = [];
  }

  /**
   * Render a help icon that opens the info panel with a specific article
   * @param {string} articleId - The article ID to display
   * @returns {string} HTML for the help icon
   */
  renderHelpIcon(articleId) {
    return `<span class="help-icon" data-info-id="${articleId}" title="Click for help">
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z"/>
      </svg>
    </span>`;
  }

  render() {
    this.container.innerHTML = `
      <div class="filter-denoising-module module-container">
        ${this.renderHeader()}
        ${this.renderStepNav()}

        <div class="step-contents">
          <!-- Step 1: Data Selection -->
          <div id="step1" class="step-content active">
            <div class="step-inner">
              <h3>Select Image Data</h3>
              <p class="step-description">
                Select a TIFF stack to denoise, or use test data to try the module.
              </p>
              <div id="fileSelectorContainer"></div>
              <div id="validationResult"></div>
              <div class="navigation-buttons">
                <div></div>
                <button id="step1Next" class="btn" disabled>Next: Configure</button>
              </div>
            </div>
          </div>

          <!-- Step 2: Configuration -->
          <div id="step2" class="step-content">
            <div class="step-inner">
              <h3>Configure Denoising</h3>
              <p class="step-description">
                Select a denoising method and adjust parameters.
              </p>

              <div class="config-form">
                <div class="method-selector">
                  <div class="section-header">
                    <h4>Select Method</h4>
                    ${this.renderHelpIcon('denoising-filter.step2.methods')}
                  </div>
                  <label class="method-option">
                    <input type="radio" name="denoise-method" value="gaussian" checked>
                    <span class="method-content">
                      <span class="method-name">Gaussian Filter</span>
                      <span class="method-desc">Fast, simple smoothing. Good for uniform noise.</span>
                    </span>
                  </label>
                  <label class="method-option">
                    <input type="radio" name="denoise-method" value="nlm">
                    <span class="method-content">
                      <span class="method-name">Non-Local Means</span>
                      <span class="method-desc">Edge-preserving. Better for structured images.</span>
                    </span>
                  </label>
                </div>

                <div id="gaussianParams" class="params-section">
                  <div class="section-header">
                    <h4>Gaussian Parameters</h4>
                    ${this.renderHelpIcon('denoising-filter.step2.gaussian')}
                  </div>
                  <div class="form-field">
                    <label for="sigma">Sigma (\u03C3)</label>
                    <div class="slider-input">
                      <input type="range" id="sigma" min="0.5" max="5" step="0.1" value="1.5">
                      <input type="number" id="sigmaValue" min="0.5" max="5" step="0.1" value="1.5">
                    </div>
                    <span class="field-hint">Higher = more smoothing (range: 0.5-5.0)</span>
                  </div>
                  <div class="form-field">
                    <label for="kernelSize">Kernel Size</label>
                    <select id="kernelSize">
                      <option value="3">3 x 3</option>
                      <option value="5" selected>5 x 5</option>
                      <option value="7">7 x 7</option>
                      <option value="9">9 x 9</option>
                      <option value="11">11 x 11</option>
                    </select>
                    <span class="field-hint">Filter window size</span>
                  </div>
                </div>

                <div id="nlmParams" class="params-section" style="display: none;">
                  <div class="section-header">
                    <h4>Non-Local Means Parameters</h4>
                    ${this.renderHelpIcon('denoising-filter.step2.nlm')}
                  </div>
                  <div class="form-field">
                    <label for="filterH">Filter Strength (h)</label>
                    <div class="slider-input">
                      <input type="range" id="filterH" min="1" max="30" step="1" value="10">
                      <input type="number" id="filterHValue" min="1" max="30" step="1" value="10">
                    </div>
                    <span class="field-hint">Higher = more denoising, may blur details (range: 1-30)</span>
                  </div>
                  <div class="form-field">
                    <label for="templateWindow">Template Window Size</label>
                    <select id="templateWindow">
                      <option value="3">3</option>
                      <option value="5">5</option>
                      <option value="7" selected>7</option>
                      <option value="9">9</option>
                      <option value="11">11</option>
                    </select>
                    <span class="field-hint">Patch size for comparison (odd numbers)</span>
                  </div>
                  <div class="form-field">
                    <label for="searchWindow">Search Window Size</label>
                    <select id="searchWindow">
                      <option value="11">11</option>
                      <option value="15">15</option>
                      <option value="21" selected>21</option>
                      <option value="31">31</option>
                      <option value="41">41</option>
                    </select>
                    <span class="field-hint">Area to search for similar patches</span>
                  </div>
                </div>
              </div>

              <div class="navigation-buttons">
                <button id="step2Back" class="btn secondary">Back</button>
                <button id="step2Next" class="btn">Next: Process</button>
              </div>
            </div>
          </div>

          <!-- Step 3: Processing -->
          <div id="step3" class="step-content">
            <div class="step-inner">
              <h3>Processing</h3>

              <div id="processingAction" class="action-section">
                <div id="configSummary" class="config-summary"></div>
                <button id="startProcessingBtn" class="btn btn-large">Start Denoising</button>
              </div>

              <div id="processingProgress" class="progress-section" style="display: none;">
                <div class="spinner"></div>
                <p id="progressStatus">Processing image...</p>
              </div>

              <div id="processingResults" class="results-section" style="display: none;">
                <div class="validation-success">
                  <div class="validation-header">Processing Complete!</div>
                  <div class="validation-details" id="resultsDetails"></div>
                </div>
                <div class="result-actions">
                  <button id="viewResultsBtn" class="btn">View in Image Viewer</button>
                  <button id="resetBtn" class="btn secondary">Process Another</button>
                </div>
              </div>

              <div class="navigation-buttons">
                <button id="step3Back" class="btn secondary">Back</button>
                <div></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  async initialize() {
    console.log('[FilterDenoisingModule] Initializing components...');

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
        id: 'denoising_input',
        fileType: 'raw_images',
        title: 'Input Image Stack',
        icon: '\uD83D\uDCC1',
        helpIconHtml: this.renderHelpIcon('denoising-filter.step1.input'),
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

    // Expose globals for onclick handlers
    window.filterDenoisingModule = this;

    console.log('[FilterDenoisingModule] Initialization complete');
  }

  setupEventListeners() {
    // Helper to add and track event listeners
    const addListener = (element, event, handler) => {
      if (element) {
        element.addEventListener(event, handler);
        this.eventListeners.push({ element, event, handler });
      }
    };

    // Back to Hub
    addListener(document.getElementById('backToHub'), 'click', () => window.workspace.returnToHub());

    // Step navigation buttons
    addListener(document.getElementById('step1Next'), 'click', () => this.nextStep());
    addListener(document.getElementById('step2Back'), 'click', () => this.previousStep());
    addListener(document.getElementById('step2Next'), 'click', () => this.nextStep());
    addListener(document.getElementById('step3Back'), 'click', () => this.previousStep());

    // Method selector
    document.querySelectorAll('input[name="denoise-method"]').forEach(radio => {
      addListener(radio, 'change', (e) => this.onMethodChange(e.target.value));
    });

    // Slider-input sync for Gaussian sigma
    const sigmaSlider = document.getElementById('sigma');
    const sigmaValue = document.getElementById('sigmaValue');
    if (sigmaSlider && sigmaValue) {
      addListener(sigmaSlider, 'input', () => sigmaValue.value = sigmaSlider.value);
      addListener(sigmaValue, 'input', () => sigmaSlider.value = sigmaValue.value);
    }

    // Slider-input sync for NLM h
    const hSlider = document.getElementById('filterH');
    const hValue = document.getElementById('filterHValue');
    if (hSlider && hValue) {
      addListener(hSlider, 'input', () => hValue.value = hSlider.value);
      addListener(hValue, 'input', () => hSlider.value = hValue.value);
    }

    // Start processing button
    addListener(document.getElementById('startProcessingBtn'), 'click', () => this.startProcessing());

    // Result buttons
    addListener(document.getElementById('viewResultsBtn'), 'click', () => this.viewResults());
    addListener(document.getElementById('resetBtn'), 'click', () => this.reset());
  }

  onMethodChange(method) {
    this.selectedMethod = method;
    const gaussianParams = document.getElementById('gaussianParams');
    const nlmParams = document.getElementById('nlmParams');

    if (method === 'gaussian') {
      gaussianParams.style.display = 'block';
      nlmParams.style.display = 'none';
    } else {
      gaussianParams.style.display = 'none';
      nlmParams.style.display = 'block';
    }
  }

  async onFileSelected(fileInfo) {
    console.log('[FilterDenoisingModule] File selected:', fileInfo);

    if (!fileInfo) {
      // Deselection
      this.uploadedFile = null;
      this.filesValidated = false;
      const step1Next = document.getElementById('step1Next');
      if (step1Next) step1Next.disabled = true;
      return;
    }

    // Handle test data - load it via API endpoint
    if (fileInfo.isTestData) {
      try {
        this.validationDisplay.showLoading('Loading test data...');

        const response = await fetch('/api/denoising/test-data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });

        const result = await response.json();

        if (result.success && result.file) {
          this.uploadedFile = {
            id: result.file.id,
            name: result.file.name,
            path: result.file.path,
            isTestData: true
          };

          this.validationDisplay.showSuccess('Test Data Loaded', [
            { label: 'Name', value: result.file.name },
            { label: 'Type', value: 'Test Data (Denoising)' }
          ]);

          this.filesValidated = true;
          const step1Next = document.getElementById('step1Next');
          if (step1Next) step1Next.disabled = false;
        } else {
          throw new Error(result.error || 'Failed to load test data');
        }
      } catch (error) {
        console.error('[FilterDenoisingModule] Error loading test data:', error);
        this.validationDisplay.showError('Error', error.message);
        this.state.notify('error', `Failed to load test data: ${error.message}`);
      }
      return;
    }

    // Regular file selection
    this.uploadedFile = fileInfo;

    this.validationDisplay.showSuccess('File Selected', [
      { label: 'Name', value: fileInfo.name || 'Selected file' },
      { label: 'Type', value: 'Workspace File' }
    ]);

    this.filesValidated = true;
    const step1Next = document.getElementById('step1Next');
    if (step1Next) step1Next.disabled = false;
  }

  onFileUploaded(file, uploadedFile) {
    console.log('[FilterDenoisingModule] File uploaded:', uploadedFile);

    // uploadedFile is the file entry directly from the server (id, name, path, etc.)
    this.uploadedFile = {
      id: uploadedFile.id,
      name: uploadedFile.name || file.name,
      path: uploadedFile.path,
      isTestData: false
    };

    this.validationDisplay.showSuccess('File Uploaded', [
      { label: 'Name', value: this.uploadedFile.name },
      { label: 'Size', value: `${(file.size / 1024 / 1024).toFixed(2)} MB` }
    ]);

    this.filesValidated = true;
    const step1Next = document.getElementById('step1Next');
    if (step1Next) step1Next.disabled = false;
  }

  canNavigateToStep(stepNumber) {
    switch (stepNumber) {
      case 1: return true;
      case 2: return this.filesValidated;
      case 3: return this.configSaved;
      default: return false;
    }
  }

  goToStep(stepNumber) {
    super.goToStep(stepNumber);
    if (this.stepNavigator) {
      this.stepNavigator.update(stepNumber);
    }

    if (stepNumber === 3) {
      this.saveConfig();
      this.updateConfigSummary();
    }
  }

  nextStep() {
    if (this.currentStep === 1 && !this.filesValidated) {
      this.state.notify('error', 'Please select a file first');
      return;
    }

    if (this.currentStep === 2) {
      this.saveConfig();
      this.configSaved = true;
    }

    super.nextStep();
  }

  saveConfig() {
    if (this.selectedMethod === 'gaussian') {
      this.parameters.gaussian = {
        sigma: parseFloat(document.getElementById('sigma')?.value || 1.5),
        kernel_size: parseInt(document.getElementById('kernelSize')?.value || 5)
      };
    } else {
      this.parameters.nlm = {
        h: parseFloat(document.getElementById('filterH')?.value || 10),
        template_window: parseInt(document.getElementById('templateWindow')?.value || 7),
        search_window: parseInt(document.getElementById('searchWindow')?.value || 21)
      };
    }
    console.log('[FilterDenoisingModule] Config saved:', this.selectedMethod, this.parameters);
  }

  updateConfigSummary() {
    const summary = document.getElementById('configSummary');
    if (!summary) return;

    const params = this.selectedMethod === 'gaussian' ? this.parameters.gaussian : this.parameters.nlm;
    const methodName = this.selectedMethod === 'gaussian' ? 'Gaussian Filter' : 'Non-Local Means';

    let paramsHtml = '';
    if (this.selectedMethod === 'gaussian') {
      paramsHtml = `
        <div class="detail-row"><span>Sigma:</span><span>${params.sigma}</span></div>
        <div class="detail-row"><span>Kernel:</span><span>${params.kernel_size} x ${params.kernel_size}</span></div>
      `;
    } else {
      paramsHtml = `
        <div class="detail-row"><span>Filter Strength (h):</span><span>${params.h}</span></div>
        <div class="detail-row"><span>Template Window:</span><span>${params.template_window}</span></div>
        <div class="detail-row"><span>Search Window:</span><span>${params.search_window}</span></div>
      `;
    }

    summary.innerHTML = `
      <h4>Configuration Summary</h4>
      <div class="detail-row"><span>Input File:</span><span>${this.uploadedFile?.name || 'N/A'}</span></div>
      <div class="detail-row"><span>Method:</span><span>${methodName}</span></div>
      ${paramsHtml}
    `;
  }

  async startProcessing() {
    console.log('[FilterDenoisingModule] Starting processing...');

    document.getElementById('processingAction').style.display = 'none';
    document.getElementById('processingProgress').style.display = 'block';

    try {
      const params = this.selectedMethod === 'gaussian' ? this.parameters.gaussian : this.parameters.nlm;

      const response = await fetch('/api/denoising/filter/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inputPath: this.uploadedFile.path,
          method: this.selectedMethod,
          parameters: params,
          inputFileIds: this.uploadedFile.id ? [this.uploadedFile.id] : []
        })
      });

      const result = await response.json();

      if (result.success) {
        this.onProcessingComplete(result);
      } else {
        throw new Error(result.error || 'Processing failed');
      }
    } catch (error) {
      console.error('[FilterDenoisingModule] Processing error:', error);
      this.state.notify('error', `Processing failed: ${error.message}`);

      document.getElementById('processingProgress').style.display = 'none';
      document.getElementById('processingAction').style.display = 'block';
    }
  }

  onProcessingComplete(result) {
    console.log('[FilterDenoisingModule] Processing complete:', result);

    this.processingResult = result;

    document.getElementById('processingProgress').style.display = 'none';
    document.getElementById('processingResults').style.display = 'block';

    const resultsDetails = document.getElementById('resultsDetails');
    if (resultsDetails) {
      resultsDetails.innerHTML = `
        <div class="detail-row"><span>Output File:</span><span>${result.outputFilename}</span></div>
        <div class="detail-row"><span>Slices Processed:</span><span>${result.slices_processed || 'N/A'}</span></div>
        <div class="detail-row"><span>Method:</span><span>${result.method}</span></div>
      `;
    }

    this.processingComplete = true;
    this.state.notify('success', 'Denoising completed successfully!');

    // Refresh workspace files
    if (window.workspace?.fileBrowser) {
      window.workspace.fileBrowser.refresh();
    }
  }

  async viewResults() {
    if (this.processingResult?.fileId) {
      // Set the file info in state for ImageViewerModule to pick up
      this.state.update('modules.denoising.viewerFile', {
        fileId: this.processingResult.fileId,
        path: this.processingResult.outputPath,
        name: this.processingResult.outputFilename || 'Denoised Image'
      });

      // Load the ImageViewer module - it will auto-detect the file and go to step 2
      try {
        await window.workspace.loadModule('imageviewer');
      } catch (error) {
        console.error('[FilterDenoisingModule] Error loading ImageViewer:', error);
        this.state.notify('error', 'Failed to open Image Viewer');
      }
    } else {
      this.state.notify('warning', 'No result file available to view');
    }
  }

  reset() {
    console.log('[FilterDenoisingModule] Resetting module...');

    this.filesValidated = false;
    this.configSaved = false;
    this.processingComplete = false;
    this.uploadedFile = null;
    this.processingResult = null;

    // Reset UI
    document.getElementById('processingAction').style.display = 'block';
    document.getElementById('processingProgress').style.display = 'none';
    document.getElementById('processingResults').style.display = 'none';

    const step1Next = document.getElementById('step1Next');
    if (step1Next) step1Next.disabled = true;

    // Clear validation display
    if (this.validationDisplay) {
      this.validationDisplay.reset(); // Clear cached container reference
      this.validationDisplay.hide();
    }
    // Also clear directly as fallback
    const validationContainer = document.getElementById('validationResult');
    if (validationContainer) {
      validationContainer.innerHTML = '';
      validationContainer.style.display = 'none';
    }

    if (this.fileSelector) {
      this.fileSelector.hidePreview();
      this.fileSelector.selectedFile = null;
      this.fileSelector.refresh();
      // Reset dropdown selection
      const dropdown = document.getElementById(`${this.fileSelector.id}-select`);
      if (dropdown) {
        dropdown.value = '';
      }
    }

    this.goToStep(1);
  }

  async deactivate() {
    console.log('[FilterDenoisingModule] Deactivating...');

    // Remove all event listeners
    for (const { element, event, handler } of this.eventListeners) {
      element.removeEventListener(event, handler);
    }
    this.eventListeners = [];

    // Clean up global references
    try { delete window.filterDenoisingModule; } catch (e) { window.filterDenoisingModule = undefined; }

    await super.deactivate();

    console.log('[FilterDenoisingModule] Deactivated');
  }
}

export default FilterDenoisingModule;
