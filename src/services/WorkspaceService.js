/**
 * WorkspaceService
 *
 * High-level wrapper around WorkspaceManager for workspace operations.
 * Provides orchestration and integration with other services.
 */

const path = require('path');
const fs = require('fs');

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
    let workspaceInfo = this.workspaceManager.getWorkspaceInfo(sessionId);
    let metadata = this.workspaceManager.loadMetadata(sessionId);

    // Initialize if not exists
    if (!workspaceInfo) {
      workspaceInfo = this.workspaceManager.initializeWorkspace(sessionId);
      metadata = this.workspaceManager.loadMetadata(sessionId);
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
}

module.exports = WorkspaceService;
