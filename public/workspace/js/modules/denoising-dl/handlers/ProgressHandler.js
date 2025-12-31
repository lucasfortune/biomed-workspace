/**
 * ProgressHandler.js - Training Progress Management for DL Denoising Module
 *
 * Handles Socket.IO event handlers for training progress updates,
 * stage transitions, and completion events.
 */

class ProgressHandler {
  /**
   * @param {DLDenoisingModule} module - Reference to the parent module
   */
  constructor(module) {
    this.module = module;
  }

  /**
   * Connect to Socket.IO for training progress updates
   */
  connectToTrainingSocket() {
    if (!this.module.trainingId) {
      console.error('[ProgressHandler] No training ID for socket connection');
      return;
    }

    // Get or create socket connection
    if (!this.module.socket) {
      // Use existing socket connection from workspace or create new one
      if (window.io) {
        this.module.socket = window.io();
      } else {
        console.error('[ProgressHandler] Socket.IO not available');
        return;
      }
    }

    console.log('[ProgressHandler] Connecting to training socket room:', `denoising-${this.module.trainingId}`);

    // Join training room
    this.module.socket.emit('join-denoising', this.module.trainingId);
    this.module.socketConnected = true;

    // Set up event handlers
    this.setupSocketHandlers();
  }

  /**
   * Set up Socket.IO event handlers
   */
  setupSocketHandlers() {
    if (!this.module.socket) return;

    // Remove existing listeners to prevent duplicates
    this.module.socket.off('denoising-init-progress');
    this.module.socket.off('denoising-data-progress');
    this.module.socket.off('denoising-stage1-progress');
    this.module.socket.off('denoising-stage1-complete');
    this.module.socket.off('denoising-mask-progress');
    this.module.socket.off('denoising-mask-complete');
    this.module.socket.off('denoising-paused');
    this.module.socket.off('denoising-stage2-progress');
    this.module.socket.off('denoising-stage2-complete');
    this.module.socket.off('denoising-cleanup-progress');
    this.module.socket.off('denoising-complete-complete');
    this.module.socket.off('denoising-training-complete');
    this.module.socket.off('denoising-error');

    // Init progress (device setup, GPU check)
    this.module.socket.on('denoising-init-progress', (data) => {
      console.log('[ProgressHandler] Init progress:', data);
      this.handleInitProgress(data);
    });

    // Data progress (extracting stack, splitting data)
    this.module.socket.on('denoising-data-progress', (data) => {
      console.log('[ProgressHandler] Data progress:', data);
      this.handleDataProgress(data);
    });

    // Stage 1 progress
    this.module.socket.on('denoising-stage1-progress', (data) => {
      console.log('[ProgressHandler] Stage 1 progress:', data);
      this.handleStage1Progress(data);
    });

    // Stage 1 complete
    this.module.socket.on('denoising-stage1-complete', (data) => {
      console.log('[ProgressHandler] Stage 1 complete:', data);
      this.handleStage1Complete(data);
    });

    // Mask extraction progress (autoStructN2V only)
    this.module.socket.on('denoising-mask-progress', (data) => {
      console.log('[ProgressHandler] Mask progress:', data);
      this.handleMaskProgress(data);
    });

    // Mask extraction complete
    this.module.socket.on('denoising-mask-complete', (data) => {
      console.log('[ProgressHandler] Mask complete:', data);
      this.handleMaskComplete(data);
    });

    // Training paused for mask approval (autoStructN2V only)
    this.module.socket.on('denoising-paused', (data) => {
      console.log('[ProgressHandler] Training paused for mask approval:', data);
      this.handleTrainingPaused(data);
    });

    // Stage 2 progress (autoStructN2V only)
    this.module.socket.on('denoising-stage2-progress', (data) => {
      console.log('[ProgressHandler] Stage 2 progress:', data);
      this.handleStage2Progress(data);
    });

    // Stage 2 complete
    this.module.socket.on('denoising-stage2-complete', (data) => {
      console.log('[ProgressHandler] Stage 2 complete:', data);
      this.handleStage2Complete(data);
    });

    // Cleanup progress
    this.module.socket.on('denoising-cleanup-progress', (data) => {
      console.log('[ProgressHandler] Cleanup progress:', data);
      this.handleCleanupProgress(data);
    });

    // Final result (when Python script emits complete stage result)
    this.module.socket.on('denoising-complete-complete', (data) => {
      console.log('[ProgressHandler] Complete result:', data);
      this.handleCompleteResult(data);
    });

    // Training process complete (from backend when process exits)
    this.module.socket.on('denoising-training-complete', (data) => {
      console.log('[ProgressHandler] Training process complete:', data);
      this.handleTrainingComplete(data);
    });

    // Training error
    this.module.socket.on('denoising-error', (data) => {
      console.error('[ProgressHandler] Training error:', data);
      this.handleTrainingError(data);
    });
  }

