const express = require('express');
const db = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { getISOWeekNumber, getWeekDateRange } = require('../utils/dateUtils');

const router = express.Router();

/**
 * Check if a user is allowed to log time against a given division.
 * Flex Team: can log against any division.
 * Dedicated Team: can only log against their assigned division.
 */
function checkDivisionAccess(userId, divisionId) {
  if (!divisionId) return { allowed: true }; // No division specified, allow

  const user = db.prepare(`
    SELECT u.division_id, u.supporting_category_id, sc.name as supporting_category_name
    FROM users u
    LEFT JOIN supporting_categories sc ON u.supporting_category_id = sc.id
    WHERE u.id = ?
  `).get(userId);

  if (!user) return { allowed: false, reason: 'User not found' };

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
           p.project_code, p.project_name, p.customer_name, p.activity as project_activity,
           p.division_id as project_division_id, p.subdivision_id as project_subdivision_id,
           tk.classification, tk.task_category, tk.task_description as task_desc, tk.requires_project,
           d.name as division_name,
           s.name as subdivision_name
    FROM timesheets t
    LEFT JOIN projects p ON t.project_id = p.id
    LEFT JOIN tasks tk ON t.task_id = tk.id
    LEFT JOIN divisions d ON t.division_id = d.id
    LEFT JOIN subdivisions s ON t.subdivision_id = s.id
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
           s.name as subdivision_name
    FROM timesheets t
    LEFT JOIN users u ON t.user_id = u.id
    LEFT JOIN projects p ON t.project_id = p.id
    LEFT JOIN tasks tk ON t.task_id = tk.id
    LEFT JOIN divisions d ON t.division_id = d.id
    LEFT JOIN subdivisions s ON t.subdivision_id = s.id
    WHERE u.name != '[Deleted User]'
  `;
  const params = [];

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
  const { week, year, status } = req.query;

  if (!week || !year) {
    return res.status(400).json({ error: 'Week and year are required' });
  }

  const { startDate, endDate } = getWeekDateRange(parseInt(week), parseInt(year));

  let query = `
    SELECT 
      u.id as user_id, u.name as user_name, u.email, u.division,
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
    WHERE u.name != '[Deleted User]' AND t.work_date BETWEEN ? AND ?
  `;
  const params = [startDate, endDate];

  if (status) {
    query += ' AND t.status = ?';
    params.push(status);
  }

  query += ' GROUP BY u.id, t.status ORDER BY u.name ASC';
  const summaries = db.prepare(query).all(...params);
  res.json({ summaries, weekRange: { startDate, endDate } });
});

// POST /api/timesheets - Create or update a single entry (upsert)
router.post('/', authenticate, (req, res) => {
  const { project_id, task_id, work_date, hours, description, division_id, subdivision_id, project_description } = req.body;
  const userId = req.user.id;

  if (!work_date || hours === undefined) {
    return res.status(400).json({ error: 'Work date and hours are required' });
  }
  if (!project_id && !task_id) {
    return res.status(400).json({ error: 'Either project or task category is required' });
  }

  if (hours < 0 || hours > 24) {
    return res.status(400).json({ error: 'Hours must be between 0 and 24' });
  }

  // Enforce Flex/Dedicated team logic (only when project is specified)
  if (project_id) {
    const effectiveDivisionId = division_id || db.prepare('SELECT division_id FROM projects WHERE id = ?').get(project_id)?.division_id;
    if (effectiveDivisionId) {
      const access = checkDivisionAccess(userId, effectiveDivisionId);
      if (!access.allowed) {
        return res.status(403).json({ error: access.reason });
      }
    }
  }

  // Compute week number
  const { week, year: weekYear } = getISOWeekNumber(work_date);

  // Check total hours for the day won't exceed 24
  const dayTotalQuery = project_id
    ? 'SELECT COALESCE(SUM(hours), 0) as total FROM timesheets WHERE user_id = ? AND work_date = ? AND NOT (project_id = ? AND COALESCE(task_id, 0) = ?)'
    : 'SELECT COALESCE(SUM(hours), 0) as total FROM timesheets WHERE user_id = ? AND work_date = ? AND NOT (project_id IS NULL AND task_id = ?)';
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

  const effectiveDivisionId = project_id
    ? (division_id || db.prepare('SELECT division_id FROM projects WHERE id = ?').get(project_id)?.division_id)
    : (division_id || null);

  if (existing) {
    if (existing.status === 'approved') {
      return res.status(400).json({ error: 'Cannot edit approved entries. Request a recall first.' });
    }
    if (existing.status === 'submitted') {
      return res.status(400).json({ error: 'Cannot edit submitted entries' });
    }

    // Update existing
    db.prepare(`
      UPDATE timesheets SET task_id = ?, hours = ?, description = ?, 
        week_number = ?, week_year = ?, division_id = ?, subdivision_id = ?, project_description = ?,
        status = 'draft', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(task_id || null, hours, description || null, week, weekYear, 
           effectiveDivisionId || null, subdivision_id || null, project_description || null, existing.id);

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

  // Create new
  const result = db.prepare(`
    INSERT INTO timesheets (user_id, project_id, task_id, work_date, hours, description, week_number, week_year, 
                            division_id, subdivision_id, project_description, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')
  `).run(userId, project_id || null, task_id || null, work_date, hours, description || null, week, weekYear,
         effectiveDivisionId || null, subdivision_id || null, project_description || null);

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
router.post('/batch', authenticate, (req, res) => {
  const { entries } = req.body;
  const userId = req.user.id;

  if (!entries || !Array.isArray(entries)) {
    return res.status(400).json({ error: 'Entries array is required' });
  }

  const upsertEntry = db.transaction((entries) => {
    const results = [];
    for (const entry of entries) {
      const { project_id, task_id, work_date, hours, description, division_id, subdivision_id, project_description } = entry;
      if (!work_date || hours === undefined) continue;
      if (!project_id && !task_id) continue; // Need at least one identifier
      if (hours < 0 || hours > 24) continue;

      // Enforce Flex/Dedicated team logic (only when project is specified)
      let effectiveDivisionId = null;
      if (project_id) {
        effectiveDivisionId = division_id || db.prepare('SELECT division_id FROM projects WHERE id = ?').get(project_id)?.division_id;
        if (effectiveDivisionId) {
          const access = checkDivisionAccess(userId, effectiveDivisionId);
          if (!access.allowed) continue; // Skip entries that violate division access
        }
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
        if (existing.status === 'approved' || existing.status === 'submitted') continue;
        if (hours === 0) {
          // Delete zero-hour entries
          db.prepare('DELETE FROM timesheets WHERE id = ?').run(existing.id);
        } else {
          db.prepare(`
            UPDATE timesheets SET task_id = ?, hours = ?, description = ?, 
              week_number = ?, week_year = ?, division_id = ?, subdivision_id = ?, project_description = ?,
              status = 'draft', updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(task_id || null, hours, description || null, week, weekYear,
                 division_id || effectiveDivisionId || null, subdivision_id || null, project_description || null, existing.id);
        }
      } else if (hours > 0) {
        db.prepare(`
          INSERT INTO timesheets (user_id, project_id, task_id, work_date, hours, description, week_number, week_year, 
                                  division_id, subdivision_id, project_description, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')
        `).run(userId, project_id || null, task_id || null, work_date, hours, description || null, week, weekYear,
               division_id || effectiveDivisionId || null, subdivision_id || null, project_description || null);
      }
      results.push({ project_id, task_id, work_date, hours, status: 'saved' });
    }
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
  if (entry.user_id !== req.user.id && req.user.role !== 'admin') {
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
router.post('/submit', authenticate, (req, res) => {
  const { week, year } = req.body;
  const userId = req.user.id;

  if (!week || !year) {
    return res.status(400).json({ error: 'Week and year are required' });
  }

  const { startDate, endDate } = getWeekDateRange(parseInt(week), parseInt(year));

  const drafts = db.prepare(`
    SELECT COUNT(*) as count FROM timesheets 
    WHERE user_id = ? AND work_date BETWEEN ? AND ? AND status IN ('draft', 'rejected', 'recalled')
  `).get(userId, startDate, endDate);

  if (drafts.count === 0) {
    return res.status(400).json({ error: 'No draft/rejected/recalled entries found for this week' });
  }

  db.prepare(`
    UPDATE timesheets SET status = 'submitted', admin_comment = NULL, updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ? AND work_date BETWEEN ? AND ? AND status IN ('draft', 'rejected', 'recalled')
  `).run(userId, startDate, endDate);

  db.prepare('INSERT INTO audit_logs (user_id, action, details, entity_type, ip_address) VALUES (?, ?, ?, ?, ?)').run(
    userId, 'SUBMIT_TIMESHEET', `Submitted timesheet for Week ${week}, ${year}`, 'timesheet', req.ip
  );

  res.json({ message: 'Timesheet submitted for approval', count: drafts.count });
});

// POST /api/timesheets/approve - Admin: Approve weekly timesheets
router.post('/approve', authenticate, authorize('admin'), (req, res) => {
  const { user_id, week, year, comment } = req.body;

  if (!user_id || !week || !year) {
    return res.status(400).json({ error: 'User ID, week, and year are required' });
  }

  const { startDate, endDate } = getWeekDateRange(parseInt(week), parseInt(year));

  const result = db.prepare(`
    UPDATE timesheets SET status = 'approved', admin_comment = ?, updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ? AND work_date BETWEEN ? AND ? AND status = 'submitted'
  `).run(comment || null, user_id, startDate, endDate);

  db.prepare('INSERT INTO audit_logs (user_id, action, details, entity_type, new_value, ip_address) VALUES (?, ?, ?, ?, ?, ?)').run(
    req.user.id, 'APPROVE_TIMESHEET', `Approved timesheet for user ${user_id}, Week ${week} ${year}`, 'timesheet', comment || null, req.ip
  );

  res.json({ message: 'Timesheet approved', updated: result.changes });
});

// POST /api/timesheets/reject - Admin: Reject weekly timesheets
router.post('/reject', authenticate, authorize('admin'), (req, res) => {
  const { user_id, week, year, comment } = req.body;

  if (!user_id || !week || !year) {
    return res.status(400).json({ error: 'User ID, week, and year are required' });
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

// POST /api/timesheets/recall - Admin or Employee: Recall an approved timesheet
router.post('/recall', authenticate, (req, res) => {
  const { user_id, week, year, comment } = req.body;

  if (!week || !year) {
    return res.status(400).json({ error: 'Week and year are required' });
  }

  const targetUserId = req.user.role === 'admin' ? (user_id || req.user.id) : req.user.id;

  // Employees can only recall their own timesheets
  if (req.user.role !== 'admin' && user_id && parseInt(user_id) !== req.user.id) {
    return res.status(403).json({ error: 'You can only recall your own timesheets' });
  }

  const { startDate, endDate } = getWeekDateRange(parseInt(week), parseInt(year));

  const recallable = db.prepare(`
    SELECT COUNT(*) as count FROM timesheets 
    WHERE user_id = ? AND work_date BETWEEN ? AND ? AND status IN ('approved', 'submitted')
  `).get(targetUserId, startDate, endDate);

  if (recallable.count === 0) {
    return res.status(400).json({ error: 'No approved or submitted entries found for this week' });
  }

  db.prepare(`
    UPDATE timesheets SET status = 'recalled', admin_comment = ?, updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ? AND work_date BETWEEN ? AND ? AND status IN ('approved', 'submitted')
  `).run(comment || null, targetUserId, startDate, endDate);

  const action = req.user.role === 'admin' ? 'ADMIN_RECALL_TIMESHEET' : 'EMPLOYEE_RECALL_TIMESHEET';
  db.prepare('INSERT INTO audit_logs (user_id, action, details, entity_type, new_value, ip_address) VALUES (?, ?, ?, ?, ?, ?)').run(
    req.user.id, action, `Recalled timesheet for user ${targetUserId}, Week ${week} ${year}. Reason: ${comment || 'N/A'}`, 'timesheet', comment || null, req.ip
  );

  res.json({ message: 'Timesheet recalled for correction', updated: recallable.count });
});

module.exports = router;
