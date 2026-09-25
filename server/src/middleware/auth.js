const jwt = require('jsonwebtoken');
const config = require('../config/env');
const db = require('../config/db');

/**
 * Authenticate middleware.
 *
 * Token resolution order:
 *  1. HttpOnly cookie `token`  (primary — browser clients)
 *  2. Authorization: Bearer <token> header (fallback — API clients / testing)
 */
function authenticate(req, res, next) {
  // 1. Try cookie first (set by /api/auth/login)
  let token = req.cookies?.token;

  // 2. Fall back to Authorization header
  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }
  }

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    const user = db.prepare(`
      SELECT u.id, u.name, u.email, u.role, u.division, u.core, u.team_type, u.active,
             u.division_id, u.department_id, u.supporting_category_id, u.employee_id,
             d.name as division_name,
             dept.name as department_name,
             sc.name as supporting_category_name
      FROM users u
      LEFT JOIN divisions d ON u.division_id = d.id
      LEFT JOIN departments dept ON u.department_id = dept.id
      LEFT JOIN supporting_categories sc ON u.supporting_category_id = sc.id
      WHERE u.id = ? AND u.active = 1
    `).get(decoded.userId);

    if (!user) {
      return res.status(401).json({ error: 'User not found or inactive' });
    }

    req.user = user;

    // Track live activity — update last_seen_at (throttled: max once per 60s per user)
    const now = Date.now();
    if (!req.user._lastSeenUpdate || now - req.user._lastSeenUpdate > 60000) {
      req.user._lastSeenUpdate = now;
      db.prepare('UPDATE users SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);
    }

    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

module.exports = { authenticate, authorize };
