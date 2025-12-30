/**
 * UIStateHandler.js - UI State Management for DL Denoising Module
 *
 * Handles UI state transitions, display updates, and visual feedback
 * for the training progress sections.
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
    const startSection = document.getElementById('startTrainingSection');
    const n2vSection = document.getElementById('n2vTrainingSection');
    const autoStructSection = document.getElementById('autoStructTrainingSection');

    // Show start button, hide training sections
    if (startSection) startSection.style.display = 'block';
    if (n2vSection) n2vSection.style.display = 'none';
    if (autoStructSection) autoStructSection.style.display = 'none';

    // Reset best val loss tracking
    this.module.bestValLoss = { n2v: Infinity, stage1: Infinity, stage2: Infinity };

    // Destroy and reset charts
    this.module.chartHandler.destroyCharts();

    // Reset completion sections
    const n2vComplete = document.getElementById('n2vCompleteSection');
    const autoStructResults = document.getElementById('autoStructResultsSection');
    const maskActions = document.getElementById('maskActions');
    if (n2vComplete) n2vComplete.style.display = 'none';
    if (autoStructResults) autoStructResults.style.display = 'none';
    if (maskActions) maskActions.style.display = 'none';

    // Reset status badges
    this.updateStageStatus('n2v', 'pending', 'Initializing...');
    this.updateStageStatus('stage1', 'pending', 'Pending');
    this.updateStageStatus('mask', 'pending', 'Pending');
    this.updateStageStatus('stage2', 'pending', 'Pending');

    // Reset progress bars and download buttons
    ['n2v', 'stage1', 'stage2'].forEach(prefix => {
      const fill = document.getElementById(`${prefix}ProgressFill`);
      if (fill) fill.style.width = '0%';
      const current = document.getElementById(`${prefix}CurrentEpoch`);
      if (current) current.textContent = '0';
      const total = document.getElementById(`${prefix}TotalEpochs`);
      if (total) total.textContent = '0';
      const trainLoss = document.getElementById(`${prefix}TrainLoss`);
      if (trainLoss) trainLoss.textContent = '--';
      const valLoss = document.getElementById(`${prefix}ValLoss`);
      if (valLoss) valLoss.textContent = '--';
      const bestValLoss = document.getElementById(`${prefix}BestValLoss`);
      if (bestValLoss) bestValLoss.textContent = '--';
      // Hide download buttons
      const downloadButtons = document.getElementById(`${prefix}DownloadButtons`);
      if (downloadButtons) downloadButtons.style.display = 'none';
      // Reset status text style
      const statusText = document.getElementById(`${prefix}StatusText`);
      if (statusText) {
        statusText.style.color = '';
        statusText.style.fontWeight = '';
      }
    });
  }

  /**
   * Show training in progress state
   */
  async showTrainingInProgress() {
    const startSection = document.getElementById('startTrainingSection');
    const n2vSection = document.getElementById('n2vTrainingSection');
    const autoStructSection = document.getElementById('autoStructTrainingSection');

    // Hide start button
    if (startSection) startSection.style.display = 'none';

    // Show the correct training section based on method
    if (this.module.selectedMethod === 'n2v') {
      if (n2vSection) n2vSection.style.display = 'block';
      if (autoStructSection) autoStructSection.style.display = 'none';
      // Update status
      this.updateStageStatus('n2v', 'training', 'Training...');
    } else {
      if (n2vSection) n2vSection.style.display = 'none';
      if (autoStructSection) autoStructSection.style.display = 'block';
      // Update status for autoStructN2V
      this.updateStageStatus('stage1', 'training', 'Training...');
      this.updateStageStatus('mask', 'pending', 'Pending');
      this.updateStageStatus('stage2', 'pending', 'Pending');
    }

    // Initialize charts
    await this.module.initializeCharts();
  }

  /**
   * Update stage status badge
   * @param {string} stage - Stage identifier ('n2v', 'stage1', 'mask', 'stage2')
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
   * Show training complete state for N2V
   * @param {Object} data - Training result data
   */
  showN2VComplete(data) {
    // Update status badge
    this.updateStageStatus('n2v', 'completed', 'Complete');

    // Update status text
    const statusText = document.getElementById('n2vStatusText');
    if (statusText) {
      statusText.textContent = 'Training completed successfully!';
      statusText.style.color = '#50C878';
      statusText.style.fontWeight = '600';
    }

    // Show download buttons in progress section
    const downloadButtons = document.getElementById('n2vDownloadButtons');
    if (downloadButtons) {
      downloadButtons.style.display = 'flex';
    }

    // Store results for download
    this.module.trainingResult = data;

    // Enable next button
    const nextBtn = document.getElementById('step3Next');
    if (nextBtn) nextBtn.disabled = false;
  }

  /**
   * Show training complete state for autoStructN2V
   * @param {Object} data - Training result data
   */
  showAutoStructComplete(data) {
    // Update final status
    this.updateStageStatus('stage2', 'completed', 'Complete');

    // Update status text
    const statusText = document.getElementById('stage2StatusText');
    if (statusText) {
      statusText.textContent = 'Training completed successfully!';
      statusText.style.color = '#50C878';
      statusText.style.fontWeight = '600';
    }

    // Show download buttons in progress section
    const downloadButtons = document.getElementById('stage2DownloadButtons');
    if (downloadButtons) {
      downloadButtons.style.display = 'flex';
    }

    // Store results for download
    this.module.trainingResult = data;

    // Enable next button
    const nextBtn = document.getElementById('step3Next');
    if (nextBtn) nextBtn.disabled = false;
  }

  /**
   * Show training complete state (generic handler)
   * Routes to appropriate method based on selected method
   * @param {Object} data - Training result data
   */
  showTrainingComplete(data) {
    if (this.module.selectedMethod === 'n2v') {
      this.showN2VComplete(data);
    } else {
      this.showAutoStructComplete(data);
    }
  }

  /**
   * Reset training stage UI elements for a given prefix
   * @param {string} prefix - Stage prefix ('n2v', 'stage1', 'stage2')
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
      statusText.textContent = prefix === 'n2v' ? 'Preparing training data...' :
                               prefix === 'stage1' ? 'Waiting to start...' :
                               'Waiting for Stage 1 and mask approval...';
      statusText.style.color = '';
      statusText.style.fontWeight = '';
    }

    // Reset metrics
    const trainLoss = document.getElementById(`${prefix}TrainLoss`);
    if (trainLoss) trainLoss.textContent = '--';

    const valLoss = document.getElementById(`${prefix}ValLoss`);
    if (valLoss) valLoss.textContent = '--';

    const bestValLoss = document.getElementById(`${prefix}BestValLoss`);
    if (bestValLoss) bestValLoss.textContent = '--';

    // Hide download buttons
    const downloadButtons = document.getElementById(`${prefix}DownloadButtons`);
    if (downloadButtons) downloadButtons.style.display = 'none';

    // Reset stage status badge if exists
    const stageStatus = document.getElementById(`${prefix}StageStatus`);
    if (stageStatus) {
      stageStatus.textContent = 'Pending';
      stageStatus.className = 'stage-status pending';
    }
  }
}

export default UIStateHandler;
