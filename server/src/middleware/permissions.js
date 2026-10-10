const policy = require('../../../shared/accessPolicy.json');
const { authorize } = require('./auth');

function permit(permission) {
  const roles = policy.permissions[permission];
  if (!roles) throw new Error(`Unknown permission: ${permission}`);
  return authorize(...roles);
}

// Activation and deactivation are deletion privileges, even when sent by PUT.
function protectCatalogStatus(req, res, next) {
  if (Object.hasOwn(req.body || {}, 'active') && !policy.permissions.catalogDelete.includes(req.user.role)) {
    return res.status(403).json({ error: 'Only a system admin can activate or deactivate shared settings' });
  }
  next();
}

module.exports = { permit, protectCatalogStatus };
