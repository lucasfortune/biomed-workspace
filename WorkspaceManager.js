const fs = require('fs');
const path = require('path');

/**
 * WorkspaceManager - Handles workspace initialization and file management
 */
class WorkspaceManager {
  constructor() {
    this.workspacesBaseDir = 'workspaces';
    this.ensureWorkspacesDirectory();
  }

  /**
   * Ensure the base workspaces directory exists
   */
  ensureWorkspacesDirectory() {
    if (!fs.existsSync(this.workspacesBaseDir)) {
      fs.mkdirSync(this.workspacesBaseDir, { recursive: true });
    }
  }

  /**
   * Generate unique ID with prefix
   * @param {string} prefix - Prefix for the ID (e.g., 'file', 'folder')
   * @returns {string} Unique ID in format: prefix_timestamp_random
   */
  generateId(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get workspace path for a session
   */
  getWorkspacePath(sessionId) {
    return path.join(this.workspacesBaseDir, sessionId);
  }

  /**
   * Initialize workspace for a new session
   */
  initializeWorkspace(sessionId) {
    const workspacePath = this.getWorkspacePath(sessionId);

    // Check if workspace already exists
    if (fs.existsSync(workspacePath)) {
      console.log(`Workspace already exists for session: ${sessionId}`);
      return this.getWorkspaceInfo(sessionId);
    }

    // Create workspace directory structure
    const directories = [
      'uploads/raw',
      'uploads/annotations',
      'uploads/imported_models',
      'results/denoised',
      'results/segmented',
      'results/meshes',
      'results/visualizations',
      'models/segmentation',
      'models/denoising',
      'models/configs'
    ];

    directories.forEach(dir => {
      const dirPath = path.join(workspacePath, dir);
      fs.mkdirSync(dirPath, { recursive: true });
    });

    // Create metadata file
    const metadata = {
      sessionId: sessionId,
      createdAt: new Date().toISOString(),
      lastAccessed: new Date().toISOString(),
      version: '1.1.0',
      files: [],
      folders: [],
      modules: {
        segmentation: { runs: [] },
        denoising: { runs: [] },
        annotation: { runs: [] },
        mesh: { runs: [] }
      }
    };

    this.saveMetadata(sessionId, metadata);

    console.log(`Workspace initialized for session: ${sessionId}`);
    return this.getWorkspaceInfo(sessionId);
  }

  /**
   * Get workspace information and file tree
   */
  getWorkspaceInfo(sessionId) {
    const workspacePath = this.getWorkspacePath(sessionId);

    if (!fs.existsSync(workspacePath)) {
      throw new Error(`Workspace not found for session: ${sessionId}`);
    }

    const metadata = this.loadMetadata(sessionId);
    const fileTree = this.buildFileTree(workspacePath);

    // Update last accessed time
    metadata.lastAccessed = new Date().toISOString();
    this.saveMetadata(sessionId, metadata);

    return {
      sessionId,
      path: workspacePath,
      metadata,
      fileTree
    };
  }

  /**
   * Build file tree structure for workspace
   */
  buildFileTree(workspacePath) {
    const buildTree = (dirPath, relativePath = '') => {
      const items = [];

      try {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });

        for (const entry of entries) {
          // Skip metadata.json from tree
          if (entry.name === 'metadata.json') continue;

          const fullPath = path.join(dirPath, entry.name);
          const relPath = path.join(relativePath, entry.name);

          if (entry.isDirectory()) {
            items.push({
              name: entry.name,
              type: 'directory',
              path: relPath,
              children: buildTree(fullPath, relPath)
            });
          } else {
            const stats = fs.statSync(fullPath);
            items.push({
              name: entry.name,
              type: 'file',
              path: relPath,
              size: stats.size,
              modified: stats.mtime.toISOString(),
              extension: path.extname(entry.name).toLowerCase()
            });
          }
        }
      } catch (error) {
        console.error(`Error reading directory ${dirPath}:`, error);
      }

      return items;
    };

