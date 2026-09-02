/**
 * StateHandler.js - State Management for Segmentation Module
 *
 * Handles state persistence, resume functionality, and UI restoration.
 * Extracted from SegmentationModule.js for better maintainability.
 */

class StateHandler {
  /**
   * @param {SegmentationModule} module - Reference to the parent module
   */
  constructor(module) {
    this.module = module;
  }

  /**
   * Save current module state to StateManager for persistence
   */
  saveState() {
    const state = {
      currentStep: this.module.currentStep,
      uploadedFiles: this.module.uploadedFiles,
      currentTrainingId: this.module.currentTrainingId,
      currentInferenceId: this.module.currentInferenceId,
      currentTask: null,
      // Step condition flags
      filesValidated: this.module.filesValidated,
      configSaved: this.module.configSaved,
      trainingComplete: this.module.trainingComplete,
      hasImportedModel: this.module.hasImportedModel,
      // Workflow mode and import state
      workflowMode: this.module.workflowMode,
      importFiles: this.module.importFiles,
      importValidated: this.module.importValidated,
      importedModelConfig: this.module.importedModelConfig
    };

    // Preserve currentTask if it exists
    if (this.module.currentTrainingId) {
      state.currentTask = { type: 'training', trainingId: this.module.currentTrainingId };
    } else if (this.module.currentInferenceId) {
      state.currentTask = { type: 'inference', inferenceId: this.module.currentInferenceId };
    }

    // Update state in StateManager
    this.module.state.update('modules.segmentation.currentStep', this.module.currentStep);
    this.module.state.update('modules.segmentation.uploadedFiles', this.module.uploadedFiles);
    this.module.state.update('modules.segmentation.currentTrainingId', this.module.currentTrainingId);
    this.module.state.update('modules.segmentation.currentInferenceId', this.module.currentInferenceId);
    // Persist step condition flags
    this.module.state.update('modules.segmentation.filesValidated', this.module.filesValidated);
    this.module.state.update('modules.segmentation.configSaved', this.module.configSaved);
    this.module.state.update('modules.segmentation.trainingComplete', this.module.trainingComplete);
    this.module.state.update('modules.segmentation.hasImportedModel', this.module.hasImportedModel);
    // Persist workflow mode and import state
    this.module.state.update('modules.segmentation.workflowMode', this.module.workflowMode);
    this.module.state.update('modules.segmentation.importFiles', this.module.importFiles);
    this.module.state.update('modules.segmentation.importValidated', this.module.importValidated);
    this.module.state.update('modules.segmentation.importedModelConfig', this.module.importedModelConfig);
    if (state.currentTask) {
      this.module.state.update('modules.segmentation.currentTask', state.currentTask);
    }

    console.log('[StateHandler] State saved:', state);
  }

  /**
   * Check if there's a task to resume
   */
  async checkForResume() {
    // Skip if we already resumed via the training session dialog
    // (checkForActiveSession already handled navigation and UI setup)
    if (this.module._resumedViaDialog) {
      console.log('[StateHandler] Skipping checkForResume - already resumed via dialog');
      return;
    }

    const segmentationState = this.module.state.get('modules.segmentation');

    if (!segmentationState) {
      console.log('[StateHandler] No saved state to resume');
      return;
    }

    console.log('[StateHandler] Checking for resume:', segmentationState);

    // Restore uploaded files
    if (segmentationState.uploadedFiles) {
      this.module.uploadedFiles = segmentationState.uploadedFiles;
      console.log('[StateHandler] Restored uploaded files:', this.module.uploadedFiles);
    }

    // Restore step condition flags
    if (segmentationState.filesValidated !== undefined) {
      this.module.filesValidated = segmentationState.filesValidated;
    }
    if (segmentationState.configSaved !== undefined) {
      this.module.configSaved = segmentationState.configSaved;
    }
    if (segmentationState.trainingComplete !== undefined) {
      this.module.trainingComplete = segmentationState.trainingComplete;
    }
    if (segmentationState.hasImportedModel !== undefined) {
      this.module.hasImportedModel = segmentationState.hasImportedModel;
    }
    console.log('[StateHandler] Restored step flags:', {
      filesValidated: this.module.filesValidated,
      configSaved: this.module.configSaved,
      trainingComplete: this.module.trainingComplete,
      hasImportedModel: this.module.hasImportedModel
    });

    // Restore workflow mode and import state
    if (segmentationState.workflowMode) {
      this.module.workflowMode = segmentationState.workflowMode;
    }
    if (segmentationState.importFiles) {
      this.module.importFiles = segmentationState.importFiles;
    }
    if (segmentationState.importValidated !== undefined) {
      this.module.importValidated = segmentationState.importValidated;
    }
    if (segmentationState.importedModelConfig) {
      this.module.importedModelConfig = segmentationState.importedModelConfig;
    }
    console.log('[StateHandler] Restored workflow state:', {
      workflowMode: this.module.workflowMode,
      importValidated: this.module.importValidated
    });

    // Restore training/inference IDs
    if (segmentationState.currentTrainingId) {
      this.module.currentTrainingId = segmentationState.currentTrainingId;
      console.log('[StateHandler] Restored training ID:', this.module.currentTrainingId);
    }

    if (segmentationState.currentInferenceId) {
      this.module.currentInferenceId = segmentationState.currentInferenceId;
      console.log('[StateHandler] Restored inference ID:', this.module.currentInferenceId);
    }

    // Restore current step
    if (segmentationState.currentStep && segmentationState.currentStep !== 1) {
      console.log('[StateHandler] Restoring to step:', segmentationState.currentStep);
      this.module.goToStep(segmentationState.currentStep);

      // Rejoin Socket.IO rooms if needed
      if (segmentationState.currentTask) {
        if (segmentationState.currentTask.type === 'training' && this.module.socket) {
          this.module.socket.emit('join-training', segmentationState.currentTask.trainingId);
          console.log('[StateHandler] Rejoined training room');
        } else if (segmentationState.currentTask.type === 'inference' && this.module.socket) {
          this.module.socket.emit('join-inference', segmentationState.currentTask.inferenceId);
          console.log('[StateHandler] Rejoined inference room');
        }
      }
    }

    // If we have uploaded files on step 1, restore the validation UI
    if (this.module.currentStep === 1 && (this.module.uploadedFiles.raw_images || this.module.uploadedFiles.annotations)) {
      console.log('[StateHandler] Restoring step 1 validation UI');
      this.restoreStep1Validation();
    }

    // Restore training UI state if training is in progress
    if (segmentationState.currentTask?.type === 'training') {
      console.log('[StateHandler] Restoring training UI state');
      this.restoreTrainingUI();
    }

    // If we're on step 4 (inference), restore inference UI
    if (this.module.currentStep === 4 && this.module.uploadedFiles.inference_data) {
      console.log('[StateHandler] Restoring step 4 inference UI');
      this.restoreStep4InferenceUI();
    }
  }

