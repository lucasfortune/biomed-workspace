/**
 * WorkspaceAPI - API client for workspace-related endpoints
 */
class WorkspaceAPI {
  constructor(baseURL = '') {
    this.baseURL = baseURL;
    this.defaultHeaders = {
      'Content-Type': 'application/json'
    };
  }

  /**
   * Make an API request
   * @private
   */
  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const config = {
      headers: {
        ...this.defaultHeaders,
        ...options.headers
      },
      ...options
    };

    try {
      console.log(`[WorkspaceAPI] ${options.method || 'GET'} ${endpoint}`);

      const response = await fetch(url, config);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      return data;
    } catch (error) {
      console.error(`[WorkspaceAPI] Error calling ${endpoint}:`, error);
      throw error;
    }
  }

  /**
   * GET request
   * @private
   */
  async get(endpoint) {
    return this.request(endpoint, { method: 'GET' });
  }

  /**
   * POST request
   * @private
   */
  async post(endpoint, data) {
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  /**
   * DELETE request
   * @private
   */
  async delete(endpoint) {
    return this.request(endpoint, { method: 'DELETE' });
  }

  // ===========================================================================
  // Workspace Management
  // ===========================================================================

  /**
   * Initialize workspace for current session
   */
  async initializeWorkspace() {
    return this.post('/api/workspace/init', {});
  }

  /**
   * Get workspace status and information
   */
  async getWorkspaceStatus() {
    return this.get('/api/workspace/status');
  }

  /**
   * Get workspace file tree
   */
  async getWorkspaceFiles() {
    return this.get('/api/workspace/files');
  }

  /**
   * Get workspace statistics
   */
  async getWorkspaceStats() {
    return this.get('/api/workspace/stats');
  }

  // ===========================================================================
  // File Management
  // ===========================================================================

  /**
   * Upload file to workspace
   * @param {File} file - File to upload
   * @param {string} category - File category (raw_images, annotations, etc.)
   */
  async uploadFile(file, category) {
    const formData = new FormData();
    // Use category as field name so backend routes to correct directory
    formData.append(category, file);
    formData.append('category', category);

    const response = await fetch(`${this.baseURL}/api/workspace/upload`, {
      method: 'POST',
      body: formData
      // Don't set Content-Type header - browser will set it with boundary
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Upload failed');
    }

    return data;
  }

  /**
   * Download file from workspace
   * @param {string} fileId - File ID to download
   */
  downloadFile(fileId) {
    window.location.href = `${this.baseURL}/api/workspace/file/${fileId}/download`;
  }

  /**
   * Delete file from workspace
   * @param {string} fileId - File ID to delete
   */
  async deleteFile(fileId) {
    return this.delete(`/api/workspace/file/${fileId}`);
  }

  /**
   * Batch delete files from workspace
   * @param {Array<string>} fileIds - Array of file IDs to delete
   */
  async batchDeleteFiles(fileIds) {
    return this.post('/api/workspace/files/batch-delete', { fileIds });
  }

  /**
   * Batch download files as ZIP
   * @param {Array<string>} fileIds - Array of file IDs to download
   */
  async batchDownloadFiles(fileIds) {
    // Use fetch with blob response for file download
    const response = await fetch(`${this.baseURL}/api/workspace/files/batch-download`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ fileIds })
    });

    if (!response.ok) {
      throw new Error('Batch download failed');
    }

    // Trigger download
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'workspace_files.zip';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);

    return { success: true };
  }

  // ===========================================================================
  // Authentication
  // ===========================================================================

  /**
   * Check authentication status
   */
  async checkAuth() {
    return this.get('/check-auth');
  }

  /**
   * Logout
   */
  async logout() {
    return this.post('/logout', {});
  }

  // ===========================================================================
  // Segmentation Module
  // ===========================================================================

  /**
   * Upload training data
   * @param {File} rawImages - Raw images TIFF file
   * @param {File} annotations - Annotations TIFF file
   * @param {boolean} isTestData - Whether using test data
   */
  async uploadTrainingData(rawImages, annotations, isTestData = false) {
    const formData = new FormData();

    if (!isTestData) {
      formData.append('raw_images', rawImages);
      formData.append('annotations', annotations);
    }
    formData.append('isTestData', isTestData.toString());

    const response = await fetch(`${this.baseURL}/upload-data`, {
      method: 'POST',
      body: formData
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Upload failed');
    }

    return data;
  }

  /**
   * Configure training parameters
   * @param {Object} config - Training configuration
   */
  async configureTraining(config) {
    return this.post('/configure-training', config);
  }

  /**
   * Start training
   */
  async startTraining() {
    return this.post('/start-training', {});
  }

  /**
   * Get training status
   * @param {string} trainingId - Training ID
   */
  async getTrainingStatus(trainingId) {
    return this.get(`/training-status/${trainingId}`);
  }

  /**
   * Upload inference data
   * @param {File} inferenceData - Inference TIFF file
   * @param {boolean} isTestData - Whether using test data
   */
  async uploadInferenceData(inferenceData, isTestData = false) {
    const formData = new FormData();

    if (!isTestData) {
      formData.append('inference_data', inferenceData);
    }
    formData.append('isTestData', isTestData.toString());

    const response = await fetch(`${this.baseURL}/upload-inference`, {
      method: 'POST',
      body: formData
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Upload failed');
    }

    return data;
  }

  /**
   * Run inference
   * @param {Object} params - Inference parameters
   */
  async runInference(params) {
    return this.post('/run-inference', params);
  }

  /**
   * Get inference status
   * @param {string} inferenceId - Inference ID
   */
  async getInferenceStatus(inferenceId) {
    return this.get(`/inference-status/${inferenceId}`);
  }

  /**
   * Download trained model
   * @param {string} trainingId - Training ID
   */
  downloadModel(trainingId) {
    window.location.href = `${this.baseURL}/download-model/${trainingId}`;
  }

  /**
   * Download inference results
   * @param {string} inferenceId - Inference ID
   */
  downloadInferenceResults(inferenceId) {
    window.location.href = `${this.baseURL}/download-inference-results/${inferenceId}`;
  }

  // ===========================================================================
  // Session Management
  // ===========================================================================

  /**
   * Reset session
   */
  async resetSession() {
    return this.post('/reset-session', {});
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = WorkspaceAPI;
}
