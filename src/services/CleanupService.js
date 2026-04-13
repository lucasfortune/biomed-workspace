/**
 * CleanupService - Scheduled cleanup of abandoned workspaces
 *
 * Runs periodically to detect and delete workspaces for sessions that:
 * - No longer have an active session file
 * - Have been inactive longer than the grace period
 * - Have NO active processes (training, inference, mesh, denoising)
 *
 * This ensures workspace files don't accumulate indefinitely when users
 * close their browser without explicitly logging out, while protecting
 * workspaces with long-running processes from premature deletion.
 */

const fs = require('fs');
const path = require('path');

class CleanupService {
  /**
   * Create a CleanupService
   * @param {object} dependencies - Service dependencies
   * @param {object} dependencies.workspaceManager - WorkspaceManager instance
   * @param {object} dependencies.sessionTracker - SessionTracker instance
   * @param {object} dependencies.activityLogger - Activity logger instance
   * @param {object} dependencies.logger - Logger instance
   * @param {object} options - Configuration options
   * @param {number} options.intervalMs - Cleanup interval in milliseconds (default: 15 minutes)
   * @param {number} options.gracePeriodMs - Grace period before considering session abandoned (default: 1 hour)
   */
  constructor(dependencies, options = {}) {
    this.workspaceManager = dependencies.workspaceManager;
    this.sessionTracker = dependencies.sessionTracker;
    this.activityLogger = dependencies.activityLogger;
    this.logger = dependencies.logger;

    // Configuration with defaults
    this.sessionsDir = options.sessionsDir || './sessions';
    this.cleanupIntervalMs = options.intervalMs || 15 * 60 * 1000;  // 15 minutes
    this.gracePeriodMs = options.gracePeriodMs || 60 * 60 * 1000;   // 1 hour

    this.intervalId = null;
    this.isRunning = false;
  }

  /**
   * Start the cleanup scheduler
   */
  start() {
    if (this.intervalId) {
      this.logger?.info('[CleanupService] Already running');
      return;
    }

    const intervalMinutes = Math.round(this.cleanupIntervalMs / 60000);
    const graceMinutes = Math.round(this.gracePeriodMs / 60000);

    this.logger?.info(`[CleanupService] Starting (interval: ${intervalMinutes}min, grace: ${graceMinutes}min)`);

    // Run cleanup immediately on startup
    this.runCleanup();

    // Schedule periodic cleanup
    this.intervalId = setInterval(() => this.runCleanup(), this.cleanupIntervalMs);
  }

  /**
   * Stop the cleanup scheduler
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      this.logger?.info('[CleanupService] Stopped');
    }
  }

  /**
   * Get set of active session IDs from session store
   * @returns {Set<string>} Set of session IDs
   */
  getActiveSessionIds() {
    const activeSessionIds = new Set();

    if (!fs.existsSync(this.sessionsDir)) {
      return activeSessionIds;
    }

    try {
      const files = fs.readdirSync(this.sessionsDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          // Session file name is the session ID
          const sessionId = file.replace('.json', '');
          activeSessionIds.add(sessionId);
        }
      }
    } catch (error) {
      this.logger?.error(`[CleanupService] Error reading sessions directory: ${error.message}`);
    }

