const express = require('express');
const db = require('../config/db');
const config = require('../config/env');
const { authenticate, authorize } = require('../middleware/auth');
const { getISOWeekNumber, getWeekDateRange } = require('../utils/dateUtils');
const timesheetRepo = require('../repositories/TimesheetRepository');

const sp = require('../services/sharepoint');
const { canReviewTimesheet, canReceiveTimesheetReview } = require('../utils/timesheetPermissions');

const { serializeDetails } = require('../utils/timesheetDetails');
const { projectScope, adminDivisionIds } = require('../utils/divisionScope');
const { validateTimesheetEntry, validateWeekEntries } = require('../utils/timesheetValidation');
const { requireAssignedReviewer, assignedReviewer } = require('../utils/timesheetAssignment');
const router = express.Router();

// Normalize once before writes, including self-post and single-entry callers.
function normalizeDetails(req, res, next) {
  if (req.method === 'POST' && ['/', '/batch', '/post'].includes(req.path)) {
    const entries = req.path === '/' ? [req.body] : req.body.entries;
    if (entries !== undefined && !Array.isArray(entries)) return res.status(400).json({ error: 'Entries array is required' });
    if (Array.isArray(entries)) for (const entry of entries) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return res.status(400).json({ error: 'Invalid timesheet entry' });
      // Batch zero-hour requests remove existing drafts; they never save a row.
      if (!(req.path === '/batch' && entry.hours === 0)) validateTimesheetEntry(entry);
      entry.details_json = serializeDetails(entry.details);
      if (entry.project_id) {
        const project = db.prepare('SELECT division_id, subdivision_id FROM projects WHERE id = ?').get(entry.project_id);
        if (!project) return res.status(400).json({ error: 'Project not found' });
        if (entry.division_id && Number(entry.division_id) !== project.division_id) {
          return res.status(400).json({ error: 'Division must match the selected project' });
        }
        if (entry.subdivision_id && Number(entry.subdivision_id) !== project.subdivision_id) {
          return res.status(400).json({ error: 'Location must match the selected project' });
        }
        entry.division_id = project.division_id;
        entry.subdivision_id = project.subdivision_id;
      } else {
        entry.division_id = null;
        entry.subdivision_id = null;
      }
      if (entry.project_id && req.user.role === 'admin') {
        const scope = projectScope(req.user);
        if (!db.prepare(`SELECT id FROM projects p WHERE p.id = ? AND ${scope.sql}`).get(entry.project_id, ...scope.params)) {
          return res.status(403).json({ error: 'Project is outside your assigned divisions' });
        }
      }
    }
  }
  next();
}

function assertDailyHours(userId, dates) {
  const total = db.prepare('SELECT COALESCE(SUM(hours), 0) AS hours FROM timesheets WHERE user_id = ? AND work_date = ?');
  for (const date of new Set(dates)) {
    if (total.get(userId, date).hours > 24) {
      throw Object.assign(new Error('Total hours for ' + date + ' would exceed 24'), { status: 400 });
    }
  }
}

/**
 * Check if a user is allowed to log time against a given division.
 * Flex Team: can log against any division.
 * Dedicated Team: can only log against their assigned division.
 */
function checkDivisionAccess(userId, divisionId) {
  if (!divisionId) return { allowed: true }; // No division specified, allow

  const user = db.prepare(`
    SELECT u.role, u.division_id, u.supporting_category_id, sc.name as supporting_category_name
    FROM users u
    LEFT JOIN supporting_categories sc ON u.supporting_category_id = sc.id
    WHERE u.id = ?
  `).get(userId);

  if (!user) return { allowed: false, reason: 'User not found' };

  if (user.role === 'employee') {
    const assigned = db.prepare('SELECT division_id FROM employee_divisions WHERE user_id = ?').all(userId);
    if (assigned.length) {
      return assigned.some(row => row.division_id === Number(divisionId))
        ? { allowed: true }
        : { allowed: false, reason: 'Select one of your assigned divisions' };
    }
  }

  // If user has no supporting category set, allow (backward compat)
  if (!user.supporting_category_name) return { allowed: true };

  // Flex Team can log against any division
  if (user.supporting_category_name.toLowerCase().includes('flex')) {
    return { allowed: true };
  }

  // Dedicated Team: must match user's assigned division
  if (user.supporting_category_name.toLowerCase().includes('dedicated')) {
    if (!user.division_id) return { allowed: true }; // No division assigned, allow all
    if (user.division_id === divisionId) return { allowed: true };
    return {
      allowed: false,
      reason: 'Dedicated Team members can only log time against their assigned division'
    };
  }

  return { allowed: true }; // Unknown category, allow
}

