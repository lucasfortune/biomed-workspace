/**
 * VisualizationAPI - API client for 3D visualization module
 *
 * Provides methods for:
 * - Validating mesh JSON files
 * - Fetching mesh data
 * - Looking up original data via lineage
 * - File operations
 *
 * @module VisualizationAPI
 */

class VisualizationAPI {
  constructor(baseUrl = '') {
    this.baseUrl = baseUrl;
  }

  /**
   * Validate a mesh JSON file
   * Checks for BufferGeometry format and extracts metadata
   * @param {string} fileId - File ID or path
   * @returns {Promise<{success: boolean, info: object, error: string}>}
   */
  async validateMeshFile(fileId) {
    try {
      const encodedId = encodeURIComponent(fileId);

      // First, try to fetch the file and parse it
      const response = await fetch(`${this.baseUrl}/api/workspace/file/${encodedId}/download`, {
        credentials: 'include'
      });

      if (!response.ok) {
        return { success: false, error: `Failed to fetch file: ${response.statusText}` };
      }

      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        // Try to parse anyway in case content-type is wrong
      }

      let jsonData;
      try {
        jsonData = await response.json();
      } catch (parseError) {
        return { success: false, error: 'File is not valid JSON' };
      }

      // Validate the mesh structure
      const validation = this.validateMeshStructure(jsonData);

      if (!validation.valid) {
        return { success: false, error: validation.error };
      }

      return {
        success: true,
        info: {
          format: validation.format,
          classCount: validation.classCount,
          classes: validation.classes,
          totalVertices: validation.totalVertices,
          totalFaces: validation.totalFaces,
          meshId: jsonData.metadata?.mesh_id
        }
      };

    } catch (error) {
      console.error('[VisualizationAPI] validateMeshFile error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Validate mesh JSON structure
   * @param {object} data - Parsed JSON data
   * @returns {{valid: boolean, format: string, classCount: number, classes: number[], error: string}}
   */
  validateMeshStructure(data) {
    if (!data) {
      return { valid: false, error: 'Empty or invalid JSON data' };
    }

    // Check for VoxelSlices format (new slice-based visualization)
    if (data.metadata && data.metadata.type === 'VoxelSlices') {
      // Validate required fields
      if (!data.data || !Array.isArray(data.data)) {
        return { valid: false, error: 'VoxelSlices format missing data array' };
      }

      if (!data.shape || data.shape.length !== 3) {
        return { valid: false, error: 'VoxelSlices format missing shape metadata' };
      }

      if (!data.classes || !Array.isArray(data.classes)) {
        return { valid: false, error: 'VoxelSlices format missing classes array' };
      }

      return {
        valid: true,
        format: 'VoxelSlices',
        classCount: data.classes.length,
        classes: data.classes.sort((a, b) => a - b),
        totalVoxels: data.statistics?.totalVoxels || data.data.length,
        sliceCount: data.sliceCount || 20,
        sliceDirection: data.sliceDirection || 'z'
      };
    }

    // Check for BufferGeometry format (marching cubes)
    if (data.metadata && data.meshes) {
      // Validate metadata
      if (data.metadata.type !== 'BufferGeometry') {
        return { valid: false, error: `Unsupported mesh type: ${data.metadata.type}` };
      }

      // Count classes and validate mesh entries
      const meshEntries = Object.entries(data.meshes);
      if (meshEntries.length === 0) {
        return { valid: false, error: 'No mesh data found in file' };
      }

      const classes = [];
      let totalVertices = 0;
      let totalFaces = 0;

      for (const [classId, meshData] of meshEntries) {
        // Validate each class mesh has required properties
        if (!meshData.attributes || !meshData.attributes.position) {
          return { valid: false, error: `Class ${classId} missing position data` };
        }

        if (!meshData.index || !meshData.index.array) {
          return { valid: false, error: `Class ${classId} missing index data` };
        }

        classes.push(parseInt(classId));

        // Count vertices and faces
        const vertexCount = meshData.attributes.position.array.length / 3;
        const faceCount = meshData.index.array.length / 3;
        totalVertices += vertexCount;
        totalFaces += faceCount;
      }

      return {
        valid: true,
        format: 'BufferGeometry',
        classCount: classes.length,
        classes: classes.sort((a, b) => a - b),
        totalVertices,
        totalFaces
      };
    }

    // Check for Three.js ObjectLoader format
    if (data.object && data.geometries) {
      return {
        valid: true,
        format: 'ObjectLoader',
        classCount: data.geometries.length,
        classes: data.geometries.map((_, i) => i + 1),
        totalVertices: null,
        totalFaces: null
      };
    }

    // Check for array of meshes format
    if (Array.isArray(data) && data.length > 0 && data[0].geometry) {
      return {
        valid: true,
        format: 'MeshArray',
        classCount: data.length,
        classes: data.map((m, i) => m.classId || i + 1),
        totalVertices: null,
        totalFaces: null
      };
    }

    return { valid: false, error: 'Unrecognized mesh file format' };
  }

  /**
   * Get mesh file data
   * @param {string} fileId - File ID or path
   * @returns {Promise<{success: boolean, data: object}>}
   */
  async getMeshData(fileId) {
    try {
      const encodedId = encodeURIComponent(fileId);
      const response = await fetch(`${this.baseUrl}/api/workspace/file/${encodedId}/download`, {
        credentials: 'include'
      });

      if (!response.ok) {
        return { success: false, error: `Failed to fetch mesh: ${response.statusText}` };
      }

      const data = await response.json();
      return { success: true, data };

    } catch (error) {
      console.error('[VisualizationAPI] getMeshData error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get original data file via lineage lookup
   * @param {string} fileId - File ID to trace lineage for
   * @returns {Promise<{originalDataFile: object|null, processingHistory: string}>}
   */
  async getOriginalDataFile(fileId) {
    try {
      const encodedId = encodeURIComponent(fileId);
      const response = await fetch(`${this.baseUrl}/api/workspace/lineage/${encodedId}`, {
        credentials: 'include'
      });

      if (!response.ok) {
        console.warn('[VisualizationAPI] Lineage lookup failed:', response.statusText);
        return { originalDataFile: null };
      }

      const lineageData = await response.json();

      if (lineageData.success) {
        return {
          originalDataFile: lineageData.originalDataFile || null,
          processingHistory: lineageData.processingHistory || '',
          chain: lineageData.chain || []
        };
      }

      return { originalDataFile: null };

    } catch (error) {
      console.error('[VisualizationAPI] getOriginalDataFile error:', error);
      return { originalDataFile: null };
    }
  }

  /**
   * Get mesh file from a mesh generation result
   * @param {string} meshId - Mesh generation ID
   * @returns {Promise<{success: boolean, fileId: string, path: string, name: string}>}
   */
  async getMeshFileFromResult(meshId) {
    try {
      // Check mesh generation status to get output info
      const response = await fetch(`${this.baseUrl}/api/mesh/status/${meshId}`, {
        credentials: 'include'
      });

      if (!response.ok) {
        return { success: false, error: 'Mesh result not found' };
      }

      const status = await response.json();

      if (status.success && status.result) {
        // Look for JSON file in the result
        const jsonFile = status.result.files?.find(f => f.format === 'json');

        if (jsonFile) {
          return {
            success: true,
            fileId: jsonFile.id,
            path: jsonFile.path,
            name: jsonFile.name || `mesh_${meshId}.json`
          };
        }
      }

      return { success: false, error: 'No JSON mesh file in result' };

    } catch (error) {
      console.error('[VisualizationAPI] getMeshFileFromResult error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get download URL for original data TIFF
   * @param {string} fileId - File ID
   * @returns {string} Download URL
   */
  getOriginalDataUrl(fileId) {
    const encodedId = encodeURIComponent(fileId);
    return `${this.baseUrl}/api/workspace/file/${encodedId}/download`;
  }

  /**
   * Delete a file from workspace
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
      console.error('[VisualizationAPI] deleteFile error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Upload a mesh JSON file
   * @param {File} file - File to upload
   * @param {function} onProgress - Progress callback (0-100)
   * @returns {Promise<{success: boolean, file_path: string, file_id: string}>}
   */
  async uploadMeshFile(file, onProgress = null) {
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('category', 'meshes');

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
      console.error('[VisualizationAPI] uploadMeshFile error:', error);
      return { success: false, error: error.message };
    }
  }
}

// Export for ES6 modules
export default VisualizationAPI;

// Also make available globally
if (typeof window !== 'undefined') {
  window.VisualizationAPI = VisualizationAPI;
}
