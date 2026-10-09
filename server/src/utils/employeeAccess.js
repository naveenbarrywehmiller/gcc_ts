const db = require('../config/db');

const assignmentRequired = {
  code: 'ADMIN_ASSIGNMENT_REQUIRED',
  error: 'Your account is not assigned to an active admin. Please contact your administrator to assign you before signing in or entering time.',
};

function employeeAccessError(user) {
  if (user.role !== 'employee') return null;
  const assignment = db.prepare(`
    SELECT 1 FROM user_admin_assignments assignment
    JOIN users admin ON admin.id = assignment.admin_id
    WHERE assignment.user_id = ? AND admin.active = 1
      AND admin.role IN ('admin', 'system admin')
  `).get(user.id);
  return assignment ? null : assignmentRequired;
}

module.exports = { employeeAccessError };
