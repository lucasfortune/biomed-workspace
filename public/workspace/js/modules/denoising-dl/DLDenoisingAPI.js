/**
 * DLDenoisingAPI - API client for Deep Learning Denoising Module
 *
 * Handles all backend communication for DL denoising operations.
 */

class DLDenoisingAPI {
  constructor() {
    this.baseUrl = '/api/denoising/dl';
  }

  /**
   * Check GPU availability
   * @returns {Promise<Object>} GPU status info
   */
  async checkGPU() {
    const response = await fetch(`${this.baseUrl}/gpu-check`);
    return response.json();
  }

  /**
   * Validate TIFF file for DL denoising
   * @param {string} filePath - Path to the file in workspace
   * @returns {Promise<Object>} Validation result
   */
  async validateFile(filePath) {
    const response = await fetch(`${this.baseUrl}/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePath })
    });
    return response.json();
  }

  /**
   * Get configuration presets
   * @returns {Promise<Object>} Preset configurations
   */
  async getPresets() {
    const response = await fetch(`${this.baseUrl}/presets`);
    return response.json();
  }

  /**
   * Start training
   * @param {Object} config - Training configuration
   * @returns {Promise<Object>} Training session info
   */
  async startTraining(config) {
    const response = await fetch(`${this.baseUrl}/start-training`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    });
    return response.json();
  }

  /**
   * Get training status
   * @param {string} trainingId - Training session ID
   * @returns {Promise<Object>} Training status
   */
  async getTrainingStatus(trainingId) {
    const response = await fetch(`${this.baseUrl}/training-status/${trainingId}`);
    return response.json();
  }

  /**
   * Extract mask from Stage 1 output
   * @param {Object} params - Mask extraction parameters
   * @returns {Promise<Object>} Mask extraction result
   */
  async extractMask(params) {
    const response = await fetch(`${this.baseUrl}/extract-mask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });
    return response.json();
  }

  /**
   * Regenerate mask with new parameters
   * @param {string} trainingId - Training session ID
   * @param {Object} parameters - Mask extraction parameters
   * @returns {Promise<Object>} New mask result
   */
  async regenerateMask(trainingId, parameters) {
    const response = await fetch(`${this.baseUrl}/regenerate-mask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trainingId, parameters })
    });
    return response.json();
  }

  /**
   * Continue training after mask approval (with the discovered mask)
   * @param {string} trainingId - Training session ID
   * @returns {Promise<Object>} Continue result
   */
  async continueTraining(trainingId) {
    const response = await fetch(`${this.baseUrl}/continue-training`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trainingId })
    });
    return response.json();
  }

  /**
   * Override the route: continue with plain N2V instead of the discovered mask
   * @param {string} trainingId - Training session ID
   * @returns {Promise<Object>} Skip result
   */
  async skipStage2(trainingId) {
    const response = await fetch(`${this.baseUrl}/skip-stage2`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trainingId })
    });
    return response.json();
  }

  /**
   * Run inference with trained model
   * @param {Object} params - Inference parameters
   * @returns {Promise<Object>} Inference result
   */
  async runInference(params) {
    const response = await fetch(`${this.baseUrl}/run-inference`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });
    return response.json();
  }

  /**
   * Get recent training results for model import
   * @returns {Promise<Object>} Recent completed trainings with model paths
   */
  async getRecentResults() {
    const response = await fetch(`${this.baseUrl}/recent-results`);
    return response.json();
  }

  /**
   * Validate and parse config file for import
   * @param {string} configPath - Path to .json config file
   * @returns {Promise<Object>} Validation result with parsed config data
   */
  async validateConfig(configPath) {
    const response = await fetch(`${this.baseUrl}/validate-config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ configPath })
    });
    return response.json();
  }

  /**
   * Validate model files for import
   * @param {string} modelPath - Path to .pth model file
   * @param {string} configPath - Path to .json config file
   * @param {string} stage - 'stage1' or 'stage2' (optional)
   * @returns {Promise<Object>} Validation result
   */
  async validateModel(modelPath, configPath, stage = 'stage1') {
    const response = await fetch(`${this.baseUrl}/validate-model`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modelPath, configPath, stage })
    });
    return response.json();
  }

  /**
   * Cancel ongoing training
   * @param {string} trainingId - Training session ID
   * @returns {Promise<Object>} Cancellation result
   */
  async cancelTraining(trainingId) {
    const response = await fetch(`${this.baseUrl}/cancel-training/${trainingId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    return response.json();
  }

  /**
   * Download a file from the server
   * @param {string} filePath - Path to the file
   * @returns {Promise<void>}
   */
  async downloadFile(filePath) {
    // Extract filename from path
    const filename = filePath.split('/').pop();

    // Create download link
    const response = await fetch(`/api/files/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePath })
    });

    if (!response.ok) {
      throw new Error('Failed to download file');
    }

    // Get blob and trigger download
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }
}

export default DLDenoisingAPI;
