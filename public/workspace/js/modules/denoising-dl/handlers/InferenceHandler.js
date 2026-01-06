/**
 * InferenceHandler.js - Inference Management for DL Denoising Module
 *
 * Handles inference operations including:
 * - Step 4 UI initialization
 * - File selection for inference input
 * - Running inference with Socket.IO progress updates
 * - Sequential processing for autoStructN2V
 * - Success state and navigation to Image Viewer
 */

import { FileSelector, ValidationDisplay } from '/workspace/js/core/components/index.js';
import Templates from '../templates/Templates.js';

class InferenceHandler {
  /**
   * @param {DLDenoisingModule} module - Reference to the parent module
   */
  constructor(module) {
    this.module = module;

    // Inference state
    this.inferenceFileSelector = null;
    this.inferenceValidationDisplay = null;
    this.inferenceInputFile = null;
    this.inferenceInputValidated = false;
    this.inferenceId = null;
    this.inferenceResult = null;
    this.isProcessing = false;

    // Bind methods
    this.onInferenceInputSelected = this.onInferenceInputSelected.bind(this);
    this.onInferenceInputUploaded = this.onInferenceInputUploaded.bind(this);
    this.processData = this.processData.bind(this);
  }

  /**
   * Initialize Step 4 UI
   */
  initializeStep4UI() {
    console.log('[InferenceHandler] Initializing Step 4 UI...');

    // Show model info
    this.renderModelInfo();

    // Initialize validation display
    this.inferenceValidationDisplay = new ValidationDisplay('inferenceValidationResult');

    // Initialize file selector
    const container = document.getElementById('inferenceFileSelectorContainer');
    if (container) {
      this.inferenceFileSelector = new FileSelector({
        id: 'inference_input',
        fileType: 'raw',  // Updated to use unified 'raw' category
        // No filterTags - denoising accepts any raw image for inference
        title: 'Input Image Stack',
        icon: '📁',
        helpIconHtml: Templates.renderHelpIcon('denoising-dl.step4.data'),
        showTestData: true,
        testDataOptions: [
          {
            value: 'denoising_test_data',
            label: 'Test Dataset - Denoising'
          }
        ],
        stateManager: this.module.state,
        onSelect: this.onInferenceInputSelected,
        onUpload: this.onInferenceInputUploaded
      });
      container.innerHTML = this.inferenceFileSelector.render();
      this.inferenceFileSelector.init();
    }

    // Set up event listeners
    this.setupEventListeners();

    // Reset state
    this.resetInferenceState();
  }

  /**
   * Set up event listeners for Step 4
   */
  setupEventListeners() {
    // Process button
    document.getElementById('processDataBtn')?.addEventListener('click', this.processData);

    // Open in viewer button
    document.getElementById('openInViewerBtn')?.addEventListener('click', () => {
      this.openInViewer();
    });

    // Process more button
    document.getElementById('processMoreBtn')?.addEventListener('click', () => {
      this.processMore();
    });
  }

  /**
   * Render model information section
   */
  renderModelInfo() {
    const container = document.getElementById('modelInfoContent');
    if (!container) return;

    const method = this.module.selectedMethod;
    const methodLabel = method === 'autostructn2v' ? 'autoStructN2V' : 'N2V';
    const workflowMode = this.module.workflowMode;

    let modelSource = '';
    let modelDetails = '';

    if (workflowMode === 'import') {
      modelSource = 'Imported Model';
      const importConfig = this.module.importedModelConfig;
      if (importConfig && importConfig.configData) {
        // Use shared config data
        const configData = importConfig.configData;
        const stage1 = configData.stage1 || {};
        modelDetails = `
          <div class="model-detail">
            <span class="detail-label">Method:</span>
            <span class="detail-value">${methodLabel}</span>
          </div>
          <div class="model-detail">
            <span class="detail-label">Stage 1:</span>
            <span class="detail-value">Features: ${stage1.features || 64}, Layers: ${stage1.num_layers || 2}</span>
          </div>
        `;
        if (method === 'autostructn2v' && configData.stage2) {
          const stage2 = configData.stage2;
          modelDetails += `
            <div class="model-detail">
              <span class="detail-label">Stage 2:</span>
              <span class="detail-value">Features: ${stage2.features || 64}, Layers: ${stage2.num_layers || 2}</span>
            </div>
          `;
        }
      }
    } else {
      modelSource = 'Trained Model';
      modelDetails = `
        <div class="model-detail">
          <span class="detail-label">Method:</span>
          <span class="detail-value">${methodLabel}</span>
        </div>
        <div class="model-detail">
          <span class="detail-label">Training ID:</span>
          <span class="detail-value">${this.module.trainingId || 'N/A'}</span>
        </div>
      `;
    }

    container.innerHTML = `
      <div class="model-source">${modelSource}</div>
      ${modelDetails}
    `;
  }

