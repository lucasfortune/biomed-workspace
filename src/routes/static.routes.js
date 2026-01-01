/**
 * Static Routes
 *
 * Handles static file serving and HTML page routes.
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const { requireAuth, requireAdmin } = require('../middleware/auth.middleware');

/**
 * Create static routes router
 * @param {object} dependencies - Shared dependencies
 * @param {object} dependencies.workspaceService - WorkspaceService instance
 * @returns {Router} Express router
 */
function createStaticRoutes(dependencies) {
  const router = express.Router();
  const { workspaceService } = dependencies;

  // ===========================================================================
  // HTML PAGES
  // ===========================================================================

  /**
   * Welcome page (landing page)
   */
  router.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../../public', 'welcome.html'));
  });

  /**
   * Main app redirect (legacy)
   */
  router.get('/app', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, '../../public', 'index.html'));
  });

  /**
   * Login page
   */
  router.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, '../../public', 'login.html'));
  });

  /**
   * Register page
   */
  router.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, '../../public', 'register.html'));
  });

  /**
   * Admin page
   */
  router.get('/admin', requireAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, '../../public', 'admin.html'));
  });

  /**
   * Classic segmentation app
   */
  router.get('/classic', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, '../../public', 'classic', 'index.html'));
  });

  /**
   * Workspace app
   */
  router.get('/workspace', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, '../../public', 'workspace', 'index.html'));
  });

  // ===========================================================================
  // STATIC FILE SERVING
  // ===========================================================================

  /**
   * Serve test data files
   */
  router.get('/test_data/:filename', requireAuth, (req, res) => {
    // Sanitize filename to prevent path traversal attacks
    const filename = path.basename(req.params.filename);
    const filePath = path.join(__dirname, '../../test_data', filename);

    if (fs.existsSync(filePath)) {
      res.sendFile(filePath);
    } else {
      res.status(404).send('Test file not found');
    }
  });

  /**
   * Serve public static files
   */
  router.use(express.static(path.join(__dirname, '../../public')));

  /**
   * Legacy static file serving for uploads
   */
  router.use('/uploads', express.static(path.join(__dirname, '../../uploads')));

  /**
   * Legacy static file serving for results
   */
  router.use('/results', express.static(path.join(__dirname, '../../results')));

  /**
   * Legacy static file serving for models
   */
  router.use('/models', express.static(path.join(__dirname, '../../models')));

  // ===========================================================================
  // WORKSPACE STATIC FILES (session-scoped)
  // ===========================================================================

  /**
   * Serve files from workspace results directory
   */
  router.use('/workspaces/:sessionId/results', requireAuth, (req, res, next) => {
    const sessionId = req.params.sessionId;

    // Verify the session ID matches the current user's session
    if (sessionId !== req.session.id) {
      return res.status(403).json({ error: 'Access denied to this workspace' });
    }

    const workspacePath = workspaceService.getWorkspacePath(sessionId);
    const resultsPath = path.join(workspacePath, 'results');

    // Serve files from the workspace results directory
    express.static(resultsPath)(req, res, next);
  });

  /**
   * Serve files from workspace uploads directory
   */
  router.use('/workspaces/:sessionId/uploads', requireAuth, (req, res, next) => {
    const sessionId = req.params.sessionId;

    // Verify the session ID matches the current user's session
    if (sessionId !== req.session.id) {
      return res.status(403).json({ error: 'Access denied to this workspace' });
    }

    const workspacePath = workspaceService.getWorkspacePath(sessionId);
    const uploadsPath = path.join(workspacePath, 'uploads');

    // Serve files from the workspace uploads directory
    express.static(uploadsPath)(req, res, next);
  });

  return router;
}

module.exports = createStaticRoutes;
