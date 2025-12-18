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
  res.status(401).json({ error: 'Authentication required', authenticated: false });
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
  res.status(403).json({ error: 'Admin access required' });
}

module.exports = {
  requireAuth,
  requireApproved,
  requireAdmin
};
