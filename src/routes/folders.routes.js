/**
 * Folder Routes
 *
 * Handles folder CRUD operations within workspaces.
 * Mounted at /api/workspace
 */

const express = require('express');
const { requireAuth } = require('../middleware/auth.middleware');

/**
 * Create folder routes router
 * @param {object} dependencies - Shared dependencies
 * @param {object} dependencies.workspaceService - WorkspaceService instance
 * @param {object} dependencies.activityLogger - Activity logger instance
 * @param {object} dependencies.logger - Logger instance
 * @returns {Router} Express router
 */
function createFoldersRoutes(dependencies) {
  const router = express.Router();
  const { workspaceService, activityLogger, logger } = dependencies;

  // ===========================================================================
  // FOLDER CRUD
  // ===========================================================================

  /**
   * Get all folders
   * GET /api/workspace/folders
   */
  router.get('/folders', requireAuth, async (req, res) => {
    try {
      const sessionId = req.session.id;
      const folders = await workspaceService.getFolders(sessionId);

      res.json({ success: true, folders });
    } catch (error) {
      if (logger) {
        logger.error('Get folders error:', error);
      }
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * Create folder
   * POST /api/workspace/folders
   */
  router.post('/folders', requireAuth, async (req, res) => {
    try {
      const { name, parentId, color } = req.body;
      const sessionId = req.session.id;

      if (!name) {
        return res.status(400).json({ success: false, error: 'Folder name required' });
      }

      const folder = await workspaceService.createFolder(
        sessionId,
        name,
        parentId || null
      );

      if (activityLogger) {
        activityLogger.logActivity(
          req.session.user.username,
          'folder_created',
          { folderId: folder.id, name }
        );
      }

      res.json({ success: true, folder });
    } catch (error) {
      if (logger) {
        logger.error('Create folder error:', error);
      }
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * Rename folder
   * PATCH /api/workspace/folders/:folderId
   */
  router.patch('/folders/:folderId', requireAuth, async (req, res) => {
    try {
      const { folderId } = req.params;
      const { name } = req.body;
      const sessionId = req.session.id;

      if (!name) {
        return res.status(400).json({ success: false, error: 'Folder name required' });
      }

      const folder = await workspaceService.renameFolder(sessionId, folderId, name);

      if (activityLogger) {
        activityLogger.logActivity(
          req.session.user.username,
          'folder_renamed',
          { folderId, name }
        );
      }

      res.json({ success: true, folder });
    } catch (error) {
      if (logger) {
        logger.error('Rename folder error:', error);
      }
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * Delete folder
   * DELETE /api/workspace/folders/:folderId
   */
  router.delete('/folders/:folderId', requireAuth, async (req, res) => {
    try {
      const { folderId } = req.params;
      const sessionId = req.session.id;

      const result = await workspaceService.deleteFolder(sessionId, folderId);

      if (activityLogger) {
        activityLogger.logActivity(
          req.session.user.username,
          'folder_deleted',
          { folderId }
        );
      }

      res.json(result);
    } catch (error) {
      if (logger) {
        logger.error('Delete folder error:', error);
      }
      res.status(500).json({ success: false, error: error.message });
    }
  });

  return router;
}

module.exports = createFoldersRoutes;
