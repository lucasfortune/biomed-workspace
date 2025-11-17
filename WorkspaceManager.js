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
      version: '1.0.0',
      files: [],
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
      return JSON.parse(data);
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
   */
  addFileToMetadata(sessionId, fileInfo) {
    const metadata = this.loadMetadata(sessionId);

    metadata.files.push({
      id: fileInfo.id || `file_${Date.now()}`,
      name: fileInfo.name,
      path: fileInfo.path,
      category: fileInfo.category,
      size: fileInfo.size,
      uploadedAt: new Date().toISOString()
    });

    this.saveMetadata(sessionId, metadata);
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
