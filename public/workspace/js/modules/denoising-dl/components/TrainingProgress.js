/**
 * TrainingProgress Component
 *
 * Displays real-time training progress for DL denoising including:
 * - Overall progress bar
 * - Stage indicators (N2V: 1 stage, autoStructN2V: 3 stages)
 * - Current epoch and loss values
 * - Time elapsed and remaining estimates
 */

class TrainingProgress {
  /**
   * @param {Object} options - Configuration options
   * @param {string} options.containerId - ID of container element
   * @param {string} options.method - 'n2v' or 'autostructn2v'
   * @param {function} options.onCancel - Callback when cancel is clicked
   */
  constructor(options = {}) {
    this.containerId = options.containerId;
    this.method = options.method || 'n2v';
    this.onCancel = options.onCancel;

    // Training state
    this.state = {
      status: 'idle', // 'idle', 'running', 'completed', 'failed'
      currentStage: null,
      stage1: {
        status: 'pending',
        epoch: 0,
        totalEpochs: 0,
        trainLoss: null,
        valLoss: null,
        learningRate: null,
        timeElapsed: 0,
        timeRemaining: 0
      },
      mask: {
        status: 'pending',
        kernelSize: null,
        kernelHeight: null,
        kernelWidth: null,
        activePixels: null,
        pattern: null,
        isEmpty: false
      },
      stage2: {
        status: 'pending',
        epoch: 0,
        totalEpochs: 0,
        trainLoss: null,
        valLoss: null,
        learningRate: null,
        timeElapsed: 0,
        timeRemaining: 0
      },
      cleanup: {
        status: 'pending'
      },
      error: null,
      outputFiles: null
    };

    this.container = null;
  }

  /**
   * Render the component
   */
  render() {
    const isAutoStruct = this.method === 'autostructn2v';

    return `
      <div class="training-progress" id="${this.containerId}">
        <div class="progress-header">
          <h4>Denoising Progress</h4>
          <span class="progress-status ${this.state.status}">${this._getStatusLabel()}</span>
        </div>

        <!-- Stage Indicators -->
        <div class="stage-indicators ${isAutoStruct ? 'multi-stage' : 'single-stage'}">
          ${this._renderStageIndicator('stage1', 'Stage 1', 'N2V Training')}
          ${isAutoStruct ? this._renderStageIndicator('mask', 'Mask', 'Pattern Detection') : ''}
          ${isAutoStruct ? this._renderStageIndicator('stage2', 'Stage 2', 'Struct-N2V Training') : ''}
          ${this._renderStageIndicator('cleanup', 'Cleanup', 'Finalizing Output')}
        </div>

        <!-- Current Stage Progress -->
        <div class="current-stage-progress">
          ${this._renderCurrentStageProgress()}
        </div>

        <!-- Error Display -->
        <div class="error-display" style="display: ${this.state.error ? 'block' : 'none'};">
          <div class="error-icon">!</div>
          <div class="error-message">${this.state.error || ''}</div>
        </div>
      </div>
    `;
  }

  /**
   * Render a stage indicator
   */
  _renderStageIndicator(stageKey, title, description) {
    const stageState = this.state[stageKey] || { status: 'pending' };
    const status = stageState.status;
    const isCurrent = this.state.currentStage === stageKey;

    let iconContent = '';
    switch (status) {
      case 'completed':
        iconContent = '<span class="check-icon">&#10003;</span>';
        break;
      case 'training':
      case 'extracting':
      case 'cleaning':
        iconContent = '<span class="spinner"></span>';
        break;
      case 'skipped':
        iconContent = '<span class="skip-icon">-</span>';
        break;
      case 'failed':
        iconContent = '<span class="fail-icon">&#10005;</span>';
        break;
      default:
        iconContent = '<span class="pending-icon">&#9711;</span>';
    }

    return `
      <div class="stage-indicator ${status} ${isCurrent ? 'current' : ''}" data-stage="${stageKey}">
        <div class="stage-icon">${iconContent}</div>
        <div class="stage-info">
          <span class="stage-title">${title}</span>
          <span class="stage-desc">${description}</span>
        </div>
      </div>
    `;
  }

