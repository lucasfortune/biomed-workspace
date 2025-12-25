/**
 * TemplateModule - Starter Template for New Modules
 *
 * This file demonstrates how to create a module using the BaseModule framework.
 * Copy this directory and customize for your new module.
 *
 * Features demonstrated:
 * - Extending BaseModule with step configuration
 * - Using StepNavigator, FileSelector, and ValidationDisplay components
 * - Conditional step navigation
 * - State management integration
 * - Socket.IO for real-time updates
 * - Proper cleanup on deactivation
 *
 * @example
 * // To use this template:
 * // 1. Copy the /template directory to /modules/yourmodule
 * // 2. Rename TemplateModule to YourModule
 * // 3. Update the config in constructor
 * // 4. Implement your render() and processing logic
 * // 5. Register in /modules/registry.js
 */

// =============================================================================
// IMPORTS
// Import BaseModule and components from the core framework
// =============================================================================

import BaseModule from '/workspace/js/core/BaseModule.js';
import { StepNavigator, FileSelector, ValidationDisplay }
  from '/workspace/js/core/components/index.js';

// =============================================================================
// MODULE CLASS
// =============================================================================

class TemplateModule extends BaseModule {

  // ===========================================================================
  // CONSTRUCTOR
  // Configure your module here
  // ===========================================================================

  constructor(stateManager) {
    // Call parent constructor with configuration
    super(stateManager, {
      // Unique module identifier (lowercase, no spaces)
      id: 'template',

      // Display name shown in header
      name: 'Template Module',

      // Path to module-specific CSS (optional)
      // CSS should import module-base.css at the top
      cssPath: '/workspace/js/modules/template/css/template.css',

      // Step configuration
      // Each step needs an id and name
      steps: [
        { id: 'upload', name: 'Data Upload' },
        { id: 'configure', name: 'Configure' },
        { id: 'process', name: 'Process' }
      ]
    });

    // =========================================================================
    // STEP CONDITION FLAGS
    // Track what's required to unlock each step
    // =========================================================================

    this.filesValidated = false;    // Step 1 complete → can access Step 2
    this.configSaved = false;       // Step 2 complete → can access Step 3
    this.processingComplete = false; // Step 3 complete

    // =========================================================================
    // COMPONENT REFERENCES
    // Store references to UI components
    // =========================================================================

    this.stepNavigator = null;
    this.validationDisplay = null;
    this.fileSelector = null;

    // =========================================================================
    // MODULE STATE
    // Store module-specific data
    // =========================================================================

    this.uploadedFile = null;
    this.config = null;
    this.socket = null;

    // =========================================================================
    // BIND METHODS
    // Bind methods that will be used as callbacks
    // =========================================================================

    this.onFileSelected = this.onFileSelected.bind(this);
    this.onFileUploaded = this.onFileUploaded.bind(this);
    this.startProcessing = this.startProcessing.bind(this);
  }

  // ===========================================================================
  // RENDER METHOD (Required)
  // Build the module's HTML structure
  // ===========================================================================

