/**
 * ResultsHandler.js - Results Management for DL Denoising Module
 *
 * Handles downloads, viewing results, and starting new analyses.
 */

class ResultsHandler {
  /**
   * @param {DLDenoisingModule} module - Reference to the parent module
   */
  constructor(module) {
    this.module = module;
  }

  /**
   * Download denoised images
   * @param {string} stage - 'stage1', 'stage2', or 'n2v'
   */
  async downloadDenoised(stage) {
    if (!this.module.trainingResult || !this.module.trainingResult.outputFiles) {
      this.module.state.notify('error', 'No results available for download');
      return;
    }

    const stackKey = `${stage}_stack`;
    const filePath = this.module.trainingResult.outputFiles[stackKey];

    if (!filePath) {
      this.module.state.notify('error', `No ${stage} output file found`);
      return;
    }

    try {
      // Download via API
      const response = await fetch(`/api/dl-denoising/download?path=${encodeURIComponent(filePath)}`);
      if (!response.ok) throw new Error('Download failed');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filePath.split('/').pop();
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('[ResultsHandler] Error downloading:', error);
      this.module.state.notify('error', `Failed to download: ${error.message}`);
    }
  }

  /**
   * Download trained model
   * @param {string} stage - 'stage1', 'stage2', or 'n2v'
   */
  async downloadModel(stage) {
    if (!this.module.trainingResult || !this.module.trainingResult.outputFiles) {
      this.module.state.notify('error', 'No model available for download');
      return;
    }

    const modelKey = `${stage}_model`;
    const filePath = this.module.trainingResult.outputFiles[modelKey];

    if (!filePath) {
      this.module.state.notify('error', `No ${stage} model file found`);
      return;
    }

    try {
      const response = await fetch(`/api/dl-denoising/download?path=${encodeURIComponent(filePath)}`);
      if (!response.ok) throw new Error('Download failed');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filePath.split('/').pop();
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('[ResultsHandler] Error downloading model:', error);
      this.module.state.notify('error', `Failed to download model: ${error.message}`);
    }
  }

  /**
   * Download result for a specific stage
   * @param {string} stage - 'stage1', 'stage2', or 'n2v'
   */
  async downloadResult(stage) {
    if (!this.module.trainingResult || !this.module.trainingResult.outputFiles) {
      this.module.state.notify('error', 'No results available for download');
      return;
    }

    const stackKey = `${stage}_stack`;
    const filePath = this.module.trainingResult.outputFiles[stackKey];

    if (!filePath) {
      this.module.state.notify('error', `No ${stage} output file found`);
      return;
    }

    try {
      await this.module.api.downloadFile(filePath);
    } catch (error) {
      console.error('[ResultsHandler] Error downloading result:', error);
      this.module.state.notify('error', `Failed to download: ${error.message}`);
    }
  }

  /**
   * Download all results
   */
  async downloadAllResults() {
    if (!this.module.trainingResult || !this.module.trainingResult.outputFiles) {
      this.module.state.notify('error', 'No results available for download');
      return;
    }

    const files = this.module.trainingResult.outputFiles;
    const downloadPromises = [];

    // Download TIFF stacks
    if (files.stage1_stack) {
      downloadPromises.push(this.module.api.downloadFile(files.stage1_stack));
    }
    if (files.stage2_stack) {
      downloadPromises.push(this.module.api.downloadFile(files.stage2_stack));
    }

    // Download model files
    if (files.stage1_model) {
      downloadPromises.push(this.module.api.downloadFile(files.stage1_model));
    }
    if (files.stage2_model) {
      downloadPromises.push(this.module.api.downloadFile(files.stage2_model));
    }
    if (files.config) {
      downloadPromises.push(this.module.api.downloadFile(files.config));
    }

    try {
      await Promise.all(downloadPromises);
      this.module.state.notify('success', 'All files downloaded');
    } catch (error) {
      console.error('[ResultsHandler] Error downloading all results:', error);
      this.module.state.notify('error', `Download failed: ${error.message}`);
    }
  }

  /**
   * Open denoised images in Image Viewer module
   * @param {string} stage - 'stage1' or 'stage2'
   */
  openInImageViewer(stage) {
    if (!this.module.trainingResult || !this.module.trainingResult.outputFiles) {
      this.module.state.notify('error', 'No results available');
      return;
    }

    const stackKey = `${stage}_stack`;
    const filePath = this.module.trainingResult.outputFiles[stackKey];

    if (!filePath) {
      this.module.state.notify('error', `No ${stage} output file found`);
      return;
    }

    // Store denoising result in StateManager for Image Viewer to consume
    const denoisingData = {
      type: 'denoising_dl_result',
      trainingId: this.module.trainingId,
      outputPath: filePath,
      stage: stage,
      method: this.module.selectedMethod,
      timestamp: Date.now()
    };

    this.module.state.update('modules.denoising-dl.viewerFile', denoisingData);

    // Reset module state before navigating away (user is done with this analysis)
    // This ensures fresh state when returning to the module
    this.module.chartHandler.resetCharts();
    this.module.bestValLoss = { n2v: Infinity, stage1: Infinity, stage2: Infinity };
    this.module.disconnectSocket();
    this.module.state.update('modules.denoising-dl.trainingId', null);
    this.module.reset();

    // Navigate to Image Viewer module
    window.workspace.loadModule('imageviewer');
  }

  /**
   * View result in image viewer (legacy alias)
   * @param {string} stage - 'stage1' or 'stage2'
   */
  viewInViewer(stage) {
    this.openInImageViewer(stage);
  }

  /**
   * View results - opens the primary result in viewer
   */
  viewResults() {
    // Open the primary result in viewer
    const stage = this.module.selectedMethod === 'autostructn2v' ? 'stage2' : 'stage1';
    this.openInImageViewer(stage);
  }

  /**
   * Start a new analysis - reset everything and go back to step 1
   */
  startNewAnalysis() {
    console.log('[ResultsHandler] Starting new analysis...');

    // Destroy charts if they exist
    this.module.chartHandler.resetCharts();

    // Reset best val loss tracking
    this.module.bestValLoss = { n2v: Infinity, stage1: Infinity, stage2: Infinity };

    // Disconnect any active socket connections
    this.module.disconnectSocket();

    // Clear state manager entries
    this.module.state.update('modules.denoising-dl.trainingId', null);
    this.module.state.update('modules.denoising-dl.viewerFile', null);

    // Reset step 3 UI - training sections
    const startSection = document.getElementById('startTrainingSection');
    const n2vSection = document.getElementById('n2vTrainingSection');
    const autoStructSection = document.getElementById('autoStructTrainingSection');

    if (startSection) startSection.style.display = 'block';
    if (n2vSection) n2vSection.style.display = 'none';
    if (autoStructSection) autoStructSection.style.display = 'none';

    // Reset training button visibility to ready state (show start button, hide cancel button)
    this.module.showTrainingReady();

    // Reset training progress UI for all stages
    ['n2v', 'stage1', 'stage2'].forEach(prefix => {
      this.module.resetTrainingStageUI(prefix);
    });

    // Reset step 3 next button
    const step3Next = document.getElementById('step3Next');
    if (step3Next) step3Next.disabled = true;

    // Hide mask section if visible
    const maskSection = document.getElementById('interimMaskSection');
    if (maskSection) maskSection.style.display = 'none';

    // Use the existing reset() method which properly handles file selector and validation
    this.module.reset();

    this.module.state.notify('info', 'Ready for new analysis');
  }
}

export default ResultsHandler;
