/**
 * WorkspaceService
 *
 * High-level wrapper around WorkspaceManager for workspace operations.
 * Provides orchestration and integration with other services.
 */

const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const unzipper = require('unzipper');
const { CACHE_DIRS } = require('../config/constants');

class WorkspaceService {
  /**
   * Create WorkspaceService instance
   * @param {object} options - Configuration options
   * @param {object} options.workspaceManager - WorkspaceManager instance
   * @param {object} options.activityLogger - Activity logger instance
   * @param {object} options.logger - Logger instance
   */
  constructor(options = {}) {
    this.workspaceManager = options.workspaceManager;
    this.activityLogger = options.activityLogger;
    this.logger = options.logger;
  }

  // ===========================================================================
  // WORKSPACE INITIALIZATION
  // ===========================================================================

  /**
   * Initialize workspace for a session
   * @param {string} sessionId - Session ID
   * @param {string} username - Username for logging
   * @returns {object} Workspace info
   */
  initializeWorkspace(sessionId, username = null) {
    const workspaceInfo = this.workspaceManager.initializeWorkspace(sessionId);

    if (this.activityLogger && username) {
      this.activityLogger.logActivity(username, 'workspace_initialized', { sessionId });
    }

    if (this.logger) {
      this.logger.debug(`Workspace initialized for session: ${sessionId}`);
    }

    return workspaceInfo;
  }

  /**
   * Get workspace info, initializing if necessary
   * @param {string} sessionId - Session ID
   * @returns {object} Workspace status with info and metadata
   */
  getWorkspaceStatus(sessionId) {
    let workspaceInfo;
    let metadata;

    try {
      workspaceInfo = this.workspaceManager.getWorkspaceInfo(sessionId);
      metadata = this.workspaceManager.loadMetadata(sessionId);
    } catch (error) {
      // If workspace doesn't exist, initialize it
      if (error.message.includes('not found')) {
        workspaceInfo = this.workspaceManager.initializeWorkspace(sessionId);
        metadata = this.workspaceManager.loadMetadata(sessionId);
      } else {
        throw error;
      }
    }

    return {
      initialized: !!workspaceInfo,
      sessionId,
      path: this.workspaceManager.getWorkspacePath(sessionId),
      files: metadata?.files || [],
      folders: metadata?.folders || []
    };
  }

  /**
   * Get workspace path for a session
   * @param {string} sessionId - Session ID
   * @returns {string} Workspace path
   */
  getWorkspacePath(sessionId) {
    return this.workspaceManager.getWorkspacePath(sessionId);
  }

  // ===========================================================================
  // FILE OPERATIONS
  // ===========================================================================

  /**
   * Get file by ID
   * @param {string} sessionId - Session ID
   * @param {string} fileId - File ID
   * @returns {Promise<object>} File object
   */
  async getFile(sessionId, fileId) {
    return this.workspaceManager.getFile(sessionId, fileId);
  }

  /**
   * Get full file path
   * @param {string} sessionId - Session ID
   * @param {object} file - File object with path property
   * @returns {string} Full file path
   */
  getFilePath(sessionId, file) {
    return path.join(this.workspaceManager.getWorkspacePath(sessionId), file.path);
  }

  /**
   * Add file to workspace metadata
   * @param {string} sessionId - Session ID
   * @param {object} fileData - File data
   * @returns {object} Created file entry
   */
  addFileToMetadata(sessionId, fileData) {
    return this.workspaceManager.addFileToMetadata(sessionId, fileData);
  }

  /**
   * Get the display name of a tracked file (for building chained names of derived files)
   * @param {string} sessionId - Session ID
   * @param {string} fileId - File ID of the source/input file
   * @param {string} [fallback='file'] - Returned when the file can't be found
   * @returns {string}
   */
  getSourceDisplayName(sessionId, fileId, fallback = 'file') {
    return this.workspaceManager.getSourceDisplayName(sessionId, fileId, fallback);
  }

  /**
   * Delete a file
   * @param {string} sessionId - Session ID
   * @param {string} fileId - File ID
   * @returns {Promise<object>} Result
   */
  async deleteFile(sessionId, fileId) {
    return this.workspaceManager.deleteFile(sessionId, fileId);
  }

