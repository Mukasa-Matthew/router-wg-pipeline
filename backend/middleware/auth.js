/**
 * Auth middleware - protects routes that require login
 */
function requireAuth(req, res, next) {
  if (req.session && req.session.adminId) {
    return next();
  }
  res.status(401).json({ error: 'Authentication required' });
}

module.exports = { requireAuth };
