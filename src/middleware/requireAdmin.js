module.exports = function requireAdmin(req, res, next) {
  if (!req.session || !req.session.adminId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
};
