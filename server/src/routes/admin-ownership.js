/**
 * admin-ownership.js — Routes for admin-user ownership management
 *
 * Enforces:
 *  - One admin per user (UNIQUE constraint on user_admin_assignments.user_id)
 *  - Division-scoped access (admin can only manage users in their assigned divisions)
 *  - Only the current admin can release a user
 *  - "Assign to myself" uses authenticated session, not client-supplied admin ID
 *  - All changes are audit-logged
 */

const express = require('express');
const db = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { projectScope, canManageDivision } = require('../utils/divisionScope');

const { permit } = require('../middleware/permissions');
const router = express.Router();

// ============================================================
// GET /api/admin-ownership/my-users
// Returns users assigned to the current admin, scoped by divisions
// ============================================================
router.get('/my-users', authenticate, permit('users'), (req, res) => {
  const adminId = req.user.id;
  const scope = projectScope(req.user, 'u');
  const users = db.prepare(`
    SELECT u.id, u.name, u.email, u.role, u.active, u.employee_id,
           u.division_id, u.department_id,
           d.name as division_name,
           dept.name as department_name,
           uaa.admin_id,
           admin_user.name as admin_name
    FROM users u
    LEFT JOIN divisions d ON u.division_id = d.id
    LEFT JOIN departments dept ON u.department_id = dept.id
    LEFT JOIN user_admin_assignments uaa ON uaa.user_id = u.id
    LEFT JOIN users admin_user ON uaa.admin_id = admin_user.id
    WHERE ${scope.sql}
      AND u.name != '[Deleted User]'
      AND u.id != ?
    ORDER BY u.name ASC
  `).all(...scope.params, adminId);

  res.json({ users });
});

// ============================================================
// GET /api/admin-ownership/user/:id/admin
// Get the admin assigned to a specific user (for any authenticated user)
// ============================================================
router.get('/user/:id/admin', authenticate, (req, res) => {
  const userId = req.params.id;

  const assignment = db.prepare(`
    SELECT uaa.admin_id, u.name as admin_name, u.email as admin_email
    FROM user_admin_assignments uaa
    JOIN users u ON uaa.admin_id = u.id
    WHERE uaa.user_id = ?
  `).get(userId);

  if (!assignment) {
    return res.json({ admin: null });
  }

  res.json({
    admin: {
      id: assignment.admin_id,
      name: assignment.admin_name,
      email: assignment.admin_email
    }
  });
});

// ============================================================
// GET /api/admin-ownership/my-admin
// Get the current user's assigned admin
// ============================================================
router.get('/my-admin', authenticate, (req, res) => {
  const userId = req.user.id;

  const assignment = db.prepare(`
    SELECT uaa.admin_id, u.name as admin_name, u.email as admin_email
    FROM user_admin_assignments uaa
    JOIN users u ON uaa.admin_id = u.id
    WHERE uaa.user_id = ?
  `).get(userId);

  if (!assignment) {
    return res.json({ admin: null });
  }

  res.json({
    admin: {
      id: assignment.admin_id,
      name: assignment.admin_name,
      email: assignment.admin_email
    }
  });
});

// ============================================================
// POST /api/admin-ownership/assign/:userId
// Assign a user to the current admin (from session, not client)
// ============================================================
router.post('/assign/:userId', authenticate, permit('users'), (req, res) => {
  const adminId = req.user.id; // ALWAYS from session
  const targetUserId = parseInt(req.params.userId);

  // 1. Check user exists and is active
  const targetUser = db.prepare(
    'SELECT id, name, active, division_id, role FROM users WHERE id = ?'
  ).get(targetUserId);

  if (!targetUser) {
    return res.status(404).json({ error: 'User not found.' });
  }
  if (!targetUser.active) {
    return res.status(400).json({ error: 'Inactive users cannot be assigned.' });
  }
  if (targetUserId === adminId) {
    return res.status(400).json({ error: 'You cannot assign yourself as your own admin.' });
  }

  // 2. Check user has a valid division
  if (!targetUser.division_id) {
    return res.status(400).json({ error: 'This user has no division assigned. Assign a division first.' });
  }

  // 3. Check admin has access to user's division
  if (!canManageDivision(req.user, targetUser.division_id)) {
    return res.status(403).json({ error: 'You can only manage users in your assigned divisions.' });
  }

  // 4. Check if user is already assigned to another admin
  const existing = db.prepare(
    'SELECT admin_id FROM user_admin_assignments WHERE user_id = ?'
  ).get(targetUserId);

  if (existing) {
    if (existing.admin_id === adminId) {
      return res.status(400).json({ error: 'This user is already assigned to you.' });
    }
    const otherAdmin = db.prepare('SELECT name FROM users WHERE id = ?').get(existing.admin_id);
    return res.status(409).json({
      error: `This user is already assigned to ${otherAdmin?.name || 'another admin'}. The current admin must release the user before another admin can assign them.`
    });
  }

  // 5. Assign (UNIQUE constraint provides concurrency protection)
  try {
    db.prepare(
      'INSERT INTO user_admin_assignments (user_id, admin_id, assigned_by) VALUES (?, ?, ?)'
    ).run(targetUserId, adminId, adminId);
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({
        error: 'This user was just assigned to another admin. Please refresh and try again.'
      });
    }
    throw err;
  }

  // 6. Audit log
  db.prepare(
    'INSERT INTO audit_logs (user_id, action, details, entity_type, entity_id, new_value, ip_address) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(
    adminId, 'ASSIGN_USER',
    `Admin "${req.user.name}" assigned user "${targetUser.name}" (ID: ${targetUserId})`,
    'user_admin_assignment', targetUserId,
    JSON.stringify({ admin_id: adminId, admin_name: req.user.name }),
    req.ip
  );

  res.json({ message: `${targetUser.name} has been assigned to you.` });
});

