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

      // Handle non-JSON responses gracefully
      let data;
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
      } else {
        // Non-JSON response - create error object
        const text = await response.text();
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        // Wrap non-JSON successful response
        data = { success: true, message: text };
      }

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
  // Workspace Export/Import (ZIP)
  // ===========================================================================

  /**
   * Download entire workspace as ZIP file
   * Uses browser's native download manager for better UX:
   * - Shows download progress in browser's download bar
   * - Streams directly to disk (no memory buffering)
   * - Doesn't block the UI
   */
  downloadWorkspace() {
    console.log('[WorkspaceAPI] Triggering workspace download via native browser...');

    // Use direct link to trigger browser's native download manager
    // This streams directly to disk without buffering in memory
    const link = document.createElement('a');
    link.href = `${this.baseURL}/api/workspace/download`;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    console.log('[WorkspaceAPI] Workspace download initiated');
  }

  /**
   * Upload and restore workspace from ZIP file
   * @param {File} zipFile - ZIP file to restore from
   * @param {function} onProgress - Progress callback (0-100)
   * @returns {Promise<object>} Result with fileCount and status
   */
  async restoreWorkspace(zipFile, onProgress = null) {
    console.log('[WorkspaceAPI] Starting workspace restore...');

    return new Promise((resolve, reject) => {
      const formData = new FormData();
      formData.append('workspace', zipFile);

      const xhr = new XMLHttpRequest();

      // Track upload progress
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable && onProgress) {
          const percent = Math.round((e.loaded / e.total) * 100);
          onProgress(percent);
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const result = JSON.parse(xhr.responseText);
            console.log('[WorkspaceAPI] Workspace restore complete:', result);
            resolve(result);
          } catch (e) {
            reject(new Error('Invalid response from server'));
          }
        } else {
          try {
            const errorData = JSON.parse(xhr.responseText);
            reject(new Error(errorData.error || `Restore failed: ${xhr.statusText}`));
          } catch (e) {
            reject(new Error(`Restore failed: ${xhr.statusText}`));
          }
        }
      });

      xhr.addEventListener('error', () => {
        reject(new Error('Network error during workspace restore'));
      });

      xhr.addEventListener('abort', () => {
        reject(new Error('Workspace restore was cancelled'));
      });

      xhr.open('POST', `${this.baseURL}/api/workspace/restore`);
      xhr.withCredentials = true;
      xhr.send(formData);
    });
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
    // Use anchor tag to trigger download without CSP issues
    const link = document.createElement('a');
    link.href = `${this.baseURL}/api/workspace/file/${fileId}/download`;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
   * Logout user
   * @param {Object} options - Logout options
   * @param {boolean} options.deleteWorkspace - Whether to delete workspace files on logout
   */
  async logout(options = {}) {
    return this.post('/logout', {
      deleteWorkspace: options.deleteWorkspace || false
    });
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
    // Use anchor tag to trigger download without CSP issues
    const link = document.createElement('a');
    link.href = `${this.baseURL}/download-model/${trainingId}`;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  /**
   * Download inference results
   * @param {string} inferenceId - Inference ID
   */
  downloadInferenceResults(inferenceId) {
    // Use anchor tag to trigger download without CSP issues
    const link = document.createElement('a');
    link.href = `${this.baseURL}/download-inference-results/${inferenceId}`;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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

  // ===========================================================================
  // Lineage Tracking
  // ===========================================================================

  /**
   * Get lineage chain for a file
   * @param {string} fileId - File ID
   * @returns {Promise<object>} Lineage data including chain, roots, and processing history
   */
  async getFileLineage(fileId) {
    return this.get(`/api/workspace/lineage/${fileId}`);
  }

  /**
   * Find original data file for overlay purposes
   * Traverses lineage to find the root file with category 'raw_images' or 'inference_data'
   * @param {string} fileId - Result file ID (e.g., mesh or segmentation result)
   * @returns {Promise<object|null>} Original data file or null if not found
   */
  async findOriginalDataFile(fileId) {
    try {
      const lineage = await this.getFileLineage(fileId);
      if (lineage.success && lineage.originalDataFile) {
        return lineage.originalDataFile;
      }
      return null;
    } catch (error) {
      console.error('[WorkspaceAPI] Error finding original data file:', error);
      return null;
    }
  }

  /**
   * Get processing history string for a file
   * @param {string} fileId - File ID
   * @returns {Promise<string>} Processing history like "Denoising → Segmentation → Mesh Generation"
   */
  async getProcessingHistory(fileId) {
    try {
      const lineage = await this.getFileLineage(fileId);
      return lineage.success ? lineage.processingHistory : '';
    } catch (error) {
      console.error('[WorkspaceAPI] Error getting processing history:', error);
      return '';
    }
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = WorkspaceAPI;
}