  /**
   * Restore Step 1 validation UI after resume
   */
  restoreStep1Validation() {
    // Check if both files are present
    if (this.module.uploadedFiles.raw_images && this.module.uploadedFiles.annotations) {
      const step1Next = document.getElementById('step1Next');
      if (step1Next) {
        step1Next.disabled = false;
      }

      // Show validation success using ValidationDisplay component
      if (this.module.validationDisplay) {
        const details = [
          { label: 'Raw Images', value: this.module.uploadedFiles.raw_images.isTestData ? 'Test Dataset' : 'Custom Upload' },
          { label: 'Annotations', value: this.module.uploadedFiles.annotations.isTestData ? 'Test Dataset' : 'Custom Upload' },
          { label: 'Status', value: 'Files are ready. Click Next to configure training.' }
        ];
        this.module.validationDisplay.showSuccess('Files Loaded', details);
      }

      // Update FileSelector UI to show selected files
      if (this.module.rawImageSelector && this.module.uploadedFiles.raw_images) {
        this.module.rawImageSelector.setSelectedFile(this.module.uploadedFiles.raw_images);
      }
      if (this.module.annotationsSelector && this.module.uploadedFiles.annotations) {
        this.module.annotationsSelector.setSelectedFile(this.module.uploadedFiles.annotations);
      }
    }
  }

  /**
   * Restore training UI state (show progress, hide start button)
   */
  restoreTrainingUI() {
    // Toggle UI visibility (running: Start hidden, Cancel shown)
    this.module.applyTrainingUIState?.('running');

    // Ensure epoch counter is visible
    const epochInfo = document.querySelector('.epoch-info');
    if (epochInfo) {
      epochInfo.style.display = 'block';
    }

    // Set status text
    const statusText = document.getElementById('trainingStatusText');
    if (statusText) {
      statusText.textContent = 'Reconnecting to training...';
    }

    // Start polling as backup to Socket.IO
    if (typeof startTrainingPolling === 'function') {
      startTrainingPolling();
    }

    // Enable Next button (training may have completed while away)
    const trainingNextBtn = document.getElementById('trainingNextBtn');
    if (trainingNextBtn) {
      trainingNextBtn.disabled = false;
    }

    console.log('[StateHandler] Training UI state restored');
  }

  /**
   * Restore Step 4 inference UI after resume
   */
  restoreStep4InferenceUI() {
    // Enable run inference button
    const runInferenceBtn = document.getElementById('runInferenceBtn');
    if (runInferenceBtn) {
      runInferenceBtn.disabled = false;
    }

    // Update FileSelector UI to show selected file
    if (this.module.inferenceSelector && this.module.uploadedFiles.inference_data) {
      this.module.inferenceSelector.setSelectedFile(this.module.uploadedFiles.inference_data);
    }

    console.log('[StateHandler] Step 4 inference UI restored');
  }
}

export default StateHandler;