  /**
   * Disconnect from Socket.IO
   */
  disconnectSocket() {
    if (this.module.socket && this.module.socketConnected) {
      this.module.socket.emit('leave-denoising', this.module.trainingId);
      this.module.socketConnected = false;
    }
  }

  /**
   * Handle init progress (device setup, GPU detection)
   */
  handleInitProgress(data) {
    console.log('[ProgressHandler] Device:', data.device, 'GPU available:', data.gpuAvailable);

    if (this.module.trainingProgress) {
      // Update status to show initialization complete
      this.module.trainingProgress.updateStatus('Preparing data...');
    }

    this.module.state.notify('info', `Training initialized on ${data.device.toUpperCase()}`);
  }

  /**
   * Handle data preparation progress (extracting stack, splitting)
   */
  handleDataProgress(data) {
    if (this.module.trainingProgress) {
      if (data.status === 'extracting_stack') {
        const msg = data.current && data.total
          ? `Extracting TIFF stack: ${data.current}/${data.total}`
          : 'Extracting TIFF stack...';
        this.module.trainingProgress.updateStatus(msg);
      } else if (data.status === 'extraction_complete') {
        this.module.trainingProgress.updateStatus(`Extracted ${data.numSlices} slices`);
      } else if (data.status === 'splitting') {
        this.module.trainingProgress.updateStatus('Splitting dataset...');
      }
    }
  }

  /**
   * Handle complete result (final output info from Python)
   */
  handleCompleteResult(data) {
    console.log('[ProgressHandler] Final result:', data);

    // Store output files info
    this.module.trainingResult = {
      trainingId: data.training_id,
      method: data.method,
      stagesRun: data.stagesRun,
      outputFiles: data.outputFiles
    };

    // Update results display
    if (this.module.resultsDisplay) {
      this.module.resultsDisplay.setResults(this.module.trainingResult);
    }

    // Refresh workspace file browser to show new output files
    if (window.workspace?.fileBrowser) {
      window.workspace.fileBrowser.refresh();
    }
  }

  /**
   * Handle Stage 1 progress update
   */
  handleStage1Progress(data) {
    // Determine prefix based on method
    const prefix = this.module.selectedMethod === 'n2v' ? 'n2v' : 'stage1';

    // Update progress bar
    const progressPercent = data.totalEpochs > 0 ? (data.epoch / data.totalEpochs) * 100 : 0;
    const progressFill = document.getElementById(`${prefix}ProgressFill`);
    if (progressFill) {
      progressFill.style.width = `${progressPercent}%`;
    }

    // Update epoch counter
    const currentEpoch = document.getElementById(`${prefix}CurrentEpoch`);
    const totalEpochs = document.getElementById(`${prefix}TotalEpochs`);
    if (currentEpoch) currentEpoch.textContent = data.epoch || 0;
    if (totalEpochs) totalEpochs.textContent = data.totalEpochs || 0;

    // Update status text
    const statusText = document.getElementById(`${prefix}StatusText`);
    if (statusText) {
      statusText.textContent = 'Training...';
    }

    // Update metrics
    const trainLoss = document.getElementById(`${prefix}TrainLoss`);
    const valLoss = document.getElementById(`${prefix}ValLoss`);
    const bestValLoss = document.getElementById(`${prefix}BestValLoss`);

    if (trainLoss && data.trainLoss != null) {
      trainLoss.textContent = data.trainLoss.toFixed(6);
    }
    if (valLoss && data.valLoss != null) {
      valLoss.textContent = data.valLoss.toFixed(6);
    }

    // Track and update best validation loss
    if (data.valLoss != null && data.valLoss > 0) {
      const lossKey = this.module.selectedMethod === 'n2v' ? 'n2v' : 'stage1';
      if (data.valLoss < this.module.bestValLoss[lossKey]) {
        this.module.bestValLoss[lossKey] = data.valLoss;
      }
      if (bestValLoss && this.module.bestValLoss[lossKey] !== Infinity) {
        bestValLoss.textContent = this.module.bestValLoss[lossKey].toFixed(6);
      }
    }

    // Update loss chart
    const chartKey = this.module.selectedMethod === 'n2v' ? 'n2v' : 'stage1';
    if (data.epoch && data.trainLoss != null) {
      this.module.addChartPoint(chartKey, data.epoch, data.trainLoss, data.valLoss);
    }
  }