  /**
   * Handle file selection for inference input
   */
  async onInferenceInputSelected(fileInfo) {
    console.log('[InferenceHandler] Input file selected:', fileInfo);

    if (!fileInfo) {
      this.inferenceInputFile = null;
      this.inferenceInputValidated = false;
      this.updateProcessButton();
      return;
    }

    // Handle test data
    if (fileInfo.isTestData) {
      try {
        this.inferenceValidationDisplay.showLoading('Loading test data...');
        const result = await this.module.api.loadTestData();

        if (result.success && result.file) {
          this.inferenceInputFile = {
            id: result.file.id,
            name: result.file.name,
            path: result.file.path,
            isTestData: true
          };

          // Refresh file browser
          if (window.workspace?.fileBrowser) {
            window.workspace.fileBrowser.refresh();
          }

          // Validate the file
          await this.validateInferenceInput(result.file.path);
        } else {
          throw new Error(result.error || 'Failed to load test data');
        }
      } catch (error) {
        console.error('[InferenceHandler] Error loading test data:', error);
        this.inferenceValidationDisplay.showError('Error', error.message);
        this.module.state.notify('error', `Failed to load test data: ${error.message}`);
      }
      return;
    }

    // Regular file selection
    this.inferenceInputFile = fileInfo;
    await this.validateInferenceInput(fileInfo.path);
  }

  /**
   * Handle file upload for inference input
   */
  async onInferenceInputUploaded(file, uploadedFile) {
    console.log('[InferenceHandler] Input file uploaded:', uploadedFile);

    this.inferenceInputFile = {
      id: uploadedFile.id,
      name: uploadedFile.name || file.name,
      path: uploadedFile.path,
      isTestData: false
    };

    // Refresh file browser
    if (window.workspace?.fileBrowser) {
      window.workspace.fileBrowser.refresh();
    }

    await this.validateInferenceInput(uploadedFile.path);
  }

  /**
   * Validate inference input file
   */
  async validateInferenceInput(filePath) {
    console.log('[InferenceHandler] Validating input:', filePath);

    this.inferenceValidationDisplay.showLoading('Validating file...');
    this.inferenceInputValidated = false;

    try {
      const result = await this.module.api.validateFile(filePath);
      console.log('[InferenceHandler] Validation result:', result);

      if (result.valid) {
        const details = [
          { label: 'Filename', value: result.info?.filename || this.inferenceInputFile?.name },
          { label: 'Dimensions', value: `${result.info?.dimensions?.width} x ${result.info?.dimensions?.height}` },
          { label: 'Slices', value: result.info?.num_slices?.toString() },
          { label: 'Bit Depth', value: `${result.info?.bit_depth}-bit` }
        ];

        this.inferenceValidationDisplay.showSuccess('File Valid', details);
        this.inferenceInputValidated = true;
      } else {
        const errorMessage = result.errors?.join('; ') || 'Unknown validation error';
        this.inferenceValidationDisplay.showError('Validation Failed', errorMessage);
      }
    } catch (error) {
      console.error('[InferenceHandler] Validation error:', error);
      this.inferenceValidationDisplay.showError('Validation Error', error.message);
    }

    this.updateProcessButton();
  }

  /**
   * Update the Process button state
   */
  updateProcessButton() {
    const btn = document.getElementById('processDataBtn');
    if (btn) {
      btn.disabled = !this.inferenceInputValidated || this.isProcessing;
    }
  }

