const db = require('../config/db');

// Only explicit, active assignments can receive submissions. Never select a fallback.
function assignedReviewer(userId) {
  return db.prepare(`SELECT reviewer.id, reviewer.email, reviewer.name, reviewer.role
    FROM user_admin_assignments assignment JOIN users reviewer ON reviewer.id = assignment.admin_id
    WHERE assignment.user_id = ? AND reviewer.id != assignment.user_id AND reviewer.active = 1
      AND reviewer.role IN ('admin', 'manager', 'system admin')`).get(userId);
}

function requireAssignedReviewer(userId) {
  const reviewer = assignedReviewer(userId);
  if (!reviewer) throw Object.assign(new Error('An active assigned Admin, Manager, or System Admin is required to submit a timesheet'), { status: 403 });
  return reviewer;
}

module.exports = { assignedReviewer, requireAssignedReviewer };
