/**
 * manager.js — Routes for the 'manager' role
 *
 * Managers can approve/reject timesheets for employees in their designated groups
 * (e.g., matching subdivision or specifically assigned teams).
 */

const express = require('express');
const db = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { canReviewTimesheet } = require('../utils/timesheetPermissions');
const { projectScope } = require('../utils/divisionScope');

const router = express.Router();

// Get timesheets needing approval for the manager's team
router.get('/pending-approvals', authenticate, authorize('manager', 'admin'), (req, res) => {
  // Simple organizational mapping: Manager sees their own division/department.
  // This can be expanded based on business rules for team assignments.
  const manager = db.prepare('SELECT division_id, department_id FROM users WHERE id = ?').get(req.user.id);
  
  if (!manager) {
    return res.json({ weeks: [] });
  }

  // Get all submitted timesheets for users in the same division/department
  let query = `
    SELECT 
      t.user_id, t.week_number, t.week_year, t.status, 
      SUM(t.hours) as total_hours,
      MIN(t.work_date) as start_date, MAX(t.work_date) as end_date,
      u.name as user_name, u.email as user_email, u.team_type
    FROM timesheets t
    JOIN users u ON t.user_id = u.id
    WHERE t.status = 'submitted'
  `;
  
  const params = [];

  // If not admin, restrict to manager's organization
  const isAdmin = req.user.role === 'admin' || req.user.role === 'system admin';
  if (!isAdmin) {
    query += ` AND u.division_id = ? AND u.id != ? `;
    params.push(manager?.division_id, req.user.id);
  } else {
    const scope = projectScope(req.user, 'u');
    query += ` AND ${scope.sql}`;
    params.push(...scope.params);
  }

  query += `
    GROUP BY t.user_id, t.week_number, t.week_year, t.status, u.name, u.email, u.team_type
    ORDER BY t.week_year ASC, t.week_number ASC, u.name ASC
  `;

  const weeks = db.prepare(query).all(...params);
  res.json({ weeks: weeks.filter(row => canReviewTimesheet(req.user, row.user_id)) });
});

// Get details for a specific week for a specific user
router.get('/week-details/:userId/:year/:week', authenticate, authorize('manager', 'admin'), (req, res) => {
  const { userId, year, week } = req.params;

  if (!canReviewTimesheet(req.user, Number(userId))) {
    return res.status(403).json({ error: 'Not authorized to view this user' });
  }

  // Reuse the repository logic for reads (but it gets one user's week)
  const entries = db.prepare(`
    SELECT t.*, p.project_code, tk.task_category, d.name as division_name, s.name as subdivision_name
    FROM timesheets t
    LEFT JOIN projects p ON t.project_id = p.id
    LEFT JOIN tasks tk ON t.task_id = tk.id
    LEFT JOIN divisions d ON t.division_id = d.id
    LEFT JOIN subdivisions s ON t.subdivision_id = s.id
    WHERE t.user_id = ? AND t.week_year = ? AND t.week_number = ?
    ORDER BY t.work_date ASC
  `).all(userId, year, week);

  res.json({ entries });
});

module.exports = router;
