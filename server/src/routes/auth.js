const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const config = require('../config/env');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

/**
 * Shared cookie options. The token is HttpOnly (no JS access),
 * Secure in production (HTTPS only), and SameSite=Strict to
 * prevent cross-site request forgery.
 */
function getCookieOptions(maxAgeMs = 15 * 60 * 1000) {
  return {
    httpOnly: true,
    secure: config.nodeEnv === 'production',
    sameSite: 'strict',
    maxAge: maxAgeMs,
    path: '/',
  };
}

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const user = db.prepare(`
    SELECT u.id, u.name, u.email, u.password_hash, u.role, u.division, u.core, u.team_type, u.active,
           u.division_id, u.department_id, u.supporting_category_id,
           d.name as division_name,
           dept.name as department_name,
           sc.name as supporting_category_name
    FROM users u
    LEFT JOIN divisions d ON u.division_id = d.id
    LEFT JOIN departments dept ON u.department_id = dept.id
    LEFT JOIN supporting_categories sc ON u.supporting_category_id = sc.id
    WHERE u.email = ? AND u.active = 1
  `).get(email.toLowerCase().trim());
  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const validPassword = bcrypt.compareSync(password, user.password_hash);
  if (!validPassword) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const token = jwt.sign({ userId: user.id, role: user.role }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });
  
  const refreshToken = jwt.sign({ userId: user.id }, config.jwtRefreshSecret, {
    expiresIn: config.jwtRefreshExpiresIn,
  });

  // Set JWT as an HttpOnly cookie
  res.cookie('token', token, getCookieOptions(15 * 60 * 1000)); // 15 minutes
  res.cookie('refreshToken', refreshToken, getCookieOptions(30 * 24 * 60 * 60 * 1000)); // 30 days

  // Audit log
  db.prepare('INSERT INTO audit_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)').run(
    user.id, 'LOGIN', 'User logged in', req.ip
  );

  // Return user profile only (token is in the cookie, not the body)
  res.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      division: user.division,
      core: user.core,
      team_type: user.team_type,
      division_id: user.division_id,
      department_id: user.department_id,
      supporting_category_id: user.supporting_category_id,
      division_name: user.division_name,
      department_name: user.department_name,
      supporting_category_name: user.supporting_category_name
    },
  });
});

// POST /api/auth/refresh — uses refresh token to get a new access token
router.post('/refresh', (req, res) => {
  const refreshToken = req.cookies?.refreshToken;
  
  if (!refreshToken) {
    return res.status(401).json({ error: 'Refresh token required' });
  }

  try {
    const decoded = jwt.verify(refreshToken, config.jwtRefreshSecret);
    const user = db.prepare('SELECT id, role, active FROM users WHERE id = ?').get(decoded.userId);
    
    if (!user || user.active !== 1) {
      return res.status(401).json({ error: 'User is inactive or deleted' });
    }

    const token = jwt.sign({ userId: user.id, role: user.role }, config.jwtSecret, {
      expiresIn: config.jwtExpiresIn,
    });

    res.cookie('token', token, getCookieOptions(15 * 60 * 1000)); // 15 minutes
    res.json({ message: 'Token refreshed' });
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired refresh token' });
  }
});

// POST /api/auth/logout — clears the session cookies
router.post('/logout', (req, res) => {
  res.clearCookie('token', {
    httpOnly: true,
    secure: config.nodeEnv === 'production',
    sameSite: 'strict',
    path: '/',
  });
  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: config.nodeEnv === 'production',
    sameSite: 'strict',
    path: '/',
  });

  if (req.headers.authorization) {
    // Optionally log the logout if the user is known via header (fallback)
    try {
      const jwt = require('jsonwebtoken');
      const decoded = jwt.verify(req.headers.authorization.split(' ')[1], config.jwtSecret);
      db.prepare('INSERT INTO audit_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)').run(
        decoded.userId, 'LOGOUT', 'User logged out', req.ip
      );
    } catch {}
  }

  res.json({ message: 'Logged out successfully' });
});

// GET /api/auth/me
router.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

// POST /api/auth/change-password
router.post('/change-password', authenticate, (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current and new passwords are required' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters' });
  }

  const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(currentPassword, user.password_hash)) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }

  const hash = bcrypt.hashSync(newPassword, 12);
  db.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(hash, req.user.id);

  db.prepare('INSERT INTO audit_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)').run(
    req.user.id, 'PASSWORD_CHANGE', 'User changed password', req.ip
  );

  res.json({ message: 'Password updated successfully' });
});

module.exports = router;
