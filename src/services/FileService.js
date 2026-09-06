/**
 * FileService
 *
 * Handles file operations including upload tracking, validation, and thumbnail generation.
 */

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { buildDisplayName } = require('../helpers/namingHelpers');

class FileService {
  /**
   * Create FileService instance
   * @param {object} options - Configuration options
   * @param {object} options.workspaceService - WorkspaceService instance
   * @param {string} options.pythonPath - Path to Python interpreter
   * @param {object} options.logger - Logger instance
   */
  constructor(options = {}) {
    this.workspaceService = options.workspaceService;
    this.pythonPath = options.pythonPath;
    this.logger = options.logger;
  }

  // ===========================================================================
  // FILE TRACKING
  // ===========================================================================

  /**
   * Track module output in workspace metadata
   * @param {string} sessionId - Session ID
   * @param {string} filePath - Absolute path to the output file
   * @param {string} category - File category (models, segmentations, denoised, etc.)
   * @param {object} metadata - Optional additional metadata
   * @returns {Promise<object|null>} File entry object or null on error
   */
  async trackModuleOutput(sessionId, filePath, category, metadata = {}) {
    try {
      const fileName = path.basename(filePath);
      const fileSize = fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;

      // Get relative path from workspace root
      const workspacePath = this.workspaceService.getWorkspacePath(sessionId);
      const relativePath = path.relative(workspacePath, filePath);

      // Build file entry with explicit tags handling
      const fileData = {
        name: fileName,
        path: relativePath,
        category: category,
        size: fileSize,
        folderId: null
      };

      // Explicitly add tags if provided
      if (metadata.tags && Array.isArray(metadata.tags)) {
        fileData.tags = metadata.tags;
      }

      // Add lineage if provided
      if (metadata.lineage) {
        fileData.lineage = metadata.lineage;
      }

      // Build a consistent display name chained from the source/input file, when lineage
      // identifies one. Info/auxiliary outputs get an 'info' qualifier so they don't
      // collide with the primary data output. Files without lineage keep their raw name.
      const lin = metadata.lineage;
      const sourceId = lin && Array.isArray(lin.inputs) ? lin.inputs[0] : null;
      if (metadata.displayName) {
        // Caller supplied an explicit display name
        fileData.displayName = metadata.displayName;
      } else if (lin && lin.processType && sourceId) {
        const sourceName = this.workspaceService.getSourceDisplayName(sessionId, sourceId);
        const isInfo = Array.isArray(metadata.tags) && metadata.tags.includes('info');
        fileData.displayName = buildDisplayName({
          sourceName,
          operation: lin.processType,
          ext: path.extname(fileName),
          qualifier: isInfo ? 'info' : undefined
        });
      }

      const fileEntry = this.workspaceService.addFileToMetadata(sessionId, fileData);

      if (this.logger) {
        this.logger.debug(`Tracked ${category} output:`, fileName);
      }

      // Generate thumbnail for TIFF files (async, don't wait)
      if (this.isTiffFile(fileName)) {
        this.generateThumbnailAsync(sessionId, filePath, fileEntry.id);
      }

      return fileEntry;
    } catch (error) {
      if (this.logger) {
        this.logger.error('Error tracking module output:', error);
      }
      return null;
    }
  }

