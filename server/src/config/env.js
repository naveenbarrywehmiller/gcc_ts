const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

module.exports = {
  // ── Core server ────────────────────────────────────────────
  port: process.env.PORT || 3001,
  nodeEnv: process.env.NODE_ENV || 'development',

  // ── JWT (local authentication) ──────────────────────────────
  jwtSecret: process.env.JWT_SECRET || 'fallback-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '15m',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'fallback-refresh-secret-change-me',
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',

  // ── SQLite database ─────────────────────────────────────────
  dbPath: path.resolve(__dirname, '..', process.env.DB_PATH || './data/timesheet.db'),

  // ── CORS & Rate Limiting ────────────────────────────────────
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000,
  rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX) || 2000,

  // ── Microsoft Entra ID / MSAL ───────────────────────────────
  entraTenantId: process.env.ENTRA_TENANT_ID || '',
  entraClientId: process.env.ENTRA_CLIENT_ID || '',
  entraClientSecret: process.env.ENTRA_CLIENT_SECRET || '',

  // ── SharePoint ──────────────────────────────────────────────
  sharepointSiteUrl: (process.env.SHAREPOINT_SITE_URL || '').replace(/\/$/, ''), // strip trailing slash
  sharepointClientId: process.env.SHAREPOINT_CLIENT_ID || '',
  sharepointClientSecret: process.env.SHAREPOINT_CLIENT_SECRET || '',

  // ── Power Automate ──────────────────────────────────────────
  powerAutomateWebhookUrl: process.env.POWER_AUTOMATE_WEBHOOK_URL || '',
  powerAutomateCallbackSecret: process.env.POWER_AUTOMATE_CALLBACK_SECRET || '',

  // ── Application Base URL ────────────────────────────────────
  appBaseUrl: (process.env.APP_BASE_URL || '').replace(/\/$/, ''),

  // ── Power BI ────────────────────────────────────────────────
  powerBiApiKey: process.env.POWERBI_API_KEY || '',
  powerBiApiEnabled: process.env.POWERBI_API_ENABLED !== 'false',
  powerBiApiBasePath: process.env.POWERBI_API_BASE_PATH || '/api/powerbi',
  powerBiMaxRecords: parseInt(process.env.POWERBI_MAX_RECORDS, 10) || 50000,
  powerBiCacheTtl: parseInt(process.env.POWERBI_CACHE_TTL, 10) || 60,

  // ── Feature flags ───────────────────────────────────────────
  enableMsalAuth: process.env.ENABLE_MSAL_AUTH === 'true',
  enableSharepointSync: process.env.ENABLE_SHAREPOINT_SYNC === 'true',
  enablePowerAutomate: process.env.ENABLE_POWER_AUTOMATE === 'true',
};
