/**
 * TrainingHandler.js - Training Execution for DL Denoising Module
 *
 * Handles training initiation and configuration preparation.
 */

import TrainingSessionPersistence from '/workspace/js/services/TrainingSessionPersistence.js';

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

    // Check global training lock
    const lockOwner = TrainingSessionPersistence.getLockOwner();
    if (lockOwner && lockOwner.moduleType !== 'denoising-dl') {
      const ownerName = TrainingSessionPersistence.getModuleName(lockOwner.moduleType);
      this.module.state.notify('error', `Training already in progress in ${ownerName} module. Please wait for it to complete or cancel it first.`);
      return;
    }

    if (!this.module.uploadedFile || !this.module.selectedMethod) {
      this.module.state.notify('error', 'Please select a file and method first');
      return;
    }

    // Read all current form values before starting training
    this.module.saveConfig();

    console.log('[TrainingHandler] Training config:', JSON.stringify(this.module.trainingConfig, null, 2));

    // bg_side is the one required extractor input for autoStructN2V
    if (this.module.selectedMethod === 'autostructn2v' &&
        !['light', 'dark', 'off'].includes(this.module.trainingConfig.maskExtractor?.bg_side)) {
      this.module.state.notify('error',
        'Please select the background side (light/dark/off) in the Configure step.');
      this.module.goToStep(2);
      return;
    }

    // Prepare training configuration in the format expected by backend
    // Backend expects: { method, mode, config, inputPath }; routed training
    // is 2D only. For autoStructN2V, pauseAfterMask shows the discovered
    // mask + routing decision (seconds) for approval BEFORE any training.
    const trainingConfig = {
      method: this.module.selectedMethod,
      mode: '2d',
      inputPath: this.module.uploadedFile.path,
      config: {
        stage1: this.module.trainingConfig.stage1,
        stage2: this.module.selectedMethod === 'autostructn2v' ? this.module.trainingConfig.stage2 : null,
        maskExtractor: this.module.selectedMethod === 'autostructn2v' ? this.module.trainingConfig.maskExtractor : null,
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

        // Acquire global training lock
        TrainingSessionPersistence.acquireLock('denoising-dl', result.trainingId);

        // Save session to localStorage for persistence across page refresh
        // Include method in config so we can restore charts correctly on resume
        TrainingSessionPersistence.save({
          moduleType: 'denoising-dl',
          trainingId: result.trainingId,
          stage: 'training',
          config: {
            ...this.module.trainingConfig,
            method: this.module.selectedMethod,
            mode: this.module.selectedMode
          },
          status: 'running'
        });

        // Connect to Socket.IO for progress updates
        this.module.connectToTrainingSocket();

        // Start the training progress component
        if (this.module.trainingProgress) {
          this.module.trainingProgress.start();
        }

        this.module.state.notify('info', 'Training started. This may take several minutes.');
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
