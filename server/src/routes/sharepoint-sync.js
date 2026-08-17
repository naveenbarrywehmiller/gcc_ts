/**
 * sharepoint-sync.js — Admin-only endpoint to trigger bulk SQLite → SharePoint sync
 *
 * POST /api/sharepoint-sync/full     — Sync all approved timesheets
 * POST /api/sharepoint-sync/week     — Sync a specific week
 * GET  /api/sharepoint-sync/status   — Get sync status and config check
 */

const express = require('express');
const db = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const sp = require('../services/sharepoint');
const config = require('../config/env');

const router = express.Router();

// GET /api/sharepoint-sync/status — Check configuration and connectivity
router.get('/status', authenticate, authorize('admin'), async (req, res) => {
  const status = {
    enabled: config.enableSharepointSync,
    siteUrl: config.sharepointSiteUrl || '(not configured)',
    hasClientId: !!config.sharepointClientId,
    hasClientSecret: !!config.sharepointClientSecret,
    hasTenantId: !!config.entraTenantId,
    canConnect: false,
    error: null,
  };

  if (config.enableSharepointSync) {
    try {
      await sp.getAccessToken();
      status.canConnect = true;
    } catch (err) {
      status.error = err.message;
    }
  }

  res.json(status);
});

// POST /api/sharepoint-sync/week — Sync all entries for a specific week
router.post('/week', authenticate, authorize('admin'), async (req, res) => {
  if (!config.enableSharepointSync) {
    return res.status(400).json({ error: 'SharePoint sync is disabled. Set ENABLE_SHAREPOINT_SYNC=true in .env' });
  }

  const { week, year } = req.body;
  if (!week || !year) {
    return res.status(400).json({ error: 'week and year are required' });
  }

  const { getWeekDateRange } = require('../utils/dateUtils');
  const { startDate, endDate } = getWeekDateRange(parseInt(week), parseInt(year));

  const entries = db.prepare(`
    SELECT t.*, 
           u.email as user_email, u.name as user_name,
           p.project_code, tk.task_category
    FROM timesheets t
    JOIN users u ON t.user_id = u.id
    LEFT JOIN projects p ON t.project_id = p.id
    LEFT JOIN tasks tk ON t.task_id = tk.id
    WHERE t.work_date BETWEEN ? AND ?
    AND u.name != '[Deleted User]'
  `).all(startDate, endDate);

  let synced = 0;
  let failed = 0;

  for (const entry of entries) {
    try {
      await sp.syncTimesheetEntry(entry);
      synced++;
    } catch (err) {
      console.error(`[SharePoint sync] Failed entry ${entry.id}:`, err.message);
      failed++;
    }
  }

  db.prepare('INSERT INTO audit_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)').run(
    req.user.id,
    'SHAREPOINT_SYNC_WEEK',
    `Synced Week ${week}/${year} to SharePoint: ${synced} ok, ${failed} failed`,
    req.ip
  );

  res.json({ synced, failed, total: entries.length, week, year, period: { startDate, endDate } });
});

// POST /api/sharepoint-sync/full — Sync all approved timesheets (use with caution — can be slow)
router.post('/full', authenticate, authorize('admin'), async (req, res) => {
  if (!config.enableSharepointSync) {
    return res.status(400).json({ error: 'SharePoint sync is disabled. Set ENABLE_SHAREPOINT_SYNC=true in .env' });
  }

  const { status: filterStatus, limit = 1000 } = req.body;

  let query = `
    SELECT t.*, 
           u.email as user_email, u.name as user_name,
           p.project_code, tk.task_category
    FROM timesheets t
    JOIN users u ON t.user_id = u.id
    LEFT JOIN projects p ON t.project_id = p.id
    LEFT JOIN tasks tk ON t.task_id = tk.id
    WHERE u.name != '[Deleted User]'
  `;
  const params = [];

  if (filterStatus) {
    query += ' AND t.status = ?';
    params.push(filterStatus);
  }

  query += ` ORDER BY t.work_date DESC LIMIT ${parseInt(limit)}`;
  const entries = db.prepare(query).all(...params);

  // Return immediately — sync runs in background
  res.json({ message: `Starting background sync of ${entries.length} entries`, total: entries.length });

  // Run sync async after response is sent
  let synced = 0, failed = 0;
  for (const entry of entries) {
    try {
      await sp.syncTimesheetEntry(entry);
      synced++;
    } catch (err) {
      console.error(`[SharePoint full sync] Failed entry ${entry.id}:`, err.message);
      failed++;
    }
    // Small delay to avoid hammering SharePoint
    if (synced % 50 === 0) await new Promise(r => setTimeout(r, 500));
  }

  db.prepare('INSERT INTO audit_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)').run(
    req.user.id,
    'SHAREPOINT_SYNC_FULL',
    `Full SharePoint sync complete: ${synced} ok, ${failed} failed (of ${entries.length} total)`,
    req.ip
  );
  console.log(`[SharePoint full sync] Complete: ${synced} ok, ${failed} failed`);
});

module.exports = router;