// GET /api/timesheets - Get current user's timesheets for a week
router.get('/', authenticate, (req, res) => {
  const { week, year } = req.query;
  const userId = req.user.id;

  if (!week || !year) {
    return res.status(400).json({ error: 'Week and year are required' });
  }

  const { startDate, endDate } = getWeekDateRange(parseInt(week), parseInt(year));

  const entries = db.prepare(`
    SELECT t.*,
           p.project_code, p.project_name, p.project_status, p.customer_name, p.activity as project_activity,
           p.division_id as project_division_id, p.subdivision_id as project_subdivision_id,
           tk.classification, tk.task_category, tk.task_description as task_desc, tk.requires_project,
           d.name as division_name,
           s.name as subdivision_name,
           do_.label as ownership_label
    FROM timesheets t
    LEFT JOIN projects p ON t.project_id = p.id
    LEFT JOIN tasks tk ON t.task_id = tk.id
    LEFT JOIN divisions d ON t.division_id = d.id
    LEFT JOIN subdivisions s ON t.subdivision_id = s.id
    LEFT JOIN department_ownerships do_ ON t.ownership_id = do_.id
    WHERE t.user_id = ? AND t.work_date BETWEEN ? AND ?
    ORDER BY t.work_date ASC, t.project_id ASC
  `).all(userId, startDate, endDate);

  res.json({ entries, weekRange: { startDate, endDate } });
});

// GET /api/timesheets/all - Admin: View all timesheets
router.get('/all', authenticate, authorize('admin'), (req, res) => {
  const { week, year, month, user_id, status, division } = req.query;

  let query = `
    SELECT t.*,
           u.name as user_name, u.email as user_email, u.division as user_division,
           p.project_code, p.project_name,
           tk.task_category,
           d.name as division_name,
           s.name as subdivision_name,
           do_.label as ownership_label
    FROM timesheets t
    LEFT JOIN users u ON t.user_id = u.id
    LEFT JOIN projects p ON t.project_id = p.id
    LEFT JOIN tasks tk ON t.task_id = tk.id
    LEFT JOIN divisions d ON t.division_id = d.id
    LEFT JOIN subdivisions s ON t.subdivision_id = s.id
    LEFT JOIN department_ownerships do_ ON t.ownership_id = do_.id
    WHERE u.name != '[Deleted User]'
  `;
  const scope = projectScope(req.user, 'u');
  query += ` AND ${scope.sql}`;
  const params = [...scope.params];

  if (week && year) {
    const { startDate, endDate } = getWeekDateRange(parseInt(week), parseInt(year));
    query += ' AND t.work_date BETWEEN ? AND ?';
    params.push(startDate, endDate);
  } else if (month && year) {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = `${year}-${String(month).padStart(2, '0')}-31`;
    query += ' AND t.work_date BETWEEN ? AND ?';
    params.push(startDate, endDate);
  }
  if (user_id) { query += ' AND t.user_id = ?'; params.push(user_id); }
  if (status) { query += ' AND t.status = ?'; params.push(status); }
  if (division) { query += ' AND u.division = ?'; params.push(division); }

  query += ' ORDER BY t.work_date DESC, u.name ASC';
  const entries = db.prepare(query).all(...params);
  res.json({ entries });
});

