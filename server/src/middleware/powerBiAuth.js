'use strict';

const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const config = require('../config/env');
const db = require('../config/db');

/**
 * Dedicated rate limiter for Power BI reporting endpoints.
 * Provides ample capacity for Power BI scheduled background refreshes and dashboard queries
 * while preventing abuse or denial-of-service attempts.
 */
const powerBiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // 1000 requests per 15 min window per client
  message: { error: 'Too many Power BI requests from this client. Please retry later.' },
  keyGenerator: (req) => {
    // Key by reporting API key or IP address
    return req.powerBiAuthIdentity || req.ip || 'powerbi-client';
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Middleware: Enforce strictly READ-ONLY access.
 * Power BI endpoints only support GET (and standard HEAD / OPTIONS).
 * Rejects POST, PUT, PATCH, DELETE with HTTP 405 Method Not Allowed.
 */
function enforceReadOnly(req, res, next) {
  const allowedMethods = ['GET', 'HEAD', 'OPTIONS'];
  if (!allowedMethods.includes(req.method.toUpperCase())) {
    res.set('Allow', 'GET, HEAD, OPTIONS');
    return res.status(405).json({
      error: `Method Not Allowed. Power BI reporting API is strictly READ-ONLY. Only GET operations are permitted. Rejected method: ${req.method}`,
    });
  }
  next();
}

/**
 * Middleware: Power BI Request Logger.
 * Logs reporting activity without exposing secrets, passwords, or tokens.
 */
function powerBiLogger(req, res, next) {
  const startTime = Date.now();
  const timestamp = new Date().toISOString();

  // Mask sensitive tokens from URL query string
  const sanitizedUrl = req.originalUrl.replace(/([?&](?:apiKey|key)=)[^&]*/gi, '$1[REDACTED]');

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const identity = req.powerBiAuthIdentity || 'Anonymous/Unauthenticated';
    const clientIp = req.ip || req.connection?.remoteAddress || 'unknown';

    console.log(
      `[PowerBI API] ${timestamp} | ${req.method} ${sanitizedUrl} | ${res.statusCode} | ${duration}ms | Identity: ${identity} | IP: ${clientIp}`
    );
  });

  next();
}

/**
 * Middleware: Power BI Authentication & Authorization.
 *
 * Checks credentials via:
 * 1. X-API-Key: <token>
 * 2. Authorization: Bearer <token>
 * 3. Authorization: Basic <base64(username:token)>
 * 4. Query parameter: ?apiKey=<token> or ?key=<token>
 * 5. Admin JWT fallback (Bearer or HttpOnly cookie)
 *
 * Dedicated reporting API key only grants access to /api/powerbi/*
 * and cannot be used to perform write operations or access other endpoints.
 */
function authenticatePowerBi(req, res, next) {
  // Check if Power BI API is enabled
  if (!config.powerBiApiEnabled) {
    return res.status(503).json({ error: 'Power BI reporting API is currently disabled' });
  }

  const configuredKey = config.powerBiApiKey;
  let clientKey = null;

  // 1. Check X-API-Key header
  if (req.headers['x-api-key']) {
    clientKey = req.headers['x-api-key'].trim();
  }

  // 2. Check Authorization header
  if (!clientKey && req.headers.authorization) {
    const authHeader = req.headers.authorization.trim();
    if (authHeader.startsWith('Bearer ')) {
      clientKey = authHeader.substring(7).trim();
    } else if (authHeader.startsWith('Basic ')) {
      // Decode basic auth credentials
      try {
        const decoded = Buffer.from(authHeader.substring(6).trim(), 'base64').toString('utf8');
        const colonIdx = decoded.indexOf(':');
        if (colonIdx !== -1) {
          // Password field contains the reporting API key (or username if powerbi:<key>)
          const user = decoded.substring(0, colonIdx);
          const pass = decoded.substring(colonIdx + 1);
          clientKey = pass || user;
        } else {
          clientKey = decoded;
        }
      } catch (e) {
        // Invalid base64, leave clientKey null
      }
    }
  }

  // 3. Check query string (?apiKey=... or ?key=...)
  if (!clientKey && req.query.apiKey) {
    clientKey = String(req.query.apiKey).trim();
  } else if (!clientKey && req.query.key) {
    clientKey = String(req.query.key).trim();
  }

  // Verify against configured dedicated API key
  if (configuredKey && configuredKey.length > 0 && clientKey === configuredKey) {
    req.powerBiAuthIdentity = 'PowerBI-Reporting-Token';
    req.powerBiIsDedicatedToken = true;
    return next();
  }

  // 4. Admin JWT fallback (allows administrators to browse /api/powerbi/* using their JWT session)
  let token = req.cookies?.token;
  if (!token && clientKey) {
    token = clientKey; // Client key might be a JWT token from an admin client
  }

  if (token) {
    try {
      const decoded = jwt.verify(token, config.jwtSecret);
      if (decoded && decoded.userId) {
        const user = db.prepare('SELECT id, name, email, role, active FROM users WHERE id = ? AND active = 1').get(decoded.userId);
        if (user) {
          if (user.role === 'admin') {
            req.powerBiAuthIdentity = `Admin:${user.email}`;
            req.user = user;
            return next();
          } else {
            return res.status(403).json({
              error: 'Insufficient permissions. Power BI reporting requires admin privileges or a dedicated reporting API key.',
            });
          }
        }
      }
    } catch (jwtErr) {
      // Not a valid JWT token
    }
  }

  // If reporting API key is not configured on the server
  if (!configuredKey || configuredKey === '') {
    return res.status(503).json({
      error: 'Power BI reporting is not configured. Please set POWERBI_API_KEY on the server.',
    });
  }

  // If credentials were provided but incorrect
  if (clientKey) {
    return res.status(401).json({ error: 'Invalid Power BI reporting API key or credentials.' });
  }

  // If no credentials were provided
  return res.status(401).json({
    error: 'Authentication required. Provide a valid Power BI reporting API key via X-API-Key header, Authorization header, or apiKey query parameter.',
  });
}

module.exports = {
  enforceReadOnly,
  authenticatePowerBi,
  powerBiLogger,
  powerBiRateLimiter,
};
