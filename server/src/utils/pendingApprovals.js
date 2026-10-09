const db = require('../config/db');
const { projectScope } = require('./divisionScope');
const { canReceiveTimesheetReview } = require('./timesheetPermissions');

// Count employee-weeks, including older submissions, within the reviewer's scope.
function getPendingApprovals(actor) {
  if (!['admin', 'system admin', 'manager'].includes(actor.role)) return [];
  const scope = actor.role === 'manager'
    ? { sql: 'u.division_id = ? AND u.id != ?', params: [actor.division_id, actor.id] }
    : projectScope(actor, 'u');
  return db.prepare(`
    SELECT t.user_id, t.week_number, t.week_year, t.status,
           SUM(t.hours) AS total_hours, MIN(t.work_date) AS start_date,
           MAX(t.work_date) AS end_date, MAX(t.updated_at) AS last_updated,
           u.name AS user_name, u.email AS user_email, u.team_type, u.division
    FROM timesheets t JOIN users u ON t.user_id = u.id
    WHERE t.status = 'submitted' AND u.name != '[Deleted User]' AND ${scope.sql}
    GROUP BY t.user_id, t.week_year, t.week_number
    ORDER BY t.week_year, t.week_number, u.name
  `).all(...scope.params).filter(row => canReceiveTimesheetReview(actor, row.user_id));
}

module.exports = { getPendingApprovals };