// GET /api/timesheets/summary - Get weekly summary for approval view
router.get('/summary', authenticate, authorize('admin'), (req, res) => {
  const { week, year, status, assigned_to_me } = req.query;

  if (!week || !year) {
    return res.status(400).json({ error: 'Week and year are required' });
  }

  const { startDate, endDate } = getWeekDateRange(parseInt(week), parseInt(year));

  let query = `
    SELECT
      u.id as user_id, u.name as user_name, u.email, u.division,
      u.employee_id,
      uaa.admin_id as assigned_admin_id,
      admin_user.name as assigned_admin_name,
      COUNT(DISTINCT t.work_date) as days_worked,
      SUM(t.hours) as total_hours,
      t.status,
      t.admin_comment,
      MIN(t.work_date) as first_entry,
      MAX(t.work_date) as last_entry,
      t.week_number,
      t.week_year
    FROM timesheets t
    LEFT JOIN users u ON t.user_id = u.id
    LEFT JOIN user_admin_assignments uaa ON uaa.user_id = u.id
    LEFT JOIN users admin_user ON uaa.admin_id = admin_user.id
    WHERE u.name != '[Deleted User]' AND t.work_date BETWEEN ? AND ?
  `;
  const params = [startDate, endDate];
  const scope = projectScope(req.user, 'u');
  query += ` AND ${scope.sql}`;
  params.push(...scope.params);

  if (assigned_to_me === 'true') {
    query += ' AND uaa.admin_id = ?';
    params.push(req.user.id);
  }

  if (status) {
    query += ' AND t.status = ?';
    params.push(status);
  }

  query += ' GROUP BY u.id, t.status ORDER BY u.name ASC';
  const summaries = db.prepare(query).all(...params);
  res.json({ summaries: summaries
    .filter(summary => summary.status !== 'submitted' || canReceiveTimesheetReview(req.user, summary.user_id))
    .map(summary => ({ ...summary, can_review: summary.status === 'submitted'
      ? canReceiveTimesheetReview(req.user, summary.user_id) : canReviewTimesheet(req.user, summary.user_id) })), weekRange: { startDate, endDate } });
});

