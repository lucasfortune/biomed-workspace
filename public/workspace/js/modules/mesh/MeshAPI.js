/**
 * MeshAPI - API client for mesh generation endpoints
 *
 * Provides methods for:
 * - Fetching available segmentation sources
 * - Getting TIFF metadata and previews
 * - Starting mesh generation
 * - Checking generation status
 * - Downloading generated meshes
 *
 * @module MeshAPI
 */

class MeshAPI {
  constructor(baseUrl = '') {
    this.baseUrl = baseUrl;
  }

  /**
   * Get TIFF stack metadata (dimensions, classes, etc.)
   * @param {string} fileId - File ID or path
   * @returns {Promise<{success: boolean, info: object}>}
   */
  async getInfo(fileId) {
    try {
      const encodedId = encodeURIComponent(fileId);
      const response = await fetch(`${this.baseUrl}/api/mesh/info/${encodedId}`, {
        credentials: 'include'
      });
      return await response.json();
    } catch (error) {
      console.error('[MeshAPI] getInfo error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get preview image URL for a specific slice
   * @param {string} fileId - File ID or path
   * @param {number} sliceIndex - Slice index (0-based)
   * @param {string} size - Image size ('thumbnail', 'gallery', 'full')
   * @returns {string} Preview image URL
   */
  getPreviewUrl(fileId, sliceIndex = 0, size = 'gallery') {
    const encodedId = encodeURIComponent(fileId);
    return `${this.baseUrl}/api/mesh/preview/${encodedId}/${sliceIndex}?size=${size}`;
  }

  /**
   * Start mesh generation
   * @param {string} sourceFile - Source file path or ID
   * @param {object} options - Generation options
   * @param {string[]} options.outputFormats - Output formats ['json', 'obj', 'stl']
   * @param {string|number[]} options.targetClasses - 'all' or array of class IDs
   * @param {number} options.zAspect - Z voxel scale relative to x/y (1.0 = symmetric)
   * @param {string} options.sourceFileId - Source file ID for lineage tracking
   * @returns {Promise<{success: boolean, meshId: string}>}
   */
  async generateMesh(sourceFile, options = {}) {
    try {
      const requestBody = {
        sourceFile,
        outputFormats: options.outputFormats || ['json', 'obj'],
        targetClasses: options.targetClasses || 'all'
      };

      // Z voxel aspect ratio relative to x/y (default 1.0 = symmetric)
      if (options.zAspect != null) {
        requestBody.zAspect = options.zAspect;
      }

      // Include sourceFileId for lineage tracking if provided
      if (options.sourceFileId) {
        requestBody.sourceFileId = options.sourceFileId;
      }

      const response = await fetch(`${this.baseUrl}/api/mesh/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify(requestBody)
      });
      return await response.json();
    } catch (error) {
      console.error('[MeshAPI] generateMesh error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Check mesh generation status
   * @param {string} meshId - Mesh generation ID
   * @returns {Promise<{success: boolean, status: string, progress: number}>}
   */
  async getStatus(meshId) {
    try {
      const response = await fetch(`${this.baseUrl}/api/mesh/status/${meshId}`, {
        credentials: 'include'
      });
      return await response.json();
    } catch (error) {
      console.error('[MeshAPI] getStatus error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Delete a file from workspace (used for cleanup after failed validation)
   * @param {string} fileId - File ID to delete
   * @returns {Promise<{success: boolean}>}
   */
  async deleteFile(fileId) {
    try {
      const response = await fetch(`${this.baseUrl}/api/workspace/file/${fileId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      return await response.json();
    } catch (error) {
      console.error('[MeshAPI] deleteFile error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Upload annotation file for mesh generation
   * @param {File} file - File to upload
   * @param {function} onProgress - Progress callback (0-100)
   * @returns {Promise<{success: boolean, file_path: string, file_id: string}>}
   */
  async uploadAnnotation(file, onProgress = null) {
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('category', 'annotations');

      const xhr = new XMLHttpRequest();

      return new Promise((resolve, reject) => {
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
              resolve(result);
            } catch (e) {
              reject(new Error('Invalid response format'));
            }
          } else {
            reject(new Error(`Upload failed: ${xhr.statusText}`));
          }
        });

        xhr.addEventListener('error', () => {
          reject(new Error('Upload failed'));
        });

        xhr.open('POST', `${this.baseUrl}/api/workspace/upload`);
        xhr.withCredentials = true;
        xhr.send(formData);
      });
    } catch (error) {
      console.error('[MeshAPI] uploadAnnotation error:', error);
      return { success: false, error: error.message };
    }
  }
}

// Export for ES6 modules
export default MeshAPI;

// Also make available globally
if (typeof window !== 'undefined') {
  window.MeshAPI = MeshAPI;
}