    return activeSessionIds;
  }

  /**
   * Check if a session file is stale (not modified within grace period)
   * @param {string} sessionId - Session ID to check
   * @returns {boolean} True if session is stale
   */
  isSessionStale(sessionId) {
    const sessionFile = path.join(this.sessionsDir, `${sessionId}.json`);

    if (!fs.existsSync(sessionFile)) {
      return true; // Session file doesn't exist, consider stale
    }

    try {
      const stats = fs.statSync(sessionFile);
      const lastModified = stats.mtime.getTime();
      const now = Date.now();
      const age = now - lastModified;

      return age > this.gracePeriodMs;
    } catch (error) {
      this.logger?.error(`[CleanupService] Error checking session file: ${error.message}`);
      return false; // Don't delete on error
    }
  }

  /**
   * Check if workspace should be deleted based on metadata
   * @param {string} sessionId - Session/workspace ID
   * @returns {boolean} True if workspace should be deleted
   */
  shouldDeleteWorkspace(sessionId) {
    try {
      const metadata = this.workspaceManager.loadMetadata(sessionId);

      if (!metadata || !metadata.lastAccessed) {
        // No metadata or no lastAccessed - check if session exists
        return !this.getActiveSessionIds().has(sessionId);
      }

      const lastAccessed = new Date(metadata.lastAccessed).getTime();
      const now = Date.now();
      const age = now - lastAccessed;

      return age > this.gracePeriodMs;
    } catch (error) {
      // If can't read metadata, check if session file exists
      return !this.getActiveSessionIds().has(sessionId);
    }
  }

  /**
   * Run cleanup of abandoned workspaces
   * @returns {object} Cleanup result { cleaned, active, errors }
   */
  runCleanup() {
    if (this.isRunning) {
      this.logger?.debug('[CleanupService] Cleanup already in progress, skipping');
      return { cleaned: 0, skipped: true };
    }

    this.isRunning = true;

    try {
      const activeSessionIds = this.getActiveSessionIds();
      const workspacesDir = this.workspaceManager.workspacesBaseDir;

      if (!fs.existsSync(workspacesDir)) {
        this.isRunning = false;
        return { cleaned: 0, active: 0 };
      }

      const workspaces = fs.readdirSync(workspacesDir);
      let cleanedCount = 0;
      let errorCount = 0;

      for (const workspaceId of workspaces) {
        const workspacePath = path.join(workspacesDir, workspaceId);

        // Skip if not a directory
        try {
          if (!fs.statSync(workspacePath).isDirectory()) continue;
        } catch (e) {
          continue;
        }

        // Check if session is active
        const hasActiveSession = activeSessionIds.has(workspaceId);

        // Check if workspace has any active processes (training, inference, mesh, denoising)
        if (this.sessionTracker) {
          const { hasActive, activeProcesses } = this.sessionTracker.hasActiveProcesses(workspaceId);
          if (hasActive) {
            this.logger?.debug(`[CleanupService] Skipping workspace ${workspaceId} — active processes: ${activeProcesses.join(', ')}`);
            continue;
          }
        }

        if (!hasActiveSession) {
          // No active session - check workspace metadata for last access time
          if (this.shouldDeleteWorkspace(workspaceId)) {
            const deleted = this.deleteAbandonedWorkspace(workspaceId);
            if (deleted) {
              cleanedCount++;
            } else {
              errorCount++;
            }
          }
        } else if (this.isSessionStale(workspaceId)) {
          // Session exists but is stale (inactive > grace period)
          // Only delete if workspace metadata also shows stale
          if (this.shouldDeleteWorkspace(workspaceId)) {
            const deleted = this.deleteAbandonedWorkspace(workspaceId);
            if (deleted) {
              cleanedCount++;
            } else {
              errorCount++;
            }
          }
        }
      }

      if (cleanedCount > 0) {
        this.logger?.info(`[CleanupService] Cleaned ${cleanedCount} abandoned workspace(s)`);
      }

      if (errorCount > 0) {
        this.logger?.warn(`[CleanupService] Failed to clean ${errorCount} workspace(s)`);
      }

      this.isRunning = false;
      return { cleaned: cleanedCount, active: activeSessionIds.size, errors: errorCount };

    } catch (error) {
      this.logger?.error(`[CleanupService] Error during cleanup: ${error.message}`);
      this.isRunning = false;
      return { cleaned: 0, error: error.message };
    }
  }

  /**
   * Delete an abandoned workspace and cleanup related resources
   * @param {string} sessionId - Session/workspace ID to delete
   * @returns {boolean} True if deleted successfully
   */
  deleteAbandonedWorkspace(sessionId) {
    try {
      // Cleanup in-memory sessions first (training, inference, etc.)
      if (this.sessionTracker) {
        try {
          this.sessionTracker.cleanupSessionById(sessionId);
        } catch (e) {
          this.logger?.debug(`[CleanupService] Session tracker cleanup error: ${e.message}`);
        }
      }

      // Delete workspace files
      const deleted = this.workspaceManager.deleteWorkspace(sessionId);

      if (deleted) {
        this.logger?.info(`[CleanupService] Deleted abandoned workspace: ${sessionId}`);

        // Log the activity
        if (this.activityLogger) {
          this.activityLogger.logActivity('system', 'workspace_deleted', {
            sessionId,
            reason: 'abandoned'
          });
        }
      }

      return deleted;

    } catch (error) {
      this.logger?.error(`[CleanupService] Error deleting workspace ${sessionId}: ${error.message}`);
      return false;
    }
  }

  /**
   * Get cleanup service status
   * @returns {object} Status information
   */
  getStatus() {
    return {
      running: this.intervalId !== null,
      intervalMs: this.cleanupIntervalMs,
      gracePeriodMs: this.gracePeriodMs,
      activeWorkspaces: this.getActiveSessionIds().size
    };
  }
}

module.exports = CleanupService;
