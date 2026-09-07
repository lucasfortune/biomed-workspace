/**
 * SegmentationAPI - Centralized API client for segmentation module
 * Handles all backend communication for the segmentation workflow
 */
class SegmentationAPI {
  constructor() {
    this.baseUrl = '';  // Same origin
  }

  /**
   * Helper method to handle fetch responses
   */
  async _handleResponse(response) {
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Network error' }));
      throw new Error(error.error || error.message || `HTTP ${response.status}`);
    }
    return response.json();
  }

  /**
   * Helper method for POST requests with JSON body
   */
  async _post(endpoint, data) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return this._handleResponse(response);
  }

  /**
   * Helper method for POST requests with FormData
   */
  async _postFormData(endpoint, formData) {
    const response = await fetch(endpoint, {
      method: 'POST',
      body: formData
    });
    return this._handleResponse(response);
  }

  /**
   * Helper method for GET requests
   */
  async _get(endpoint) {
    const response = await fetch(endpoint);
    return this._handleResponse(response);
  }

  // ============================================================================
  // Data Upload
  // ============================================================================

  /**
   * Upload training data (raw images and annotations)
   * @param {File} rawImages - Raw image file
   * @param {File} annotations - Annotation file
   */
  async uploadTrainingData(rawImages, annotations) {
    const formData = new FormData();
    formData.append('raw_images', rawImages);
    formData.append('annotations', annotations);

    return this._postFormData('/upload-data', formData);
  }

  /**
   * Upload inference data
   * @param {File} inferenceData - Inference file
   */
  async uploadInferenceData(inferenceData) {
    const formData = new FormData();
    formData.append('inference_data', inferenceData);

    return this._postFormData('/upload-inference', formData);
  }

  // ============================================================================
  // Training
  // ============================================================================

  /**
   * Configure training parameters
   * @param {Object} config - Training configuration
   */
  async configureTraining(config) {
    return this._post('/configure-training', config);
  }

  /**
   * Start model training
   */
  async startTraining() {
    return this._post('/start-training', {});
  }

  /**
   * Get training status
   * @param {string} trainingId - Training session ID
   */
  async getTrainingStatus(trainingId) {
    return this._get(`/training-status/${trainingId}`);
  }

  /**
   * Cancel an ongoing training process
   * @param {string} trainingId - Training session ID
   */
  async cancelTraining(trainingId) {
    return this._post(`/cancel-training/${trainingId}`, {});
  }

  /**
   * Download trained model
   * @param {string} trainingId - Training session ID
   * @returns {string} Download URL
   */
  getModelDownloadUrl(trainingId) {
    return `/download-model/${trainingId}`;
  }

  // ============================================================================
  // Inference
  // ============================================================================

  /**
   * Run inference with trained or imported model
   * @param {Object} params - Inference parameters
   * @param {string} params.model_path - Path to model file
   * @param {string} params.data_path - Path to inference data
   * @param {string} params.output_path - Path for results
   * @param {string} [params.training_id] - Training ID (optional for imported models)
   */
  async runInference(params) {
    return this._post('/run-inference', params);
  }

  /**
   * Get inference results
   * @param {string} inferenceId - Inference session ID
   * @returns {string} Download URL
   */
  getInferenceDownloadUrl(inferenceId) {
    return `/download-inference-results/${inferenceId}`;
  }

  /**
   * Get visualization data for 3D viewer
   * @param {string} trainingId - Training/inference ID
   */
  async getVisualizationData(trainingId) {
    return this._get(`/results/${trainingId}/visualization.json`);
  }

  /**
   * Get original data overlay for visualization
   * @param {string} trainingId - Training/inference ID
   */
  async getOriginalDataOverlay(trainingId) {
    return this._get(`/results/${trainingId}/original-data-web`);
  }

  // ============================================================================
  // Model Import
  // ============================================================================

  /**
   * Import pre-trained model (classic file upload)
   * @param {File} modelFile - .pth model file
   * @param {File} configFile - .json config file
   */
  async importModel(modelFile, configFile) {
    const formData = new FormData();
    formData.append('model', modelFile);
    formData.append('config', configFile);

    return this._postFormData('/import-pretrained-model', formData);
  }

  /**
   * Get recent completed training results for model import
   * @returns {Promise<{success: boolean, results: Array}>}
   */
  async getRecentTrainingResults() {
    return this._get('/api/segmentation/recent-results');
  }

  /**
   * Validate model and config files for import
   * @param {string} modelPath - Path to model file
   * @param {string} configPath - Path to config file
   * @returns {Promise<{success: boolean, valid: boolean, modelInfo?: object, configData?: object, errors?: Array}>}
   */
  async validateImportedModel(modelPath, configPath) {
    return this._post('/api/segmentation/validate-model', { modelPath, configPath });
  }

  /**
   * Store imported model paths in session for inference
   * @param {string} modelPath - Path to model file
   * @param {string} configPath - Path to config file
   * @returns {Promise<{success: boolean, message?: string}>}
   */
  async storeImportedModel(modelPath, configPath) {
    return this._post('/api/segmentation/store-imported-model', { modelPath, configPath });
  }

  // ============================================================================
  // Session Management
  // ============================================================================

  /**
   * Check authentication status
   */
  async checkAuth() {
    return this._get('/check-auth');
  }

  /**
   * Logout current user
   */
  async logout() {
    return this._post('/logout', {});
  }

  // ============================================================================
  // Workspace API
  // ============================================================================

  /**
   * Initialize workspace for current session
   */
  async initializeWorkspace() {
    return this._post('/api/workspace/init', {});
  }

  /**
   * Get workspace status and file tree
   */
  async getWorkspaceStatus() {
    return this._get('/api/workspace/status');
  }

  /**
   * Get workspace files
   */
  async getWorkspaceFiles() {
    return this._get('/api/workspace/files');
  }

  /**
   * Get workspace statistics
   */
  async getWorkspaceStats() {
    return this._get('/api/workspace/stats');
  }

  /**
   * Upload file to workspace
   * @param {File} file - File to upload
   * @param {string} category - File category (raw_images, annotations, etc.)
   */
  async uploadFileToWorkspace(file, category) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('category', category);

    return this._postFormData('/api/workspace/upload', formData);
  }
}

// Make available globally for helper scripts
if (typeof window !== 'undefined') {
  window.SegmentationAPI = SegmentationAPI;
}

// ES6 export for module imports
export default SegmentationAPI;
