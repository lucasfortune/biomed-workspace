/**
 * AnnotationAPI - API client for annotation endpoints
 *
 * Provides methods for:
 * - Getting full-resolution slices
 * - Saving annotation progress
 * - Creating final annotations
 * - Loading unfinished annotations
 *
 * @module AnnotationAPI
 */

class AnnotationAPI {
  constructor(baseUrl = '') {
    this.baseUrl = baseUrl;
  }

  /**
   * Get full-resolution slice as PNG (no scaling)
   * @param {string} fileId - File ID
   * @param {number} sliceIndex - Slice index (0-based)
   * @returns {string} URL for the raw slice PNG
   */
  getRawSliceUrl(fileId, sliceIndex) {
    const encodedId = encodeURIComponent(fileId);
    return `${this.baseUrl}/api/annotation/raw-slice/${encodedId}/${sliceIndex}`;
  }

  /**
   * Get TIFF info (dimensions, slice count, etc.)
   * Uses existing workspace endpoint
   * @param {string} fileId - File ID
   * @returns {Promise<{success: boolean, info: object}>}
   */
  async getTiffInfo(fileId) {
    try {
      const encodedId = encodeURIComponent(fileId);
      const response = await fetch(`${this.baseUrl}/api/workspace/tiff-info/${encodedId}`, {
        credentials: 'include'
      });
      return await response.json();
    } catch (error) {
      console.error('[AnnotationAPI] getTiffInfo error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Save annotation progress (unfinished annotation)
   * @param {object} data - Annotation data
   * @param {string} data.sourceFileId - Source file ID
   * @param {string} data.sourceFileName - Source file name
   * @param {object} data.dimensions - { width, height, slices }
   * @param {Array} data.classes - Class definitions
   * @param {object} data.sliceData - Map of slice index to base64 encoded data
   * @param {string} [data.existingFileId] - Existing annotation file ID (for updates)
   * @param {object} [data.filaments] - Filament data (from FilamentManager.toJSON())
   * @returns {Promise<{success: boolean, fileId: string, filePath: string}>}
   */
  async saveProgress(data) {
    try {
      const response = await fetch(`${this.baseUrl}/api/annotation/save-progress`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify(data)
      });
      return await response.json();
    } catch (error) {
      console.error('[AnnotationAPI] saveProgress error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Create final annotation
   * @param {object} data - Annotation data (same as saveProgress)
   * @param {object} [data.filaments] - Filament data (from FilamentManager.toJSON())
   * @returns {Promise<{success: boolean, fileId: string, filePath: string}>}
   */
  async createAnnotation(data) {
    try {
      const response = await fetch(`${this.baseUrl}/api/annotation/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify(data)
      });
      return await response.json();
    } catch (error) {
      console.error('[AnnotationAPI] createAnnotation error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Load unfinished or existing annotation
   * @param {string} fileId - Annotation file ID
   * @returns {Promise<{success: boolean, data: object}>}
   */
  async loadAnnotation(fileId) {
    try {
      const encodedId = encodeURIComponent(fileId);
      const response = await fetch(`${this.baseUrl}/api/annotation/load/${encodedId}`, {
        credentials: 'include'
      });
      return await response.json();
    } catch (error) {
      console.error('[AnnotationAPI] loadAnnotation error:', error);
      return { success: false, error: error.message };
    }
  }
}

// =============================================================================
// EXPORT
// =============================================================================

export default AnnotationAPI;