// POST /api/timesheets - Create or update a single entry (upsert)
router.post('/', authenticate, normalizeDetails, (req, res) => {
  const { project_id, task_id, work_date, hours, description, division_id, subdivision_id, project_description, ownership_id, details_json } = req.body;
  const userId = req.user.id;

  if (!work_date || hours === undefined) {
    return res.status(400).json({ error: 'Work date and hours are required' });
  }
  if (!project_id && !task_id) {
    return res.status(400).json({ error: 'Either project or task category is required' });
  }

  if (typeof hours !== 'number' || !Number.isFinite(hours) || hours < 0 || hours > 24) {
    return res.status(400).json({ error: 'Hours must be between 0 and 24' });
  }

  const effectiveDivisionId = division_id || null;
  if (effectiveDivisionId) {
    const access = checkDivisionAccess(userId, effectiveDivisionId);
    if (!access.allowed) {
      return res.status(403).json({ error: access.reason });
    }
  }

  // Compute week number
  const { week, year: weekYear } = getISOWeekNumber(work_date);

  // Check total hours for the day won't exceed 24
  const dayTotalQuery = project_id
    ? 'SELECT COALESCE(SUM(hours), 0) as total FROM timesheets WHERE user_id = ? AND work_date = ? AND NOT (COALESCE(project_id, 0) = ? AND COALESCE(task_id, 0) = ?)'
    : 'SELECT COALESCE(SUM(hours), 0) as total FROM timesheets WHERE user_id = ? AND work_date = ? AND NOT (project_id IS NULL AND COALESCE(task_id, 0) = ?)';
  const dayTotalParams = project_id
    ? [userId, work_date, project_id, task_id || 0]
    : [userId, work_date, task_id];
  const dayTotal = db.prepare(dayTotalQuery).get(...dayTotalParams);

  if (dayTotal.total + hours > 24) {
    return res.status(400).json({ error: `Total hours for ${work_date} would exceed 24. Currently: ${dayTotal.total}h` });
  }

  // Check if entry already exists - use project_id+task_id or task_id-only lookup
  let existing;
  if (project_id) {
    existing = db.prepare(
      'SELECT id, status FROM timesheets WHERE user_id = ? AND project_id = ? AND work_date = ? AND COALESCE(task_id, 0) = ?'
    ).get(userId, project_id, work_date, task_id || 0);
  } else {
    existing = db.prepare(
      'SELECT id, status FROM timesheets WHERE user_id = ? AND project_id IS NULL AND task_id = ? AND work_date = ?'
    ).get(userId, task_id, work_date);
  }

  if (existing) {
    if (existing.status === 'approved') {
      return res.status(400).json({ error: 'Cannot edit approved entries. Request a recall first.' });
    }
    if (existing.status === 'submitted') {
      return res.status(400).json({ error: 'Cannot edit submitted entries' });
    }

    const taskInfo = task_id ? db.prepare('SELECT classification FROM tasks WHERE id = ?').get(task_id) : null;
    const isBillable = (taskInfo?.classification === 'Billable') ? 1 : 0;

    // Update existing
    db.prepare(`
      UPDATE timesheets SET task_id = ?, hours = ?, description = ?,
        week_number = ?, week_year = ?, division_id = ?, subdivision_id = ?, project_description = ?,
        ownership_id = ?, billable = ?, details_json = COALESCE(?, details_json), status = 'draft', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(task_id || null, hours, description || null, week, weekYear,
           effectiveDivisionId || null, subdivision_id || null, project_description || null, ownership_id || null, isBillable, details_json ?? null, existing.id);

    const entry = db.prepare(`
      SELECT t.*, p.project_code, p.project_name, tk.task_category, tk.requires_project,
             d.name as division_name, s.name as subdivision_name
      FROM timesheets t
      LEFT JOIN projects p ON t.project_id = p.id
      LEFT JOIN tasks tk ON t.task_id = tk.id
      LEFT JOIN divisions d ON t.division_id = d.id
      LEFT JOIN subdivisions s ON t.subdivision_id = s.id
      WHERE t.id = ?
    `).get(existing.id);
    return res.json({ entry });
  }

  const taskInfo = task_id ? db.prepare('SELECT classification FROM tasks WHERE id = ?').get(task_id) : null;
  const isBillable = (taskInfo?.classification === 'Billable') ? 1 : 0;

  // Create new
  const result = db.prepare(`
    INSERT INTO timesheets (user_id, project_id, task_id, work_date, hours, description, week_number, week_year,
                            division_id, subdivision_id, project_description, ownership_id, billable, details_json, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')
  `).run(userId, project_id || null, task_id || null, work_date, hours, description || null, week, weekYear,
         effectiveDivisionId || null, subdivision_id || null, project_description || null, ownership_id || null, isBillable, details_json ?? '{}');

  const entry = db.prepare(`
    SELECT t.*, p.project_code, p.project_name, tk.task_category, tk.requires_project,
           d.name as division_name, s.name as subdivision_name
    FROM timesheets t
    LEFT JOIN projects p ON t.project_id = p.id
    LEFT JOIN tasks tk ON t.task_id = tk.id
    LEFT JOIN divisions d ON t.division_id = d.id
    LEFT JOIN subdivisions s ON t.subdivision_id = s.id
    WHERE t.id = ?
  `).get(result.lastInsertRowid);

  res.status(201).json({ entry });
});

// POST /api/timesheets/batch - Save multiple entries at once (auto-save)
router.post('/batch', authenticate, normalizeDetails, (req, res) => {
  const { entries } = req.body;
  const userId = req.user.id;

  if (!entries || !Array.isArray(entries)) {
    return res.status(400).json({ error: 'Entries array is required' });
  }

  const upsertEntry = db.transaction((entries) => {
    const results = [];
    for (const entry of entries) {
      const { project_id, task_id, work_date, hours, description, division_id, subdivision_id, project_description, ownership_id, details_json } = entry;
      if (!work_date || (!project_id && !task_id) || typeof hours !== 'number' || !Number.isFinite(hours) || hours < 0 || hours > 24) {
        throw Object.assign(new Error('Each entry requires a date, project or task, and numeric hours between 0 and 24'), { status: 400 });
      }

      const effectiveDivisionId = division_id || null;
      if (effectiveDivisionId) {
        const access = checkDivisionAccess(userId, effectiveDivisionId);
        if (!access.allowed) throw Object.assign(new Error(access.reason), { status: 403 });
      }

      const { week, year: weekYear } = getISOWeekNumber(work_date);

      // Look up existing entry - use appropriate key based on whether project exists
      let existing;
      if (project_id) {
        existing = db.prepare(
          'SELECT id, status FROM timesheets WHERE user_id = ? AND project_id = ? AND work_date = ? AND COALESCE(task_id, 0) = ?'
        ).get(userId, project_id, work_date, task_id || 0);
      } else {
        existing = db.prepare(
          'SELECT id, status FROM timesheets WHERE user_id = ? AND project_id IS NULL AND task_id = ? AND work_date = ?'
        ).get(userId, task_id, work_date);
      }

      if (existing) {
        if (existing.status === 'approved' || existing.status === 'submitted') {
          throw Object.assign(new Error('Cannot edit approved or submitted entries'), { status: 400 });
        }
        if (hours === 0) {
          // Delete zero-hour entries
          db.prepare('DELETE FROM timesheets WHERE id = ?').run(existing.id);
        } else {
          const taskInfo = task_id ? db.prepare('SELECT classification FROM tasks WHERE id = ?').get(task_id) : null;
          const isBillable = (taskInfo?.classification === 'Billable') ? 1 : 0;

          db.prepare(`
            UPDATE timesheets SET task_id = ?, hours = ?, description = ?,
              week_number = ?, week_year = ?, division_id = ?, subdivision_id = ?, project_description = ?,
              ownership_id = ?, billable = ?, details_json = COALESCE(?, details_json), status = 'draft', updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(task_id || null, hours, description || null, week, weekYear,
                 effectiveDivisionId || null, subdivision_id || null, project_description || null, ownership_id || null, isBillable, details_json ?? null, existing.id);
        }
      } else if (hours > 0) {
        const taskInfo = task_id ? db.prepare('SELECT classification FROM tasks WHERE id = ?').get(task_id) : null;
        const isBillable = (taskInfo?.classification === 'Billable') ? 1 : 0;

        db.prepare(`
          INSERT INTO timesheets (user_id, project_id, task_id, work_date, hours, description, week_number, week_year,
                                  division_id, subdivision_id, project_description, ownership_id, billable, details_json, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')
        `).run(userId, project_id || null, task_id || null, work_date, hours, description || null, week, weekYear,
               effectiveDivisionId || null, subdivision_id || null, project_description || null, ownership_id || null, isBillable, details_json ?? '{}');
      }
      results.push({ project_id, task_id, work_date, hours, status: 'saved' });
    }
    assertDailyHours(userId, entries.map(entry => entry.work_date));
    return results;
  });

  const results = upsertEntry(entries);
  res.json({ saved: results.length, results });
});

