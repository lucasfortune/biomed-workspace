# Workspace File Cleanup Implementation Plan

**Status:** Approved
**Date:** 2026-01-01
**Priority:** Critical (required before rollout)

## Overview

Implement automatic workspace file deletion to prevent storage accumulation. The application cannot offer backend storage for user data - all workspace files must be deleted when users log out or abandon their sessions.

## Current State

| Aspect | Status |
|--------|--------|
| Logout cleanup | Not implemented - session destroyed but files remain |
| Session expiration cleanup | Not implemented - 7-day TTL but no file cleanup |
| Browser tab close cleanup | Not implemented |
| Manual reset endpoint | Exists for classic app only (`/reset-session`) |
| WorkspaceManager cleanup methods | Exist but never called automatically |
| Frontend logout button (workspace) | Missing |

**Risk:** Without cleanup, workspaces accumulate indefinitely on disk.

## Requirements

- **Scheduled cleanup** (not Beacon API) for detecting abandoned sessions
- **Warning dialog** before logout explaining data deletion
- **1-hour grace period** before considering a session abandoned

---

## Implementation Plan

### Phase 1: Add Logout Button to Workspace UI

**Files to modify:**

#### 1.1 `/public/workspace/index.html`
Add logout button in the user-info section (after line 35):
```html
<button class="btn-logout" id="btn-logout" title="Logout">
  <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
    <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z"/>
  </svg>
</button>
```

#### 1.2 `/public/workspace/css/workspace.css`
Add logout button styles:
```css
.btn-logout {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 8px;
  border-radius: 4px;
  margin-left: auto;
}
.btn-logout:hover {
  background: var(--danger-color);
  color: var(--text-on-accent);
}
.user-info {
  display: flex;
  align-items: center;
}
```

#### 1.3 `/public/workspace/js/workspace.js`
Add logout handler with confirmation dialog:
```javascript
// In setupEventListeners():
const logoutBtn = document.getElementById('btn-logout');
if (logoutBtn) {
  logoutBtn.addEventListener('click', () => this.handleLogout());
}

// New method:
async handleLogout() {
  const stats = await this.api.getWorkspaceStats();
  const fileCount = stats?.stats?.fileCount || 0;
  const size = stats?.stats?.totalSizeMB || '0';

  const confirmed = confirm(
    `Logging out will permanently delete your workspace files.\n\n` +
    `Current workspace:\n` +
    `- ${fileCount} files\n` +
    `- ${size} MB total size\n\n` +
    `This action cannot be undone. Do you want to continue?`
  );

  if (!confirmed) return;

  try {
    this.state.update('ui.loading', true);
    await this.api.logout({ deleteWorkspace: true });
    window.location.href = '/';
  } catch (error) {
    this.state.update('ui.loading', false);
    this.state.notify('error', 'Logout failed: ' + error.message);
  }
}
```

#### 1.4 `/public/workspace/js/core/WorkspaceAPI.js`
Update logout method:
```javascript
async logout(options = {}) {
  return this.post('/logout', {
    deleteWorkspace: options.deleteWorkspace || false
  });
}
```

---

### Phase 2: Enhance Logout Endpoint

**Files to modify:**

#### 2.1 `/src/routes/auth.routes.js`

Update function signature to accept additional dependencies:
```javascript
function createAuthRoutes(dependencies) {
  const {
    authService,
    activityLogger,
    logger,
    workspaceManager,   // Add
    sessionTracker      // Add
  } = dependencies;
```

Enhance logout endpoint (replace lines 115-138):
```javascript
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
    }
  }

  // Cleanup in-memory sessions
  if (sessionTracker && sessionId) {
    sessionTracker.cleanupSessionById(sessionId);
  }

  req.session.destroy((err) => {
    if (err) {
      if (logger) logger.error('Logout error:', err);
      return res.status(500).json({ success: false, error: 'Logout failed' });
    }
    if (logger) logger.info(`User logged out: ${username}`);
    res.json({ success: true, message: 'Logged out successfully', workspaceDeleted: deleteWorkspace });
  });
});
```

#### 2.2 `/src/app.js`

Pass additional dependencies to auth routes (update the createAuthRoutes call):
```javascript
app.use('/', createAuthRoutes({
  authService: services.authService,
  activityLogger,
  logger,
  workspaceManager,    // Add
  sessionTracker       // Add (import from services)
}));
```

---

### Phase 3: Implement Scheduled Cleanup Service

**Files to create/modify:**

#### 3.1 Create `/src/services/CleanupService.js` (NEW FILE)