  /**
   * Render current stage progress details
   */
  _renderCurrentStageProgress() {
    const { currentStage, status } = this.state;

    if (status === 'idle') {
      return `
        <div class="progress-placeholder">
          <p>Click "Start Denoising" to begin training.</p>
        </div>
      `;
    }

    if (status === 'completed') {
      return this._renderCompletedProgress();
    }

    if (status === 'failed') {
      return `
        <div class="progress-failed">
          <p>Training failed. Please check the error message above.</p>
        </div>
      `;
    }

    // Running state - show current stage
    if (currentStage === 'stage1' || currentStage === 'stage2') {
      return this._renderTrainingProgress(currentStage);
    } else if (currentStage === 'mask') {
      return this._renderMaskProgress();
    } else if (currentStage === 'cleanup' || currentStage === 'stage1_inference' || currentStage === 'stage2_inference') {
      return this._renderCleanupProgress();
    }

    return `
      <div class="progress-initializing">
        <div class="spinner-large"></div>
        <p>${this.state.statusMessage || 'Initializing...'}</p>
      </div>
    `;
  }

  /**
   * Render training stage progress
   */
  _renderTrainingProgress(stageKey) {
    const stage = this.state[stageKey];
    const progressPercent = stage.totalEpochs > 0
      ? Math.round((stage.epoch / stage.totalEpochs) * 100)
      : 0;

    return `
      <div class="training-stage-progress">
        <div class="epoch-info">
          <span class="epoch-label">Epoch</span>
          <span class="epoch-value">${stage.epoch} / ${stage.totalEpochs}</span>
        </div>

        <div class="progress-bar-container">
          <div class="progress-bar" style="width: ${progressPercent}%"></div>
          <span class="progress-percent">${progressPercent}%</span>
        </div>

        <div class="loss-values">
          <div class="loss-item">
            <span class="loss-label">Train Loss</span>
            <span class="loss-value">${stage.trainLoss != null ? stage.trainLoss.toFixed(6) : '-'}</span>
          </div>
          <div class="loss-item">
            <span class="loss-label">Val Loss</span>
            <span class="loss-value">${stage.valLoss != null ? stage.valLoss.toFixed(6) : '-'}</span>
          </div>
          <div class="loss-item">
            <span class="loss-label">Learning Rate</span>
            <span class="loss-value">${stage.learningRate != null ? stage.learningRate.toExponential(2) : '-'}</span>
          </div>
        </div>

        <div class="time-info">
          <span class="time-elapsed">Elapsed: ${this._formatTime(stage.timeElapsed)}</span>
          <span class="time-remaining">Remaining: ${this._formatTime(stage.timeRemaining)}</span>
        </div>
      </div>
    `;
  }

  /**
   * Render mask extraction progress
   */
  _renderMaskProgress() {
    const mask = this.state.mask;

    if (mask.status === 'completed') {
      return `
        <div class="mask-progress">
          <div class="mask-result">
            <p>Structural pattern detected:</p>
            <div class="mask-info">
              <span class="mask-detail">Kernel Size: ${mask.kernelHeight ?? mask.kernelSize}x${mask.kernelWidth ?? mask.kernelSize}</span>
              <span class="mask-detail">Active Pixels: ${mask.activePixels}</span>
              <span class="mask-detail">Pattern: ${mask.pattern || 'Unknown'}</span>
            </div>
            ${mask.isEmpty ? '<p class="mask-warning">Low structural noise detected. Stage 2 may be skipped.</p>' : ''}
          </div>
        </div>
      `;
    }

    return `
      <div class="mask-progress">
        <div class="spinner-large"></div>
        <p>Extracting structural noise pattern...</p>
      </div>
    `;
  }

  /**
   * Render cleanup/finalization progress
   */
  _renderCleanupProgress() {
    return `
      <div class="cleanup-progress">
        <div class="spinner-large"></div>
        <p>Finalizing output files...</p>
        <p class="cleanup-detail">Creating TIFF stacks and cleaning up intermediate files.</p>
      </div>
    `;
  }

  /**
   * Render completed state
   */
  _renderCompletedProgress() {
    return `
      <div class="progress-completed">
        <div class="completed-icon">&#10003;</div>
        <p>Denoising completed successfully!</p>
        <p class="completed-detail">Your denoised images are ready for download below.</p>
      </div>
    `;
  }

  /**
   * Format time in seconds to human-readable string
   */
  _formatTime(seconds) {
    if (seconds === null || seconds === undefined || seconds === 0) return '-';

    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);

