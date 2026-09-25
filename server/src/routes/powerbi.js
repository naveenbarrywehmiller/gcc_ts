'use strict';

/**
 * powerbi.js — Dedicated Read-Only REST API for Power BI Reporting
 *
 * Provides structured, read-only reporting endpoints designed for Power BI consumption:
 *   - GET /api/powerbi/timesheets
 *   - GET /api/powerbi/users
 *   - GET /api/powerbi/divisions
 *   - GET /api/powerbi/departments
 *   - GET /api/powerbi/projects
 *   - GET /api/powerbi/holidays
 *   - GET /api/powerbi/tasks
 *   - GET /api/powerbi/assignments
 *   - GET /api/powerbi/status-summary
 *   - GET /api/powerbi/version
 *   - GET /api/powerbi/export (legacy flat table export)
 *
 * Security:
 *   - Strictly READ-ONLY: All non-GET methods (POST, PUT, PATCH, DELETE) are rejected with HTTP 405.
 *   - Authenticated via dedicated reporting API key (X-API-Key, Bearer token, Basic Auth, or ?apiKey=)
 *     or active Administrator JWT session.
 *   - Never exposes passwords, password hashes, secrets, or internal database tokens.
 *   - Parameterized SQL queries prevent SQL injection.
 */

const express = require('express');
const powerBiService = require('../services/powerBiService');
const {
  enforceReadOnly,
  authenticatePowerBi,
  powerBiLogger,
  powerBiRateLimiter,
} = require('../middleware/powerBiAuth');

const router = express.Router();

// Strict method enforcement: only GET, HEAD, OPTIONS are permitted
router.use(enforceReadOnly);

// Request logging (sanitizing tokens)
router.use(powerBiLogger);

// Rate limiting protection
router.use(powerBiRateLimiter);

// Authentication & authorization middleware
router.use(authenticatePowerBi);

// Helper: validate YYYY-MM-DD date format and calendar validity
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
function isValidDateString(str) {
  if (typeof str !== 'string' || !DATE_REGEX.test(str)) return false;
  const d = new Date(str + 'T00:00:00Z');
  return !isNaN(d.getTime()) && d.toISOString().startsWith(str);
}

const ALLOWED_STATUSES = ['draft', 'submitted', 'approved', 'rejected', 'recalled'];

/**
 * GET /api/powerbi/version
 * Returns API version, compatibility information, and available endpoints.
 */
router.get('/version', (req, res) => {
  try {
    const result = powerBiService.getVersion();
    res.json(result);
  } catch (err) {
    console.error('[PowerBI API] Error fetching version:', err);
    res.status(500).json({ error: 'Failed to retrieve version information' });
  }
});

/**
 * GET /api/powerbi/timesheets
 * Read-only reporting endpoint for timesheet entries with server-side filtering & pagination.
 *
 * Supported query parameters:
 *   - from: YYYY-MM-DD
 *   - to: YYYY-MM-DD
 *   - employeeId: string
 *   - division: string
 *   - department: string
 *   - project: string (code or name)
 *   - status: draft | submitted | approved | rejected | recalled
 *   - page: integer (>= 1)
 *   - limit: integer (1 - 50000)
 */