  /**
   * Handle Stage 1 completion
   */
  handleStage1Complete(data) {
    const prefix = this.module.selectedMethod === 'n2v' ? 'n2v' : 'stage1';

    // Update status badge
    this.module.updateStageStatus(prefix, 'completed', 'Complete');

    // Update status text
    const statusText = document.getElementById(`${prefix}StatusText`);
    if (statusText) {
      statusText.textContent = 'Stage 1 training complete!';
    }

    // Update progress bar to 100%
    const progressFill = document.getElementById(`${prefix}ProgressFill`);
    if (progressFill) {
      progressFill.style.width = '100%';
    }

    // For N2V-only, we're essentially done (just cleanup remaining)
    if (this.module.selectedMethod === 'n2v') {
      this.module.state.notify('success', 'N2V training complete, finalizing output...');
    } else {
      // For autoStructN2V, update mask status to show it's starting
      this.module.updateStageStatus('mask', 'training', 'Extracting...');
    }

    // Refresh workspace file browser to show Stage 1 output files
    if (window.workspace?.fileBrowser) {
      window.workspace.fileBrowser.refresh();
    }
  }

  /**
   * Handle mask extraction progress
   */
  handleMaskProgress(data) {
    // Update mask status
    this.module.updateStageStatus('mask', 'training', 'Extracting mask...');
  }

  /**
   * Handle mask extraction completion
   */
  handleMaskComplete(data) {
    // Update mask status
    this.module.updateStageStatus('mask', 'completed', 'Complete');

    // Initialize mask UI for autoStructN2V
    if (this.module.selectedMethod === 'autostructn2v') {
      this.module.initializeMaskUI();

      // Use real maskArray if provided, otherwise create mock grid for visualization
      let maskData;
      if (data.maskArray && Array.isArray(data.maskArray)) {
        // Convert to boolean 2D array for visualization
        maskData = data.maskArray.map(row => row.map(val => Boolean(val)));
      } else {
        // Fallback to mock grid (for backwards compatibility)
        maskData = this.module.maskHandler.createMaskGrid(data.kernelSize, data.activePixels, data.pattern);
      }

      this.module.updateMaskVisualization({
        mask: maskData,
        kernelSize: data.kernelSize,
        activePixels: data.activePixels,
        pattern: data.pattern,
        isEmpty: data.isEmpty
      });

      // Note: For pause-and-resume workflow, mask actions will be shown by handleTrainingPaused
      // For continuous workflow (legacy), show them here
      if (!this.module.trainingConfig?.pauseAfterMask) {
        const maskActions = document.getElementById('maskActions');
        if (maskActions) {
          maskActions.style.display = 'block';
        }
      }
    }
  }

  /**
   * Handle training paused for mask approval (autoStructN2V only)
   * This is called when the Python process exits after mask extraction,
   * waiting for user approval before starting Stage 2.
   */
  handleTrainingPaused(data) {
    console.log('[ProgressHandler] Training paused, awaiting mask approval');

    // Update mask status to show awaiting approval
    this.module.updateStageStatus('mask', 'completed', 'Awaiting Approval');

    // Initialize mask UI if not already done
    this.module.initializeMaskUI();

    // Use real maskArray for visualization (this should always be present for pause workflow)
    let maskData;
    if (data.maskArray && Array.isArray(data.maskArray)) {
      // Convert to boolean 2D array for visualization
      maskData = data.maskArray.map(row => row.map(val => Boolean(val)));
    } else {
      // Fallback (shouldn't happen in normal pause workflow)
      console.warn('[ProgressHandler] No maskArray in paused data, using mock');
      maskData = this.module.maskHandler.createMaskGrid(data.kernelSize, data.activePixels, data.pattern);
    }

    this.module.updateMaskVisualization({
      mask: maskData,
      kernelSize: data.kernelSize,
      activePixels: data.activePixels,
      pattern: data.pattern,
      isEmpty: data.activePixels < 2
    });

    // Show mask action buttons (Approve/Skip)
    const maskActions = document.getElementById('maskActions');
    if (maskActions) {
      maskActions.style.display = 'block';
    }

    // Update training progress component
    if (this.module.trainingProgress) {
      this.module.trainingProgress.updateStatus('Mask extracted - awaiting your approval');
    }

    // Keep socket connected - we'll need it when Stage 2 starts
    this.module.state.notify('info', 'Mask extracted. Review and approve to continue to Stage 2.');
  }

