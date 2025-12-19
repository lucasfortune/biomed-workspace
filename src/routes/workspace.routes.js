/**
 * Workspace Routes
 *
 * Handles workspace initialization, status, upload, stats, and thumbnails.
 * Mounted at /api/workspace
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { requireAuth } = require('../middleware/auth.middleware');
const { PYTHON_PATH } = require('../config/constants');

/**
 * Create workspace routes router
 * @param {object} dependencies - Shared dependencies
 * @param {object} dependencies.workspaceManager - WorkspaceManager instance
 * @param {object} dependencies.workspaceService - WorkspaceService instance
 * @param {object} dependencies.fileService - FileService instance
 * @param {object} dependencies.activityLogger - Activity logger instance
 * @param {object} dependencies.logger - Logger instance
 * @param {function} dependencies.upload - Multer upload middleware
 * @returns {Router} Express router
 */
function createWorkspaceRoutes(dependencies) {
  const router = express.Router();
  const {
    workspaceManager,
    workspaceService,
    fileService,
    activityLogger,
    logger,
    upload
  } = dependencies;

  // ===========================================================================
  // WORKSPACE MANAGEMENT
  // ===========================================================================

  /**
   * Initialize workspace for current session
   * POST /api/workspace/init
   */
  router.post('/init', requireAuth, (req, res) => {
    try {
      const sessionId = req.session.id;
      const workspaceInfo = workspaceService.initializeWorkspace(
        sessionId,
        req.session.user.username
      );

      res.json({
        success: true,
        workspace: workspaceInfo
      });
    } catch (error) {
      if (logger) {
        logger.error('Error initializing workspace:', error);
      }
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * Get workspace status and file tree
   * GET /api/workspace/status
   */
  router.get('/status', requireAuth, async (req, res) => {
    try {
      const sessionId = req.session.id;
      const status = workspaceService.getWorkspaceStatus(sessionId);

      res.json({
        success: true,
        workspace: status
      });
    } catch (error) {
      if (logger) {
        logger.error('Error getting workspace status:', error);
      }
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * Get workspace file tree
   * GET /api/workspace/files
   */
  router.get('/files', requireAuth, (req, res) => {
    try {
      const sessionId = req.session.id;
      const metadata = workspaceService.loadMetadata(sessionId);

      res.json({
        success: true,
        files: metadata?.files || []
      });
    } catch (error) {
      if (logger) {
        logger.error('Error getting workspace files:', error);
      }
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * Get workspace statistics
   * GET /api/workspace/stats
   */
  router.get('/stats', requireAuth, (req, res) => {
    try {
      const sessionId = req.session.id;
      const stats = workspaceService.getWorkspaceStats(sessionId);

      res.json({
        success: true,
        stats: stats
      });
    } catch (error) {
      if (logger) {
        logger.error('Error getting workspace stats:', error);
      }
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ===========================================================================
  // FILE UPLOAD
  // ===========================================================================

  /**
   * Upload file to workspace
   * POST /api/workspace/upload
   */
  router.post('/upload', requireAuth, upload.any(), async (req, res) => {
    try {
      const sessionId = req.session.id;
      const category = req.body.category || 'uploads';

      // Check approval status - only active users can upload custom files
      if (req.session.user.status !== 'active') {
        return res.status(403).json({
          success: false,
          error: 'Custom file upload requires account approval',
          status: req.session.user.status,
          message: 'Your account is pending approval. You can use test data while waiting.'
        });
      }

      if (!req.files || req.files.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No file uploaded'
        });
      }

      const uploadedFile = req.files[0];
      const workspacePath = workspaceService.getWorkspacePath(sessionId);

      // Determine relative path within workspace
      const relativePath = path.relative(workspacePath, uploadedFile.path);

      // Add file to metadata
      const fileEntry = workspaceService.addFileToMetadata(sessionId, {
        name: uploadedFile.originalname,
        path: relativePath,
        category: category,
        size: uploadedFile.size,
        folderId: req.body.folderId || null
      });

      // Trigger thumbnail generation for TIFF files
      if (fileService && fileService.isTiffFile(uploadedFile.originalname)) {
        fileService.generateThumbnailAsync(sessionId, uploadedFile.path, fileEntry.id);
      }

      if (activityLogger) {
        activityLogger.logActivity(req.session.user.username, 'file_upload', {
          filename: uploadedFile.originalname,
          category: category,
          size: uploadedFile.size
        });
      }

      res.json({
        success: true,
        file: fileEntry,
        message: 'File uploaded successfully'
      });

    } catch (error) {
      if (logger) {
        logger.error('Error uploading file to workspace:', error);
      }
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ===========================================================================
  // THUMBNAILS
  // ===========================================================================

  /**
   * Get or generate thumbnail for a file
   * GET /api/workspace/thumbnail/:fileId
   */
  router.get('/thumbnail/:fileId', requireAuth, async (req, res) => {
    try {
      const { fileId } = req.params;
      const sessionId = req.session.id;

      const file = await workspaceService.getFile(sessionId, fileId);
      const workspacePath = workspaceService.getWorkspacePath(sessionId);

      // Check if thumbnail already exists
      if (file.thumbnailPath) {
        const thumbPath = path.join(workspacePath, file.thumbnailPath);
        if (fs.existsSync(thumbPath)) {
          return res.sendFile(path.resolve(thumbPath));
        }
      }

      // Only generate thumbnails for TIFF files
      const ext = path.extname(file.name).toLowerCase();
      if (ext !== '.tif' && ext !== '.tiff') {
        return res.status(400).json({
          success: false,
          error: 'Thumbnails only available for TIFF files'
        });
      }

      // Create .thumbnails directory
      const thumbnailsDir = workspaceService.ensureThumbnailsDir(sessionId);
      const thumbnailFilename = `${fileId}.jpg`;
      const thumbnailPath = path.join(thumbnailsDir, thumbnailFilename);
      const filePath = path.join(workspacePath, file.path);

      // Spawn Python script
      const pythonProcess = spawn(PYTHON_PATH, [
        'python/generate_thumbnail.py',
        filePath,
        thumbnailPath
      ]);

      let output = '';
      pythonProcess.stdout.on('data', (data) => {
        output += data.toString();
      });

      pythonProcess.on('close', async (code) => {
        if (code === 0 && output.includes('SUCCESS:')) {
          // Update metadata with thumbnail path
          await workspaceService.setThumbnailPath(
            sessionId,
            fileId,
            `.thumbnails/${thumbnailFilename}`
          );

          res.sendFile(path.resolve(thumbnailPath));
        } else {
          if (logger) {
            logger.error('Thumbnail generation failed:', output);
          }
          res.status(500).json({
            success: false,
            error: 'Thumbnail generation failed'
          });
        }
      });

    } catch (error) {
      if (logger) {
        logger.error('Thumbnail error:', error);
      }
      res.status(500).json({ success: false, error: error.message });
    }
  });

  return router;
}

module.exports = createWorkspaceRoutes;