  render() {
    this.container.innerHTML = `
      <div class="template-module module-container">
        <!-- Header with back button - uses BaseModule helper -->
        ${this.renderHeader()}

        <!-- Step navigation - uses BaseModule helper -->
        ${this.renderStepNav()}

        <!-- Step Contents Container -->
        <div class="step-contents">

          <!-- =============================================================== -->
          <!-- STEP 1: Data Upload -->
          <!-- =============================================================== -->
          <div id="step1" class="step-content active">
            <div class="step-inner">
              <h3>Upload Your Data</h3>
              <p class="step-description">
                Select or upload the data you want to process.
              </p>

              <!-- File Selector will be rendered here -->
              <div id="fileSelectorContainer"></div>

              <!-- Validation Display -->
              <div id="validationResult"></div>

              <!-- Navigation Buttons -->
              <div class="navigation-buttons">
                <div></div> <!-- Spacer for alignment -->
                <button id="step1Next" class="btn" disabled>
                  Next: Configure
                </button>
              </div>
            </div>
          </div>

          <!-- =============================================================== -->
          <!-- STEP 2: Configuration -->
          <!-- =============================================================== -->
          <div id="step2" class="step-content">
            <div class="step-inner">
              <h3>Configure Processing</h3>
              <p class="step-description">
                Adjust the processing parameters as needed.
              </p>

              <div class="config-form">
                <div class="form-field">
                  <label for="paramA">Parameter A</label>
                  <input type="number" id="paramA" value="10" min="1" max="100">
                  <span class="field-hint">Range: 1-100</span>
                </div>

                <div class="form-field">
                  <label for="paramB">Parameter B</label>
                  <select id="paramB">
                    <option value="option1">Option 1</option>
                    <option value="option2">Option 2</option>
                    <option value="option3">Option 3</option>
                  </select>
                </div>

                <div class="form-field">
                  <label>
                    <input type="checkbox" id="paramC" checked>
                    Enable advanced processing
                  </label>
                </div>
              </div>

              <!-- Navigation Buttons -->
              <div class="navigation-buttons">
                <button id="step2Back" class="btn secondary" onclick="previousStep()">
                  Back
                </button>
                <button id="step2Next" class="btn" onclick="nextStep()">
                  Next: Process
                </button>
              </div>
            </div>
          </div>

          <!-- =============================================================== -->
          <!-- STEP 3: Processing -->
          <!-- =============================================================== -->
          <div id="step3" class="step-content">
            <div class="step-inner">
              <h3>Processing</h3>

              <!-- Action Section (shown before processing starts) -->
              <div id="processingAction" class="action-section">
                <p class="step-description">
                  Ready to process your data with the configured parameters.
                </p>
                <button id="startProcessingBtn" class="btn" onclick="startProcessing()">
                  Start Processing
                </button>
              </div>

              <!-- Progress Section (shown during processing) -->
              <div id="processingProgress" class="progress-section" style="display: none;">
                <div class="progress-info">
                  <span>Processing...</span>
                  <span id="progressPercent">0%</span>
                </div>
                <div class="progress-bar-container">
                  <div id="progressBar" class="progress-fill" style="width: 0%"></div>
                </div>
                <p id="progressStatus">Initializing...</p>
              </div>

              <!-- Results Section (shown after processing completes) -->
              <div id="processingResults" class="results-section" style="display: none;">
                <div class="validation-success">
                  <div class="validation-header">Processing Complete!</div>
                  <div class="validation-details" id="resultsDetails"></div>
                </div>

                <div class="result-actions">
                  <button id="downloadBtn" class="btn">
                    Download Results
                  </button>
                  <button id="resetBtn" class="btn secondary">
                    Process Another
                  </button>
                </div>
              </div>

              <!-- Navigation Buttons -->
              <div class="navigation-buttons">
                <button id="step3Back" class="btn secondary" onclick="previousStep()">
                  Back
                </button>
                <div></div>
              </div>
            </div>
          </div>

        </div>
      </div>
    `;
  }

  // ===========================================================================
  // INITIALIZE METHOD
  // Set up components and event listeners after render
  // ===========================================================================

  async initialize() {
    console.log('[TemplateModule] Initializing components...');

    // =========================================================================
    // Initialize StepNavigator Component
    // =========================================================================

    this.stepNavigator = new StepNavigator({
      steps: this.config.steps,
      currentStep: this.currentStep,
      onStepClick: (stepNum) => this.goToStep(stepNum),
      canNavigate: (stepNum) => this.canNavigateToStep(stepNum)
    });
    this.stepNavigator.init(this.container);

    // =========================================================================
    // Initialize ValidationDisplay Component
    // =========================================================================

    this.validationDisplay = new ValidationDisplay('validationResult');

    // =========================================================================
    // Initialize FileSelector Component
    // =========================================================================

    const fileSelectorContainer = document.getElementById('fileSelectorContainer');
    if (fileSelectorContainer) {
      this.fileSelector = new FileSelector({
        id: 'input_data',
        fileType: 'input_data',
        title: 'Input Data',
        icon: '📁',
        showTestData: true,  // Show "Use Test Data" option
        stateManager: this.state,
        onSelect: this.onFileSelected,
        onUpload: this.onFileUploaded
      });

      fileSelectorContainer.innerHTML = this.fileSelector.render();
      this.fileSelector.init();
    }

    // =========================================================================
    // Set Up Event Listeners
    // =========================================================================

    this.setupEventListeners();

    // =========================================================================
    // Make Module Globally Accessible (for helper scripts)
    // =========================================================================

    window.templateModule = this;

    // =========================================================================
    // Expose Helper Functions Globally (for onclick handlers in HTML)
    // =========================================================================

    window.nextStep = () => this.nextStep();
    window.previousStep = () => this.previousStep();
    window.startProcessing = () => this.startProcessing();

    console.log('[TemplateModule] Initialization complete');
  }

