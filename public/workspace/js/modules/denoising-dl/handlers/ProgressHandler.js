/**
 * ProgressHandler.js - Training Progress Management for DL Denoising Module
 *
 * Handles Socket.IO event handlers for the routed training flow:
 * noise analysis/mask (seconds) -> [pause for approval] -> single training
 * -> full-stack prediction -> finalize.
 */

import TrainingSessionPersistence from '/workspace/js/services/TrainingSessionPersistence.js';

// Events emitted by the backend for a training room. Stage names map to
// `denoising-${stage}-progress|complete`; see DenoisingService._handleProgress.
const TRAINING_EVENTS = [
  'denoising-init-progress',
  'denoising-data-progress',
  'denoising-mask-progress',
  'denoising-mask-complete',
  'denoising-paused',
  'denoising-train-progress',
  'denoising-train-complete',
  'denoising-predict-progress',
  'denoising-cleanup-progress',
  'denoising-complete-complete',
  'denoising-training-complete',
  'denoising-cancelled',
  'denoising-error'
];

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
    TRAINING_EVENTS.forEach(evt => this.module.socket.off(evt));

    this.module.socket.on('denoising-init-progress', (data) => {
      console.log('[ProgressHandler] Init progress:', data);
      this.handleInitProgress(data);
    });

    this.module.socket.on('denoising-data-progress', (data) => {
      console.log('[ProgressHandler] Data progress:', data);
      this.handleDataProgress(data);
    });

    // Mask/route analysis (autoStructN2V; runs in seconds on the raw stack)
    this.module.socket.on('denoising-mask-progress', (data) => {
      console.log('[ProgressHandler] Mask progress:', data);
      this.handleMaskProgress(data);
    });

    this.module.socket.on('denoising-mask-complete', (data) => {
      console.log('[ProgressHandler] Mask complete:', data);
      this.handleMaskComplete(data);
    });

    // Run paused for mask approval (BEFORE any training)
    this.module.socket.on('denoising-paused', (data) => {
      console.log('[ProgressHandler] Paused for mask approval:', data);
      this.handleTrainingPaused(data);
    });

    // The single routed training
    this.module.socket.on('denoising-train-progress', (data) => {
      this.handleTrainProgress(data);
    });

    this.module.socket.on('denoising-train-complete', (data) => {
      console.log('[ProgressHandler] Training model complete:', data);
      this.handleTrainComplete(data);
    });

    // Full-stack prediction after training
    this.module.socket.on('denoising-predict-progress', (data) => {
      this.handlePredictProgress(data);
    });

    this.module.socket.on('denoising-cleanup-progress', (data) => {
      // Finalization status is reflected via the complete events
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

    this.module.socket.on('denoising-error', (data) => {
      console.error('[ProgressHandler] Training error:', data);
      this.handleTrainingError(data);
    });

    this.module.socket.on('denoising-cancelled', (data) => {
      console.log('[ProgressHandler] Training cancelled:', data);
      this.handleTrainingCancelled(data);
    });
  }

  /**
   * Disconnect from Socket.IO and remove all event listeners
   */
  disconnectSocket() {
    if (this.module.socket) {
      TRAINING_EVENTS.forEach(evt => this.module.socket.off(evt));

      // Leave the room if connected
      if (this.module.socketConnected && this.module.trainingId) {
        this.module.socket.emit('leave-denoising', this.module.trainingId);
      }
      this.module.socketConnected = false;
    }
  }

  /**
   * Handle init progress (device setup, GPU detection)
   */
  handleInitProgress(data) {
    console.log('[ProgressHandler] Device:', data.device, 'GPU available:', data.gpuAvailable);

    if (this.module.trainingProgress) {
      this.module.trainingProgress.updateStatus('Preparing data...');
    }

    this.module.state.notify('info', `Run initialized on ${(data.device || 'cpu').toUpperCase()}`);
  }

  /**
   * Handle data preparation progress (loading, splitting)
   */
  handleDataProgress(data) {
    if (this.module.trainingProgress) {
      if (data.status === 'splitting') {
        this.module.trainingProgress.updateStatus('Loading and splitting dataset...');
      } else if (data.status === 'loaded') {
        this.module.trainingProgress.updateStatus(`Loaded ${data.numSlices} slices`);
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
      branch: data.branch,
      routeReason: data.routeReason,
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
   * Convert a payload's maskArray (0/1 ints) to the boolean grid the
   * visualization expects. Falls back to a synthetic grid only when the
   * payload carries no array (should not happen in the routed flow).
   */
  _maskDataFromPayload(data) {
    if (data.maskArray && Array.isArray(data.maskArray)) {
      // Legacy 3D triplet masks (array of 3 2D arrays) only appear when
      // viewing old sessions; new masks are always 2D.
      if (data.maskArray.length === 3 &&
          Array.isArray(data.maskArray[0]) &&
          Array.isArray(data.maskArray[0][0])) {
        return data.maskArray.map(slice =>
          slice.map(row => row.map(val => Boolean(val)))
        );
      }
      return data.maskArray.map(row => row.map(val => Boolean(val)));
    }
    console.warn('[ProgressHandler] No maskArray in payload, using synthetic grid');
    return this.module.maskHandler.createMaskGrid(data.kernelSize, data.activePixels, data.pattern);
  }

  /**
   * Handle mask/route analysis progress
   */
  handleMaskProgress(data) {
    this.module.updateStageStatus('mask', 'training', 'Analyzing noise...');
  }

  /**
   * Handle mask extraction completion (mask + route decision available)
   */
  handleMaskComplete(data) {
    this.module.updateStageStatus('mask', 'completed', 'Complete');

    if (this.module.selectedMethod === 'autostructn2v') {
      this.module.initializeMaskUI();
      this.module.maskHandler.renderRouteDecision(data);
      this.module.updateMaskVisualization({
        mask: this._maskDataFromPayload(data),
        kernelSize: data.kernelSize,
        kernelHeight: data.kernelHeight,
        kernelWidth: data.kernelWidth,
        activePixels: data.activePixels,
        pattern: data.pattern,
        isEmpty: data.isEmpty,
        branch: data.branch
      });
    }
  }

  /**
   * Handle run paused for mask approval (autoStructN2V only).
   * Emitted when the Python process exits cleanly after the (seconds-fast)
   * noise analysis, BEFORE any training. The user approves, adjusts, or
   * overrides to plain N2V from here.
   */
  handleTrainingPaused(data) {
    console.log('[ProgressHandler] Paused, awaiting mask approval');

    // Update localStorage stage to paused_at_mask
    TrainingSessionPersistence.updateStage('paused_at_mask');

    this.module.updateStageStatus('mask', 'completed', 'Awaiting Approval');

    // Initialize mask UI if not already done
    this.module.initializeMaskUI();

    // Show the routing decision (branch, reason, Dmax, mask_rho2)
    this.module.maskHandler.renderRouteDecision(data);

    this.module.updateMaskVisualization({
      mask: this._maskDataFromPayload(data),
      kernelSize: data.kernelSize,
      kernelHeight: data.kernelHeight,
      kernelWidth: data.kernelWidth,
      activePixels: data.activePixels,
      pattern: data.pattern,
      isEmpty: data.isEmpty != null ? data.isEmpty : data.activePixels < 2,
      branch: data.branch
    });

    // Disable the auto-approve toggle now that the analysis is complete
    this.module.updateAutoApproveToggleState(false);

    // Check if auto-approve is enabled
    if (this.module.autoApproveEnabled) {
      console.log('[ProgressHandler] Auto-approve enabled, approving mask...');
      this.module.updateStageStatus('mask', 'completed', 'Auto-approved');

      if (this.module.trainingProgress) {
        this.module.trainingProgress.updateStatus('Mask auto-approved, starting training...');
      }

      this.module.approveMask();
      return; // Exit early - don't show manual approval UI
    }

    // Manual approval flow: show action buttons
    const maskActions = document.getElementById('maskActions');
    if (maskActions) {
      maskActions.style.display = 'block';
    }

    if (this.module.trainingProgress) {
      this.module.trainingProgress.updateStatus('Noise analyzed - awaiting your approval');
    }

    // Keep socket connected - we'll need it when training starts
    this.module.state.notify('info', 'Noise analysis complete. Review the discovered mask to start training.');
  }

  /**
   * Handle training progress update (the single routed model)
   */
  handleTrainProgress(data) {
    // Update localStorage stage on first epoch
    if (data.epoch === 1) {
      TrainingSessionPersistence.updateStage('train');
    }
    // Update progress timestamp for stale detection
    TrainingSessionPersistence.updateProgress();

    // Show the branch that is actually training in the section title
    if (data.branch) {
      this.module.setTrainSectionBranch(data.branch);
    }

    // Update progress bar
    const progressPercent = data.totalEpochs > 0 ? (data.epoch / data.totalEpochs) * 100 : 0;
    const progressFill = document.getElementById('trainProgressFill');
    if (progressFill) {
      progressFill.style.width = `${progressPercent}%`;
    }

    // Update epoch counter
    const currentEpoch = document.getElementById('trainCurrentEpoch');
    const totalEpochs = document.getElementById('trainTotalEpochs');
    if (currentEpoch) currentEpoch.textContent = data.epoch || 0;
    if (totalEpochs) totalEpochs.textContent = data.totalEpochs || 0;

    // Update status text
    const statusText = document.getElementById('trainStatusText');
    if (statusText) {
      statusText.textContent = 'Training...';
    }
    this.module.updateStageStatus('train', 'training', 'Training...');

    // Update metrics
    const trainLoss = document.getElementById('trainTrainLoss');
    const valLoss = document.getElementById('trainValLoss');
    const bestValLoss = document.getElementById('trainBestValLoss');

    if (trainLoss && data.trainLoss != null) {
      trainLoss.textContent = data.trainLoss.toFixed(6);
    }
    if (valLoss && data.valLoss != null) {
      valLoss.textContent = data.valLoss.toFixed(6);
    }

    // Track and update best validation loss
    if (data.valLoss != null && data.valLoss > 0) {
      if (data.valLoss < this.module.bestValLoss.train) {
        this.module.bestValLoss.train = data.valLoss;
      }
      if (bestValLoss && this.module.bestValLoss.train !== Infinity) {
        bestValLoss.textContent = this.module.bestValLoss.train.toFixed(6);
      }
    }

    // Update loss chart
    if (data.epoch && data.trainLoss != null) {
      this.module.addChartPoint('train', data.epoch, data.trainLoss, data.valLoss);
    }
  }

  /**
   * Handle training completion (model trained; prediction follows)
   */
  handleTrainComplete(data) {
    this.module.updateStageStatus('train', 'training', 'Denoising stack...');

    const statusText = document.getElementById('trainStatusText');
    if (statusText) {
      statusText.textContent = 'Model trained. Denoising the full stack...';
    }

    // Progress bar to 100% for the training phase
    const progressFill = document.getElementById('trainProgressFill');
    if (progressFill) {
      progressFill.style.width = '100%';
    }
  }

  /**
   * Handle full-stack prediction progress
   */
  handlePredictProgress(data) {
    TrainingSessionPersistence.updateProgress();

    const statusText = document.getElementById('trainStatusText');
    if (statusText && data.current_slice != null && data.total_slices != null) {
      statusText.textContent =
        `Denoising stack: slice ${data.current_slice} of ${data.total_slices}`;
    }
  }

  /**
   * Handle training completion (process exit)
   */
  handleTrainingComplete(data) {
    console.log('[ProgressHandler] Training complete with data:', data);

    // Merge with existing trainingResult (which has outputFiles from handleCompleteResult)
    this.module.trainingResult = {
      ...this.module.trainingResult,
      ...data,
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

    // Clear localStorage session - training is done
    TrainingSessionPersistence.clearAll();

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

    // Clear localStorage session - training failed
    TrainingSessionPersistence.clearAll();

    // Disconnect socket
    this.disconnectSocket();
  }

  /**
   * Handle training cancelled (from backend when process is killed)
   */
  handleTrainingCancelled(data) {
    console.log('[ProgressHandler] Training was cancelled');

    // Reset UI to ready state
    this.module.showTrainingReady();

    // Clear saved training ID
    this.module.trainingId = null;
    this.module.state.update(`modules.denoising-dl.trainingId`, null);

    // Clear localStorage session
    TrainingSessionPersistence.clearAll();

    // Disconnect socket
    this.disconnectSocket();

    this.module.state.notify('info', 'Training cancelled');
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

      // Clear localStorage session - training cancelled
      TrainingSessionPersistence.clearAll();
    } catch (error) {
      console.error('[ProgressHandler] Error cancelling training:', error);
      this.module.state.notify('error', 'Failed to cancel training');
    }
  }
}

export default ProgressHandler;
