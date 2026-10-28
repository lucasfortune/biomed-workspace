/**
 * Session Middleware
 *
 * Express session configuration with file-based storage.
 */

const session = require('express-session');
const FileStore = require('session-file-store')(session);
const { SESSION_CONFIG } = require('../config/constants');

/**
 * Create session middleware with file-based storage
 * @param {object} env - Environment configuration (must include SESSION_SECRET)
 * @param {object} options - Additional options
 * @param {string} options.sessionsDir - Directory for session files (defaults to './sessions')
 * @returns {function} Express session middleware
 */
function createSessionMiddleware(env, options = {}) {
  if (!env.SESSION_SECRET) {
    throw new Error('SESSION_SECRET is required for session middleware');
  }

  const isProduction = process.env.NODE_ENV === 'production';
  const sessionsDir = options.sessionsDir || './sessions';

  // Local mode (ADR-019): every new session gets the same fixed id, so the
  // workspace at workspaces/<id>/ survives lost cookies and other browsers
  const genid = SESSION_CONFIG.fixedSessionId
    ? () => SESSION_CONFIG.fixedSessionId
    : undefined;

  return session({
    ...(genid ? { genid } : {}),
    rolling: SESSION_CONFIG.rolling === true,
    store: new FileStore({
      path: sessionsDir,
      ttl: SESSION_CONFIG.ttl,
      retries: 0,
      secret: env.SESSION_SECRET
    }),
    secret: env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false, // Don't create sessions for unauthenticated users
    cookie: {
      secure: isProduction, // Require HTTPS in production
      httpOnly: true, // Prevent client-side JS access to cookie
      sameSite: 'lax', // Protect against CSRF
      maxAge: SESSION_CONFIG.cookieMaxAge
    }
  });
}

module.exports = {
  createSessionMiddleware
};
