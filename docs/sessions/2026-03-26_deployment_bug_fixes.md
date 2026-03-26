# Deployment & Legacy Cleanup Bug Fixes

**Date:** 2026-03-26
**Phase:** Phase 5 - Maintenance
**Duration:** ~1 hour
**Status:** Complete
**Complexity:** Simple

---

## Goals

**Primary Objectives:**
- [x] Fix Telegram bot not sending notifications on live server
- [x] Fix activity logs not displaying on admin page
- [x] Remove legacy /login page and fix auth redirects

---

## Summary

**Accomplished:**
- Fixed 3 open bugs, all related to deployment configuration or legacy code

**Key Findings:**
- Telegram bot issue: `.env` is gitignored, so `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` were missing on the deployed server
- Activity logs issue: Admin route read from hardcoded relative path (`__dirname/../../logs/activity.log`) while the logger wrote to `DATA_DIR/logs/activity.log` on the external SSD. Logs were being written correctly since Feb 16 but read from the wrong location
- Login page issue: Legacy `login.html` from classic version was still served; auth middleware and frontend JS redirected to `/login` instead of `/` (welcome page with embedded auth)

---

## Detailed Log

### Task 1: Telegram Bot Notifications (prio 5)

**Problem:**
Telegram bot did not send notifications when new users registered on the live server. Worked locally.

**Investigation:**
- Checked TelegramService wiring: correctly instantiated in server.js, passed through app.js to auth.routes.js, called after successful registration
- Checked server pm2 logs: no `[TelegramService]` output at all initially
- Realized `.env` is gitignored — env vars were never deployed

**Solution:**
No code changes. Added `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` to the server's `.env` file and restarted pm2.

**Result:**
`[TelegramService] Notifications enabled` confirmed in pm2 logs.

---

### Task 2: Activity Logs Not Displaying (prio 5)

**Problem:**
Admin dashboard showed no activity logs after Feb 16, 2026. The app had been actively used since then.

**Investigation:**
- `activityLogger.js` uses `initialize(dataDir)` which sets log path to `DATA_DIR/logs/activity.log`
- On the server, `DATA_DIR=/mnt/volume/biomed_data` (external 2TB SSD)
- Logger correctly wrote to `/mnt/volume/biomed_data/logs/activity.log`
- Admin route in `admin.routes.js` used hardcoded `path.join(__dirname, '../../logs/activity.log')` pointing to `/var/www/biomed_workspace/logs/activity.log`
- Two separate log files existed; admin page read the stale one

**Solution:**
- Added `getLogFilePath()` method to `activityLogger.js`
- Changed admin route to use `activityLogger.getLogFilePath()` instead of hardcoded path

**Result:**
Admin page now reads from the correct location. All logs since Feb 16 are visible again.

**Files Changed:**
- `activityLogger.js` - Added `getLogFilePath()` export
- `src/routes/admin.routes.js` - Use `activityLogger.getLogFilePath()` instead of hardcoded path

---

### Task 3: Legacy /login Page Removal (prio 3)

**Problem:**
Old standalone `login.html` from classic version still existed. On session expiry, users were redirected to `/login` (legacy page) instead of `/` (welcome page with embedded login form).

**Solution:**
- Deleted `public/login.html` and `public/js/login.js`
- Changed GET `/login` route to redirect to `/`
- Updated all `window.location.href = '/login'` to `'/'` in: auth middleware (2), workspace.js (2), admin.js (3), register.js (1), app.js (3)
- Updated `register.html` link from `/login` to `/`
- Preserved `POST /login` API endpoint (used by welcome page form)

**Result:**
All auth flows now route through the welcome page. Legacy login page no longer accessible. Bookmarks to `/login` redirect to `/`.

**Files Changed:**
- `src/middleware/auth.middleware.js` - 2 redirects changed
- `src/routes/static.routes.js` - GET /login now redirects to /
- `public/workspace/js/workspace.js` - 2 redirects changed
- `public/js/admin.js` - 3 redirects changed
- `public/js/register.js` - 1 redirect changed
- `public/js/app.js` - 3 redirects changed
- `public/register.html` - 1 link changed
- `public/login.html` - Deleted
- `public/js/login.js` - Deleted

---

## Code Changes Summary

### Modified Files (4 changes)
- `activityLogger.js` - Added getLogFilePath() method
- `src/routes/admin.routes.js` - Use dynamic log path from activityLogger
- `src/middleware/auth.middleware.js` - Redirect to / instead of /login
- `src/routes/static.routes.js` - GET /login redirects to /
- `public/workspace/js/workspace.js` - Auth redirects to /
- `public/js/admin.js` - Auth redirects to /
- `public/js/register.js` - Post-register redirect to /
- `public/js/app.js` - Auth redirects to /
- `public/register.html` - Login link to /

### Deleted Files (-2)
- `public/login.html` - Legacy standalone login page
- `public/js/login.js` - Legacy login page script

---

## Testing Performed

**Manual Testing:**
- Telegram: Confirmed `[TelegramService] Notifications enabled` in server logs
- Activity logs: Verified locally that admin page loads logs correctly
- Login redirect: Verified unauthenticated access to /workspace redirects to /
- Login redirect: Verified /login redirects to /
- Login flow: Verified login via welcome page still works

---

## Issues Resolved

- **Telegram bot not working** (prio 5) - Server .env missing tokens
- **Activity logs not displaying** (prio 5) - Hardcoded path vs DATA_DIR mismatch
- **Old /login page still exists** (prio 3) - Legacy page removed, redirects fixed

---

## Next Steps

**Remaining Open Issues:**
1. [ ] Update user guides for annotation & segmentation modules (direction-aware segmentation) - prio 1 (5 if deploying)

---

## Metrics

| Metric | Value |
|--------|-------|
| Files Changed | 11 files |
| Commits | 2 |
| Issues Closed | 3 |

---

**Navigation:**
← [Session Index](INDEX.md) | [Documentation Index](../INDEX.md) →

---

**Session Type:** Bug Fix
