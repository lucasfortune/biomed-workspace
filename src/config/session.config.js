/**
 * Session Configuration
 *
 * Express session configuration with file-based storage.
 */

const session = require('express-session');
const FileStore = require('session-file-store')(session);
const { SESSION_CONFIG } = require('./constants');

/**
 * Create session middleware configuration
 * @param {object} env - Environment variables (SESSION_SECRET)
 * @returns {object} Session middleware configuration object
 */
function createSessionConfig(env) {
  return {
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
  };
}

/**
 * Create and apply session middleware to Express app
 * @param {object} app - Express app instance
 * @param {object} env - Environment variables
 * @returns {function} Session middleware
 */
function configureSession(app, env) {
  const sessionConfig = createSessionConfig(env);
  const sessionMiddleware = session(sessionConfig);
  app.use(sessionMiddleware);
  return sessionMiddleware;
}

module.exports = {
  createSessionConfig,
  configureSession
};
