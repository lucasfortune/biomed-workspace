/**
 * Authentication Routes
 *
 * Handles user authentication: login, register, logout, auth check.
 */

const express = require('express');

/**
 * Create authentication routes router
 * @param {object} dependencies - Shared dependencies
 * @param {object} dependencies.authService - AuthService instance
 * @param {object} dependencies.activityLogger - Activity logger instance
 * @param {object} dependencies.logger - Logger instance
 * @param {object} dependencies.workspaceManager - WorkspaceManager instance (for cleanup on logout)
 * @param {object} dependencies.sessionTracker - SessionTracker instance (for cleanup on logout)
 * @param {object} dependencies.telegramService - TelegramService instance (for signup notifications)
 * @returns {Router} Express router
 */
function createAuthRoutes(dependencies) {
  const router = express.Router();
  const { authService, activityLogger, logger, workspaceManager, sessionTracker, telegramService } = dependencies;

  // ===========================================================================
  // AUTH STATUS
  // ===========================================================================

  /**
   * Check authentication status
   * GET /check-auth
   */
  router.get('/check-auth', (req, res) => {
    const userInfo = authService.getAuthenticatedUserInfo(req.session?.user);
    res.json(userInfo);
  });

  // ===========================================================================
  // REGISTRATION
  // ===========================================================================

  /**
   * Register new user
   * POST /register
   */
  router.post('/register', async (req, res) => {
    try {
      const { username, password, fullName, email, institution } = req.body;

      const result = await authService.register({
        username,
        password,
        fullName,
        email,
        institution
      });

      if (!result.success) {
        return res.status(400).json(result);
      }

      // Send Telegram notification (non-blocking, fire-and-forget)
      if (telegramService) {
        telegramService.notifyNewUser({ username, fullName, email, institution });
      }

      res.json(result);

    } catch (error) {
      if (logger) {
        logger.error('Registration error:', error);
      }
      res.status(500).json({
        success: false,
        error: 'Registration failed. Please try again.'
      });
    }
  });

  // ===========================================================================
  // LOGIN / LOGOUT
  // ===========================================================================

  /**
   * Login user
   * POST /login
   */
  router.post('/login', async (req, res) => {
    try {
      const { username, password } = req.body;

      const result = await authService.login(username, password);

      if (!result.success) {
        // Determine appropriate status code
        if (result.rejected) {
          return res.status(403).json(result);
        }
        return res.status(401).json(result);
      }

      // Create session
      req.session.user = result.sessionData;

      // Remove sessionData from response
      const { sessionData, ...responseData } = result;
      res.json(responseData);

    } catch (error) {
      if (logger) {
        logger.error('Login error:', error);
      }
      res.status(500).json({
        success: false,
        error: 'Login failed. Please try again.'
      });
    }
  });

  /**
   * Logout user
   * POST /logout
   * @body {boolean} deleteWorkspace - Whether to delete workspace files on logout
   */
  router.post('/logout', (req, res) => {
    const username = req.session?.user?.username || 'unknown';
    const sessionId = req.session?.id;
    const deleteWorkspace = req.body?.deleteWorkspace === true;

    // Delete workspace if requested
    if (deleteWorkspace && sessionId && workspaceManager) {
      try {
        const deleted = workspaceManager.deleteWorkspace(sessionId);
        if (logger && deleted) {
          logger.info(`Workspace deleted for session ${sessionId} on logout`);
        }
        if (activityLogger) {
          activityLogger.logActivity(username, 'workspace_deleted', {
            sessionId,
            reason: 'logout'
          });
        }
      } catch (error) {
        if (logger) {
          logger.error(`Error deleting workspace on logout: ${error.message}`);
        }
        // Continue with logout even if workspace deletion fails
      }
    }

    // Cleanup in-memory sessions (training, inference, etc.)
    if (sessionTracker && sessionId) {
      try {
        sessionTracker.cleanupSessionById(sessionId);
      } catch (error) {
        if (logger) {
          logger.error(`Error cleaning up session tracker: ${error.message}`);
        }
      }
    }

    req.session.destroy((err) => {
      if (err) {
        if (logger) {
          logger.error('Logout error:', err);
        }
        return res.status(500).json({
          success: false,
          error: 'Logout failed'
        });
      }

      if (logger) {
        logger.info(`User logged out: ${username}${deleteWorkspace ? ' (workspace deleted)' : ''}`);
      }

      res.json({
        success: true,
        message: 'Logged out successfully',
        workspaceDeleted: deleteWorkspace
      });
    });
  });

  return router;
}

module.exports = createAuthRoutes;
