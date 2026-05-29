/**
 * TrainingHandler.js - Training Execution for Segmentation Module
 *
 * Handles training initiation, progress updates, and completion.
 * Converted from global functions to ES6 class for better maintainability.
 */

import TrainingSessionPersistence from '/workspace/js/services/TrainingSessionPersistence.js';

class TrainingHandler {
  /**
   * @param {SegmentationModule} module - Reference to the parent module
   */
  constructor(module) {
    this.module = module;
    this.trainingPollInterval = null;
  }

  /**
   * Start training with current configuration
   */
  async startTraining() {
    // Check global training lock
    const lockOwner = TrainingSessionPersistence.getLockOwner();
    if (lockOwner && lockOwner.moduleType !== 'segmentation') {
      const ownerName = TrainingSessionPersistence.getModuleName(lockOwner.moduleType);
      this.module.state.notify('error', `Training already in progress in ${ownerName} module. Please wait for it to complete or cancel it first.`);
      return;
    }

    // Get configuration from form
    const config = {
      patch_size: parseInt(document.getElementById('patchSize').value),
      patches_per_image: parseInt(document.getElementById('patchesPerImage').value),
      batch_size: parseInt(document.getElementById('batchSize').value),
      augment: document.getElementById('augmentation').checked,
      features: parseInt(document.getElementById('numFeatures').value),
      num_layers: parseInt(document.getElementById('numLayers').value),
      learning_rate: parseFloat(document.getElementById('learningRate').value),
      num_epochs: parseInt(document.getElementById('numEpochs').value)
    };

    // Validate configuration
    if (!this.validateConfiguration(config)) {
      return;
    }

    this.showLoading('Starting training...', 'Preparing your model and data for training.');

    try {
      // Send configuration
      const configResponse = await fetch('/configure-training', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });

      if (!configResponse.ok) {
        throw new Error('Configuration failed');
      }

      // Start training
      const trainingResponse = await fetch('/start-training', {
        method: 'POST'
      });

      const result = await trainingResponse.json();
      this.hideLoading();

      if (result.success) {
        // Store training ID in module
        this.module.currentTrainingId = result.training_id;

        // Mark training as started (access global stepStates)
        if (typeof stepStates !== 'undefined') {
          stepStates[3].trainingStarted = true;
        }
        if (typeof processStates !== 'undefined') {
          processStates.trainingInProgress = true;
        }

        // Switch from action button to progress display
        const trainingActionContent = document.getElementById('trainingActionContent');
        const trainingProgressContent = document.getElementById('trainingProgressContent');

        if (trainingActionContent) {
          trainingActionContent.style.display = 'none';
        }
        if (trainingProgressContent) {
          trainingProgressContent.style.display = 'block';
        }

        // Initialize training UI
        document.getElementById('totalEpochs').textContent = config.num_epochs;
        document.getElementById('currentEpoch').textContent = '0';
        document.getElementById('trainingStatusText').textContent = 'Training started... Preparing data...';

        // Join training room via module socket
        if (this.module.socket) {
          this.module.socket.emit('join-training', this.module.currentTrainingId);
        }

        // Start polling as backup
        this.startTrainingPolling();

        // Update navigation buttons
        document.getElementById('trainingBackBtn').disabled = true;
        if (typeof updateNavigationButtons === 'function') {
          updateNavigationButtons();
        }

      } else {
        this.showError('Failed to start training: ' + result.error);
      }
    } catch (error) {
      this.hideLoading();
      this.showError('Error starting training: ' + error.message);
    }
  }

  /**
   * Validate training configuration
   * @param {Object} config - Training configuration
   * @returns {boolean} True if valid
   */
  validateConfiguration(config) {
    if (config.patch_size < 32 || config.patch_size > 256) {
      this.showError('Patch size must be between 32 and 256');
      return false;
    }
    if (config.num_epochs < 1 || config.num_epochs > 500) {
      this.showError('Number of epochs must be between 1 and 500');
      return false;
    }
    return true;
  }

  /**
   * Handle the device init message emitted at the start of a run.
   * Notifies the user which device the run actually resolved to, so a
   * silent CPU fallback (e.g. a broken GPU driver) is never hidden.
   * @param {Object} data - { device, gpuAvailable }
   * @param {string} label - 'Training' or 'Inference'
   */
  handleInitProgress(data, label = 'Training') {
    const device = String(data.device || 'cpu').toUpperCase();
    console.log(`[TrainingHandler] ${label} device:`, device, '| GPU available:', data.gpuAvailable);

    if (!this.module.state) return;

    if (data.gpuAvailable === false || device === 'CPU') {
      this.module.state.notify(
        'warning',
        `${label} running on CPU — no GPU detected, this will be slow.`,
        8000
      );
    } else {
      this.module.state.notify('info', `${label} initialized on ${device}`);
    }
  }

  /**
   * Update training progress display
   * @param {Object} data - Progress data from socket
   */
  updateTrainingProgress(data) {
    // Device init message (parity with DL denoising) — surface resolved device
    if (data.type === 'init') {
      this.handleInitProgress(data, 'Training');
      return;
    }

    const { epoch, total_epochs, metrics } = data;

    // Validate data
    if (!epoch || !total_epochs || !metrics) {
      console.warn('[TrainingHandler] Incomplete training progress data:', data);
      return;
    }

    // Update progress bar
    const progress = (epoch / total_epochs) * 100;
    const progressFill = document.getElementById('trainingProgressFill');
    if (progressFill) {
      progressFill.style.width = progress + '%';
    }

    // Update epoch display
    const currentEpochEl = document.getElementById('currentEpoch');
    const totalEpochsEl = document.getElementById('totalEpochs');
    if (currentEpochEl) currentEpochEl.textContent = epoch;
    if (totalEpochsEl) totalEpochsEl.textContent = total_epochs;

    // Update metrics with error checking
    if (metrics.train_loss !== undefined) {
      const el = document.getElementById('trainLoss');
      if (el) el.textContent = metrics.train_loss.toFixed(4);
    }
    if (metrics.val_loss !== undefined) {
      const el = document.getElementById('valLoss');
      if (el) el.textContent = metrics.val_loss.toFixed(4);
    }
    if (metrics.train_dice !== undefined) {
      const el = document.getElementById('trainDice');
      if (el) el.textContent = metrics.train_dice.toFixed(4);
    }
    if (metrics.val_dice !== undefined) {
      const el = document.getElementById('valDice');
      if (el) el.textContent = metrics.val_dice.toFixed(4);
    }

    // Update status
    const statusText = document.getElementById('trainingStatusText');
    if (statusText) {
      statusText.textContent = 'Training in progress...';
    }

    // Update charts
    if (typeof updateCharts === 'function') {
      updateCharts(epoch, metrics);
    }
  }

  /**
   * Handle training completion
   * @param {Object} data - Completion data
   */
  onTrainingComplete(data) {
    const statusText = document.getElementById('trainingStatusText');
    const stageStatus = document.getElementById('trainingStageStatus');

    if (data.success) {
      if (statusText) {
        statusText.textContent = 'Training completed successfully!';
      }

      // Update status badge to show completion
      if (stageStatus) {
        stageStatus.textContent = 'Complete';
        stageStatus.className = 'stage-status completed';
      }

      // Mark step 3 as completed and enable step 4
      if (typeof stepStates !== 'undefined') {
        stepStates[3].completed = true;
        stepStates[3].trainingCompleted = true;
        stepStates[4].canNavigate = true;
      }
      if (typeof markStepCompleted === 'function') {
        markStepCompleted(3);
      }

      // Update process states
      if (typeof processStates !== 'undefined') {
        processStates.trainingInProgress = false;
      }

      // Enable navigation buttons
      const nextBtn = document.getElementById('trainingNextBtn');
      const backBtn = document.getElementById('trainingBackBtn');
      if (nextBtn) nextBtn.disabled = false;
      if (backBtn) backBtn.disabled = false;

      // Update navigation buttons
      if (typeof updateNavigationButtons === 'function') {
        updateNavigationButtons();
      }

      // Refresh file browser to show newly created model files
      if (window.workspace && window.workspace.fileBrowser) {
        window.workspace.fileBrowser.refresh();
      }

    } else {
      if (statusText) {
        statusText.textContent = 'Training failed!';
      }
      this.showError('Training failed. Please check your configuration and try again.');

      // Update status badge to show failure
      if (stageStatus) {
        stageStatus.textContent = 'Failed';
        stageStatus.className = 'stage-status failed';
      }

      // Reset training states on failure
      if (typeof stepStates !== 'undefined') {
        stepStates[3].trainingStarted = false;
      }
      if (typeof processStates !== 'undefined') {
        processStates.trainingInProgress = false;
      }
      const backBtn = document.getElementById('trainingBackBtn');
      if (backBtn) backBtn.disabled = false;
    }

    // Stop polling
    this.stopTrainingPolling();
  }

  /**
   * Start polling for training status as backup to socket
   */
  startTrainingPolling() {
    this.stopTrainingPolling();

    this.trainingPollInterval = setInterval(async () => {
      const trainingId = this.module.currentTrainingId;
      if (!trainingId) return;

      try {
        const response = await fetch(`/training-status/${trainingId}`);
        const status = await response.json();

        // Update UI if we have progress data
        if (status.current_epoch && status.total_epochs && status.metrics) {
          const progressData = {
            epoch: status.current_epoch,
            total_epochs: status.total_epochs,
            metrics: status.metrics
          };
          this.updateTrainingProgress(progressData);
        }

        // Check if training is complete
        if (status.status === 'completed' || status.status === 'failed') {
          this.onTrainingComplete({ success: status.status === 'completed' });
        }

      } catch (error) {
        console.error('[TrainingHandler] Error polling training status:', error);
      }
    }, 5000); // Poll every 5 seconds
  }

  /**
   * Stop training polling
   */
  stopTrainingPolling() {
    if (this.trainingPollInterval) {
      clearInterval(this.trainingPollInterval);
      this.trainingPollInterval = null;
    }
  }

  /**
   * Download trained model
   */
  downloadModel() {
    const trainingId = this.module.currentTrainingId;
    if (trainingId) {
      window.open(`/download-model/${trainingId}`, '_blank');
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
      console.error('[TrainingHandler]', message);
    }
  }

  /**
   * Cleanup when module deactivates
   */
  cleanup() {
    this.stopTrainingPolling();
  }
}

export default TrainingHandler;