// DELETE /api/timesheets/:id
router.delete('/:id', authenticate, (req, res) => {
  const entryId = req.params.id;
  const entry = db.prepare('SELECT * FROM timesheets WHERE id = ?').get(entryId);

  if (!entry) return res.status(404).json({ error: 'Entry not found' });
  const isAdmin = req.user.role === 'admin' || req.user.role === 'system admin';
  if (entry.user_id !== req.user.id && (!isAdmin || !canReviewTimesheet(req.user, entry.user_id))) {
    return res.status(403).json({ error: 'Not authorized' });
  }
  if (entry.status === 'approved') {
    return res.status(400).json({ error: 'Cannot delete approved entries' });
  }
  if (entry.status === 'submitted') {
    return res.status(400).json({ error: 'Cannot delete submitted entries' });
  }

  db.prepare('DELETE FROM timesheets WHERE id = ?').run(entryId);
  res.json({ message: 'Entry deleted' });
});

// POST /api/timesheets/submit - Submit week for approval
router.post('/submit', authenticate, async (req, res, next) => {
  try {
    const { week, year } = req.body;
    const userId = req.user.id;

    if (!week || !year) {
      return res.status(400).json({ error: 'Week and year are required' });
    }

    const { startDate, endDate } = getWeekDateRange(parseInt(week), parseInt(year));

    const drafts = db.prepare(`
      SELECT COUNT(*) as count, SUM(hours) as total_hours FROM timesheets
      WHERE user_id = ? AND work_date BETWEEN ? AND ? AND status IN ('draft', 'rejected', 'recalled')
    `).get(userId, startDate, endDate);

    if (drafts.count === 0) {
      return res.status(400).json({ error: 'No draft/rejected/recalled entries found for this week' });
    }

    // Use repository to handle SQLite + optional SharePoint sync
    const reviewer = requireAssignedReviewer(userId);
    await timesheetRepo.submitWeek(userId, week, year);

    db.prepare('INSERT INTO audit_logs (user_id, action, details, entity_type, ip_address) VALUES (?, ?, ?, ?, ?)').run(
      userId, 'SUBMIT_TIMESHEET', `Submitted timesheet for Week ${week}, ${year}`, 'timesheet', req.ip
    );

    // Trigger Power Automate Webhook if enabled
    if (config.enablePowerAutomate && config.powerAutomateWebhookUrl) {
      const user = db.prepare('SELECT name, email FROM users WHERE id = ?').get(userId);

      // Fire and forget
      fetch(config.powerAutomateWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeEmail: user.email,
          employeeName: user.name,
          approverEmail: reviewer.email,
          approverId: reviewer.id,
          weekNumber: parseInt(week),
          weekYear: parseInt(year),
          weekStart: startDate,
          weekEnd: endDate,
          totalHours: drafts.total_hours,
          timesheetUrl: `${req.protocol}://${req.get('host')}/timesheet`,
          callbackUrl: `${req.protocol}://${req.get('host')}/api/timesheets/pa-callback`,
          callbackSecret: config.powerAutomateCallbackSecret
        })
      }).catch(err => console.error('[Power Automate] Webhook failed:', err.message));
    }

    res.json({ message: 'Timesheet submitted for approval', count: drafts.count });
  } catch (error) { next(error); }
});