  // ===========================================================================
  // EVENT LISTENERS
  // ===========================================================================

  setupEventListeners() {
    // Back to Hub button
    const backButton = document.getElementById('backToHub');
    if (backButton) {
      backButton.addEventListener('click', () => {
        window.workspace.returnToHub();
      });
    }

    // Step 1 Next button
    const step1Next = document.getElementById('step1Next');
    if (step1Next) {
      step1Next.addEventListener('click', () => this.nextStep());
    }

    // Download button
    const downloadBtn = document.getElementById('downloadBtn');
    if (downloadBtn) {
      downloadBtn.addEventListener('click', () => this.downloadResults());
    }

    // Reset button
    const resetBtn = document.getElementById('resetBtn');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => this.reset());
    }
  }

  // ===========================================================================
  // FILE SELECTION HANDLERS
  // ===========================================================================

  onFileSelected(fileInfo) {
    console.log('[TemplateModule] File selected:', fileInfo);

    this.uploadedFile = fileInfo;

    // Show validation
    this.validationDisplay.showSuccess('File Selected', [
      { label: 'Name', value: fileInfo.name || 'Selected file' },
      { label: 'Type', value: fileInfo.isTestData ? 'Test Data' : 'Custom Upload' }
    ]);

    // Enable next button
    this.filesValidated = true;
    const step1Next = document.getElementById('step1Next');
    if (step1Next) step1Next.disabled = false;
  }

  onFileUploaded(file, uploadResult) {
    console.log('[TemplateModule] File uploaded:', uploadResult);

    this.uploadedFile = {
      name: file.name,
      path: uploadResult.file_path,
      isTestData: false
    };

    // Show validation
    this.validationDisplay.showSuccess('File Uploaded', [
      { label: 'Name', value: file.name },
      { label: 'Size', value: `${(file.size / 1024 / 1024).toFixed(2)} MB` }
    ]);

    // Enable next button
    this.filesValidated = true;
    const step1Next = document.getElementById('step1Next');
    if (step1Next) step1Next.disabled = false;
  }

  // ===========================================================================
  // STEP NAVIGATION OVERRIDES
  // ===========================================================================

  /**
   * Override canNavigateToStep for conditional navigation
   */
  canNavigateToStep(stepNumber) {
    switch (stepNumber) {
      case 1:
        return true; // Always accessible
      case 2:
        return this.filesValidated;
      case 3:
        return this.configSaved;
      default:
        return false;
    }
  }

  /**
   * Override goToStep to update the StepNavigator component
   */
  goToStep(stepNumber) {
    // Call parent implementation
    super.goToStep(stepNumber);

    // Update StepNavigator UI
    if (this.stepNavigator) {
      this.stepNavigator.update(stepNumber);
    }

    // Step-specific logic
    if (stepNumber === 2) {
      // Mark step 1 complete, enable step 2 access
      this.filesValidated = true;
    }

    if (stepNumber === 3) {
      // Save config when entering step 3
      this.saveConfig();
    }
  }

  /**
   * Override nextStep for validation before advancing
   */
  nextStep() {
    // Validate before advancing
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

  // ===========================================================================
  // CONFIGURATION
  // ===========================================================================

  saveConfig() {
    this.processingConfig = {
      paramA: parseInt(document.getElementById('paramA')?.value || 10),
      paramB: document.getElementById('paramB')?.value || 'option1',
      paramC: document.getElementById('paramC')?.checked || false
    };

    console.log('[TemplateModule] Config saved:', this.processingConfig);
  }

  // ===========================================================================
  // PROCESSING
  // ===========================================================================

  async startProcessing() {
    console.log('[TemplateModule] Starting processing...');

    // Hide action, show progress
    document.getElementById('processingAction').style.display = 'none';
    document.getElementById('processingProgress').style.display = 'block';

    try {
      // Simulate processing with progress updates
      // In a real module, you would:
      // 1. Call your backend API
      // 2. Set up Socket.IO for progress
      // 3. Update progress UI

      for (let i = 0; i <= 100; i += 10) {
        await this.delay(300); // Simulate work
        this.updateProgress(i, `Processing step ${i / 10 + 1} of 11...`);
      }

      // Processing complete
      this.onProcessingComplete({
        outputPath: '/results/processed_data.tif',
        processingTime: '3.2 seconds',
        itemsProcessed: 100
      });

    } catch (error) {
      console.error('[TemplateModule] Processing error:', error);
      this.state.notify('error', `Processing failed: ${error.message}`);

      // Show action section again
      document.getElementById('processingProgress').style.display = 'none';
      document.getElementById('processingAction').style.display = 'block';
    }
  }

  updateProgress(percent, status) {
    const progressBar = document.getElementById('progressBar');
    const progressPercent = document.getElementById('progressPercent');
    const progressStatus = document.getElementById('progressStatus');

    if (progressBar) progressBar.style.width = `${percent}%`;
    if (progressPercent) progressPercent.textContent = `${percent}%`;
    if (progressStatus) progressStatus.textContent = status;
  }

  onProcessingComplete(result) {
    console.log('[TemplateModule] Processing complete:', result);

    // Hide progress, show results
    document.getElementById('processingProgress').style.display = 'none';
    document.getElementById('processingResults').style.display = 'block';

    // Display results
    const resultsDetails = document.getElementById('resultsDetails');
    if (resultsDetails) {
      resultsDetails.innerHTML = `
        <div class="detail-row">
          <span>Output:</span>
          <span>${result.outputPath}</span>
        </div>
        <div class="detail-row">
          <span>Processing Time:</span>
          <span>${result.processingTime}</span>
        </div>
        <div class="detail-row">
          <span>Items Processed:</span>
          <span>${result.itemsProcessed}</span>
        </div>
      `;
    }

    // Mark processing complete
    this.processingComplete = true;

    // Show success notification
    this.state.notify('success', 'Processing completed successfully!');
  }

  // ===========================================================================
  // RESULTS & RESET
  // ===========================================================================

  downloadResults() {
    // In a real module, trigger download from server
    console.log('[TemplateModule] Downloading results...');
    this.state.notify('info', 'Download started');
  }

  reset() {
    console.log('[TemplateModule] Resetting module...');

    // Reset state flags
    this.filesValidated = false;
    this.configSaved = false;
    this.processingComplete = false;
    this.uploadedFile = null;

    // Reset UI
    document.getElementById('processingAction').style.display = 'block';
    document.getElementById('processingProgress').style.display = 'none';
    document.getElementById('processingResults').style.display = 'none';

    // Reset step 1
    const step1Next = document.getElementById('step1Next');
    if (step1Next) step1Next.disabled = true;

    // Clear validation display
    if (this.validationDisplay) {
      this.validationDisplay.hide();
    }

    // Reset file selector
    if (this.fileSelector) {
      this.fileSelector.refresh();
    }

    // Go back to step 1
    this.goToStep(1);
  }

  // ===========================================================================
  // UTILITIES
  // ===========================================================================

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ===========================================================================
  // CLEANUP
  // ===========================================================================

  async deactivate() {
    console.log('[TemplateModule] Deactivating...');

    // Disconnect Socket.IO if connected
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }

    // Clean up global references (use try-catch for non-configurable properties)
    const globalsToClean = ['templateModule', 'nextStep', 'previousStep', 'startProcessing'];
    for (const name of globalsToClean) {
      try {
        delete window[name];
      } catch (e) {
        window[name] = undefined;
      }
    }

    // Call parent deactivate
    await super.deactivate();

    console.log('[TemplateModule] Deactivated');
  }
}

// =============================================================================
// EXPORT
// =============================================================================

export default TemplateModule;
