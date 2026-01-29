const fs = require('fs');
const crypto = require('crypto');
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
   * Generate unique ID with prefix using cryptographically secure random bytes
   * @param {string} prefix - Prefix for the ID (e.g., 'file', 'folder')
   * @returns {string} Unique ID in format: prefix_timestamp_random
   */
  generateId(prefix) {
    return `${prefix}_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
  }

  /**
   * Normalize category to new three-category system
   * Maps legacy categories to: uploads, models, results
   * @param {string} category - Original category
   * @returns {string} Normalized category
   */
  normalizeCategory(category) {
    // Legacy category mappings
    const categoryMap = {
      // Legacy upload categories -> uploads
      'raw': 'uploads',
      'raw_images': 'uploads',
      'inference_data': 'uploads',
      'annotations': 'uploads',
      'unfinished_annotations': 'results',
      'unfinished_annotations_sidecar': 'results',
      // Legacy result categories -> results
      'segmentations': 'results',
      'segmented_stack': 'results',
      'denoised_images': 'results',
      'meshes': 'results',
      // These are already correct
      'uploads': 'uploads',
      'models': 'models',
      'results': 'results'
    };

    return categoryMap[category] || category;
  }

  /**
   * Normalize tags based on category and ensure proper structure
   * Each category has specific allowed tags:
   * - uploads: raw, annotation (+ optional test-data)
   * - models: [method: denoising/segmentation/unspecified] + [type: weights/config/info]
   * - results: [method: denoising/annotation/segmentation/mesh] + [type: data/info/wip]
   *
   * @param {string} category - Normalized category (uploads, models, results)
   * @param {string[]} tags - Existing tags array
   * @param {object} options - Additional context for tag inference
   * @param {string} options.legacyCategory - Original category before normalization
   * @param {string} options.fileName - File name for extension-based inference
   * @returns {string[]} Normalized tags array
   */
  normalizeTags(category, tags = [], options = {}) {
    const { legacyCategory, fileName } = options;
    const normalizedTags = [...tags];

    // Helper to check if tag exists
    const hasTag = (tag) => normalizedTags.includes(tag);
    const addTag = (tag) => { if (!hasTag(tag)) normalizedTags.push(tag); };

    switch (category) {
      case 'uploads':
        // Infer raw/annotation from legacy category if not already tagged
        if (!hasTag('raw') && !hasTag('annotation')) {
          if (legacyCategory === 'annotations') {
            addTag('annotation');
          } else {
            // Default to raw for legacy raw_images, inference_data, raw
            addTag('raw');
          }
        }
        // Convert legacy 'training'/'inference' tags to just 'raw' (they're all raw images)
        // Keep test-data tag if present
        break;

      case 'models':
        // Ensure method tag exists (denoising, segmentation, or unspecified)
        if (!hasTag('denoising') && !hasTag('segmentation') && !hasTag('unspecified')) {
          // Try to infer from existing tags or default to unspecified
          addTag('unspecified');
        }
        // Ensure type tag exists (weights, config, info)
        if (!hasTag('weights') && !hasTag('config') && !hasTag('info')) {
          // Infer from filename
          if (fileName) {
            const ext = path.extname(fileName).toLowerCase();
            if (ext === '.pth' || ext === '.pt') {
              addTag('weights');
            } else if (ext === '.json' && fileName.includes('config')) {
              addTag('config');
            } else if (ext === '.json') {
              addTag('info');
            }
          }
        }
        break;

      case 'results':
        // Infer method tag from legacy category if not already tagged
        if (!hasTag('denoising') && !hasTag('annotation') && !hasTag('segmentation') && !hasTag('mesh')) {
          if (legacyCategory === 'denoised_images') {
            addTag('denoising');
          } else if (legacyCategory === 'segmentations' || legacyCategory === 'segmented_stack') {
            addTag('segmentation');
          } else if (legacyCategory === 'meshes') {
            addTag('mesh');
          } else if (legacyCategory === 'unfinished_annotations' || legacyCategory === 'unfinished_annotations_sidecar') {
            addTag('annotation');
          }
        }
        // Infer type tag if not present
        if (!hasTag('data') && !hasTag('info') && !hasTag('wip')) {
          if (legacyCategory === 'unfinished_annotations') {
            addTag('wip');
          } else if (legacyCategory === 'unfinished_annotations_sidecar') {
            addTag('info');
          } else if (fileName) {
            // Infer from filename
            if (fileName.includes('metadata') || fileName.includes('_info') || fileName.endsWith('_meta.json')) {
              addTag('info');
            } else {
              addTag('data');
            }
          } else {
            addTag('data');
          }
        }
        break;
    }

    return normalizedTags;
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

    // Create workspace directory structure (minimal - subdirs created on-demand)
    const directories = [
      'uploads',
      'results',
      'models'
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
      folders: []
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
        version: '1.1.0',
        files: [],
        folders: []
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
      thumbnailPath: null,
      // Tags for additional classification (e.g., ['inference'] for inference data)
      tags: fileInfo.tags || [],
      // Lineage - only added for processed files (not original uploads)
      ...(fileInfo.lineage && { lineage: fileInfo.lineage })
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

    const workspacePath = this.getWorkspacePath(sessionId);

    // Delete physical file
    const filePath = path.join(workspacePath, file.path);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Delete thumbnail if exists
    if (file.thumbnailPath) {
      const thumbPath = path.join(workspacePath, file.thumbnailPath);
      if (fs.existsSync(thumbPath)) {
        fs.unlinkSync(thumbPath);
      }
    }

    // Clean up slice cache files (in main .slices directory)
    this.cleanupSliceCache(workspacePath, fileId, filePath);

    // Clean up slice cache in the file's directory (for result files)
    const fileDir = path.dirname(filePath);
    const localSlicesDir = path.join(fileDir, '.slices');
    if (fs.existsSync(localSlicesDir)) {
      this.cleanupDirectorySliceCache(localSlicesDir, fileId);
    }

    // Clean up mesh preview cache files
    this.cleanupMeshPreviewCache(workspacePath, filePath);

    // Clean up empty .thumbnails directory
    const thumbnailsDir = path.join(workspacePath, '.thumbnails');
    if (fs.existsSync(thumbnailsDir)) {
      try {
        const remaining = fs.readdirSync(thumbnailsDir);
        if (remaining.length === 0) {
          fs.rmdirSync(thumbnailsDir);
        }
      } catch (error) {
        // Silently ignore cleanup errors
      }
    }

    // Clean up empty parent directories (for result files in nested structures)
    this.cleanupEmptyDirectories(fileDir, workspacePath);

    // Remove from metadata
    metadata.files = metadata.files.filter(f => f.id !== fileId);
    this.saveMetadata(sessionId, metadata);

    return { success: true, message: 'File deleted' };
  }

  /**
   * Clean up slice cache files for a given file
   * Handles all cache naming conventions:
   *   - Standard slices: {fileId}_{slice}_{size}.jpg
   *   - Annotation slices: {fileHash}_{slice}_raw.png (fileHash = base64 of filePath)
   *   - DL denoising slices: dl_{pathHash}_{slice}_{size}.jpg (pathHash = md5 of normalized path)
   * @param {string} workspacePath - Workspace path
   * @param {string} fileId - File ID
   * @param {string} filePath - Full file path (for computing path-based hashes)
   */
  cleanupSliceCache(workspacePath, fileId, filePath) {
    const slicesDir = path.join(workspacePath, '.slices');
    if (!fs.existsSync(slicesDir)) {
      return;
    }

    try {
      const files = fs.readdirSync(slicesDir);

      // Build all possible prefixes for this file's cache entries
      const prefixes = [`${fileId}_`];

      if (filePath) {
        // Annotation slice cache prefix (base64 of filePath)
        const fileHash = Buffer.from(filePath).toString('base64').replace(/[/+=]/g, '_').substring(0, 32);
        prefixes.push(`${fileHash}_`);

        // DL denoising slice cache prefix (md5 of normalized path)
        // Normalize: use the relative path within workspace (e.g., "uploads/raw/file.tif")
        const relativePath = path.relative(workspacePath, filePath);
        const normalizedPath = relativePath.replace(/\\/g, '/');
        const pathHash = crypto.createHash('md5').update(normalizedPath).digest('hex').substring(0, 8);
        prefixes.push(`dl_${pathHash}_`);
      }

      for (const file of files) {
        if (prefixes.some(prefix => file.startsWith(prefix))) {
          fs.unlinkSync(path.join(slicesDir, file));
        }
      }

      // Remove .slices directory if empty
      const remaining = fs.readdirSync(slicesDir);
      if (remaining.length === 0) {
        fs.rmdirSync(slicesDir);
      }
    } catch (error) {
      // Silently ignore cleanup errors
    }
  }

  /**
   * Clean up slice cache in a specific directory
   * For result directories, we delete all files since the directory is result-specific
   * @param {string} slicesDir - Slices directory path
   * @param {string} fileId - File ID (used for prefix matching in shared directories)
   * @param {boolean} deleteAll - If true, delete all files in directory (for result dirs)
   */
  cleanupDirectorySliceCache(slicesDir, fileId, deleteAll = true) {
    try {
      const files = fs.readdirSync(slicesDir);

      if (deleteAll) {
        // Delete all cache files in this directory (for result-specific .slices folders)
        for (const file of files) {
          fs.unlinkSync(path.join(slicesDir, file));
        }
      } else {
        // Only delete files matching the fileId prefix
        const prefix = `${fileId}_`;
        for (const file of files) {
          if (file.startsWith(prefix)) {
            fs.unlinkSync(path.join(slicesDir, file));
          }
        }
      }

      // If directory is now empty, remove it
      const remaining = fs.readdirSync(slicesDir);
      if (remaining.length === 0) {
        fs.rmdirSync(slicesDir);
      }
    } catch (error) {
      // Silently ignore cleanup errors
    }
  }

  /**
   * Clean up mesh preview cache files for a given file path
   * @param {string} workspacePath - Workspace path
   * @param {string} filePath - Full file path
   */
  cleanupMeshPreviewCache(workspacePath, filePath) {
    const meshPreviewsDir = path.join(workspacePath, '.mesh-previews');
    if (!fs.existsSync(meshPreviewsDir)) {
      return;
    }

    try {
      // Generate the same hash used when creating previews
      const fileHash = Buffer.from(filePath).toString('base64').replace(/[/+=]/g, '_').substring(0, 32);
      const files = fs.readdirSync(meshPreviewsDir);
      const prefix = `${fileHash}_`;
      for (const file of files) {
        if (file.startsWith(prefix)) {
          fs.unlinkSync(path.join(meshPreviewsDir, file));
        }
      }
      // If directory is now empty, remove it
      const remaining = fs.readdirSync(meshPreviewsDir);
      if (remaining.length === 0) {
        fs.rmdirSync(meshPreviewsDir);
      }
    } catch (error) {
      // Silently ignore cleanup errors
    }
  }

  /**
   * Clean up empty directories recursively up to the workspace root
   * @param {string} dirPath - Directory to check
   * @param {string} stopAt - Stop cleaning when reaching this directory
   */
  cleanupEmptyDirectories(dirPath, stopAt) {
    try {
      // Don't go above the workspace root
      if (dirPath === stopAt || !dirPath.startsWith(stopAt)) {
        return;
      }

      // Check if directory exists and is empty
      if (!fs.existsSync(dirPath)) return;

      const contents = fs.readdirSync(dirPath);

      // If empty, remove it and check parent
      if (contents.length === 0) {
        fs.rmdirSync(dirPath);
        // Recursively check parent directory
        const parentDir = path.dirname(dirPath);
        this.cleanupEmptyDirectories(parentDir, stopAt);
      }
    } catch (error) {
      // Ignore errors (directory might be in use or have permission issues)
    }
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
   * Clear all workspace files for restore operation
   * Deletes all files and directories except cache dirs (.thumbnails, .slices, .mesh-previews)
   * Resets metadata to empty state
   * @param {string} sessionId - Session ID
   * @returns {object} Result with cleared file count
   */
  clearWorkspace(sessionId) {
    const workspacePath = this.getWorkspacePath(sessionId);

    if (!fs.existsSync(workspacePath)) {
      throw new Error(`Workspace not found for session: ${sessionId}`);
    }

    // Directories to preserve (will be recreated if needed)
    const cacheDirectories = ['.thumbnails', '.slices', '.mesh-previews'];

    // Get current file count for reporting
    const metadata = this.loadMetadata(sessionId);
    const previousFileCount = metadata.files.length;

    // Delete all contents except cache directories
    const deleteRecursive = (dirPath, isRoot = false) => {
      if (!fs.existsSync(dirPath)) return;

      const entries = fs.readdirSync(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        // Skip cache directories at root level
        if (isRoot && cacheDirectories.includes(entry.name)) {
          continue;
        }

        // Skip metadata.json - we'll reset it separately
        if (entry.name === 'metadata.json') {
          continue;
        }

        if (entry.isDirectory()) {
          // Recursively delete directory contents
          fs.rmSync(fullPath, { recursive: true, force: true });
        } else {
          fs.unlinkSync(fullPath);
        }
      }
    };

    deleteRecursive(workspacePath, true);

    // Recreate standard directory structure (minimal - subdirs created on-demand)
    const directories = [
      'uploads',
      'results',
      'models'
    ];

    directories.forEach(dir => {
      const dirPath = path.join(workspacePath, dir);
      fs.mkdirSync(dirPath, { recursive: true });
    });

    // Reset metadata (keeping session ID and timestamps)
    const newMetadata = {
      sessionId: sessionId,
      createdAt: metadata.createdAt || new Date().toISOString(),
      lastAccessed: new Date().toISOString(),
      version: '1.1.0',
      files: [],
      folders: []
    };

    this.saveMetadata(sessionId, newMetadata);

    console.log(`[WorkspaceManager] Cleared workspace for session: ${sessionId} (${previousFileCount} files removed)`);

    return {
      success: true,
      clearedFileCount: previousFileCount
    };
  }

  /**
   * Update session ID in metadata (for workspace restore)
   * @param {string} sessionId - Current session ID (the new one)
   * @param {object} importedMetadata - Metadata object from imported workspace
   * @returns {object} Updated metadata
   */
  updateMetadataSessionId(sessionId, importedMetadata) {
    const workspacePath = this.getWorkspacePath(sessionId);

    if (!fs.existsSync(workspacePath)) {
      throw new Error(`Workspace not found for session: ${sessionId}`);
    }

    // Update session ID and timestamps
    const updatedMetadata = {
      ...importedMetadata,
      sessionId: sessionId,
      lastAccessed: new Date().toISOString(),
      // Preserve original creation date but add import timestamp
      importedAt: new Date().toISOString(),
      originalSessionId: importedMetadata.sessionId
    };

    this.saveMetadata(sessionId, updatedMetadata);

    console.log(`[WorkspaceManager] Updated metadata session ID from ${importedMetadata.sessionId} to ${sessionId}`);

    return updatedMetadata;
  }

  /**
   * Get all TIFF files in workspace for thumbnail regeneration
   * @param {string} sessionId - Session ID
   * @returns {array} Array of file objects with TIFF extension
   */
  getTiffFiles(sessionId) {
    const metadata = this.loadMetadata(sessionId);

    return metadata.files.filter(file => {
      const ext = path.extname(file.name).toLowerCase();
      return ext === '.tif' || ext === '.tiff';
    });
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
