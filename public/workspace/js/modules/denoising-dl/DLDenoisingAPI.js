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
   * @param {Object} params - Mask regeneration parameters
   * @returns {Promise<Object>} New mask result
   */
  async regenerateMask(params) {
    const response = await fetch(`${this.baseUrl}/regenerate-mask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
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
   * Load test data for denoising
   * @returns {Promise<Object>} Test data file info
   */
  async loadTestData() {
    const response = await fetch('/api/denoising/test-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    return response.json();
  }
}

export default DLDenoisingAPI;
