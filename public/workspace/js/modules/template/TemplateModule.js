/**
 * TemplateModule - Starter Template for New Modules
 *
 * This file demonstrates how to create a module using the BaseModule framework.
 * Copy this directory and customize for your new module.
 *
 * Features demonstrated:
 * - Extending BaseModule with step configuration
 * - Using StepNavigator, FileSelector, and ValidationDisplay components
 * - Conditional step navigation: canNavigateToStep() feeding StepNavigator's
 *   `canNavigate` option, so blocked steps cannot be clicked
 * - The shared step chrome: `.step-inner` wrappers, the job button in the
 *   nav row's right slot, and a `.section-card.success-card` result block
 * - Wiring every button with addEventListener (never inline onclick, never
 *   window.* free functions); delegated `data-action` for re-rendered markup
 * - Built-in sample files: seeded into every workspace, so they appear in
 *   FileSelector like any other file (no test-data config needed)
 * - Context-sensitive help via `helpIconHtml` (see renderHelpIcon)
 * - ValidationDisplay.renderContainer() for the validation slot
 * - State management integration
 * - Socket.IO for real-time updates
 * - Proper cleanup + reset-on-leave in deactivate()
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
    // NOTE: never assign to `this.config` - BaseModule keeps the module
    // configuration (id, name, steps, cssPath) there.
    this.processingConfig = null;
    this.socket = null;

    // =========================================================================
    // BIND METHODS
    // Bind methods that will be used as callbacks
    // =========================================================================

    this.onFileSelected = this.onFileSelected.bind(this);
    this.onFileUploaded = this.onFileUploaded.bind(this);
    this.startProcessing = this.startProcessing.bind(this);

    // Tracked listeners so deactivate() can remove every one of them
    this.eventListeners = [];
  }

  // ===========================================================================
  // HELP ICONS
  // Any label can carry a help icon that opens the info panel on the matching
  // article. Pass the markup to components through their `helpIconHtml`
  // option, or drop it straight into render() next to a heading. Article ids
  // are `<moduleId>.<step>.<topic>` and live under
  // /workspace/content/modules/<moduleId>/.
  // ===========================================================================

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

              <!-- Validation Display: the component owns the container markup -->
              ${ValidationDisplay.renderContainer('validationResult')}

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

              <!-- Navigation Buttons (wired in setupEventListeners) -->
              <div class="navigation-buttons">
                <button id="step2Back" class="btn secondary">Back</button>
                <button id="step2Next" class="btn">Next: Process</button>
              </div>
            </div>
          </div>

          <!-- =============================================================== -->
          <!-- STEP 3: Processing -->
          <!-- =============================================================== -->
          <div id="step3" class="step-content">
            <div class="step-inner">
              <h3>Processing</h3>
              <p class="step-description">
                Ready to process your data with the configured parameters.
              </p>

              <!-- Progress Section (shown during processing).
                   The track + fill come from module-base.css:
                   .progress-bar-container wraps a .job-progress-fill -->
              <div id="processingProgress" class="progress-section" style="display: none;">
                <div class="progress-info">
                  <span>Processing...</span>
                  <span id="progressPercent">0%</span>
                </div>
                <div class="progress-bar-container">
                  <div id="progressBar" class="job-progress-fill" style="width: 0%"></div>
                </div>
                <p id="progressStatus">Initializing...</p>
              </div>

              <!-- Results (shown after processing completes).
                   The standard result block: a .section-card.success-card
                   with a success header, details, and .success-actions -->
              <div class="section-card success-card" id="processingResults" style="display: none;">
                <div class="success-header">
                  <span class="success-icon">&#10003;</span>
                  <span class="success-title">Processing Complete</span>
                </div>

                <div id="resultsDetails" class="validation-details"></div>

                <div class="success-actions">
                  <button class="btn primary" id="downloadBtn">Download Results</button>
                  <button class="btn secondary" id="resetBtn">Start New Run</button>
                </div>
              </div>

              <!-- Navigation Buttons.
                   The primary job action lives in the nav row's right slot,
                   so there is exactly one enabled red button on the step. -->
              <div class="navigation-buttons">
                <button id="step3Back" class="btn secondary">Back</button>
                <button id="startProcessingBtn" class="btn primary">
                  <span class="btn-glyph">&#9658;</span> Start Processing
                </button>
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
        fileType: 'uploads',
        filterTags: ['raw'],
        title: 'Input Data',
        // `icon` takes a name from core/icons.js - never an emoji
        icon: 'image',
        // Help icon next to the picker heading (see renderHelpIcon above).
        // Placeholder id: no content/modules/template/ directory exists, so
        // point this at your own module's article once you copy the template.
        helpIconHtml: this.renderHelpIcon('template.step1.input-data'),
        // Built-in sample files are seeded into every workspace, so they show
        // up in this selector automatically alongside the user's own files.
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
    // Make Module Globally Accessible (debugging handle only - never rely on
    // window.* free functions such as window.nextStep for wiring buttons)
    // =========================================================================

    window.templateModule = this;

    console.log('[TemplateModule] Initialization complete');
  }

  // ===========================================================================
  // EVENT LISTENERS
  // Every button is wired here with addEventListener - no inline onclick in
  // render(). Listeners are tracked so deactivate() can remove them all.
  // ===========================================================================

  setupEventListeners() {
    const addListener = (element, event, handler) => {
      if (element) {
        element.addEventListener(event, handler);
        this.eventListeners.push({ element, event, handler });
      }
    };

    // Back to Hub button (rendered by BaseModule.renderHeader)
    addListener(document.getElementById('backToHub'), 'click', () => window.workspace.returnToHub());

    // Step navigation
    addListener(document.getElementById('step1Next'), 'click', () => this.nextStep());
    addListener(document.getElementById('step2Back'), 'click', () => this.previousStep());
    addListener(document.getElementById('step2Next'), 'click', () => this.nextStep());
    addListener(document.getElementById('step3Back'), 'click', () => this.previousStep());

    // Job action (nav row, step 3)
    addListener(document.getElementById('startProcessingBtn'), 'click', () => this.startProcessing());

    // Result actions
    addListener(document.getElementById('downloadBtn'), 'click', () => this.downloadResults());
    addListener(document.getElementById('resetBtn'), 'click', () => this.reset());

    // For markup you rebuild with innerHTML (a list of results, per-item
    // buttons, ...) the ids do not exist yet at this point. Delegate from the
    // stable parent instead and read the action off the button:
    //
    //   addListener(document.getElementById('resultsDetails'), 'click', (event) => {
    //     const btn = event.target.closest('button[data-action]');
    //     if (!btn) return;
    //     if (btn.dataset.action === 'open-viewer') this.openInImageViewer(btn.dataset.fileId);
    //   });
    //
    // One delegated listener survives every re-render - never write
    // onclick="..." into the generated HTML.
  }

  /**
   * Show/hide the nav-row job button. It is hidden while the job runs and
   * while the result card is shown; "Start New Run" brings it back.
   * @param {boolean} visible
   */
  setJobButtonVisible(visible) {
    const btn = document.getElementById('startProcessingBtn');
    if (btn) btn.style.display = visible ? '' : 'none';
  }

  // ===========================================================================
  // FILE SELECTION HANDLERS
  // ===========================================================================

  onFileSelected(fileInfo) {
    console.log('[TemplateModule] File selected:', fileInfo);

    // The selector reports null when the user clears the dropdown
    if (!fileInfo) {
      this.uploadedFile = null;
      this.filesValidated = false;
      this.validationDisplay.hide();
      const step1Next = document.getElementById('step1Next');
      if (step1Next) step1Next.disabled = true;
      return;
    }

    // Every selection (including the built-in samples) is a regular workspace
    // file, so there is nothing special to branch on.
    this.uploadedFile = fileInfo;

    // Show validation
    this.validationDisplay.showSuccess('File Selected', [
      { label: 'Name', value: fileInfo.displayName || fileInfo.name || 'Selected file' },
      { label: 'Type', value: 'Workspace File' }
    ]);

    // Enable next button
    this.filesValidated = true;
    const step1Next = document.getElementById('step1Next');
    if (step1Next) step1Next.disabled = false;
  }

  onFileUploaded(file, uploadResult) {
    console.log('[TemplateModule] File uploaded:', uploadResult);

    // uploadResult is the workspace file entry returned by the server
    this.uploadedFile = {
      id: uploadResult.id,
      name: uploadResult.name || file.name,
      path: uploadResult.path
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

    // Hide the job button, show progress
    this.setJobButtonVisible(false);
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

      // Offer the job button again so the run can be retried
      document.getElementById('processingProgress').style.display = 'none';
      this.setJobButtonVisible(true);
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

    // Hide progress, show results. The job button stays hidden until the
    // user asks for another run ("Start New Run").
    document.getElementById('processingProgress').style.display = 'none';
    document.getElementById('processingResults').style.display = 'block';
    this.setJobButtonVisible(false);

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

  /**
   * Put the module back into its fresh state.
   *
   * Called by "Start New Run" and by deactivate(): ModuleLoader caches the
   * instance and BaseModule.activate() only re-renders, so anything left in
   * an instance field would still be here on the user's next visit.
   */
  reset() {
    console.log('[TemplateModule] Resetting module...');

    // Reset state flags and data back to the constructor defaults
    this.filesValidated = false;
    this.configSaved = false;
    this.processingComplete = false;
    this.uploadedFile = null;
    this.processingConfig = null;

    // Reset UI (guarded: reset() may run while a step is not rendered)
    const progress = document.getElementById('processingProgress');
    if (progress) progress.style.display = 'none';
    const results = document.getElementById('processingResults');
    if (results) results.style.display = 'none';
    this.setJobButtonVisible(true);
    this.updateProgress(0, 'Initializing...');

    // Config form back to defaults
    const paramA = document.getElementById('paramA');
    if (paramA) paramA.value = 10;
    const paramB = document.getElementById('paramB');
    if (paramB) paramB.value = 'option1';
    const paramC = document.getElementById('paramC');
    if (paramC) paramC.checked = true;

    // Reset step 1
    const step1Next = document.getElementById('step1Next');
    if (step1Next) step1Next.disabled = true;

    // Clear validation display
    if (this.validationDisplay) {
      this.validationDisplay.hide();
    }

    // Clear the file selection (not just the file list)
    if (this.fileSelector) {
      this.fileSelector.clearSelection();
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

    // Reset on leave: the DOM still exists here (super.deactivate() clears
    // the container below), so reset() can touch it safely.
    this.reset();

    // Remove every listener registered in setupEventListeners()
    for (const { element, event, handler } of this.eventListeners) {
      element.removeEventListener(event, handler);
    }
    this.eventListeners = [];

    // Disconnect Socket.IO if connected
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }

    // Clean up global references (use try-catch for non-configurable properties)
    const globalsToClean = ['templateModule'];
    for (const name of globalsToClean) {
      try {
        delete window[name];
      } catch (e) {
        // Property may be non-configurable, try setting to undefined
        try {
          window[name] = undefined;
        } catch (e2) {
          // Property may also be non-writable, just log and continue
          console.warn(`[TemplateModule] Could not clean up window.${name}`);
        }
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
