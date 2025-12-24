/**
 * Annotation Routes
 *
 * Handles annotation-related endpoints:
 * - Get full-resolution slices (no scaling)
 * - Save annotation progress
 * - Create final annotations
 * - Load existing annotations
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const { requireAuth } = require('../middleware/auth.middleware');
const { PYTHON_PATH, DIRECTORIES } = require('../config/constants');

/**
 * Create annotation routes router
 * @param {object} dependencies - Shared dependencies
 * @param {object} dependencies.workspaceManager - WorkspaceManager instance
 * @param {object} dependencies.sessionTracker - SessionTracker instance
 * @param {object} dependencies.activityLogger - Activity logger instance
 * @param {object} dependencies.logger - Logger instance
 * @param {object} dependencies.io - Socket.IO instance
 * @returns {Router} Express router
 */
function createAnnotationRoutes(dependencies) {
  const router = express.Router();
  const {
    workspaceManager,
    sessionTracker,
    activityLogger,
    logger,
    io
  } = dependencies;

  // ===========================================================================
  // GET RAW SLICE (Full Resolution)
  // ===========================================================================

  /**
   * Get full-resolution slice as PNG (no scaling)
   * GET /api/annotation/raw-slice/:fileId/:sliceIndex
   *
   * Note: Full implementation in Phase 3
   */
  router.get('/raw-slice/:fileId/:sliceIndex', requireAuth, async (req, res) => {
    const { spawn } = require('child_process');

    try {
      const fileId = decodeURIComponent(req.params.fileId);
      const sliceIndex = parseInt(req.params.sliceIndex, 10);
      const sessionId = req.session.id;
      const workspacePath = workspaceManager.getWorkspacePath(sessionId);

      // Resolve file path from fileId
      let filePath;
      if (path.isAbsolute(fileId)) {
        filePath = fileId;
      } else {
        const metadata = workspaceManager.loadMetadata(sessionId);
        const file = metadata?.files?.find(f => f.id === fileId);

        if (file) {
          filePath = path.join(workspacePath, file.path);
        } else {
          filePath = path.join(workspacePath, fileId);
        }
      }

      if (!fs.existsSync(filePath)) {
        return res.status(404).json({
          success: false,
          error: 'File not found',
          path: fileId
        });
      }

      // Create cache directory for raw slices
      const cacheDir = path.join(workspacePath, '.slices');
      if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
      }

      // Generate cache filename with _raw suffix to distinguish from scaled slices
      const fileHash = Buffer.from(filePath).toString('base64').replace(/[/+=]/g, '_').substring(0, 32);
      const cacheFilename = `${fileHash}_${sliceIndex}_raw.png`;
      const cachePath = path.join(cacheDir, cacheFilename);

      // Check cache
      if (fs.existsSync(cachePath)) {
        return res.sendFile(path.resolve(cachePath));
      }

      // Extract slice using Python (full resolution, no scaling)
      const pythonProcess = spawn(PYTHON_PATH, [
        'python/extract_raw_slice.py',
        filePath,
        sliceIndex.toString(),
        cachePath
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
        if (code === 0 && output.includes('SUCCESS:') && fs.existsSync(cachePath)) {
          res.sendFile(path.resolve(cachePath));
        } else {
          const errorMsg = output.includes('ERROR:')
            ? output.replace('ERROR:', '').trim()
            : errorOutput || 'Unknown error during slice extraction';
          if (logger) logger.error('Raw slice extraction error:', errorMsg);
          res.status(500).json({
            success: false,
            error: errorMsg
          });
        }
      });

    } catch (error) {
      if (logger) logger.error('Error getting raw slice:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ===========================================================================
  // SAVE PROGRESS (Placeholder)
  // ===========================================================================

  /**
   * Save annotation progress (unfinished annotation)
   * POST /api/annotation/save-progress
   *
   * Note: Full implementation in Phase 8
   */
  router.post('/save-progress', requireAuth, async (req, res) => {
    try {
      // Placeholder response for Phase 1
      // Full implementation in Phase 8
      if (logger) logger.info('[Annotation] Save progress endpoint called (placeholder)');

      res.json({
        success: true,
        message: 'Save progress endpoint placeholder - implementation in Phase 8',
        fileId: null,
        filePath: null
      });

    } catch (error) {
      if (logger) logger.error('Error saving annotation progress:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ===========================================================================
  // CREATE ANNOTATION (Placeholder)
  // ===========================================================================

  /**
   * Create final annotation
   * POST /api/annotation/create
   *
   * Note: Full implementation in Phase 9
   */
  router.post('/create', requireAuth, async (req, res) => {
    try {
      // Placeholder response for Phase 1
      // Full implementation in Phase 9
      if (logger) logger.info('[Annotation] Create annotation endpoint called (placeholder)');

      res.json({
        success: true,
        message: 'Create annotation endpoint placeholder - implementation in Phase 9',
        fileId: null,
        filePath: null
      });

    } catch (error) {
      if (logger) logger.error('Error creating annotation:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ===========================================================================
  // LOAD ANNOTATION (Placeholder)
  // ===========================================================================

  /**
   * Load existing or unfinished annotation
   * GET /api/annotation/load/:fileId
   *
   * Note: Full implementation in Phase 8-9
   */
  router.get('/load/:fileId', requireAuth, async (req, res) => {
    try {
      const fileId = decodeURIComponent(req.params.fileId);

      // Placeholder response for Phase 1
      // Full implementation in Phase 8-9
      if (logger) logger.info('[Annotation] Load annotation endpoint called (placeholder):', fileId);

      res.json({
        success: true,
        message: 'Load annotation endpoint placeholder - implementation in Phase 8-9',
        data: null
      });

    } catch (error) {
      if (logger) logger.error('Error loading annotation:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  return router;
}

module.exports = createAnnotationRoutes;