  /**
   * Delete multiple files
   * @param {string} sessionId - Session ID
   * @param {Array<string>} fileIds - File IDs to delete
   * @returns {Promise<object>} Result with deleted and failed arrays
   */
  async deleteFiles(sessionId, fileIds) {
    return this.workspaceManager.deleteFiles(sessionId, fileIds);
  }

  /**
   * Rename a file
   * @param {string} sessionId - Session ID
   * @param {string} fileId - File ID
   * @param {string} newName - New file name
   * @returns {Promise<object>} Updated file object
   */
  async renameFile(sessionId, fileId, newName) {
    if (this.logger) {
      this.logger.debug(`Renaming file ${fileId} to ${newName}`);
    }
    return this.workspaceManager.renameFile(sessionId, fileId, newName);
  }

  /**
   * Search files by name
   * @param {string} sessionId - Session ID
   * @param {string} query - Search query
   * @returns {Promise<Array>} Matching files
   */
  async searchFiles(sessionId, query) {
    return this.workspaceManager.searchFiles(sessionId, query);
  }

  /**
   * Get files by category
   * @param {string} sessionId - Session ID
   * @param {string} category - File category
   * @returns {Promise<Array>} Files in category
   */
  async getFilesByCategory(sessionId, category) {
    return this.workspaceManager.getFilesByCategory(sessionId, category);
  }

  /**
   * Set thumbnail path for a file
   * @param {string} sessionId - Session ID
   * @param {string} fileId - File ID
   * @param {string} thumbnailPath - Thumbnail path
   */
  async setThumbnailPath(sessionId, fileId, thumbnailPath) {
    return this.workspaceManager.setThumbnailPath(sessionId, fileId, thumbnailPath);
  }

  // ===========================================================================
  // WORKSPACE STATS
  // ===========================================================================

  /**
   * Get workspace statistics
   * @param {string} sessionId - Session ID
   * @returns {object} Stats { fileCount, totalSize, ... }
   */
  getWorkspaceStats(sessionId) {
    return this.workspaceManager.getWorkspaceStats(sessionId);
  }

  /**
   * Load workspace metadata
   * @param {string} sessionId - Session ID
   * @returns {object} Metadata object
   */
  loadMetadata(sessionId) {
    return this.workspaceManager.loadMetadata(sessionId);
  }

  // ===========================================================================
  // THUMBNAIL OPERATIONS
  // ===========================================================================

  /**
   * Get thumbnails directory path
   * @param {string} sessionId - Session ID
   * @returns {string} Thumbnails directory path
   */
  getThumbnailsDir(sessionId) {
    return path.join(this.workspaceManager.getWorkspacePath(sessionId), '.thumbnails');
  }

  /**
   * Ensure thumbnails directory exists
   * @param {string} sessionId - Session ID
   * @returns {string} Thumbnails directory path
   */
  ensureThumbnailsDir(sessionId) {
    const thumbnailsDir = this.getThumbnailsDir(sessionId);
    if (!fs.existsSync(thumbnailsDir)) {
      fs.mkdirSync(thumbnailsDir, { recursive: true });
    }
    return thumbnailsDir;
  }

  /**
   * Get thumbnail path for a file
   * @param {string} sessionId - Session ID
   * @param {string} fileId - File ID
   * @returns {string} Thumbnail file path
   */
  getThumbnailPath(sessionId, fileId) {
    return path.join(this.getThumbnailsDir(sessionId), `${fileId}.jpg`);
  }

  // ===========================================================================
  // WORKSPACE EXPORT/IMPORT (ZIP)
  // ===========================================================================