// POST /api/timesheets/post - Admin: Self-post timesheet directly (if no other admin assigned)
router.post('/post', authenticate, authorize('admin'), normalizeDetails, (req, res) => {
  const { week, year, comment, entries: incomingEntries } = req.body;
  const userId = req.user.id;

  if (!week || !year) {
    return res.status(400).json({ error: 'Week and year are required' });
  }

  // Check if another admin is assigned to this admin
  const assignment = db.prepare(`
    SELECT uaa.admin_id, u.name as admin_name
    FROM user_admin_assignments uaa
    JOIN users u ON uaa.admin_id = u.id
    WHERE uaa.user_id = ?
  `).get(userId);

  if (assignment) {
    return res.status(403).json({
      error: `You cannot post your own timesheet because you are assigned to admin ${assignment.admin_name}. Your assigned admin must approve your timesheet.`
    });
  }

  const { startDate, endDate } = getWeekDateRange(parseInt(week), parseInt(year));

  const approved = db.transaction(() => {
    // If client provided entries directly in body, save and approve them
    if (incomingEntries && Array.isArray(incomingEntries) && incomingEntries.length > 0) {
      for (const entry of incomingEntries) {
        const { project_id, task_id, work_date, hours, description, division_id, subdivision_id, project_description, ownership_id, details_json } = entry;
        if (!work_date || work_date < startDate || work_date > endDate || (!project_id && !task_id) || typeof hours !== 'number' || !Number.isFinite(hours) || hours < 0 || hours > 24) {
          throw Object.assign(new Error('Invalid entry or entry outside the requested week'), { status: 400 });
        }
        const numHours = hours;
        if (numHours === 0) continue;

        const { week: w, year: y } = getISOWeekNumber(work_date);
        let existing;
        if (project_id) {
          existing = db.prepare(
            'SELECT id, status FROM timesheets WHERE user_id = ? AND project_id = ? AND work_date = ? AND COALESCE(task_id, 0) = ?'
          ).get(userId, project_id, work_date, task_id || 0);
        } else {
          existing = db.prepare(
            'SELECT id, status FROM timesheets WHERE user_id = ? AND project_id IS NULL AND task_id = ? AND work_date = ?'
          ).get(userId, task_id, work_date);
        }

        const taskInfo = task_id ? db.prepare('SELECT classification FROM tasks WHERE id = ?').get(task_id) : null;
        const isBillable = (taskInfo?.classification === 'Billable') ? 1 : 0;

        if (existing) {
          db.prepare(`
            UPDATE timesheets SET task_id = ?, hours = ?, description = ?,
              week_number = ?, week_year = ?, division_id = ?, subdivision_id = ?, project_description = ?,
              ownership_id = ?, billable = ?, details_json = COALESCE(?, details_json), status = 'approved', admin_comment = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(task_id || null, numHours, description || null, w, y,
                 division_id || null, subdivision_id || null, project_description || null, ownership_id || null, isBillable, details_json ?? null, comment || 'Self-posted by admin', existing.id);
        } else {
          db.prepare(`
            INSERT INTO timesheets (user_id, project_id, task_id, work_date, hours, description, week_number, week_year,
                                    division_id, subdivision_id, project_description, ownership_id, billable, details_json, status, admin_comment)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', ?)
          `).run(userId, project_id || null, task_id || null, work_date, numHours, description || null, w, y,
                 division_id || null, subdivision_id || null, project_description || null, ownership_id || null, isBillable, details_json ?? '{}', comment || 'Self-posted by admin');
        }
      }
    }

    // Also approve any existing draft, submitted, rejected, or recalled entries for this week in DB
    validateWeekEntries(userId, startDate, endDate, ['draft', 'submitted', 'rejected', 'recalled']);
    db.prepare(`
      UPDATE timesheets
      SET status = 'approved', admin_comment = ?, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ? AND work_date BETWEEN ? AND ? AND status IN ('draft', 'submitted', 'rejected', 'recalled')
    `).run(comment || 'Self-posted by admin', userId, startDate, endDate);

    assertDailyHours(userId, db.prepare('SELECT DISTINCT work_date FROM timesheets WHERE user_id = ? AND work_date BETWEEN ? AND ?').all(userId, startDate, endDate).map(entry => entry.work_date));

    // Check that we have at least one approved entry for this week
    const approved = db.prepare(`
      SELECT COUNT(*) as count, SUM(hours) as total_hours FROM timesheets
      WHERE user_id = ? AND work_date BETWEEN ? AND ? AND status = 'approved'
    `).get(userId, startDate, endDate);

    if (approved.count === 0) {
      throw Object.assign(new Error('No timesheet entries found to post for this week'), { status: 400 });
    }

    return approved;
  })();

  // Sync to SharePoint if enabled
  if (config.enableSharepointSync) {
    const user = db.prepare('SELECT email FROM users WHERE id = ?').get(userId);
    sp.updateTimesheetStatus(user.email, week, year, 'approved').catch(err => {
      console.error(`[SharePoint] Failed to sync approved status for ${user.email} W${week}/${year}:`, err.message);
    });
  }

  // Audit log
  db.prepare('INSERT INTO audit_logs (user_id, action, details, entity_type, new_value, ip_address) VALUES (?, ?, ?, ?, ?, ?)').run(
    userId, 'POST_TIMESHEET', `Admin "${req.user.name}" posted their own timesheet for Week ${week}, ${year}`, 'timesheet', comment || 'Self-posted', req.ip
  );

  res.json({ message: 'Timesheet posted successfully', count: approved.count });
});

// POST /api/timesheets/approve - Admin: Approve weekly timesheets
router.post('/approve', authenticate, authorize('admin', 'manager'), (req, res) => {
  const { user_id, week, year, comment } = req.body;

  if (!user_id || !week || !year) {
    return res.status(400).json({ error: 'User ID, week, and year are required' });
  }

  const targetUserId = Number(user_id);
  if (!Number.isInteger(targetUserId) || !canReceiveTimesheetReview(req.user, targetUserId)) {
    return res.status(403).json({ error: 'Not authorized to review this user' });
  }

  // If approving their own timesheet, ensure no other admin is assigned to them
  if (targetUserId === req.user.id) {
    const assignment = db.prepare(`
      SELECT uaa.admin_id, u.name as admin_name
      FROM user_admin_assignments uaa
      JOIN users u ON uaa.admin_id = u.id
      WHERE uaa.user_id = ?
    `).get(req.user.id);

    if (assignment) {
      return res.status(403).json({
        error: `You cannot approve your own timesheet because you are assigned to admin ${assignment.admin_name}. Your assigned admin must approve your timesheet.`
      });
    }
  }

  const { startDate, endDate } = getWeekDateRange(parseInt(week), parseInt(year));

  const result = db.prepare(`
    UPDATE timesheets SET status = 'approved', admin_comment = ?, updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ? AND work_date BETWEEN ? AND ? AND status = 'submitted'
  `).run(comment || null, targetUserId, startDate, endDate);

  db.prepare('INSERT INTO audit_logs (user_id, action, details, entity_type, new_value, ip_address) VALUES (?, ?, ?, ?, ?, ?)').run(
    req.user.id, 'APPROVE_TIMESHEET', `Approved timesheet for user ${targetUserId}, Week ${week} ${year}`, 'timesheet', comment || null, req.ip
  );

  res.json({ message: 'Timesheet approved', updated: result.changes });
});

// POST /api/timesheets/reject - Reject weekly timesheets
router.post('/reject', authenticate, authorize('admin', 'manager'), (req, res) => {
  const { user_id, week, year, comment } = req.body;

  if (!user_id || !week || !year) {
    return res.status(400).json({ error: 'User ID, week, and year are required' });
  }

  if (!Number.isInteger(Number(user_id)) || !canReceiveTimesheetReview(req.user, Number(user_id))) {
    return res.status(403).json({ error: 'Not authorized to review this user' });
  }

  const { startDate, endDate } = getWeekDateRange(parseInt(week), parseInt(year));

  const result = db.prepare(`
    UPDATE timesheets SET status = 'rejected', admin_comment = ?, updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ? AND work_date BETWEEN ? AND ? AND status = 'submitted'
  `).run(comment || null, user_id, startDate, endDate);

  db.prepare('INSERT INTO audit_logs (user_id, action, details, entity_type, new_value, ip_address) VALUES (?, ?, ?, ?, ?, ?)').run(
    req.user.id, 'REJECT_TIMESHEET', `Rejected timesheet for user ${user_id}, Week ${week} ${year}`, 'timesheet', comment || null, req.ip
  );

  res.json({ message: 'Timesheet rejected', updated: result.changes });
});

// POST /api/timesheets/recall - Admin or Employee: Recall a timesheet
router.post('/recall', authenticate, async (req, res) => {
  const { user_id, week, year, comment } = req.body;

  if (!week || !year) {
    return res.status(400).json({ error: 'Week and year are required' });
  }

  const isAdmin = req.user.role === 'admin' || req.user.role === 'system admin';
  const targetUserId = isAdmin ? (user_id || req.user.id) : req.user.id;

  if (!isAdmin && user_id && parseInt(user_id) !== req.user.id) {
    return res.status(403).json({ error: 'You can only recall your own timesheets' });
  }

  // If division admin (not system admin) is recalling another user's timesheet, verify division scope
  if (req.user.role === 'admin' && targetUserId !== req.user.id) {
    const adminDivisions = adminDivisionIds(req.user);
    const targetUser = db.prepare('SELECT division_id FROM users WHERE id = ?').get(targetUserId);
    if (!targetUser || !adminDivisions.includes(targetUser.division_id)) {
      return res.status(403).json({ error: 'You are not authorized to manage timesheets for this user.' });
    }
  }

  try {
    const changed = await timesheetRepo.recallWeek(
      targetUserId,
      parseInt(week),
      parseInt(year),
      isAdmin ? req.user.id : null,
      comment || null
    );

    if (changed === 0) {
      return res.status(400).json({ error: 'No recallable timesheet entries found for this week' });
    }

    const action = isAdmin ? 'ADMIN_RECALL_TIMESHEET' : 'EMPLOYEE_RECALL_TIMESHEET';
    db.prepare('INSERT INTO audit_logs (user_id, action, details, entity_type, new_value, ip_address) VALUES (?, ?, ?, ?, ?, ?)').run(
      req.user.id, action, `Recalled timesheet for user ${targetUserId}, Week ${week} ${year}. Reason: ${comment || 'N/A'}`, 'timesheet', comment || null, req.ip
    );

    res.json({ message: 'Timesheet recalled for correction', updated: changed });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Failed to recall timesheet' });
  }
});

// PATCH /api/timesheets/pa-callback - Power Automate Webhook Callback
router.patch('/pa-callback', async (req, res) => {
  const secret = req.headers['x-callback-secret'];
  if (!config.powerAutomateCallbackSecret || secret !== config.powerAutomateCallbackSecret) {
    return res.status(401).json({ error: 'Unauthorized callback' });
  }

  const { status, employeeEmail, weekNumber, weekYear, approverEmail, approverComments } = req.body;

  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(employeeEmail);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const reviewer = assignedReviewer(user.id);
  if (!reviewer || typeof approverEmail !== 'string' || reviewer.email.toLowerCase() !== approverEmail.toLowerCase()) {
    return res.status(403).json({ error: 'Approval requires the active assigned reviewer' });
  }

  const { startDate, endDate } = getWeekDateRange(parseInt(weekNumber), parseInt(weekYear));

  const result = db.prepare(`
    UPDATE timesheets SET status = ?, admin_comment = ?, updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ? AND work_date BETWEEN ? AND ? AND status = 'submitted'
  `).run(status, approverComments || null, user.id, startDate, endDate);

  if (result.changes > 0) {
    db.prepare('INSERT INTO audit_logs (user_id, action, details, entity_type, new_value, ip_address) VALUES (?, ?, ?, ?, ?, ?)').run(
      user.id, 'POWER_AUTOMATE_APPROVAL', `Timesheet ${status} by ${approverEmail} via Power Automate, Week ${weekNumber} ${weekYear}`, 'timesheet', approverComments || null, req.ip
    );

    // Sync to SharePoint
    if (config.enableSharepointSync) {
      const sp = require('../services/sharepoint');
      sp.updateTimesheetStatus(employeeEmail, weekNumber, weekYear, status, approverEmail, approverComments).catch(err => {
        console.error(`[SharePoint] PA callback failed to sync status:`, err.message);
      });
    }
  }

  res.json({ message: `Timesheet ${status}`, updated: result.changes });
});

module.exports = router;