```javascript
/**
 * CleanupService - Scheduled cleanup of abandoned workspaces
 */
const fs = require('fs');
const path = require('path');

class CleanupService {
  constructor(dependencies) {
    this.workspaceManager = dependencies.workspaceManager;
    this.sessionTracker = dependencies.sessionTracker;
    this.activityLogger = dependencies.activityLogger;
    this.logger = dependencies.logger;

    this.sessionsDir = './sessions';
    this.cleanupIntervalMs = 15 * 60 * 1000; // Run every 15 minutes
    this.gracePeriodMs = 60 * 60 * 1000;     // 1 hour grace period
    this.intervalId = null;
  }

  start() {
    if (this.intervalId) return;
    this.logger?.info('[CleanupService] Starting (interval: 15min, grace: 1hr)');
    this.runCleanup(); // Run immediately
    this.intervalId = setInterval(() => this.runCleanup(), this.cleanupIntervalMs);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      this.logger?.info('[CleanupService] Stopped');
    }
  }

  getActiveSessionIds() {
    const activeSessionIds = new Set();
    if (!fs.existsSync(this.sessionsDir)) return activeSessionIds;

    for (const file of fs.readdirSync(this.sessionsDir)) {
      if (file.endsWith('.json')) {
        activeSessionIds.add(file.replace('.json', ''));
      }
    }
    return activeSessionIds;
  }

  isSessionStale(sessionId) {
    const sessionFile = path.join(this.sessionsDir, `${sessionId}.json`);
    if (!fs.existsSync(sessionFile)) return true;

    try {
      const stats = fs.statSync(sessionFile);
      return (Date.now() - stats.mtime.getTime()) > this.gracePeriodMs;
    } catch {
      return false;
    }
  }

  runCleanup() {
    try {
      const activeSessionIds = this.getActiveSessionIds();
      const workspacesDir = this.workspaceManager.workspacesBaseDir;

      if (!fs.existsSync(workspacesDir)) return;

      let cleanedCount = 0;
      for (const workspaceId of fs.readdirSync(workspacesDir)) {
        const workspacePath = path.join(workspacesDir, workspaceId);
        if (!fs.statSync(workspacePath).isDirectory()) continue;

        // Check if session exists and is active
        const hasActiveSession = activeSessionIds.has(workspaceId);

        if (!hasActiveSession || this.isSessionStale(workspaceId)) {
          // Verify workspace is old enough via metadata
          if (this.shouldDeleteWorkspace(workspaceId)) {
            this.deleteAbandonedWorkspace(workspaceId);
            cleanedCount++;
          }
        }
      }

      if (cleanedCount > 0) {
        this.logger?.info(`[CleanupService] Cleaned ${cleanedCount} abandoned workspaces`);
      }
    } catch (error) {
      this.logger?.error(`[CleanupService] Error: ${error.message}`);
    }
  }

  shouldDeleteWorkspace(sessionId) {
    try {
      const metadata = this.workspaceManager.loadMetadata(sessionId);
      const lastAccessed = new Date(metadata.lastAccessed).getTime();
      return (Date.now() - lastAccessed) > this.gracePeriodMs;
    } catch {
      return !this.getActiveSessionIds().has(sessionId);
    }
  }

  deleteAbandonedWorkspace(sessionId) {
    try {
      if (this.sessionTracker) {
        this.sessionTracker.cleanupSessionById(sessionId);
      }

      const deleted = this.workspaceManager.deleteWorkspace(sessionId);

      if (deleted) {
        this.logger?.info(`[CleanupService] Deleted abandoned workspace: ${sessionId}`);
        this.activityLogger?.logActivity('system', 'workspace_deleted', {
          sessionId,
          reason: 'abandoned'
        });
      }
      return deleted;
    } catch (error) {
      this.logger?.error(`[CleanupService] Failed to delete ${sessionId}: ${error.message}`);
      return false;
    }
  }
}

module.exports = CleanupService;
```

#### 3.2 Modify `/server.js`

Add CleanupService initialization (after line 101):
```javascript
const CleanupService = require('./src/services/CleanupService');

const cleanupService = new CleanupService({
  workspaceManager,
  sessionTracker,
  activityLogger,
  logger
});

// Start cleanup scheduler
cleanupService.start();
```

Update graceful shutdown handlers (lines 156-170):
```javascript
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  cleanupService.stop();  // Add this
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully...');
  cleanupService.stop();  // Add this
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});
```

#### 3.3 Update `/src/services/index.js`

Export CleanupService:
```javascript
const CleanupService = require('./CleanupService');
module.exports = {
  // ... existing exports
  CleanupService
};
```

---

## Configuration

Add to `/src/config/constants.js`:
```javascript
const CLEANUP_CONFIG = {
  intervalMs: 15 * 60 * 1000,    // Run cleanup every 15 minutes
  gracePeriodMs: 60 * 60 * 1000, // 1 hour before considering abandoned
  enableOnStartup: true
};
```

---

## Edge Cases Handled

1. **Active training during logout** - SessionTracker cleanup stops in-memory tracking; Python processes may continue but results won't persist
2. **Concurrent cleanup and user request** - Workspace deletion is atomic; new requests create fresh workspace
3. **Orphaned workspaces** - Cleanup based on metadata.lastAccessed timestamp
4. **Multiple browser tabs** - Logout in one tab deletes workspace; other tabs redirect to login on next request
5. **Session file encryption** - Use file mtime as proxy for activity (not session content)

---

## Files Summary

| File | Action |
|------|--------|
| `/public/workspace/index.html` | Add logout button |
| `/public/workspace/css/workspace.css` | Add logout button styles |
| `/public/workspace/js/workspace.js` | Add logout handler with confirmation |
| `/public/workspace/js/core/WorkspaceAPI.js` | Update logout method |
| `/src/routes/auth.routes.js` | Enhance logout with workspace deletion |
| `/src/app.js` | Pass additional dependencies to auth routes |
| `/src/services/CleanupService.js` | **NEW** - Scheduled cleanup service |
| `/src/services/index.js` | Export CleanupService |
| `/server.js` | Initialize and manage CleanupService lifecycle |
| `/src/config/constants.js` | Add cleanup configuration |

---

## Testing Checklist

- [ ] Logout button visible in workspace sidebar
- [ ] Confirmation dialog shows file count and size
- [ ] Workspace files deleted on confirmed logout
- [ ] User redirected to welcome page after logout
- [ ] Cleanup job runs every 15 minutes
- [ ] Workspaces inactive for >1 hour are cleaned up
- [ ] Activity log shows workspace_deleted events
- [ ] Graceful shutdown stops cleanup scheduler
- [ ] No errors when workspace doesn't exist