  /**
   * Export workspace to a zip file stream
   * Excludes cache directories (.thumbnails, .slices, .mesh-previews)
   * @param {string} sessionId - Session ID
   * @param {object} res - Express response object to stream to
   * @param {string} username - Username for logging
   * @returns {Promise<void>}
   */
  async exportWorkspace(sessionId, res, username = null) {
    const workspacePath = this.workspaceManager.getWorkspacePath(sessionId);

    if (!fs.existsSync(workspacePath)) {
      throw new Error(`Workspace not found for session: ${sessionId}`);
    }

    // Cache directories to exclude
    const excludeDirs = CACHE_DIRS;

    // Generate filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `workspace_${timestamp}.zip`;

    // Set response headers for download
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Create archive
    const archive = archiver('zip', {
      zlib: { level: 6 } // Compression level (0-9)
    });

    // Handle archive errors
    archive.on('error', (err) => {
      if (this.logger) {
        this.logger.error(`Archive error for session ${sessionId}:`, err);
      }
      throw err;
    });

    // Pipe archive to response
    archive.pipe(res);

    // Add files to archive, excluding cache directories
    const addDirectory = (dirPath, archivePath = '') => {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        const entryArchivePath = archivePath ? `${archivePath}/${entry.name}` : entry.name;

        // Skip excluded directories at any level
        if (entry.isDirectory() && excludeDirs.includes(entry.name)) {
          continue;
        }

        if (entry.isDirectory()) {
          addDirectory(fullPath, entryArchivePath);
        } else {
          archive.file(fullPath, { name: entryArchivePath });
        }
      }
    };

    addDirectory(workspacePath);

    // Log activity
    if (this.activityLogger && username) {
      const stats = this.workspaceManager.getWorkspaceStats(sessionId);
      this.activityLogger.logActivity(username, 'workspace_exported', {
        sessionId,
        fileCount: stats?.fileCount || 0,
        totalSizeMB: stats?.totalSizeMB || '0'
      });
    }

    if (this.logger) {
      this.logger.info(`Exporting workspace for session: ${sessionId}`);
    }

