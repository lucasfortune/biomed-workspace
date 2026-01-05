/**
 * TrainingHandler.js - Training Execution for DL Denoising Module
 *
 * Handles training initiation and configuration preparation.
 */

class TrainingHandler {
  /**
   * @param {DLDenoisingModule} module - Reference to the parent module
   */
  constructor(module) {
    this.module = module;
  }

  /**
   * Start the denoising training process
   */
  async startTraining() {
    console.log('[TrainingHandler] Starting training...');

    if (!this.module.uploadedFile || !this.module.selectedMethod) {
      this.module.state.notify('error', 'Please select a file and method first');
      return;
    }

    // Read all current form values before starting training
    this.module.saveConfig();

    console.log('[TrainingHandler] Training config:', JSON.stringify(this.module.trainingConfig, null, 2));

    // Prepare training configuration in the format expected by backend
    // Backend expects: { method, mode, config, inputPath }
    // For autoStructN2V, set pauseAfterMask to allow user to approve mask before Stage 2
    const trainingConfig = {
      method: this.module.selectedMethod,
      mode: this.module.selectedMode, // '2d' or '2.5d'
      inputPath: this.module.uploadedFile.path,
      config: {
        stage1: this.module.trainingConfig.stage1,
        stage2: this.module.selectedMethod === 'autostructn2v' ? this.module.trainingConfig.stage2 : null,
        maskExtractor: this.module.selectedMethod === 'autostructn2v' ? this.module.trainingConfig.maskExtractor : null,
        // Pause after mask extraction for user approval (autoStructN2V only)
        pauseAfterMask: this.module.selectedMethod === 'autostructn2v'
      }
    };

    try {
      // Update UI to show training in progress
      this.module.showTrainingInProgress();

      // Start training via API
      const result = await this.module.api.startTraining(trainingConfig);

      if (result.success) {
        this.module.trainingId = result.trainingId;

        // Save training ID to state for resume capability
        this.module.state.update(`modules.denoising-dl.trainingId`, this.module.trainingId);

        // Connect to Socket.IO for progress updates
        this.module.connectToTrainingSocket();

        // Start the training progress component
        if (this.module.trainingProgress) {
          this.module.trainingProgress.start();
        }

        this.module.state.notify('success', 'Training started. This may take several minutes.');
      } else {
        throw new Error(result.error || 'Failed to start training');
      }
    } catch (error) {
      console.error('[TrainingHandler] Error starting training:', error);
      this.module.state.notify('error', `Failed to start training: ${error.message}`);
      this.module.showTrainingReady();

      if (this.module.trainingProgress) {
        this.module.trainingProgress.fail(error.message);
      }
    }
  }
}

export default TrainingHandler;
