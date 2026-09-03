/**
 * UIStateHandler.js - UI State Management for DL Denoising Module
 *
 * Handles UI state transitions, display updates, and visual feedback
 * for the routed training flow: [noise analysis & mask approval] -> train.
 */

class UIStateHandler {
  /**
   * @param {DLDenoisingModule} module - Reference to the parent module
   */
  constructor(module) {
    this.module = module;
  }

  /**
   * Show training ready state (reset UI to initial state)
   */
  showTrainingReady() {
    const maskApprovalSection = document.getElementById('maskApprovalSection');
    const trainSection = document.getElementById('trainSection');

    // Nav row: Start enabled, Cancel hidden, Next disabled
    this.setJobButtons('idle');

    if (maskApprovalSection) maskApprovalSection.style.display = 'none';
    if (trainSection) trainSection.style.display = 'none';

    // Reset best val loss tracking
    this.module.bestValLoss = { train: Infinity };

    // Destroy and reset charts
    this.module.chartHandler.destroyCharts();

    // Reset mask approval bits
    const maskActions = document.getElementById('maskActions');
    if (maskActions) maskActions.style.display = 'none';
    const routeCard = document.getElementById('routeDecisionCard');
    if (routeCard) {
      routeCard.style.display = 'none';
      routeCard.innerHTML = '';
    }

    // Reset status badges
    this.updateStageStatus('mask', 'pending', 'Pending');
    this.updateStageStatus('train', 'pending', 'Pending');

    // Reset progress bar and download buttons
    this.resetTrainingStageUI('train');
  }

  /**
   * Show training in progress state
   */
  async showTrainingInProgress() {
    const maskApprovalSection = document.getElementById('maskApprovalSection');
    const trainSection = document.getElementById('trainSection');

    // Nav row: Start hidden, Cancel shown, Next still disabled
    this.setJobButtons('running');

    // The mask/route section only exists for autoStructN2V; the training
    // section is shared by both methods.
    if (this.module.selectedMethod === 'autostructn2v') {
      if (maskApprovalSection) maskApprovalSection.style.display = 'block';
      this.updateStageStatus('mask', 'training', 'Analyzing noise...');
      this.updateStageStatus('train', 'pending', 'Awaiting mask approval');
    } else {
      if (maskApprovalSection) maskApprovalSection.style.display = 'none';
      this.updateStageStatus('train', 'training', 'Training...');
    }
    if (trainSection) trainSection.style.display = 'block';

    // Initialize charts
    await this.module.initializeCharts();
  }

  /**
   * Update stage status badge
   * @param {string} stage - Stage identifier ('mask', 'train')
   * @param {string} status - Status class ('pending', 'training', 'completed', 'skipped')
   * @param {string} text - Display text for the status
   */
  updateStageStatus(stage, status, text) {
    const statusEl = document.getElementById(`${stage}StageStatus`);
    if (statusEl) {
      statusEl.textContent = text;
      statusEl.className = `stage-status ${status}`;
    }
  }

  /**
   * Show training complete state
   * @param {Object} data - Training result data
   */
  showTrainingComplete(data) {
    // Update status badge
    this.updateStageStatus('train', 'completed', 'Complete');

    // Update status text
    const statusText = document.getElementById('trainStatusText');
    if (statusText) {
      statusText.textContent = 'Training completed successfully!';
      statusText.classList.add('is-success');
    }

    // Show the success card with the result actions
    const successSection = document.getElementById('trainSuccessSection');
    if (successSection) {
      successSection.style.display = 'block';
    }

    // Store results for download
    this.module.trainingResult = data;

    // Nav row: Start stays hidden, Cancel hidden, Next enabled
    this.setJobButtons('finished');
  }

  /**
   * Drive the nav-row job buttons so exactly one primary action is offered.
   * @param {'idle'|'running'|'finished'} state
   */
  setJobButtons(state) {
    const startBtn = document.getElementById('startTrainingBtn');
    const cancelBtn = document.getElementById('cancelTrainingBtn');
    const nextBtn = document.getElementById('step3Next');

    if (startBtn) {
      startBtn.style.display = state === 'idle' ? 'inline-flex' : 'none';
      startBtn.disabled = false;
    }
    if (cancelBtn) {
      cancelBtn.style.display = state === 'running' ? 'inline-flex' : 'none';
    }
    if (nextBtn) {
      nextBtn.disabled = state !== 'finished';
    }
  }

  /**
   * Reset training stage UI elements
   * @param {string} prefix - Stage prefix ('train')
   */
  resetTrainingStageUI(prefix) {
    // Reset progress bar
    const progressFill = document.getElementById(`${prefix}ProgressFill`);
    if (progressFill) progressFill.style.width = '0%';

    // Reset epoch counters
    const currentEpoch = document.getElementById(`${prefix}CurrentEpoch`);
    if (currentEpoch) currentEpoch.textContent = '0';

    const totalEpochs = document.getElementById(`${prefix}TotalEpochs`);
    if (totalEpochs) totalEpochs.textContent = '0';

    // Reset status text
    const statusText = document.getElementById(`${prefix}StatusText`);
    if (statusText) {
      statusText.textContent = 'Waiting to start...';
      statusText.classList.remove('is-success');
    }

    // Reset metrics
    const trainLoss = document.getElementById(`${prefix}TrainLoss`);
    if (trainLoss) trainLoss.textContent = '--';

    const valLoss = document.getElementById(`${prefix}ValLoss`);
    if (valLoss) valLoss.textContent = '--';

    const bestValLoss = document.getElementById(`${prefix}BestValLoss`);
    if (bestValLoss) bestValLoss.textContent = '--';

    // Hide the success card
    const successSection = document.getElementById(`${prefix}SuccessSection`);
    if (successSection) successSection.style.display = 'none';

    // Reset stage status badge if exists
    const stageStatus = document.getElementById(`${prefix}StageStatus`);
    if (stageStatus) {
      stageStatus.textContent = 'Pending';
      stageStatus.className = 'stage-status pending';
    }
  }
}

export default UIStateHandler;
