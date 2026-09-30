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
      // Get relative path from workspace root
      const workspacePath = this.workspaceService.getWorkspacePath(sessionId);

      // Build a consistent display name chained from the source/input file, when lineage
      // identifies one. Info/auxiliary outputs get an 'info' qualifier so they don't
      // collide with the primary data output. Files without lineage keep their raw name.
      const lin = metadata.lineage;
      const sourceId = lin && Array.isArray(lin.inputs) ? lin.inputs[0] : null;
      let displayName = null;
      if (metadata.displayName) {
        // Caller supplied an explicit display name
        displayName = metadata.displayName;
      } else if (lin && lin.processType && sourceId) {
        const sourceName = this.workspaceService.getSourceDisplayName(sessionId, sourceId);
        const isInfo = Array.isArray(metadata.tags) && metadata.tags.includes('info');
        displayName = buildDisplayName({
          sourceName,
          operation: lin.processType,
          ext: path.extname(filePath),
          qualifier: isInfo ? 'info' : undefined
        });
      }

      // ADR-018: a produced file carries its display name on disk. Scripts
      // that pick their own file names (inference, denoising, packaging) hand
      // the file over with adoptName, and it is renamed before tracking.
      if (metadata.adoptName && displayName && this.workspaceService.adoptDisplayName) {
        filePath = this.workspaceService.adoptDisplayName(filePath, displayName);
      }

      const fileName = path.basename(filePath);
      const fileSize = fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;
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

      if (displayName) {
        fileData.displayName = displayName;
      }

      // Sidecar link (info/config files live and die with their main output)
      if (metadata.parentId) {
        fileData.parentId = metadata.parentId;
      }
      if (metadata.voxelSize) {
        fileData.voxelSize = metadata.voxelSize;
      }

      const fileEntry = this.workspaceService.addFileToMetadata(sessionId, fileData);
      if (fileEntry && metadata.adoptName) {
        // Callers may need the final location (renamed above)
        fileEntry.absolutePath = filePath;
      }

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

    // New metadata system: results category with segmentation/data or
    // segmentation/info tags. The main output is tracked first so its
    // sidecars can point at it (parentId); files are renamed onto their
    // display names (ADR-018) and the result paths updated accordingly.
    const voxelSize = lineage && Array.isArray(lineage.inputs) && lineage.inputs[0]
      ? this.inheritedVoxelSize(sessionId, lineage.inputs[0]) : null;
    const filesToTrack = [
      { key: 'output_path', tags: ['segmentation', 'data'], main: true },
      { key: 'metadata_path', tags: ['segmentation', 'info'] },
      { key: 'visualization_path', tags: ['segmentation', 'info'] }
    ];

    let mainId = null;
    for (const file of filesToTrack) {
      const filePath = result[file.key];
      if (filePath && fs.existsSync(filePath)) {
        const entry = await this.trackModuleOutput(sessionId, filePath, 'results', {
          lineage: lineage ? { ...lineage, inputs: [...(lineage.inputs || [])] } : null,
          tags: file.tags,
          adoptName: true,
          ...(file.main && voxelSize && { voxelSize }),
          ...(!file.main && mainId && { parentId: mainId })
        });
        if (entry) {
          if (entry.absolutePath) result[file.key] = entry.absolutePath;
          if (file.main) mainId = entry.id;
        }
        if (this.logger) {
          this.logger.debug(`[TRACKING] Tracked ${path.basename(result[file.key])} (results)`);
        }
      }
    }

    if (this.logger) {
      this.logger.debug(`[TRACKING] Completed tracking for inference ${inferenceId} (source: ${source})`);
    }
  }

  /**
   * Voxel size of a source file, for inheritance by derived outputs (ADR-008)
   * @param {string} sessionId - Session ID
   * @param {string} fileId - Source file id
   * @returns {object|null}
   */
  inheritedVoxelSize(sessionId, fileId) {
    try {
      const metadata = this.workspaceService.loadMetadata(sessionId);
      const file = (metadata.files || []).find(f => f.id === fileId);
      return file && file.voxelSize ? { ...file.voxelSize } : null;
    } catch (e) {
      return null;
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