  /**
   * Track multiple files from inference results
   * @param {object} result - Inference result object with file paths
   * @param {string} inferenceId - Inference ID
   * @param {string} sessionId - Session ID
   * @param {string} source - Source identifier for logging
   * @param {object} [lineage=null] - Optional lineage object for provenance tracking
   */
  async trackInferenceResults(result, inferenceId, sessionId, source, lineage = null) {
    if (!result || !result.success) {
      if (this.logger) {
        this.logger.debug(`[TRACKING] Skipping tracking - result not successful (source: ${source})`);
      }
      return;
    }

    if (this.logger) {
      this.logger.debug(`[TRACKING] Tracking inference results from ${source} for inference ${inferenceId}`);
      if (lineage) {
        this.logger.debug(`[TRACKING] Including lineage: ${JSON.stringify(lineage)}`);
      }
    }

    // New metadata system: results category with segmentation/data or segmentation/info tags
    const filesToTrack = [
      { path: result.output_path, category: 'results', tags: ['segmentation', 'data'] },
      { path: result.metadata_path, category: 'results', tags: ['segmentation', 'info'] },
      { path: result.visualization_path, category: 'results', tags: ['segmentation', 'info'] }
    ];

    for (const file of filesToTrack) {
      if (file.path && fs.existsSync(file.path)) {
        // Pass lineage and tags as part of metadata
        await this.trackModuleOutput(sessionId, file.path, file.category, { lineage, tags: file.tags });
        if (this.logger) {
          this.logger.debug(`[TRACKING] Tracked ${path.basename(file.path)} (${file.category})`);
        }
      }
    }

    if (this.logger) {
      this.logger.debug(`[TRACKING] Completed tracking for inference ${inferenceId} (source: ${source})`);
    }
  }

  // ===========================================================================
  // THUMBNAIL GENERATION
  // ===========================================================================

  /**
   * Generate thumbnail for a TIFF file asynchronously
   * @param {string} sessionId - Session ID
   * @param {string} filePath - Path to TIFF file
   * @param {string} fileId - File ID for the thumbnail
   */
  generateThumbnailAsync(sessionId, filePath, fileId) {
    if (!this.pythonPath) {
      if (this.logger) {
        this.logger.warn('Python path not configured, skipping thumbnail generation');
      }
      return;
    }

    const thumbnailsDir = this.workspaceService.ensureThumbnailsDir(sessionId);
    const thumbnailPath = path.join(thumbnailsDir, `${fileId}.jpg`);

    const process = spawn(this.pythonPath, [
      'python/generate_thumbnail.py',
      filePath,
      thumbnailPath
    ]);

    process.on('close', async (code) => {
      if (code === 0) {
        await this.workspaceService.setThumbnailPath(
          sessionId,
          fileId,
          `.thumbnails/${fileId}.jpg`
        );
        if (this.logger) {
          this.logger.debug(`Thumbnail generated for file ${fileId}`);
        }
      } else {
        if (this.logger) {
          this.logger.warn(`Thumbnail generation failed for file ${fileId} with code ${code}`);
        }
      }
    });

    process.on('error', (error) => {
      if (this.logger) {
        this.logger.error(`Thumbnail generation error for file ${fileId}:`, error);
      }
    });
  }

  // ===========================================================================
  // FILE UTILITIES
  // ===========================================================================

  /**
   * Check if a file is a TIFF file
   * @param {string} fileName - File name
   * @returns {boolean} True if TIFF file
   */
  isTiffFile(fileName) {
    const ext = path.extname(fileName).toLowerCase();
    return ext === '.tif' || ext === '.tiff';
  }

  /**
   * Get file size
   * @param {string} filePath - Path to file
   * @returns {number} File size in bytes, or 0 if file doesn't exist
   */
  getFileSize(filePath) {
    if (fs.existsSync(filePath)) {
      return fs.statSync(filePath).size;
    }
    return 0;
  }

  /**
   * Check if file exists
   * @param {string} filePath - Path to file
   * @returns {boolean} True if file exists
   */
  fileExists(filePath) {
    return fs.existsSync(filePath);
  }

  /**
   * Copy file to workspace
   * @param {string} sourcePath - Source file path
   * @param {string} destPath - Destination file path
   * @returns {boolean} True if successful
   */
  copyFile(sourcePath, destPath) {
    try {
      // Ensure destination directory exists
      const destDir = path.dirname(destPath);
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }
      fs.copyFileSync(sourcePath, destPath);
      return true;
    } catch (error) {
      if (this.logger) {
        this.logger.error('Error copying file:', error);
      }
      return false;
    }
  }

  /**
   * Delete file
   * @param {string} filePath - Path to file
   * @returns {boolean} True if successful
   */
  deleteFile(filePath) {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      return true;
    } catch (error) {
      if (this.logger) {
        this.logger.error('Error deleting file:', error);
      }
      return false;
    }
  }
}

module.exports = FileService;
