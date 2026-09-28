const db = require('../config/db');

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
  return Boolean(db.prepare('SELECT 1 FROM admin_divisions WHERE user_id = ? AND division_id = ?')
    .get(actor.id, target.division_id));
}

module.exports = { canReviewTimesheet };
