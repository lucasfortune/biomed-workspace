/**
 * InferenceHandler.js - Inference Execution for Segmentation Module
 *
 * Handles inference initiation, progress updates, and completion.
 * Converted from global functions to ES6 class for better maintainability.
 */

class InferenceHandler {
  /**
   * @param {SegmentationModule} module - Reference to the parent module
   */
  constructor(module) {
    this.module = module;
  }

  /**
   * Run inference with current model and data
   */
  async runInference() {
    // Get uploaded files from module
    const uploadedFiles = this.module.uploadedFiles || {};
    if (!uploadedFiles.inference_data) {
      this.showError('Please upload inference data first.');
      return;
    }

    // Check if we're using imported model OR have training session
    const usingImportedModel = window.importedModelInfo;
    const trainingId = this.module.currentTrainingId;
    if (!trainingId && !usingImportedModel) {
      this.showError('No training session found and no imported model. Please complete training or import a model first.');
      return;
    }

    this.showLoading('Preparing inference...', 'Uploading data and starting segmentation.');

    try {
      let uploadResult;

      // Check if we're using test data
      if (uploadedFiles.inference_data.isTestData) {
        console.log('[InferenceHandler] Using test data for inference');

        // For test data, send a special request to handle server-side file copying
        const testDataForm = new FormData();
        testDataForm.append('isTestData', 'true');

        const uploadResponse = await fetch('/upload-inference', {
          method: 'POST',
          body: testDataForm
        });

        uploadResult = await uploadResponse.json();
        if (!uploadResult.success) {
          throw new Error(uploadResult.error);
        }

      } else {
        // Handle regular uploaded files
        const formData = new FormData();
        formData.append('inference_data', uploadedFiles.inference_data);

        const uploadResponse = await fetch('/upload-inference', {
          method: 'POST',
          body: formData
        });

        uploadResult = await uploadResponse.json();
        if (!uploadResult.success) {
          throw new Error(uploadResult.error);
        }
      }

      // Build inference request based on model type
      let inferenceRequestBody;

      if (usingImportedModel) {
        console.log('[InferenceHandler] Running inference with imported model');
        inferenceRequestBody = {
          data_path: uploadResult.file_path,
          output_path: `results/segmentation/imported_model_${Date.now()}/segmented/inference_result.tif`,
        };
      } else {
        console.log('[InferenceHandler] Running inference with trained model');
        inferenceRequestBody = {
          model_path: `models/${trainingId}/best_model.pth`,
          data_path: uploadResult.file_path,
          output_path: `results/segmentation/${trainingId}/segmented/inference_result.tif`,
          training_id: trainingId
        };
      }

      // Start inference
      const inferenceResponse = await fetch('/run-inference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(inferenceRequestBody)
      });

      const inferenceResult = await inferenceResponse.json();

      if (inferenceResult.success) {
        // Store inference ID in module instance
        this.module.currentInferenceId = inferenceResult.inference_id;
        console.log('[InferenceHandler] Stored inference ID:', inferenceResult.inference_id);

        // Mark inference as in progress
        if (typeof processStates !== 'undefined') {
          processStates.inferenceInProgress = true;
        }
        if (typeof updateNavigationButtons === 'function') {
          updateNavigationButtons();
        }

        console.log('[InferenceHandler] Inference started successfully:', inferenceResult.model_info);

        // Join inference room via module socket
        if (this.module.socket) {
          this.module.socket.emit('join-inference', this.module.currentInferenceId);
        }

        // Show progress container
        const progressContainer = document.getElementById('inferenceProgressContainer');
        if (progressContainer) {
          progressContainer.style.display = 'block';
        }

        // Update UI to show progress tracking
        this.updateInferenceLoadingUI();

        // Initialize progress display
        const currentSliceEl = document.getElementById('currentSlice');
        const totalSlicesEl = document.getElementById('totalSlices');
        const progressPercentEl = document.getElementById('inferenceProgressPercent');
        const progressBarEl = document.getElementById('inferenceProgressBar');

        if (currentSliceEl) currentSliceEl.textContent = '0';
        if (totalSlicesEl) totalSlicesEl.textContent = '...';
        if (progressPercentEl) progressPercentEl.textContent = '0%';
        if (progressBarEl) progressBarEl.style.width = '0%';

      } else {
        this.hideLoading();
        this.showError('Failed to start inference: ' + (inferenceResult.error || 'Unknown error') +
          (inferenceResult.details ? ('\n' + inferenceResult.details) : ''));
      }

    } catch (error) {
      this.hideLoading();
      this.showError('Error during inference: ' + error.message);
    }
  }

  /**
   * Update inference progress display
   * @param {Object} data - Progress data from socket
   */
  updateInferenceProgress(data) {
    const { current_slice, total_slices, progress_percent } = data;

    // Validate data
    if (current_slice === undefined || total_slices === undefined || progress_percent === undefined) {
      console.warn('[InferenceHandler] Incomplete inference progress data:', data);
      return;
    }

    // Update slice counters
    const currentSliceEl = document.getElementById('currentSlice');
    if (currentSliceEl) {
      currentSliceEl.textContent = current_slice;
    }

    const totalSlicesEl = document.getElementById('totalSlices');
    if (totalSlicesEl) {
      totalSlicesEl.textContent = total_slices;
    }

    // Update progress bar
    const progressBarEl = document.getElementById('inferenceProgressBar');
    if (progressBarEl) {
      const safeProgress = Math.min(100, Math.max(0, progress_percent));
      progressBarEl.style.width = safeProgress + '%';
    }

    const progressPercentEl = document.getElementById('inferenceProgressPercent');
    if (progressPercentEl) {
      progressPercentEl.textContent = Math.round(progress_percent) + '%';
    }

    // When inference reaches 100%, show finalizing message
    if (progress_percent >= 100) {
      console.log('[InferenceHandler] Inference complete, finalizing results...');
      this.showLoading('Finalizing Results', 'Saving segmentation results...');
    }

    // If elements don't exist, try to recreate the UI
    if (!currentSliceEl || !totalSlicesEl || !progressBarEl || !progressPercentEl) {
      console.log('[InferenceHandler] Some progress elements not found, checking loading overlay...');
      const loadingOverlay = document.getElementById('loadingOverlay');
      if (loadingOverlay && loadingOverlay.style.display !== 'none') {
        this.updateInferenceLoadingUI();
        // Retry updating with the new elements
        setTimeout(() => this.updateInferenceProgress(data), 100);
      }
    }
  }

  /**
   * Handle inference completion
   * @param {Object} data - Completion data
   */
  onInferenceComplete(data) {
    this.hideLoading();

    // Hide progress container
    const progressContainer = document.getElementById('inferenceProgressContainer');
    if (progressContainer) {
      progressContainer.style.display = 'none';
    }

    if (data.success) {
      // Mark step 4 as completed
      if (typeof stepStates !== 'undefined') {
        stepStates[4].completed = true;
      }
      if (typeof markStepCompleted === 'function') {
        markStepCompleted(4);
      }

      // Update process states
      if (typeof processStates !== 'undefined') {
        processStates.inferenceInProgress = false;
      }

      // Store inference result
      if (data.result) {
        window.inferenceResult = data.result;
      } else {
        console.log('[InferenceHandler] No data.result found, creating fallback result');

        // Handle both training and imported model cases
        const usingImportedModel = window.importedModelInfo;
        const trainingId = this.module.currentTrainingId;
        const baseResultPath = usingImportedModel
          ? `/results/segmentation/imported_model_${Date.now()}`
          : `/results/segmentation/${trainingId}`;

        window.inferenceResult = {
          success: true,
          output_path: `${baseResultPath}/segmented/inference_result.tif`,
          metadata_path: `${baseResultPath}/segmented/inference_result_metadata.json`
        };
      }

      // Store inference ID from module instance
      const inferenceId = this.module.currentInferenceId;
      if (inferenceId) {
        window.inferenceResult.inference_id = inferenceId;
        console.log('[InferenceHandler] Stored inference ID:', inferenceId);
      }

      // Show completion section with viewer button
      const completionSection = document.getElementById('inferenceCompletionSection');
      if (completionSection) {
        completionSection.style.display = 'block';
      }

      // Update navigation buttons
      if (typeof updateNavigationButtons === 'function') {
        updateNavigationButtons();
      }

      // Refresh file browser to show newly created inference result files
      if (window.workspace && window.workspace.fileBrowser) {
        window.workspace.fileBrowser.refresh();
      }

    } else {
      this.showError('Inference failed: ' + (data.error || 'Unknown error'));
      if (typeof processStates !== 'undefined') {
        processStates.inferenceInProgress = false;
      }
    }
  }

  /**
   * Update the loading overlay with inference progress elements
   */
  updateInferenceLoadingUI() {
    const loadingText = document.getElementById('loadingText');
    const loadingDescription = document.getElementById('loadingDescription');

    if (loadingText) {
      loadingText.textContent = 'Processing slices...';
    }

    if (loadingDescription) {
      loadingDescription.innerHTML = `
        <div id="inferenceProgressContainer" style="margin-top: 20px; text-align: center;">
          <div style="margin-bottom: 15px; font-size: 16px;">
            Slice <span id="currentSlice" style="font-weight: bold; color: #4CAF50;">0</span>
            of <span id="totalSlices" style="font-weight: bold; color: #4CAF50;">...</span>
          </div>
          <div style="background: #e0e0e0; height: 15px; border-radius: 8px; margin: 15px 0; overflow: hidden; box-shadow: inset 0 2px 4px rgba(0,0,0,0.1);">
            <div id="inferenceProgressBar" style="background: linear-gradient(90deg, #4CAF50, #81C784); height: 100%; width: 0%; transition: width 0.3s ease; border-radius: 8px;"></div>
          </div>
          <div id="inferenceProgressPercent" style="font-size: 18px; font-weight: bold; color: #4CAF50;">0%</div>
          <div style="margin-top: 15px; font-size: 14px; color: #666;">
            <div>Initializing segmentation process...</div>
            <div style="margin-top: 5px; font-size: 12px; color: #999;">
              Progress updates will appear once processing begins
            </div>
          </div>
        </div>
      `;
    }
  }

  /**
   * Download inference results
   */
  downloadResults() {
    const inferenceId = this.module.currentInferenceId;
    if (window.inferenceResult && inferenceId) {
      console.log('[InferenceHandler] Downloading results for inference ID:', inferenceId);
      window.open(`/download-inference-results/${inferenceId}`, '_blank');
    } else if (window.inferenceResult && window.inferenceResult.output_path) {
      console.log('[InferenceHandler] Fallback: Using result path directly');
      window.open(window.inferenceResult.output_path, '_blank');
    } else {
      this.showError('No inference results available for download. Please run segmentation first.');
    }
  }

  // Helper methods that delegate to module or use fallbacks

  showLoading(title, description) {
    if (this.module.showLoading) {
      this.module.showLoading(title, description);
    } else if (typeof window.showLoading === 'function') {
      window.showLoading(title, description);
    }
  }

  hideLoading() {
    if (this.module.hideLoading) {
      this.module.hideLoading();
    } else if (typeof window.hideLoading === 'function') {
      window.hideLoading();
    }
  }

  showError(message) {
    if (this.module.state) {
      this.module.state.notify('error', message, 5000);
    } else if (typeof window.showError === 'function') {
      window.showError(message);
    } else {
      console.error('[InferenceHandler]', message);
    }
  }
}

export default InferenceHandler;