  /**
   * Handle Stage 2 progress update
   */
  handleStage2Progress(data) {
    // Update progress bar
    const progressPercent = data.totalEpochs > 0 ? (data.epoch / data.totalEpochs) * 100 : 0;
    const progressFill = document.getElementById('stage2ProgressFill');
    if (progressFill) {
      progressFill.style.width = `${progressPercent}%`;
    }

    // Update epoch counter
    const currentEpoch = document.getElementById('stage2CurrentEpoch');
    const totalEpochs = document.getElementById('stage2TotalEpochs');
    if (currentEpoch) currentEpoch.textContent = data.epoch || 0;
    if (totalEpochs) totalEpochs.textContent = data.totalEpochs || 0;

    // Update status text
    const statusText = document.getElementById('stage2StatusText');
    if (statusText) {
      statusText.textContent = 'Training...';
    }

    // Update metrics
    const trainLoss = document.getElementById('stage2TrainLoss');
    const valLoss = document.getElementById('stage2ValLoss');
    const bestValLoss = document.getElementById('stage2BestValLoss');

    if (trainLoss && data.trainLoss != null) {
      trainLoss.textContent = data.trainLoss.toFixed(6);
    }
    if (valLoss && data.valLoss != null) {
      valLoss.textContent = data.valLoss.toFixed(6);
    }

    // Track and update best validation loss
    if (data.valLoss != null && data.valLoss > 0) {
      if (data.valLoss < this.module.bestValLoss.stage2) {
        this.module.bestValLoss.stage2 = data.valLoss;
      }
      if (bestValLoss && this.module.bestValLoss.stage2 !== Infinity) {
        bestValLoss.textContent = this.module.bestValLoss.stage2.toFixed(6);
      }
    }

    // Update stage 2 loss chart
    if (data.epoch && data.trainLoss != null) {
      this.module.addChartPoint('stage2', data.epoch, data.trainLoss, data.valLoss);
    }
  }

  /**
   * Handle Stage 2 completion
   */
  handleStage2Complete(data) {
    // Update status badge
    this.module.updateStageStatus('stage2', 'completed', 'Complete');

    // Update status text
    const statusText = document.getElementById('stage2StatusText');
    if (statusText) {
      statusText.textContent = 'Stage 2 training complete!';
    }

    // Update progress bar to 100%
    const progressFill = document.getElementById('stage2ProgressFill');
    if (progressFill) {
      progressFill.style.width = '100%';
    }

    this.module.state.notify('success', 'Stage 2 training complete, finalizing output...');

    // Refresh workspace file browser to show Stage 2 output files
    if (window.workspace?.fileBrowser) {
      window.workspace.fileBrowser.refresh();
    }
  }

  /**
   * Handle cleanup progress
   */
  handleCleanupProgress(data) {
    // Cleanup notifications removed - they were showing for every file
    // The UI already shows cleanup status in the progress component
  }

  /**
   * Handle training completion
   */
  handleTrainingComplete(data) {
    console.log('[ProgressHandler] Training complete with data:', data);

    // Merge with existing trainingResult (which has outputFiles from handleCompleteResult)
    // Don't overwrite - the denoising-training-complete event doesn't include outputFiles
    this.module.trainingResult = {
      ...this.module.trainingResult,
      ...data,
      // Preserve outputFiles from handleCompleteResult if not in new data
      outputFiles: data.outputFiles || this.module.trainingResult?.outputFiles
    };
    this.module.trainingComplete = true;

    // Show results section
    this.module.showTrainingComplete(this.module.trainingResult);

    // Enable next step button
    const step3Next = document.getElementById('step3Next');
    if (step3Next) {
      step3Next.disabled = false;
    }

    // Clear saved training ID from state (training is done)
    this.module.state.update(`modules.denoising-dl.trainingId`, null);

    // Disconnect socket
    this.disconnectSocket();

    // Refresh workspace file browser to show new output files
    if (window.workspace?.fileBrowser) {
      window.workspace.fileBrowser.refresh();
    }

    this.module.state.notify('success', 'Denoising complete! Your images are ready.');
  }

  /**
   * Handle training error
   */
  handleTrainingError(data) {
    const errorMessage = data.error || data.message || 'Unknown error occurred';

    if (this.module.trainingProgress) {
      this.module.trainingProgress.fail(errorMessage);
    }

    this.module.state.notify('error', `Training failed: ${errorMessage}`);

    // Show error state
    this.module.showTrainingReady();

    // Clear saved training ID
    this.module.state.update(`modules.denoising-dl.trainingId`, null);

    // Disconnect socket
    this.disconnectSocket();
  }

  /**
   * Cancel ongoing training
   */
  async cancelTraining() {
    if (!this.module.trainingId) return;

    try {
      await this.module.api.cancelTraining(this.module.trainingId);
      this.module.state.notify('info', 'Training cancelled');

      if (this.module.trainingProgress) {
        this.module.trainingProgress.reset();
      }

      this.module.showTrainingReady();
      this.disconnectSocket();

      // Clear training ID
      this.module.trainingId = null;
      this.module.state.update(`modules.denoising-dl.trainingId`, null);
    } catch (error) {
      console.error('[ProgressHandler] Error cancelling training:', error);
      this.module.state.notify('error', 'Failed to cancel training');
    }
  }
}

export default ProgressHandler;
