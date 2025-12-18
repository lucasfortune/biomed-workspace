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
 * @returns {function} Express session middleware
 */
function createSessionMiddleware(env) {
  if (!env.SESSION_SECRET) {
    throw new Error('SESSION_SECRET is required for session middleware');
  }

  return session({
    store: new FileStore({
      path: './sessions',
      ttl: SESSION_CONFIG.ttl,
      retries: 0,
      secret: env.SESSION_SECRET
    }),
    secret: env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: {
      secure: false, // Set to true in production with HTTPS
      maxAge: SESSION_CONFIG.cookieMaxAge
    }
  });
}

/**
 * Apply session middleware to Express app
 * @param {object} app - Express application instance
 * @param {object} env - Environment configuration
 * @returns {function} The session middleware that was applied
 */
function applySessionMiddleware(app, env) {
  const sessionMiddleware = createSessionMiddleware(env);
  app.use(sessionMiddleware);
  return sessionMiddleware;
}

module.exports = {
  createSessionMiddleware,
  applySessionMiddleware
};
