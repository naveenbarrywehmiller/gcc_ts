const db = require('../config/db');
const { canManageDivision } = require('./divisionScope');
const { assignedReviewer } = require('./timesheetAssignment');

function canReviewTimesheet(actor, targetUserId) {
  if (actor.role === 'system admin') return true;
  const target = db.prepare('SELECT division_id FROM users WHERE id = ?').get(targetUserId);
  if (!target) return false;
  if (actor.role === 'manager') {
    return actor.id !== targetUserId && actor.division_id != null && actor.division_id === target.division_id;
  }
  if (actor.role !== 'admin') return false;
  const assignment = db.prepare('SELECT admin_id FROM user_admin_assignments WHERE user_id = ?').get(targetUserId);
  if (actor.id === targetUserId) return !assignment;
  return canManageDivision(actor, target.division_id);
}

function canReceiveTimesheetReview(actor, targetUserId) {
  if (!assignedReviewer(targetUserId)) return false;
  return canReviewTimesheet(actor, targetUserId);
}

module.exports = { canReviewTimesheet, canReceiveTimesheetReview };