    return buildTree(workspacePath);
  }

  /**
   * Load workspace metadata
   */
  loadMetadata(sessionId) {
    const metadataPath = path.join(this.getWorkspacePath(sessionId), 'metadata.json');

    if (!fs.existsSync(metadataPath)) {
      // Return default metadata if file doesn't exist
      return {
        sessionId,
        createdAt: new Date().toISOString(),
        lastAccessed: new Date().toISOString(),
        version: '1.0.0',
        files: [],
        modules: {}
      };
    }

    try {
      const data = fs.readFileSync(metadataPath, 'utf8');
      const metadata = JSON.parse(data);

      // Backward compatibility: Add folders array if missing (v1.0.0 -> v1.1.0)
      if (!metadata.folders) {
        metadata.folders = [];
        metadata.version = '1.1.0';
        // Note: Auto-save happens on next operation
      }

      return metadata;
    } catch (error) {
      console.error(`Error loading metadata for session ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Save workspace metadata
   */
  saveMetadata(sessionId, metadata) {
    const metadataPath = path.join(this.getWorkspacePath(sessionId), 'metadata.json');

    try {
      fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
    } catch (error) {
      console.error(`Error saving metadata for session ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Add file to workspace metadata
   * @param {string} sessionId - Session ID
   * @param {object} fileInfo - File information
   * @returns {object} Created file entry
   */
  addFileToMetadata(sessionId, fileInfo) {
    const metadata = this.loadMetadata(sessionId);

    // Check if file with same path already exists (prevent duplicates)
    const existingFile = metadata.files.find(f => f.path === fileInfo.path);
    if (existingFile) {
      console.log('[WorkspaceManager] File already tracked:', fileInfo.path);
      return existingFile;
    }

    const fileEntry = {
      id: fileInfo.id || this.generateId('file'),
      name: fileInfo.name,
      path: fileInfo.path,
      category: fileInfo.category,
      size: fileInfo.size,
      uploadedAt: new Date().toISOString(),
      folderId: fileInfo.folderId || null,
      thumbnailPath: null
    };

    metadata.files.push(fileEntry);
    this.saveMetadata(sessionId, metadata);

    console.log('[WorkspaceManager] File tracked:', fileEntry.id, fileEntry.path);
    return fileEntry;
  }

  /**
   * Create a new folder
   * @param {string} sessionId - Session ID
   * @param {string} folderName - Name of the folder
   * @param {string|null} parentId - Parent folder ID (null for root)
   * @param {string} color - Folder color
   * @returns {object} Created folder object
   */
  async createFolder(sessionId, folderName, parentId = null, color = '#4A90E2') {
    const metadata = this.loadMetadata(sessionId);

    // Validate parent exists if specified
    if (parentId && !metadata.folders.find(f => f.id === parentId)) {
      throw new Error('Parent folder not found');
    }

    const folder = {
      id: this.generateId('folder'),
      name: folderName,
      parentId: parentId,
      createdAt: new Date().toISOString(),
      color: color
    };

    metadata.folders.push(folder);
    this.saveMetadata(sessionId, metadata);

    return folder;
  }

  /**
   * Rename a folder
   * @param {string} sessionId - Session ID
   * @param {string} folderId - Folder ID to rename
   * @param {string} newName - New folder name
   * @returns {object} Updated folder object
   */
  async renameFolder(sessionId, folderId, newName) {
    const metadata = this.loadMetadata(sessionId);
    const folder = metadata.folders.find(f => f.id === folderId);

    if (!folder) {
      throw new Error('Folder not found');
    }

    folder.name = newName;
    this.saveMetadata(sessionId, metadata);

    return folder;
  }

  /**
   * Delete a folder (moves files to root)
   * @param {string} sessionId - Session ID
   * @param {string} folderId - Folder ID to delete
   * @returns {object} Success message
   */
  async deleteFolder(sessionId, folderId) {
    const metadata = this.loadMetadata(sessionId);

    // Remove folder from array
    metadata.folders = metadata.folders.filter(f => f.id !== folderId);

    // Move all files in folder to root (folderId = null)
    metadata.files.forEach(file => {
      if (file.folderId === folderId) {
        file.folderId = null;
      }
    });

    // Move all child folders to root
    metadata.folders.forEach(folder => {
      if (folder.parentId === folderId) {
        folder.parentId = null;
      }
    });

    this.saveMetadata(sessionId, metadata);

    return { success: true, message: 'Folder deleted, contents moved to root' };
  }

  /**
   * Get all folders
   * @param {string} sessionId - Session ID
   * @returns {array} Array of folder objects
   */
  async getFolders(sessionId) {
    const metadata = this.loadMetadata(sessionId);
    return metadata.folders || [];
  }

  /**
   * Get file by ID
   * @param {string} sessionId - Session ID
   * @param {string} fileId - File ID
   * @returns {object} File object
   */
  async getFile(sessionId, fileId) {
    const metadata = this.loadMetadata(sessionId);
    const file = metadata.files.find(f => f.id === fileId);

    if (!file) {
      throw new Error('File not found');
    }

    return file;
  }

  /**
   * Rename a file
   * @param {string} sessionId - Session ID
   * @param {string} fileId - File ID
   * @param {string} newName - New file name
   * @returns {object} Updated file object
   */
  async renameFile(sessionId, fileId, newName) {
    const metadata = this.loadMetadata(sessionId);
    const file = metadata.files.find(f => f.id === fileId);

    if (!file) {
      throw new Error('File not found');
    }

    // Validate extension matches
    const oldExt = path.extname(file.name);
    const newExt = path.extname(newName);

    if (oldExt !== newExt) {
      throw new Error('Cannot change file extension');
    }

    // Get the actual filename from the path (not from file.name which may be outdated)
    const workspaceDir = path.join('workspaces', sessionId);
    const oldFullPath = path.join(workspaceDir, file.path);

    // Build new path: get directory from old path, append new filename
    const pathParts = file.path.split('/');
    const oldFilename = pathParts[pathParts.length - 1]; // Original filename from path
    pathParts[pathParts.length - 1] = newName; // Replace with new filename
    const newPath = pathParts.join('/');
    const newFullPath = path.join(workspaceDir, newPath);

    // Check if old file exists
    if (fs.existsSync(oldFullPath)) {
      // Rename the physical file
      console.log(`[WorkspaceManager] Renaming file: ${oldFullPath} -> ${newFullPath}`);
      fs.renameSync(oldFullPath, newFullPath);
    } else {
      console.warn(`[WorkspaceManager] File not found for rename: ${oldFullPath}`);
      // File doesn't exist at old path, but continue to update metadata
    }

    // Update metadata
    file.name = newName;
    file.path = newPath;
    this.saveMetadata(sessionId, metadata);

    console.log(`[WorkspaceManager] File metadata updated: name=${newName}, path=${newPath}`);

    return file;
  }

  /**
   * Move file to folder
   * @param {string} sessionId - Session ID
   * @param {string} fileId - File ID
   * @param {string|null} targetFolderId - Target folder ID (null for root)
   * @returns {object} Updated file object
   */
  async moveFile(sessionId, fileId, targetFolderId) {
    const metadata = this.loadMetadata(sessionId);
    const file = metadata.files.find(f => f.id === fileId);

    if (!file) {
      throw new Error('File not found');
    }

    // Validate folder exists if specified
    if (targetFolderId && !metadata.folders.find(f => f.id === targetFolderId)) {
      throw new Error('Target folder not found');
    }

    file.folderId = targetFolderId;
    this.saveMetadata(sessionId, metadata);

    return file;
  }

  /**
   * Delete a file
   * @param {string} sessionId - Session ID
   * @param {string} fileId - File ID
   * @returns {object} Success message
   */
  async deleteFile(sessionId, fileId) {
    const metadata = this.loadMetadata(sessionId);
    const file = metadata.files.find(f => f.id === fileId);

    if (!file) {
      throw new Error('File not found');
    }

    // Delete physical file
    const filePath = path.join(this.getWorkspacePath(sessionId), file.path);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Delete thumbnail if exists
    if (file.thumbnailPath) {
      const thumbPath = path.join(this.getWorkspacePath(sessionId), file.thumbnailPath);
      if (fs.existsSync(thumbPath)) {
        fs.unlinkSync(thumbPath);
      }
    }

    // Remove from metadata
    metadata.files = metadata.files.filter(f => f.id !== fileId);
    this.saveMetadata(sessionId, metadata);

    return { success: true, message: 'File deleted' };
  }

  /**
   * Delete multiple files (batch)
   * @param {string} sessionId - Session ID
   * @param {array} fileIds - Array of file IDs
   * @returns {object} Result with deleted count
   */
  async deleteFiles(sessionId, fileIds) {
    let deletedCount = 0;

    for (const fileId of fileIds) {
      try {
        await this.deleteFile(sessionId, fileId);
        deletedCount++;
      } catch (error) {
        console.error(`Failed to delete file ${fileId}:`, error);
      }
    }

    return { success: true, deletedCount };
  }

  /**
   * Move multiple files to folder (batch)
   * @param {string} sessionId - Session ID
   * @param {array} fileIds - Array of file IDs
   * @param {string|null} targetFolderId - Target folder ID (null for root)
   * @returns {object} Result with moved count
   */
  async moveFilesToFolder(sessionId, fileIds, targetFolderId) {
    const metadata = this.loadMetadata(sessionId);

    // Validate folder exists
    if (targetFolderId && !metadata.folders.find(f => f.id === targetFolderId)) {
      throw new Error('Target folder not found');
    }

    let movedCount = 0;

    metadata.files.forEach(file => {
      if (fileIds.includes(file.id)) {
        file.folderId = targetFolderId;
        movedCount++;
      }
    });

    this.saveMetadata(sessionId, metadata);

    return { success: true, movedCount };
  }

  /**
   * Search files by name
   * @param {string} sessionId - Session ID
   * @param {string} query - Search query
   * @returns {array} Array of matching files
   */
  async searchFiles(sessionId, query) {
    const metadata = this.loadMetadata(sessionId);

    if (!query || query.trim() === '') {
      return metadata.files;
    }

    const lowerQuery = query.toLowerCase();

    return metadata.files.filter(file =>
      file.name.toLowerCase().includes(lowerQuery)
    );
  }

  /**
   * Get files by category
   * @param {string} sessionId - Session ID
   * @param {string} category - File category
   * @returns {array} Array of files in category
   */
  async getFilesByCategory(sessionId, category) {
    const metadata = this.loadMetadata(sessionId);

    return metadata.files.filter(file => file.category === category);
  }

  /**
   * Set thumbnail path for a file
   * @param {string} sessionId - Session ID
   * @param {string} fileId - File ID
   * @param {string} thumbnailPath - Relative path to thumbnail
   * @returns {object} Updated file object
   */
  async setThumbnailPath(sessionId, fileId, thumbnailPath) {
    const metadata = this.loadMetadata(sessionId);
    const file = metadata.files.find(f => f.id === fileId);

    if (!file) {
      throw new Error('File not found');
    }

    file.thumbnailPath = thumbnailPath;
    this.saveMetadata(sessionId, metadata);

    return file;
  }

  /**
   * Get thumbnail path for a file
   * @param {string} sessionId - Session ID
   * @param {string} fileId - File ID
   * @returns {string|null} Thumbnail path or null
   */
  async getThumbnailPath(sessionId, fileId) {
    const metadata = this.loadMetadata(sessionId);
    const file = metadata.files.find(f => f.id === fileId);

    if (!file) {
      throw new Error('File not found');
    }

    return file.thumbnailPath;
  }

  /**
   * Get file tree with folder structure
   * @param {string} sessionId - Session ID
   * @returns {object} Hierarchical tree structure
   */
  async getFileTree(sessionId) {
    const metadata = this.loadMetadata(sessionId);

    // Build tree structure
    const tree = {
      id: 'root',
      name: 'Root',
      type: 'folder',
      children: []
    };

    // Create folder map
    const folderMap = new Map();
    folderMap.set(null, tree); // root

    // Add folders
    metadata.folders.forEach(folder => {
      folderMap.set(folder.id, {
        ...folder,
        type: 'folder',
        children: []
      });
    });

    // Build folder hierarchy
    metadata.folders.forEach(folder => {
      const folderNode = folderMap.get(folder.id);
      const parent = folderMap.get(folder.parentId);

      if (parent) {
        parent.children.push(folderNode);
      }
    });

    // Add files to appropriate folders
    metadata.files.forEach(file => {
      const parent = folderMap.get(file.folderId);

      if (parent) {
        parent.children.push({
          ...file,
          type: 'file'
        });
      }
    });

    return tree;
  }

  /**
   * Get workspace statistics
   */
  getWorkspaceStats(sessionId) {
    const workspacePath = this.getWorkspacePath(sessionId);

    if (!fs.existsSync(workspacePath)) {
      return null;
    }

    const metadata = this.loadMetadata(sessionId);

    // Calculate total size
    const getTotalSize = (dirPath) => {
      let totalSize = 0;

      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          totalSize += getTotalSize(fullPath);
        } else {
          const stats = fs.statSync(fullPath);
          totalSize += stats.size;
        }
      }

      return totalSize;
    };

    const totalSize = getTotalSize(workspacePath);

    return {
      sessionId,
      totalSize,
      totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2),
      fileCount: metadata.files.length,
      createdAt: metadata.createdAt,
      lastAccessed: metadata.lastAccessed
    };
  }

  /**
   * Clean up old/inactive workspaces
   * @param {number} maxAgeDays - Maximum age in days before cleanup
   */
  cleanupOldWorkspaces(maxAgeDays = 30) {
    const now = new Date();
    const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
    const cleanedWorkspaces = [];

    try {
      const sessions = fs.readdirSync(this.workspacesBaseDir);

      for (const sessionId of sessions) {
        const workspacePath = this.getWorkspacePath(sessionId);

        if (!fs.statSync(workspacePath).isDirectory()) continue;

        try {
          const metadata = this.loadMetadata(sessionId);
          const lastAccessed = new Date(metadata.lastAccessed);
          const ageMs = now - lastAccessed;

          if (ageMs > maxAgeMs) {
            // Delete workspace
            fs.rmSync(workspacePath, { recursive: true, force: true });
            cleanedWorkspaces.push({
              sessionId,
              lastAccessed: metadata.lastAccessed,
              ageDays: (ageMs / (24 * 60 * 60 * 1000)).toFixed(1)
            });
            console.log(`Cleaned up workspace for session ${sessionId} (${cleanedWorkspaces[cleanedWorkspaces.length - 1].ageDays} days old)`);
          }
        } catch (error) {
          console.error(`Error checking workspace ${sessionId}:`, error);
        }
      }
    } catch (error) {
      console.error('Error during workspace cleanup:', error);
    }

    return cleanedWorkspaces;
  }

  /**
   * Delete a specific workspace
   */
  deleteWorkspace(sessionId) {
    const workspacePath = this.getWorkspacePath(sessionId);

    if (!fs.existsSync(workspacePath)) {
      return false;
    }

    try {
      fs.rmSync(workspacePath, { recursive: true, force: true });
      console.log(`Deleted workspace for session: ${sessionId}`);
      return true;
    } catch (error) {
      console.error(`Error deleting workspace for session ${sessionId}:`, error);
      throw error;
    }
  }
}

module.exports = WorkspaceManager;
