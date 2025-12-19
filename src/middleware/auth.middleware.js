/**
 * Authentication Middleware
 *
 * Express middleware functions for authentication and authorization.
 */

/**
 * Basic authentication - allows pending & approved users
 * Use for routes that any authenticated user can access
 */
function requireAuth(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }

  // For API routes, return JSON error
  // Use originalUrl to check the full path (req.path is relative to mount point)
  if (req.originalUrl.startsWith('/api/') || req.xhr || req.headers.accept?.includes('application/json')) {
    return res.status(401).json({ error: 'Authentication required', authenticated: false });
  }

  // For HTML page routes, redirect to login
  res.redirect('/login');
}

/**
 * Requires approved status - full access
 * Use for routes that require account approval (e.g., custom uploads, model imports)
 */
function requireApproved(req, res, next) {
  if (req.session && req.session.user && req.session.user.status === 'active') {
    return next();
  }
  res.status(403).json({ error: 'Account approval required' });
}

/**
 * Admin-only access
 * Use for admin dashboard and user management routes
 */
function requireAdmin(req, res, next) {
  if (req.session && req.session.user && req.session.user.isAdmin) {
    return next();
  }

  // For API routes, return JSON error
  // Use originalUrl to check the full path (req.path is relative to mount point)
  if (req.originalUrl.startsWith('/api/') || req.xhr || req.headers.accept?.includes('application/json')) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  // For HTML page routes, redirect to login if not authenticated, or show forbidden
  if (!req.session || !req.session.user) {
    return res.redirect('/login');
  }

  // User is authenticated but not admin - return 403
  res.status(403).json({ error: 'Admin access required' });
}

module.exports = {
  requireAuth,
  requireApproved,
  requireAdmin
};
