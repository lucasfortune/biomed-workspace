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
const { findRootFiles, getLineageChain, getProcessingHistoryString, findOriginalDataFile } = require('../helpers/lineageHelpers');

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
  // WORKSPACE EXPORT/IMPORT (ZIP)
  // ===========================================================================

  /**
   * Download workspace as ZIP file
   * GET /api/workspace/download
   *
   * Streams a zip file containing all workspace files (excluding cache directories).
   * Cache directories (.thumbnails, .slices, .mesh-previews) are excluded.
   */
  router.get('/download', requireAuth, async (req, res) => {
    try {
      const sessionId = req.session.id;

      // Set extended timeout for large workspaces (10 minutes)
      req.setTimeout(600000);
      res.setTimeout(600000);

      await workspaceService.exportWorkspace(
        sessionId,
        res,
        req.session.user?.username
      );

      // Note: response is handled by exportWorkspace (streaming)
    } catch (error) {
      if (logger) {
        logger.error('Workspace download error:', error);
      }
      // Only send error if headers haven't been sent yet
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    }
  });

  /**
   * Restore workspace from ZIP file
   * POST /api/workspace/restore
   *
   * Accepts a zip file upload and restores the workspace from it.
   * Clears existing workspace, extracts zip, updates session ID in metadata.
   */
  router.post('/restore', requireAuth, dependencies.uploadWorkspaceZip.single('workspace'), async (req, res) => {
    try {
      const sessionId = req.session.id;

      // Check approval status - only active users can restore workspaces
      if (req.session.user.status !== 'active') {
        return res.status(403).json({
          success: false,
          error: 'Workspace restore requires account approval',
          status: req.session.user.status,
          message: 'Your account is pending approval.'
        });
      }

      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'No file uploaded'
        });
      }

      // Validate file is a zip
      if (!req.file.originalname.toLowerCase().endsWith('.zip')) {
        return res.status(400).json({
          success: false,
          error: 'Only ZIP files are allowed for workspace restore'
        });
      }

      // Restore workspace from zip buffer
      const result = await workspaceService.restoreWorkspace(
        sessionId,
        req.file.buffer,
        fileService,
        req.session.user?.username
      );

      res.json({
        success: true,
        message: 'Workspace restored successfully',
        fileCount: result.fileCount,
        folderCount: result.folderCount,
        originalSessionId: result.originalSessionId
      });

    } catch (error) {
      if (logger) {
        logger.error('Workspace restore error:', error);
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

  // ===========================================================================
  // IMAGE VIEWER - SLICE EXTRACTION
  // ===========================================================================

  /**
   * Get TIFF file information (slice count, dimensions, dtype)
   * GET /api/workspace/tiff-info/:fileId
   */
  router.get('/tiff-info/:fileId', requireAuth, async (req, res) => {
    try {
      const { fileId } = req.params;
      const sessionId = req.session.id;

      const file = await workspaceService.getFile(sessionId, fileId);
      const workspacePath = workspaceService.getWorkspacePath(sessionId);
      const filePath = path.join(workspacePath, file.path);

      // Verify file exists
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({
          success: false,
          error: 'File not found'
        });
      }

      // Only allow TIFF files
      const ext = path.extname(file.name).toLowerCase();
      if (ext !== '.tif' && ext !== '.tiff') {
        return res.status(400).json({
          success: false,
          error: 'Only TIFF files are supported'
        });
      }

      // Spawn Python script to get info
      // Use --no-classes for fast metadata-only read (skips loading entire file)
      const pythonProcess = spawn(PYTHON_PATH, [
        'python/extract_slice.py',
        filePath,
        '--info',
        '--no-classes'
      ]);

      let output = '';
      let errorOutput = '';

      pythonProcess.stdout.on('data', (data) => {
        output += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      pythonProcess.on('close', (code) => {
        if (code === 0 && output.includes('INFO:')) {
          const jsonStr = output.replace('INFO:', '').trim();
          try {
            const info = JSON.parse(jsonStr);
            res.json({
              success: true,
              fileId: fileId,
              fileName: file.name,
              ...info
            });
          } catch (parseError) {
            res.status(500).json({
              success: false,
              error: 'Failed to parse TIFF info'
            });
          }
        } else {
          const errorMsg = output.includes('ERROR:')
            ? output.replace('ERROR:', '').trim()
            : errorOutput || 'Unknown error';
          res.status(500).json({
            success: false,
            error: errorMsg
          });
        }
      });

    } catch (error) {
      if (logger) {
        logger.error('TIFF info error:', error);
      }
      res.status(error.message.includes('not found') ? 404 : 500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * Extract and serve a slice from a TIFF file as JPEG
   * GET /api/workspace/slice/:fileId/:sliceIndex
   * Query params:
   *   - size: 'icon' (128px), 'gallery' (512px), or number (default: 512)
   */
  router.get('/slice/:fileId/:sliceIndex', requireAuth, async (req, res) => {
    try {
      const { fileId, sliceIndex } = req.params;
      const size = req.query.size || 'gallery';
      const sessionId = req.session.id;

      // Validate slice index
      const sliceNum = parseInt(sliceIndex, 10);
      if (isNaN(sliceNum) || sliceNum < 0) {
        return res.status(400).json({
          success: false,
          error: 'Invalid slice index'
        });
      }

      const file = await workspaceService.getFile(sessionId, fileId);
      const workspacePath = workspaceService.getWorkspacePath(sessionId);
      const filePath = path.join(workspacePath, file.path);

      // Verify file exists
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({
          success: false,
          error: 'File not found'
        });
      }

      // Only allow TIFF files
      const ext = path.extname(file.name).toLowerCase();
      if (ext !== '.tif' && ext !== '.tiff') {
        return res.status(400).json({
          success: false,
          error: 'Only TIFF files are supported'
        });
      }

      // Create cache directory for slices
      const slicesDir = path.join(workspacePath, '.slices');
      if (!fs.existsSync(slicesDir)) {
        fs.mkdirSync(slicesDir, { recursive: true });
      }

      // Generate cache filename based on fileId, slice, and size
      const cacheFilename = `${fileId}_${sliceIndex}_${size}.jpg`;
      const cachePath = path.join(slicesDir, cacheFilename);

      // Check cache first
      if (fs.existsSync(cachePath)) {
        return res.sendFile(path.resolve(cachePath));
      }

      // Spawn Python script to extract slice
      const pythonProcess = spawn(PYTHON_PATH, [
        'python/extract_slice.py',
        filePath,
        sliceIndex.toString(),
        cachePath,
        '--size',
        size
      ]);

      let output = '';
      let errorOutput = '';

      pythonProcess.stdout.on('data', (data) => {
        output += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      pythonProcess.on('close', (code) => {
        if (code === 0 && output.includes('SUCCESS:')) {
          res.sendFile(path.resolve(cachePath));
        } else {
          const errorMsg = output.includes('ERROR:')
            ? output.replace('ERROR:', '').trim()
            : errorOutput || 'Unknown error';

          // Check for specific error types
          if (errorMsg.includes('out of range')) {
            res.status(400).json({
              success: false,
              error: errorMsg
            });
          } else {
            res.status(500).json({
              success: false,
              error: errorMsg
            });
          }
        }
      });

    } catch (error) {
      if (logger) {
        logger.error('Slice extraction error:', error);
      }
      res.status(error.message.includes('not found') ? 404 : 500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ===========================================================================
  // LINEAGE TRACKING
  // ===========================================================================

  /**
   * Get lineage chain for a file
   * GET /api/workspace/lineage/:fileId
   *
   * Returns the processing history chain from root file(s) to the specified file.
   */
  router.get('/lineage/:fileId', requireAuth, (req, res) => {
    try {
      const { fileId } = req.params;
      const sessionId = req.session.id;
      const metadata = workspaceManager.loadMetadata(sessionId);

      if (!metadata || !metadata.files) {
        return res.status(404).json({
          success: false,
          error: 'Workspace metadata not found'
        });
      }

      // Find the file by ID or path (path fallback for direct module navigation)
      let file = metadata.files.find(f => f.id === fileId);
      if (!file) {
        // Try matching by path (fileId might be a path from mesh module)
        file = metadata.files.find(f => f.path === fileId || f.path === decodeURIComponent(fileId));
      }
      if (!file) {
        return res.status(404).json({
          success: false,
          error: 'File not found',
          fileId
        });
      }

      // Get lineage information (use actual file.id for lookups)
      const actualFileId = file.id;
      const chain = getLineageChain(actualFileId, metadata.files);
      const roots = findRootFiles(actualFileId, metadata.files);
      const processingHistory = getProcessingHistoryString(actualFileId, metadata.files);
      const originalDataFile = findOriginalDataFile(actualFileId, metadata.files);

      res.json({
        success: true,
        fileId,
        fileName: file.name,
        hasLineage: !!file.lineage,
        processingHistory,
        chain,
        rootIds: roots.rootIds,
        originalDataFile: originalDataFile ? {
          id: originalDataFile.id,
          name: originalDataFile.name,
          path: originalDataFile.path,
          category: originalDataFile.category
        } : null,
        hasErrors: roots.hasErrors,
        errors: roots.errors
      });
    } catch (error) {
      if (logger) {
        logger.error('Lineage query error:', error);
      }
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  return router;
}

module.exports = createWorkspaceRoutes;
