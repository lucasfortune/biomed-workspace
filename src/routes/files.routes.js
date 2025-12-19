/**
 * File Routes
 *
 * Handles file CRUD operations, batch operations, and search.
 * Mounted at /api/workspace
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const { requireAuth } = require('../middleware/auth.middleware');

/**
 * Create file routes router
 * @param {object} dependencies - Shared dependencies
 * @param {object} dependencies.workspaceManager - WorkspaceManager instance
 * @param {object} dependencies.workspaceService - WorkspaceService instance
 * @param {object} dependencies.activityLogger - Activity logger instance
 * @param {object} dependencies.logger - Logger instance
 * @returns {Router} Express router
 */
function createFilesRoutes(dependencies) {
  const router = express.Router();
  const { workspaceManager, workspaceService, activityLogger, logger } = dependencies;

  // ===========================================================================
  // SINGLE FILE OPERATIONS
  // ===========================================================================

  /**
   * Get file by ID
   * GET /api/workspace/file/:fileId
   */
  router.get('/file/:fileId', requireAuth, async (req, res) => {
    try {
      const { fileId } = req.params;
      const sessionId = req.session.id;

      const file = await workspaceService.getFile(sessionId, fileId);

      res.json({ success: true, file });
    } catch (error) {
      if (logger) {
        logger.error('Get file error:', error);
      }
      res.status(404).json({ success: false, error: error.message });
    }
  });

  /**
   * Delete file by ID
   * DELETE /api/workspace/file/:fileId
   */
  router.delete('/file/:fileId', requireAuth, async (req, res) => {
    try {
      const { fileId } = req.params;
      const sessionId = req.session.id;

      const result = await workspaceService.deleteFile(sessionId, fileId);

      if (activityLogger) {
        activityLogger.logActivity(
          req.session.user.username,
          'file_deleted',
          { fileId }
        );
      }

      res.json(result);
    } catch (error) {
      if (logger) {
        logger.error('Delete file error:', error);
      }
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * Rename file
   * PATCH /api/workspace/file/:fileId/rename
   */
  router.patch('/file/:fileId/rename', requireAuth, async (req, res) => {
    try {
      const { fileId } = req.params;
      const { newName } = req.body;
      const sessionId = req.session.id;

      if (logger) {
        logger.debug(`Rename endpoint hit: fileId=${fileId}, newName=${newName}, sessionId=${sessionId}`);
      }

      if (!newName) {
        return res.status(400).json({ success: false, error: 'New name required' });
      }

      const file = await workspaceService.renameFile(sessionId, fileId, newName);

      if (activityLogger) {
        activityLogger.logActivity(
          req.session.user.username,
          'file_renamed',
          { fileId, newName }
        );
      }

      res.json({ success: true, file });
    } catch (error) {
      if (logger) {
        logger.error('Rename file error:', error);
      }
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * Move file to folder
   * PATCH /api/workspace/file/:fileId/move
   */
  router.patch('/file/:fileId/move', requireAuth, async (req, res) => {
    try {
      const { fileId } = req.params;
      const { targetFolderId } = req.body;
      const sessionId = req.session.id;

      const file = await workspaceService.moveFile(sessionId, fileId, targetFolderId);

      if (activityLogger) {
        activityLogger.logActivity(
          req.session.user.username,
          'file_moved',
          { fileId, targetFolderId }
        );
      }

      res.json({ success: true, file });
    } catch (error) {
      if (logger) {
        logger.error('Move file error:', error);
      }
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * Download file
   * GET /api/workspace/file/:fileId/download
   */
  router.get('/file/:fileId/download', requireAuth, async (req, res) => {
    try {
      const { fileId } = req.params;
      const sessionId = req.session.id;

      const file = await workspaceService.getFile(sessionId, fileId);
      const filePath = workspaceService.getFilePath(sessionId, file);

      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ success: false, error: 'File not found' });
      }

      res.download(filePath, file.name);
    } catch (error) {
      if (logger) {
        logger.error('Download file error:', error);
      }
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ===========================================================================
  // BATCH OPERATIONS
  // ===========================================================================

  /**
   * Batch delete files
   * POST /api/workspace/files/batch-delete
   */
  router.post('/files/batch-delete', requireAuth, async (req, res) => {
    try {
      const { fileIds } = req.body;
      const sessionId = req.session.id;

      if (!Array.isArray(fileIds) || fileIds.length === 0) {
        return res.status(400).json({ success: false, error: 'File IDs array required' });
      }

      const result = await workspaceService.deleteFiles(sessionId, fileIds);

      if (activityLogger) {
        activityLogger.logActivity(
          req.session.user.username,
          'batch_delete',
          { count: result.deletedCount }
        );
      }

      res.json(result);
    } catch (error) {
      if (logger) {
        logger.error('Batch delete error:', error);
      }
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * Batch download files as zip
   * POST /api/workspace/files/batch-download
   */
  router.post('/files/batch-download', requireAuth, async (req, res) => {
    try {
      const { fileIds } = req.body;
      const sessionId = req.session.id;

      if (!Array.isArray(fileIds) || fileIds.length === 0) {
        return res.status(400).json({ success: false, error: 'File IDs array required' });
      }

      const archive = archiver('zip', { zlib: { level: 9 } });

      // Set headers
      res.attachment('workspace_files.zip');
      archive.pipe(res);

      // Get file metadata
      const metadata = workspaceService.loadMetadata(sessionId);
      const files = metadata.files.filter(f => fileIds.includes(f.id));
      const workspacePath = workspaceService.getWorkspacePath(sessionId);

      // Add files to archive
      for (const file of files) {
        const filePath = path.join(workspacePath, file.path);
        if (fs.existsSync(filePath)) {
          archive.file(filePath, { name: file.name });
        }
      }

      await archive.finalize();

      if (activityLogger) {
        activityLogger.logActivity(
          req.session.user.username,
          'batch_download',
          { count: files.length }
        );
      }

    } catch (error) {
      if (logger) {
        logger.error('Batch download error:', error);
      }
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ===========================================================================
  // SEARCH AND FILTER
  // ===========================================================================

  /**
   * Search files by name
   * GET /api/workspace/files/search
   */
  router.get('/files/search', requireAuth, async (req, res) => {
    try {
      const { q } = req.query;
      const sessionId = req.session.id;

      const files = await workspaceService.searchFiles(sessionId, q);

      res.json({ success: true, files });
    } catch (error) {
      if (logger) {
        logger.error('Search files error:', error);
      }
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * Filter files by category
   * GET /api/workspace/files/category/:category
   */
  router.get('/files/category/:category', requireAuth, async (req, res) => {
    try {
      const { category } = req.params;
      const sessionId = req.session.id;

      const files = await workspaceService.getFilesByCategory(sessionId, category);

      res.json({ success: true, files });
    } catch (error) {
      if (logger) {
        logger.error('Filter files error:', error);
      }
      res.status(500).json({ success: false, error: error.message });
    }
  });

  return router;
}

module.exports = createFilesRoutes;
