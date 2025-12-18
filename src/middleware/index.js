/**
 * Middleware Index
 *
 * Re-exports all middleware modules for convenient importing.
 */

const authMiddleware = require('./auth.middleware');
const uploadMiddleware = require('./upload.middleware');
const sessionMiddleware = require('./session.middleware');
const errorMiddleware = require('./error.middleware');

module.exports = {
  // Auth middleware
  ...authMiddleware,

  // Upload middleware
  ...uploadMiddleware,

  // Session middleware
  ...sessionMiddleware,

  // Error middleware
  ...errorMiddleware
};