router.get('/timesheets', (req, res) => {
  try {
    const { from, to, employeeId, division, department, project, status, page, limit } = req.query;

    // Validate 'from' date
    if (from !== undefined) {
      if (!isValidDateString(from)) {
        return res.status(400).json({
          error: "Invalid 'from' date parameter. Format must be valid YYYY-MM-DD (e.g. 2026-01-01).",
        });
      }
    }

    // Validate 'to' date
    if (to !== undefined) {
      if (!isValidDateString(to)) {
        return res.status(400).json({
          error: "Invalid 'to' date parameter. Format must be valid YYYY-MM-DD (e.g. 2026-09-25).",
        });
      }
    }

    // Check date range consistency
    if (from && to && from > to) {
      return res.status(400).json({
        error: "'from' date cannot be after 'to' date.",
      });
    }

    // Validate 'status' filter
    if (status !== undefined) {
      if (!ALLOWED_STATUSES.includes(status.toLowerCase())) {
        return res.status(400).json({
          error: `Invalid 'status' filter: '${status}'. Allowed values are: ${ALLOWED_STATUSES.join(', ')}.`,
        });
      }
    }

    // Validate pagination parameters
    let parsedPage;
    if (page !== undefined) {
      parsedPage = parseInt(page, 10);
      if (isNaN(parsedPage) || parsedPage < 1) {
        return res.status(400).json({ error: "Parameter 'page' must be a positive integer >= 1." });
      }
    }

    let parsedLimit;
    if (limit !== undefined) {
      parsedLimit = parseInt(limit, 10);
      if (isNaN(parsedLimit) || parsedLimit < 1) {
        return res.status(400).json({ error: "Parameter 'limit' must be a positive integer >= 1." });
      }
    }

    const filters = {
      from,
      to,
      employeeId: employeeId ? String(employeeId).trim() : undefined,
      division: division ? String(division).trim() : undefined,
      department: department ? String(department).trim() : undefined,
      project: project ? String(project).trim() : undefined,
      status: status ? status.toLowerCase() : undefined,
    };

    const pagination = {
      page: parsedPage,
      limit: parsedLimit,
    };

    const result = powerBiService.getTimesheets(filters, pagination);
    res.json(result);
  } catch (err) {
    console.error('[PowerBI API] Error fetching timesheets:', err);
    res.status(500).json({ error: 'Failed to retrieve timesheet reporting data' });
  }
});

/**
 * GET /api/powerbi/users
 * Read-only reporting endpoint for employee / user information.
 * Excludes password hashes and secrets.
 *
 * Supported query parameters:
 *   - employeeId: string
 *   - division: string
 *   - department: string
 *   - role: admin | manager | employee
 *   - status: Active | Inactive
 *   - active: 1 | 0
 */
router.get('/users', (req, res) => {
  try {
    const { employeeId, division, department, role, status, active } = req.query;

    const filters = {
      employeeId: employeeId ? String(employeeId).trim() : undefined,
      division: division ? String(division).trim() : undefined,
      department: department ? String(department).trim() : undefined,
      role: role ? String(role).trim() : undefined,
      status: status ? String(status).trim() : undefined,
      active: active !== undefined ? active : undefined,
    };

    const result = powerBiService.getUsers(filters);
    res.json(result);
  } catch (err) {
    console.error('[PowerBI API] Error fetching users:', err);
    res.status(500).json({ error: 'Failed to retrieve user reporting data' });
  }
});

/**
 * GET /api/powerbi/divisions
 * Read-only reference endpoint for divisions.
 */
router.get('/divisions', (req, res) => {
  try {
    const { active } = req.query;
    const filters = {
      active: active !== undefined ? active : undefined,
    };

    const result = powerBiService.getDivisions(filters);
    res.json(result);
  } catch (err) {
    console.error('[PowerBI API] Error fetching divisions:', err);
    res.status(500).json({ error: 'Failed to retrieve division reporting data' });
  }
});

/**
 * GET /api/powerbi/departments
 * Read-only reference endpoint for departments.
 */
router.get('/departments', (req, res) => {
  try {
    const { active } = req.query;
    const filters = {
      active: active !== undefined ? active : undefined,
    };

    const result = powerBiService.getDepartments(filters);
    res.json(result);
  } catch (err) {
    console.error('[PowerBI API] Error fetching departments:', err);
    res.status(500).json({ error: 'Failed to retrieve department reporting data' });
  }
});

/**
 * GET /api/powerbi/projects
 * Read-only reference endpoint for projects.
 */
router.get('/projects', (req, res) => {
  try {
    const { division, active } = req.query;
    const filters = {
      division: division ? String(division).trim() : undefined,
      active: active !== undefined ? active : undefined,
    };

    const result = powerBiService.getProjects(filters);
    res.json(result);
  } catch (err) {
    console.error('[PowerBI API] Error fetching projects:', err);
    res.status(500).json({ error: 'Failed to retrieve project reporting data' });
  }
});