    // Finalize archive
    await archive.finalize();
  }

  /**
   * Restore workspace from an uploaded zip file on disk
   * Clears existing workspace and extracts zip contents (streamed, with
   * entry-path sanitization - absolute paths and '..' components are
   * rejected so a crafted archive can't write outside the workspace).
   * Updates session ID in metadata
   * @param {string} sessionId - Session ID
   * @param {string} zipPath - Path to the uploaded zip file (temp file)
   * @param {object} fileService - FileService instance for thumbnail regeneration
   * @param {string} username - Username for logging
   * @param {function} progressCallback - Optional callback for progress updates (phase, progress, message)
   * @returns {Promise<object>} Result with file count and status
   */
  async restoreWorkspace(sessionId, zipPath, fileService = null, username = null, progressCallback = null) {
    // Helper to emit progress if callback provided
    const emitProgress = (phase, progress, message) => {
      if (progressCallback) {
        progressCallback(phase, progress, message);
      }
    };

    const workspacePath = this.workspaceManager.getWorkspacePath(sessionId);

    // Ensure workspace exists
    if (!fs.existsSync(workspacePath)) {
      this.workspaceManager.initializeWorkspace(sessionId);
    }

    // Phase 1: Validate ZIP
    emitProgress('validating', 55, 'Validating workspace archive...');
    const hasMetadata = await this.validateWorkspaceZip(zipPath);
    if (!hasMetadata) {
      throw new Error('Invalid workspace zip: missing metadata.json');
    }

    // Phase 2: Clear existing workspace
    emitProgress('clearing', 65, 'Clearing existing workspace...');
    const clearResult = this.workspaceManager.clearWorkspace(sessionId);
    if (this.logger) {
      this.logger.info(`Cleared ${clearResult.clearedFileCount} files before restore`);
    }

    // Phase 3: Stream-extract ZIP into the workspace with sanitized paths
    emitProgress('extracting', 75, 'Extracting files...');
    await this.extractZipSafely(zipPath, workspacePath);

    // Phase 4: Load and update metadata
    emitProgress('updating', 90, 'Updating metadata...');
    let importedMetadata;
    try {
      importedMetadata = this.workspaceManager.loadMetadata(sessionId);
    } catch (error) {
      // If metadata failed to load after extraction, something went wrong
      throw new Error('Failed to load metadata from extracted workspace');
    }

    // Update session ID in metadata
    const updatedMetadata = this.workspaceManager.updateMetadataSessionId(sessionId, importedMetadata);

    // Regenerate thumbnails for TIFF files (async, don't block response)
    if (fileService) {
      const tiffFiles = this.workspaceManager.getTiffFiles(sessionId);
      if (tiffFiles.length > 0 && this.logger) {
        this.logger.info(`Regenerating thumbnails for ${tiffFiles.length} TIFF files`);
      }

      // Regenerate thumbnails asynchronously
      for (const file of tiffFiles) {
        const filePath = path.join(workspacePath, file.path);
        if (fs.existsSync(filePath)) {
          fileService.generateThumbnailAsync(sessionId, filePath, file.id);
        }
      }
    }

    // Log activity
    if (this.activityLogger && username) {
      this.activityLogger.logActivity(username, 'workspace_restored', {
        sessionId,
        fileCount: updatedMetadata.files?.length || 0,
        originalSessionId: updatedMetadata.originalSessionId
      });
    }

    if (this.logger) {
      this.logger.info(`Workspace restored for session: ${sessionId} (${updatedMetadata.files?.length || 0} files)`);
    }

    // Phase 5: Complete
    emitProgress('complete', 100, 'Workspace restored successfully');

    return {
      success: true,
      fileCount: updatedMetadata.files?.length || 0,
      folderCount: updatedMetadata.folders?.length || 0,
      originalSessionId: updatedMetadata.originalSessionId
    };
  }

  /**
   * Stream-extract a zip file into a target directory, skipping any entry
   * whose path is absolute or contains '..' components (zip-slip guard).
   * @param {string} zipPath - Path to the zip file
   * @param {string} targetDir - Directory to extract into
   * @returns {Promise<void>}
   */
  extractZipSafely(zipPath, targetDir) {
    const targetRoot = path.resolve(targetDir);
    return new Promise((resolve, reject) => {
      const pendingWrites = [];

      fs.createReadStream(zipPath)
        .pipe(unzipper.Parse())
        .on('entry', (entry) => {
          const entryPath = String(entry.path).replace(/\\/g, '/');
          const segments = entryPath.split('/');

          const unsafe = path.isAbsolute(entryPath)
            || /^[a-zA-Z]:/.test(entryPath)
            || segments.some(seg => seg === '..');
          const destination = unsafe ? null : path.resolve(targetRoot, entryPath);
          if (!destination
              || !(destination === targetRoot || destination.startsWith(targetRoot + path.sep))) {
            if (this.logger) {
              this.logger.warn(`[Restore] Skipping unsafe zip entry: ${entry.path}`);
            }
            entry.autodrain();
            return;
          }

          if (entry.type === 'Directory') {
            fs.mkdirSync(destination, { recursive: true });
            entry.autodrain();
            return;
          }

          fs.mkdirSync(path.dirname(destination), { recursive: true });
          const writeStream = fs.createWriteStream(destination);
          pendingWrites.push(new Promise((done, fail) => {
            writeStream.on('finish', done);
            writeStream.on('error', fail);
          }));
          entry.pipe(writeStream);
        })
        .on('close', () => Promise.all(pendingWrites).then(() => resolve(), reject))
        .on('error', reject);
    });
  }

  /**
   * Validate that a zip file contains a valid workspace structure
   * @param {string} zipPath - Path to the zip file
   * @returns {Promise<boolean>} True if valid workspace zip
   */
  async validateWorkspaceZip(zipPath) {
    return new Promise((resolve, reject) => {
      let hasMetadata = false;

      fs.createReadStream(zipPath)
        .pipe(unzipper.Parse())
        .on('entry', (entry) => {
          if (entry.path === 'metadata.json') {
            hasMetadata = true;
          }
          entry.autodrain();
        })
        .on('close', () => resolve(hasMetadata))
        .on('error', reject);
    });
  }

  /**
   * Get TIFF files in workspace (for thumbnail regeneration)
   * @param {string} sessionId - Session ID
   * @returns {Array} Array of TIFF file objects
   */
  getTiffFiles(sessionId) {
    return this.workspaceManager.getTiffFiles(sessionId);
  }
}

module.exports = WorkspaceService;
