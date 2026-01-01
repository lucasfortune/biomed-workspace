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
   * Move a file to a folder
   * @param {string} sessionId - Session ID
   * @param {string} fileId - File ID
   * @param {string|null} targetFolderId - Target folder ID (null for root)
   * @returns {Promise<object>} Updated file object
   */
  async moveFile(sessionId, fileId, targetFolderId) {
    return this.workspaceManager.moveFile(sessionId, fileId, targetFolderId);
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
  // FOLDER OPERATIONS
  // ===========================================================================

  /**
   * Get all folders
   * @param {string} sessionId - Session ID
   * @returns {Promise<Array>} Folders array
   */
  async getFolders(sessionId) {
    return this.workspaceManager.getFolders(sessionId);
  }

  /**
   * Create a folder
   * @param {string} sessionId - Session ID
   * @param {string} name - Folder name
   * @param {string|null} parentId - Parent folder ID
   * @returns {Promise<object>} Created folder
   */
  async createFolder(sessionId, name, parentId = null) {
    return this.workspaceManager.createFolder(sessionId, name, parentId);
  }

  /**
   * Rename a folder
   * @param {string} sessionId - Session ID
   * @param {string} folderId - Folder ID
   * @param {string} newName - New folder name
   * @returns {Promise<object>} Updated folder
   */
  async renameFolder(sessionId, folderId, newName) {
    return this.workspaceManager.renameFolder(sessionId, folderId, newName);
  }

  /**
   * Delete a folder
   * @param {string} sessionId - Session ID
   * @param {string} folderId - Folder ID
   * @returns {Promise<object>} Result
   */
  async deleteFolder(sessionId, folderId) {
    return this.workspaceManager.deleteFolder(sessionId, folderId);
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
    const excludeDirs = ['.thumbnails', '.slices', '.mesh-previews'];

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
   * Restore workspace from a zip buffer
   * Clears existing workspace and extracts zip contents
   * Updates session ID in metadata
   * @param {string} sessionId - Session ID
   * @param {Buffer} zipBuffer - Zip file buffer
   * @param {object} fileService - FileService instance for thumbnail regeneration
   * @param {string} username - Username for logging
   * @returns {Promise<object>} Result with file count and status
   */
  async restoreWorkspace(sessionId, zipBuffer, fileService = null, username = null) {
    const workspacePath = this.workspaceManager.getWorkspacePath(sessionId);

    // Ensure workspace exists
    if (!fs.existsSync(workspacePath)) {
      this.workspaceManager.initializeWorkspace(sessionId);
    }

    // First, validate that the zip contains metadata.json
    const hasMetadata = await this.validateWorkspaceZip(zipBuffer);
    if (!hasMetadata) {
      throw new Error('Invalid workspace zip: missing metadata.json');
    }

    // Clear existing workspace
    const clearResult = this.workspaceManager.clearWorkspace(sessionId);
    if (this.logger) {
      this.logger.info(`Cleared ${clearResult.clearedFileCount} files before restore`);
    }

    // Extract zip to workspace
    await new Promise((resolve, reject) => {
      const stream = require('stream');
      const bufferStream = new stream.PassThrough();
      bufferStream.end(zipBuffer);

      bufferStream
        .pipe(unzipper.Extract({ path: workspacePath }))
        .on('close', resolve)
        .on('error', reject);
    });

    // Load the imported metadata and update session ID
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

    return {
      success: true,
      fileCount: updatedMetadata.files?.length || 0,
      folderCount: updatedMetadata.folders?.length || 0,
      originalSessionId: updatedMetadata.originalSessionId
    };
  }

  /**
   * Validate that a zip buffer contains a valid workspace structure
   * @param {Buffer} zipBuffer - Zip file buffer
   * @returns {Promise<boolean>} True if valid workspace zip
   */
  async validateWorkspaceZip(zipBuffer) {
    return new Promise((resolve, reject) => {
      const stream = require('stream');
      const bufferStream = new stream.PassThrough();
      bufferStream.end(zipBuffer);

      let hasMetadata = false;

      bufferStream
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
