/**
 * Admin Routes
 *
 * Handles admin dashboard API endpoints:
 * - User management (list, approve, reject)
 * - Activity logs
 * - Active sessions monitoring
 *
 * Mounted at /admin
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const { requireAdmin } = require('../middleware/auth.middleware');

/**
 * Create admin routes router
 * @param {object} dependencies - Shared dependencies
 * @param {object} dependencies.authService - AuthService instance
 * @param {object} dependencies.sessionTracker - SessionTracker instance
 * @param {object} dependencies.denoisingService - DenoisingService instance
 * @param {object} dependencies.logger - Logger instance
 * @returns {Router} Express router
 */
function createAdminRoutes(dependencies) {
  const router = express.Router();
  const { authService, sessionTracker, denoisingService, logger, activityLogger } = dependencies;

  // ===========================================================================
  // USER MANAGEMENT
  // ===========================================================================

  /**
   * Get all users with optional status filter
   * GET /admin/users?filter={all|active|pending|rejected}
   */
  router.get('/users', requireAdmin, (req, res) => {
    try {
      const filter = req.query.filter || 'all';
      let users = authService.getAllUsers();

      if (filter !== 'all') {
        users = users.filter(u => u.status === filter);
      }

      res.json({ users });
    } catch (error) {
      if (logger) {
        logger.error('Error getting users:', error);
      }
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Get pending users for approval
   * GET /admin/pending-users
   */
  router.get('/pending-users', requireAdmin, (req, res) => {
    try {
      const users = authService.getPendingUsers();
      res.json({ users });
    } catch (error) {
      if (logger) {
        logger.error('Error getting pending users:', error);
      }
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Approve a user
   * POST /admin/approve-user
   * Body: { username: string }
   */
  router.post('/approve-user', requireAdmin, (req, res) => {
    try {
      const { username } = req.body;

      if (!username) {
        return res.status(400).json({ success: false, error: 'Username is required' });
      }

      const result = authService.approveUser(username);

      if (result.success) {
        if (logger) {
          logger.info(`Admin ${req.session.user.username} approved user: ${username}`);
        }
        res.json({ success: true });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      if (logger) {
        logger.error('Error approving user:', error);
      }
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * Reject a user
   * POST /admin/reject-user
   * Body: { username: string }
   */
  router.post('/reject-user', requireAdmin, (req, res) => {
    try {
      const { username } = req.body;

      if (!username) {
        return res.status(400).json({ success: false, error: 'Username is required' });
      }

      const result = authService.rejectUser(username);

      if (result.success) {
        if (logger) {
          logger.info(`Admin ${req.session.user.username} rejected user: ${username}`);
        }
        res.json({ success: true });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      if (logger) {
        logger.error('Error rejecting user:', error);
      }
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * Remove a user (soft-delete)
   * POST /admin/remove-user
   * Body: { username: string }
   */
  router.post('/remove-user', requireAdmin, (req, res) => {
    try {
      const { username } = req.body;

      if (!username) {
        return res.status(400).json({ success: false, error: 'Username is required' });
      }

      const adminUsername = req.session.user.username;
      const result = authService.removeUser(username, adminUsername);

      if (result.success) {
        if (logger) {
          logger.info(`Admin ${adminUsername} removed user: ${username}`);
        }
        if (activityLogger) {
          activityLogger.logActivity(adminUsername, 'user_removed', { targetUser: username });
        }
        res.json({ success: true });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      if (logger) {
        logger.error('Error removing user:', error);
      }
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * Ban an email address
   * POST /admin/ban-email
   * Body: { email: string }
   */
  router.post('/ban-email', requireAdmin, (req, res) => {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({ success: false, error: 'Email is required' });
      }

      const adminUsername = req.session.user.username;
      const result = authService.banEmail(email, adminUsername);

      if (result.success) {
        if (logger) {
          logger.info(`Admin ${adminUsername} banned email: ${email}`);
        }
        if (activityLogger) {
          activityLogger.logActivity(adminUsername, 'email_banned', { email: email.toLowerCase().trim() });
        }
        res.json({ success: true });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      if (logger) {
        logger.error('Error banning email:', error);
      }
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * Unban an email address
   * POST /admin/unban-email
   * Body: { email: string }
   */
  router.post('/unban-email', requireAdmin, (req, res) => {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({ success: false, error: 'Email is required' });
      }

      const adminUsername = req.session.user.username;
      const result = authService.unbanEmail(email);

      if (result.success) {
        if (logger) {
          logger.info(`Admin ${adminUsername} unbanned email: ${email}`);
        }
        if (activityLogger) {
          activityLogger.logActivity(adminUsername, 'email_unbanned', { email: email.toLowerCase().trim() });
        }
        res.json({ success: true });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      if (logger) {
        logger.error('Error unbanning email:', error);
      }
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * Get all banned emails
   * GET /admin/banned-emails
   */
  router.get('/banned-emails', requireAdmin, (req, res) => {
    try {
      const bannedEmails = authService.getBannedEmails();
      res.json({ bannedEmails });
    } catch (error) {
      if (logger) {
        logger.error('Error getting banned emails:', error);
      }
      res.status(500).json({ error: error.message });
    }
  });

  // ===========================================================================
  // ACTIVITY LOGS
  // ===========================================================================

  /**
   * Get activity logs with optional filters
   * GET /admin/activity-logs?user={username}&type={actionType}&limit={number}
   */
  router.get('/activity-logs', requireAdmin, (req, res) => {
    try {
      const { user, type, limit = 100 } = req.query;
      const logPath = activityLogger.getLogFilePath();

      // Read and parse JSONL file
      let logs = [];
      let allUsers = new Set();

      if (fs.existsSync(logPath)) {
        const content = fs.readFileSync(logPath, 'utf8');
        const lines = content.trim().split('\n').filter(line => line);

        // Parse all logs and collect usernames
        for (const line of lines) {
          try {
            const log = JSON.parse(line);
            logs.push(log);
            if (log.username) {
              allUsers.add(log.username);
            }
          } catch (parseError) {
            // Skip malformed lines
            if (logger) {
              logger.warn('Skipping malformed log line:', line);
            }
          }
        }

        // Reverse to get most recent first
        logs.reverse();
      }

      // Apply filters
      if (user && user !== 'all') {
        logs = logs.filter(log => log.username === user);
      }
      if (type && type !== 'all') {
        logs = logs.filter(log => log.action && log.action.includes(type));
      }

      // Apply limit
      const limitNum = parseInt(limit, 10) || 100;
      logs = logs.slice(0, limitNum);

      // Return logs and unique usernames for filter dropdown
      res.json({
        logs,
        users: Array.from(allUsers).sort()
      });
    } catch (error) {
      if (logger) {
        logger.error('Error getting activity logs:', error);
      }
      res.status(500).json({ error: error.message });
    }
  });

  // ===========================================================================
  // ACTIVE SESSIONS
  // ===========================================================================

  /**
   * Helper function to calculate denoising progress based on stage
   */
  function calculateDenoisingProgress(session) {
    if (session.status === 'completed') return 100;
    if (session.status === 'failed') return 0;
    // Estimate based on stage
    if (session.stage === 'stage1') return 33;
    if (session.stage === 'mask') return 50;
    if (session.stage === 'stage2') return 75;
    return 0;
  }

  /**
   * Get all active sessions (training, inference, mesh, denoising)
   * GET /admin/active-sessions
   */
  router.get('/active-sessions', requireAdmin, (req, res) => {
    try {
      // Training sessions (from SessionTracker)
      const training = [];
      if (sessionTracker && sessionTracker.trainingSessions) {
        for (const [trainingId, session] of sessionTracker.trainingSessions.entries()) {
          training.push({
            trainingId,
            status: session.status,
            fullName: session.fullName,
            username: session.username,
            startTime: session.startTime,
            current_epoch: session.current_epoch || 0,
            total_epochs: session.total_epochs || 0
          });
        }
      }

      // Inference sessions (from SessionTracker)
      const inference = [];
      if (sessionTracker && sessionTracker.inferenceSessions) {
        for (const [inferenceId, session] of sessionTracker.inferenceSessions.entries()) {
          inference.push({
            inferenceId,
            status: session.status,
            fullName: session.fullName,
            username: session.username,
            startTime: session.startTime,
            progress: session.progress || 0,
            currentSlice: session.currentSlice || 0,
            totalSlices: session.totalSlices || 0
          });
        }
      }

      // Mesh sessions (from SessionTracker)
      const mesh = [];
      if (sessionTracker && sessionTracker.meshSessions) {
        for (const [meshId, session] of sessionTracker.meshSessions.entries()) {
          mesh.push({
            meshId,
            status: session.status,
            fullName: session.fullName || null,
            username: session.username,
            startTime: session.startTime,
            progress: session.progress || 0,
            currentClass: session.currentClass || 0,
            totalClasses: session.totalClasses || 0
          });
        }
      }

      // Denoising sessions (from DenoisingService)
      const denoising = [];
      if (denoisingService && denoisingService.denoisingSessions) {
        for (const [sessionId, session] of denoisingService.denoisingSessions.entries()) {
          denoising.push({
            denoisingId: session.id,
            status: session.status,
            method: session.method,
            username: session.username || 'Unknown',
            startTime: session.startTime,
            stage: session.stage,
            progress: calculateDenoisingProgress(session)
          });
        }
      }

      res.json({ training, inference, mesh, denoising });
    } catch (error) {
      if (logger) {
        logger.error('Error getting active sessions:', error);
      }
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}

module.exports = createAdminRoutes;
