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
   */
  async downloadDenoised() {
    if (!this.module.trainingResult || !this.module.trainingResult.outputFiles) {
      this.module.state.notify('error', 'No results available for download');
      return;
    }

    const filePath = this.module.trainingResult.outputFiles.denoised_stack;

    if (!filePath) {
      this.module.state.notify('error', 'No denoised output file found');
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
   */
  async downloadModel() {
    if (!this.module.trainingResult || !this.module.trainingResult.outputFiles) {
      this.module.state.notify('error', 'No model available for download');
      return;
    }

    const filePath = this.module.trainingResult.outputFiles.model;

    if (!filePath) {
      this.module.state.notify('error', 'No model file found');
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
   * Download the denoised result stack
   */
  async downloadResult() {
    if (!this.module.trainingResult || !this.module.trainingResult.outputFiles) {
      this.module.state.notify('error', 'No results available for download');
      return;
    }

    const filePath = this.module.trainingResult.outputFiles.denoised_stack;

    if (!filePath) {
      this.module.state.notify('error', 'No denoised output file found');
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

    // Routed v1.0 output keys
    for (const key of ['denoised_stack', 'model', 'config', 'routed_mask',
                       'route_decision', 'results']) {
      if (files[key]) {
        downloadPromises.push(this.module.api.downloadFile(files[key]));
      }
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
   * Open the denoised result in the Image Viewer module
   */
  openInImageViewer() {
    if (!this.module.trainingResult || !this.module.trainingResult.outputFiles) {
      this.module.state.notify('error', 'No results available');
      return;
    }

    const filePath = this.module.trainingResult.outputFiles.denoised_stack;

    if (!filePath) {
      this.module.state.notify('error', 'No denoised output file found');
      return;
    }

    // Store denoising result in StateManager for Image Viewer to consume
    const denoisingData = {
      type: 'denoising_dl_result',
      trainingId: this.module.trainingId,
      outputPath: filePath,
      method: this.module.selectedMethod,
      branch: this.module.trainingResult.branch || null,
      timestamp: Date.now()
    };

    this.module.state.update('modules.denoising-dl.viewerFile', denoisingData);

    // Reset module state before navigating away (user is done with this analysis)
    // This ensures fresh state when returning to the module
    this.module.chartHandler.resetCharts();
    this.module.bestValLoss = { train: Infinity };
    this.module.disconnectSocket();
    this.module.state.update('modules.denoising-dl.trainingId', null);
    this.module.reset();

    // Navigate to Image Viewer module
    window.workspace.loadModule('imageviewer');
  }

  /**
   * View result in image viewer (legacy alias)
   */
  viewInViewer() {
    this.openInImageViewer();
  }

  /**
   * View results - opens the denoised result in viewer
   */
  viewResults() {
    this.openInImageViewer();
  }

  /**
   * Start a new analysis - reset everything and go back to step 1
   */
  startNewAnalysis() {
    console.log('[ResultsHandler] Starting new analysis...');

    // Destroy charts if they exist
    this.module.chartHandler.resetCharts();

    // Reset best val loss tracking
    this.module.bestValLoss = { train: Infinity };

    // Disconnect any active socket connections
    this.module.disconnectSocket();

    // Clear state manager entries
    this.module.state.update('modules.denoising-dl.trainingId', null);
    this.module.state.update('modules.denoising-dl.viewerFile', null);

    // Reset step 3 UI (showTrainingReady hides the mask/train sections and
    // resets progress bars + badges)
    this.module.showTrainingReady();

    // Reset step 3 next button
    const step3Next = document.getElementById('step3Next');
    if (step3Next) step3Next.disabled = true;

    // Use the existing reset() method which properly handles file selector and validation
    this.module.reset();

    this.module.state.notify('info', 'Ready for new analysis');
  }
}

export default ResultsHandler;