/**
 * GET /api/powerbi/holidays
 * Read-only reference endpoint for holidays.
 */
router.get('/holidays', (req, res) => {
  try {
    const { year, from, to } = req.query;

    if (from !== undefined && !isValidDateString(from)) {
      return res.status(400).json({ error: "Invalid 'from' date parameter. Format must be YYYY-MM-DD." });
    }
    if (to !== undefined && !isValidDateString(to)) {
      return res.status(400).json({ error: "Invalid 'to' date parameter. Format must be YYYY-MM-DD." });
    }

    const filters = {
      year: year ? String(year).trim() : undefined,
      from,
      to,
    };

    const result = powerBiService.getHolidays(filters);
    res.json(result);
  } catch (err) {
    console.error('[PowerBI API] Error fetching holidays:', err);
    res.status(500).json({ error: 'Failed to retrieve holiday reporting data' });
  }
});

/**
 * GET /api/powerbi/tasks
 * Read-only reference endpoint for task categories.
 *
 * Supported query parameters:
 *   - active: 1 | 0
 *   - classification: Billable | Non-Billable
 */
router.get('/tasks', (req, res) => {
  try {
    const { active, classification } = req.query;
    const filters = {
      active: active !== undefined ? active : undefined,
      classification: classification ? String(classification).trim() : undefined,
    };

    const result = powerBiService.getTasks(filters);
    res.json(result);
  } catch (err) {
    console.error('[PowerBI API] Error fetching tasks:', err);
    res.status(500).json({ error: 'Failed to retrieve task reporting data' });
  }
});

/**
 * GET /api/powerbi/assignments
 * Read-only endpoint for admin-employee assignment mapping.
 */
router.get('/assignments', (req, res) => {
  try {
    const result = powerBiService.getAssignments();
    res.json(result);
  } catch (err) {
    console.error('[PowerBI API] Error fetching assignments:', err);
    res.status(500).json({ error: 'Failed to retrieve assignment reporting data' });
  }
});

/**
 * GET /api/powerbi/status-summary
 * Read-only endpoint providing aggregated timesheet status overview.
 *
 * Supported query parameters:
 *   - from: YYYY-MM-DD
 *   - to: YYYY-MM-DD
 *   - division: string
 */
router.get('/status-summary', (req, res) => {
  try {
    const { from, to, division } = req.query;

    if (from !== undefined && !isValidDateString(from)) {
      return res.status(400).json({ error: "Invalid 'from' date parameter. Format must be YYYY-MM-DD." });
    }
    if (to !== undefined && !isValidDateString(to)) {
      return res.status(400).json({ error: "Invalid 'to' date parameter. Format must be YYYY-MM-DD." });
    }

    const filters = {
      from,
      to,
      division: division ? String(division).trim() : undefined,
    };

    const result = powerBiService.getStatusSummary(filters);
    res.json(result);
  } catch (err) {
    console.error('[PowerBI API] Error fetching status summary:', err);
    res.status(500).json({ error: 'Failed to retrieve status summary data' });
  }
});

/**
 * GET /api/powerbi/export
 * Legacy flat star-schema export array for existing Power BI datasets.
 */
router.get('/export', (req, res) => {
  try {
    const data = powerBiService.getLegacyExport();
    res.json(data);
  } catch (err) {
    console.error('[PowerBI API] Error generating legacy export:', err);
    res.status(500).json({ error: 'Failed to generate export' });
  }
});

// Explicit catch-all for unsupported methods on any subroute
router.all('*', (req, res) => {
  res.set('Allow', 'GET, HEAD, OPTIONS');
  res.status(405).json({
    error: 'Method Not Allowed. Power BI reporting API is strictly read-only. Only GET requests are permitted.',
  });
});

module.exports = router;