  /**
   * Process data - run inference
   */
  async processData() {
    if (!this.inferenceInputValidated || this.isProcessing) return;

    console.log('[InferenceHandler] Starting inference...');
    this.isProcessing = true;
    this.updateProcessButton();

    // Show progress section
    const progressSection = document.getElementById('inferenceProgressSection');
    const successSection = document.getElementById('inferenceSuccessSection');
    const actionsSection = document.getElementById('inferenceActions');

    if (progressSection) progressSection.style.display = 'block';
    if (successSection) successSection.style.display = 'none';
    if (actionsSection) actionsSection.style.display = 'none';

    this.updateProgress(0, 'Initializing...');

    try {
      // Determine model paths based on workflow
      let inferenceParams;

      if (this.module.workflowMode === 'import') {
        // Use imported model paths with shared config
        const importConfig = this.module.importedModelConfig;
        inferenceParams = {
          inputPath: this.inferenceInputFile.path,
          modelPaths: {
            stage1: importConfig.stage1?.modelPath,
            stage2: importConfig.stage2?.modelPath || null
          },
          configPath: importConfig.configPath,  // Shared config file
          method: this.module.selectedMethod,
          isImported: true
        };
      } else {
        // Use trained model from training session
        inferenceParams = {
          trainingId: this.module.trainingId,
          inputPath: this.inferenceInputFile.path,
          method: this.module.selectedMethod
        };
      }

      console.log('[InferenceHandler] Inference params:', inferenceParams);

      // Start inference
      const result = await this.module.api.runInference(inferenceParams);

      if (result.success) {
        this.inferenceId = result.inferenceId;
        // Connect to Socket.IO for progress updates
        this.connectToInferenceSocket();
      } else {
        throw new Error(result.error || 'Failed to start inference');
      }

    } catch (error) {
      console.error('[InferenceHandler] Error starting inference:', error);
      this.module.state.notify('error', `Failed to start inference: ${error.message}`);
      this.isProcessing = false;
      this.updateProcessButton();
      if (progressSection) progressSection.style.display = 'none';
      if (actionsSection) actionsSection.style.display = 'flex';
    }
  }

  /**
   * Connect to Socket.IO for inference progress updates
   */
  connectToInferenceSocket() {
    if (!this.inferenceId) return;

    console.log('[InferenceHandler] Connecting to inference socket...');

    const socket = io();
    this.socket = socket;

    socket.on('connect', () => {
      console.log('[InferenceHandler] Socket connected, joining room...');
      socket.emit('join-denoising-inference', this.inferenceId);
    });

    socket.on('denoising-inference-progress', (data) => {
      this.handleInferenceProgress(data);
    });

    socket.on('denoising-inference-complete', (data) => {
      this.handleInferenceComplete(data);
    });

    socket.on('denoising-error', (data) => {
      this.handleInferenceError(data);
    });
  }

  /**
   * Handle inference progress update
   */
  handleInferenceProgress(data) {
    console.log('[InferenceHandler] Progress:', data);

    const percent = data.progress_percent || 0;
    const stage = data.stage || 'stage1';
    const sliceInfo = data.current_slice && data.total_slices
      ? `Slice ${data.current_slice} of ${data.total_slices}`
      : '';

    let statusText = 'Processing...';
    if (stage === 'stage1') {
      statusText = this.module.selectedMethod === 'autostructn2v'
        ? `Stage 1 (N2V): ${sliceInfo}`
        : `Denoising: ${sliceInfo}`;
    } else if (stage === 'stage2') {
      statusText = `Stage 2 (Struct-N2V): ${sliceInfo}`;
    }

    this.updateProgress(percent, statusText);
  }

  /**
   * Handle inference completion
   */
  handleInferenceComplete(data) {
    console.log('[InferenceHandler] Complete:', data);

    // Check if this is a success (has outputPath) or failure (has success: false)
    if (data.outputPath || data.success === true) {
      this.inferenceResult = data;
      this.showSuccess(data);
    } else if (data.success === false || data.error) {
      this.handleInferenceError({ message: data.error || 'Inference failed' });
    } else {
      // Unknown format - treat as success if we have any result data
      this.inferenceResult = data;
      this.showSuccess(data);
    }

    // Disconnect socket
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }

    this.isProcessing = false;
  }

  /**
   * Handle inference error
   */
  handleInferenceError(data) {
    console.error('[InferenceHandler] Error:', data);

    this.module.state.notify('error', data.message || 'Inference failed');

    // Hide progress, show actions
    const progressSection = document.getElementById('inferenceProgressSection');
    const actionsSection = document.getElementById('inferenceActions');

    if (progressSection) progressSection.style.display = 'none';
    if (actionsSection) actionsSection.style.display = 'flex';

    this.isProcessing = false;
    this.updateProcessButton();

    // Disconnect socket
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  /**
   * Update progress display
   */
  updateProgress(percent, statusText) {
    const progressBar = document.getElementById('inferenceProgressBar');
    const progressText = document.getElementById('inferenceProgressText');
    const statusEl = document.getElementById('inferenceStatusText');

    if (progressBar) progressBar.style.width = `${percent}%`;
    if (progressText) progressText.textContent = `${Math.round(percent)}%`;
    if (statusEl) statusEl.textContent = statusText;
  }

  /**
   * Show success state
   */
  showSuccess(data) {
    const progressSection = document.getElementById('inferenceProgressSection');
    const successSection = document.getElementById('inferenceSuccessSection');
    const resultInfo = document.getElementById('inferenceResultInfo');

    if (progressSection) progressSection.style.display = 'none';
    if (successSection) successSection.style.display = 'block';

    if (resultInfo && data) {
      const outputPath = data.output_path || data.outputPath;
      const filename = outputPath ? outputPath.split('/').pop() : 'denoised_output.tif';
      const slices = data.totalSlices || data.total_slices || data.slicesProcessed || data.slices_processed || 'N/A';

      resultInfo.innerHTML = `
        <div class="result-detail">
          <span class="result-label">Output:</span>
          <span class="result-value">${filename}</span>
        </div>
        <div class="result-detail">
          <span class="result-label">Slices processed:</span>
          <span class="result-value">${slices}</span>
        </div>
      `;
    }

    // Refresh file browser to show new output
    if (window.workspace?.fileBrowser) {
      window.workspace.fileBrowser.refresh();
    }

    this.module.state.notify('success', 'Inference complete!');
  }

  /**
   * Open result in Image Viewer
   */
  openInViewer() {
    if (!this.inferenceResult) {
      this.module.state.notify('error', 'No inference result to view');
      return;
    }

    const outputPath = this.inferenceResult.output_path || this.inferenceResult.outputPath;
    if (!outputPath) {
      this.module.state.notify('error', 'Output path not found');
      return;
    }

    console.log('[InferenceHandler] Opening in viewer:', outputPath);

    // Store path for Image Viewer module
    this.module.state.update('modules.image-viewer.pendingFile', {
      path: outputPath,
      source: 'denoising-dl'
    });

    // Navigate to Image Viewer
    window.workspace.loadModule('image-viewer');
  }

  /**
   * Process more - reset for another inference
   */
  processMore() {
    console.log('[InferenceHandler] Processing more...');

    // Reset UI
    const progressSection = document.getElementById('inferenceProgressSection');
    const successSection = document.getElementById('inferenceSuccessSection');
    const actionsSection = document.getElementById('inferenceActions');

    if (progressSection) progressSection.style.display = 'none';
    if (successSection) successSection.style.display = 'none';
    if (actionsSection) actionsSection.style.display = 'flex';

    // Reset state
    this.inferenceInputFile = null;
    this.inferenceInputValidated = false;
    this.inferenceId = null;
    this.inferenceResult = null;

    // Clear file selector
    if (this.inferenceFileSelector) {
      this.inferenceFileSelector.clearSelection();
    }

    // Clear validation display
    if (this.inferenceValidationDisplay) {
      this.inferenceValidationDisplay.reset();
    }

    this.updateProcessButton();
  }

  /**
   * Reset inference state
   */
  resetInferenceState() {
    this.inferenceInputFile = null;
    this.inferenceInputValidated = false;
    this.inferenceId = null;
    this.inferenceResult = null;
    this.isProcessing = false;

    // Reset UI
    const progressSection = document.getElementById('inferenceProgressSection');
    const successSection = document.getElementById('inferenceSuccessSection');
    const actionsSection = document.getElementById('inferenceActions');

    if (progressSection) progressSection.style.display = 'none';
    if (successSection) successSection.style.display = 'none';
    if (actionsSection) actionsSection.style.display = 'flex';

    this.updateProcessButton();
  }
}

export default InferenceHandler;
