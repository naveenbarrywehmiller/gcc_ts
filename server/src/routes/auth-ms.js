/**
 * auth-ms.js — Microsoft Entra ID Authentication Route
 *
 * This route handles the validation of MSAL ID tokens and bridges
 * the Microsoft identity into the local SQLite user database, issuing
 * a standard local JWT session cookie.
 */

const express = require('express');
const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');
const db = require('../config/db');
const config = require('../config/env');

const router = express.Router();

// JWKS Client to fetch Microsoft public keys
const client = jwksClient({
  jwksUri: `https://login.microsoftonline.com/${config.entraTenantId || 'common'}/discovery/v2.0/keys`
});

function getKey(header, callback) {
  client.getSigningKey(header.kid, function(err, key) {
    if (err) {
      console.error('[MSAL] Failed to fetch signing key:', err.message);
      return callback(err);
    }
    const signingKey = key.publicKey || key.rsaPublicKey;
    callback(null, signingKey);
  });
}

// GET /api/auth/ms-config — Provide MSAL config to frontend
router.get('/ms-config', (req, res) => {
  res.json({
    enabled: config.enableMsalAuth,
    clientId: config.entraClientId,
    tenantId: config.entraTenantId
  });
});

// POST /api/auth/ms-callback — Validate MSAL token and create local session
router.post('/ms-callback', (req, res) => {
  if (!config.enableMsalAuth) {
    return res.status(400).json({ error: 'MSAL authentication is disabled' });
  }

  const { idToken } = req.body;
  if (!idToken) {
    return res.status(400).json({ error: 'idToken is required' });
  }

  // Verify the ID token using Microsoft's public keys
  jwt.verify(idToken, getKey, {
    audience: config.entraClientId,
    issuer: `https://login.microsoftonline.com/${config.entraTenantId}/v2.0`
  }, (err, decoded) => {
    if (err) {
      console.error('[MSAL] Token validation failed:', err.message);
      return res.status(401).json({ error: 'Invalid token' });
    }

    const { preferred_username, name, email, roles } = decoded;
    const userEmail = (preferred_username || email || '').toLowerCase();

    if (!userEmail) {
      return res.status(400).json({ error: 'Email claim missing from token' });
    }

    // Find or create user in local SQLite DB
    let user = db.prepare('SELECT * FROM users WHERE email = ?').get(userEmail);

    if (!user) {
      // Auto-provision user
      // Default to employee role, can map from Entra 'roles' claim if configured
      const role = (roles && roles.includes('Admin')) ? 'admin' : 
                   (roles && roles.includes('Manager')) ? 'manager' : 'employee';

      const result = db.prepare(`
        INSERT INTO users (name, email, password_hash, role, active, created_at, updated_at)
        VALUES (?, ?, 'MSAL_SSO_USER', ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).run(name, userEmail, role);

      user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
      console.log(`[MSAL] Auto-provisioned new user: ${userEmail}`);
    } else if (!user.active) {
      return res.status(403).json({ error: 'Account is deactivated' });
    }

    // Update last seen
    db.prepare('UPDATE users SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);

    // Issue local session tokens
    const accessToken = jwt.sign(
      { id: user.id, role: user.role },
      config.jwtSecret,
      { expiresIn: config.jwtExpiresIn }
    );

    const refreshToken = jwt.sign(
      { id: user.id, role: user.role, type: 'refresh' },
      config.jwtRefreshSecret,
      { expiresIn: config.jwtRefreshExpiresIn }
    );

    // Set HttpOnly cookies
    res.cookie('token', accessToken, {
      httpOnly: true,
      secure: config.nodeEnv === 'production',
      sameSite: 'strict',
      maxAge: 15 * 60 * 1000 // 15 mins
    });

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: config.nodeEnv === 'production',
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    });

    const userProfile = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      division: user.division,
      core: user.core,
      team_type: user.team_type
    };

    res.json({ user: userProfile });
  });
});

module.exports = router;