// ============================================================
// POST /api/admin-ownership/release/:userId
// Release a user from the current admin's ownership
// ============================================================
router.post('/release/:userId', authenticate, permit('users'), (req, res) => {
  const adminId = req.user.id;
  const targetUserId = parseInt(req.params.userId);

  // 1. Check assignment exists and belongs to this admin
  const assignment = db.prepare(
    'SELECT id, admin_id FROM user_admin_assignments WHERE user_id = ?'
  ).get(targetUserId);

  if (!assignment) {
    return res.status(400).json({ error: 'This user is not assigned to any admin.' });
  }

  if (assignment.admin_id !== adminId) {
    return res.status(403).json({ error: 'Only the current admin can release this user.' });
  }

  const targetUser = db.prepare('SELECT name FROM users WHERE id = ?').get(targetUserId);

  // 2. Release
  db.prepare('DELETE FROM user_admin_assignments WHERE user_id = ?').run(targetUserId);

  // 3. Audit log
  db.prepare(
    'INSERT INTO audit_logs (user_id, action, details, entity_type, entity_id, old_value, ip_address) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(
    adminId, 'RELEASE_USER',
    `Admin "${req.user.name}" released user "${targetUser?.name}" (ID: ${targetUserId})`,
    'user_admin_assignment', targetUserId,
    JSON.stringify({ previous_admin_id: adminId, previous_admin_name: req.user.name }),
    req.ip
  );

  res.json({ message: `${targetUser?.name} has been released from your assignment.` });
});

// ============================================================
// GET /api/admin-ownership/timesheet-history
// Admin: View timesheet history for their authorized users
// Enforces division-scoped access
// ============================================================
router.get('/timesheet-history', authenticate, permit('users'), (req, res) => {
  const adminId = req.user.id;
  const { user_id, week, year, month, status, division_id, assigned_only } = req.query;

  const scope = projectScope(req.user, 'u');

  // If specific user requested, verify admin has access
  if (user_id) {
    const targetUser = db.prepare('SELECT division_id FROM users WHERE id = ?').get(user_id);
    if (!targetUser || !canManageDivision(req.user, targetUser.division_id)) {
      return res.status(403).json({ error: 'You are not authorized to view this user\'s timesheets.' });
    }
  }

  let query = `
    SELECT t.*,
           u.name as user_name, u.email as user_email, u.division as user_division,
           u.employee_id,
           uaa.admin_id,
           p.project_code, p.project_name,
           tk.task_category, tk.classification,
           d.name as division_name,
           s.name as subdivision_name,
           do_.label as ownership_label
    FROM timesheets t
    JOIN users u ON t.user_id = u.id
    LEFT JOIN user_admin_assignments uaa ON uaa.user_id = u.id
    LEFT JOIN projects p ON t.project_id = p.id
    LEFT JOIN tasks tk ON t.task_id = tk.id
    LEFT JOIN divisions d ON t.division_id = d.id
    LEFT JOIN subdivisions s ON t.subdivision_id = s.id
    LEFT JOIN department_ownerships do_ ON t.ownership_id = do_.id
    WHERE u.name != '[Deleted User]'
  `;
  const params = [];

  // Enforce division scope
  query += ` AND ${scope.sql}`;
  params.push(...scope.params);

  if (assigned_only === 'true') {
    query += ' AND uaa.admin_id = ?';
    params.push(adminId);
  }

  if (user_id) {
    query += ' AND t.user_id = ?';
    params.push(parseInt(user_id));
  }
  if (division_id) {
    query += ' AND u.division_id = ?';
    params.push(parseInt(division_id));
  }
  if (status) {
    query += ' AND t.status = ?';
    params.push(status);
  }

  if (week && year) {
    // Import getWeekDateRange
    const { getWeekDateRange } = require('../utils/dateUtils');
    const { startDate, endDate } = getWeekDateRange(parseInt(week), parseInt(year));
    query += ' AND t.work_date BETWEEN ? AND ?';
    params.push(startDate, endDate);
  } else if (month && year) {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = `${year}-${String(month).padStart(2, '0')}-31`;
    query += ' AND t.work_date BETWEEN ? AND ?';
    params.push(startDate, endDate);
  }

  query += ' ORDER BY t.work_date DESC, u.name ASC';

  // Limit to last 1000 entries for performance
  query += ' LIMIT 1000';

  const entries = db.prepare(query).all(...params);
  res.json({ entries });
});

// ============================================================
// GET /api/admin-ownership/authorized-users
// Get all users the current admin can see (for dropdowns/filters)
// ============================================================
router.get('/authorized-users', authenticate, permit('users'), (req, res) => {
  const scope = projectScope(req.user, 'u');
  const users = db.prepare(`
    SELECT u.id, u.name, u.email, u.employee_id, u.division_id,
           d.name as division_name
    FROM users u
    LEFT JOIN divisions d ON u.division_id = d.id
    WHERE ${scope.sql}
      AND u.active = 1
      AND u.name != '[Deleted User]'
    ORDER BY u.name ASC
  `).all(...scope.params);

  res.json({ users });
});

module.exports = router;