    if (mins === 0) return `${secs}s`;
    return `${mins}m ${secs}s`;
  }

  /**
   * Get status label text
   */
  _getStatusLabel() {
    switch (this.state.status) {
      case 'idle': return 'Ready';
      case 'running': return 'In Progress';
      case 'completed': return 'Completed';
      case 'failed': return 'Failed';
      default: return '';
    }
  }

  /**
   * Initialize the component after rendering
   */
  init() {
    this.container = document.getElementById(this.containerId);
  }

  /**
   * Update stage 1 progress
   */
  updateStage1Progress(data) {
    this.state.status = 'running';
    this.state.currentStage = 'stage1';
    this.state.stage1 = {
      ...this.state.stage1,
      status: 'training',
      epoch: data.epoch || 0,
      totalEpochs: data.totalEpochs || 0,
      trainLoss: data.trainLoss,
      valLoss: data.valLoss,
      learningRate: data.learningRate,
      timeElapsed: data.timeElapsed || 0,
      timeRemaining: data.timeRemaining || 0
    };
    this._refresh();
  }

  /**
   * Mark stage 1 as complete
   */
  completeStage1(data) {
    this.state.stage1.status = 'completed';
    this.state.stage1.modelPath = data.modelPath;
    this._refresh();
  }

  /**
   * Update mask extraction progress
   */
  updateMaskProgress(data) {
    this.state.currentStage = 'mask';
    this.state.mask.status = data.status || 'extracting';
    this._refresh();
  }

  /**
   * Complete mask extraction
   */
  completeMask(data) {
    this.state.mask = {
      ...this.state.mask,
      status: 'completed',
      kernelSize: data.kernelSize,
      kernelHeight: data.kernelHeight,
      kernelWidth: data.kernelWidth,
      activePixels: data.activePixels,
      pattern: data.pattern,
      isEmpty: data.isEmpty,
      maskPath: data.maskPath
    };
    this._refresh();
  }

  /**
   * Update stage 2 progress
   */
  updateStage2Progress(data) {
    this.state.currentStage = 'stage2';
    this.state.stage2 = {
      ...this.state.stage2,
      status: 'training',
      epoch: data.epoch || 0,
      totalEpochs: data.totalEpochs || 0,
      trainLoss: data.trainLoss,
      valLoss: data.valLoss,
      learningRate: data.learningRate,
      timeElapsed: data.timeElapsed || 0,
      timeRemaining: data.timeRemaining || 0
    };
    this._refresh();
  }

  /**
   * Mark stage 2 as complete
   */
  completeStage2(data) {
    this.state.stage2.status = 'completed';
    this.state.stage2.modelPath = data.modelPath;
    this._refresh();
  }

  /**
   * Update cleanup progress
   */
  updateCleanupProgress(data) {
    this.state.currentStage = 'cleanup';
    this.state.cleanup.status = data.status || 'cleaning';
    this._refresh();
  }

  /**
   * Mark training as complete
   */
  complete(data) {
    this.state.status = 'completed';
    this.state.cleanup.status = 'completed';
    this.state.outputFiles = data.outputFiles;
    this._refresh();
  }

  /**
   * Mark training as failed
   */
  fail(error) {
    this.state.status = 'failed';
    this.state.error = error;
    this._refresh();
  }

  /**
   * Reset to initial state
   */
  reset() {
    this.state = {
      status: 'idle',
      currentStage: null,
      stage1: {
        status: 'pending',
        epoch: 0,
        totalEpochs: 0,
        trainLoss: null,
        valLoss: null,
        learningRate: null,
        timeElapsed: 0,
        timeRemaining: 0
      },
      mask: {
        status: 'pending',
        kernelSize: null,
        kernelHeight: null,
        kernelWidth: null,
        activePixels: null,
        pattern: null,
        isEmpty: false
      },
      stage2: {
        status: 'pending',
        epoch: 0,
        totalEpochs: 0,
        trainLoss: null,
        valLoss: null,
        learningRate: null,
        timeElapsed: 0,
        timeRemaining: 0
      },
      cleanup: {
        status: 'pending'
      },
      error: null,
      outputFiles: null
    };
    this._refresh();
  }

  /**
   * Start training (update UI to running state)
   */
  start() {
    this.state.status = 'running';
    this.state.currentStage = 'init';
    this.state.statusMessage = 'Initializing...';
    this._refresh();
  }

  /**
   * Update status message (for init/data phases)
   */
  updateStatus(message) {
    this.state.statusMessage = message;
    this._refresh();
  }

  /**
   * Refresh the component display
   */
  _refresh() {
    if (this.container) {
      this.container.innerHTML = this.render();
      this.container = document.getElementById(this.containerId);
    }
  }

  /**
   * Get current state
   */
  getState() {
    return { ...this.state };
  }
}

export default TrainingProgress;
