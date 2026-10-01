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
const { getPendingApprovals } = require('../utils/pendingApprovals');

const router = express.Router();

// Get timesheets needing approval for the manager's team
router.get('/pending-approvals', authenticate, authorize('manager', 'admin'), (req, res) => {
  res.json({ weeks: getPendingApprovals(req.user) });
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
