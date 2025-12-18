/**
 * Error Middleware
 *
 * Global error handling middleware for Express.
 */

const multer = require('multer');

/**
 * Global error handler middleware
 * Should be applied last in the middleware chain
 * @param {Error} error - Error object
 * @param {object} req - Express request
 * @param {object} res - Express response
 * @param {function} next - Next middleware
 */
function globalErrorHandler(error, req, res, next) {
  // Handle Multer errors
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large (max 200MB)' });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ error: 'Too many files' });
    }
    if (error.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({ error: 'Unexpected file field' });
    }
    return res.status(400).json({ error: error.message });
  }

  // Handle validation errors
  if (error.name === 'ValidationError') {
    return res.status(400).json({ error: error.message });
  }

  // Handle JSON parsing errors
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON in request body' });
  }

  // Log unexpected errors
  if (process.env.DEBUG === 'true') {
    console.error('[ERROR]', error);
  }

  // Default error response
  res.status(500).json({ error: error.message || 'Internal server error' });
}

/**
 * Not found handler middleware
 * Should be applied after all routes
 * @param {object} req - Express request
 * @param {object} res - Express response
 */
function notFoundHandler(req, res) {
  res.status(404).json({ error: 'Not found' });
}

/**
 * Async route wrapper to catch errors in async route handlers
 * @param {function} fn - Async route handler
 * @returns {function} Wrapped handler that catches errors
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = {
  globalErrorHandler,
  notFoundHandler,
  asyncHandler
};
