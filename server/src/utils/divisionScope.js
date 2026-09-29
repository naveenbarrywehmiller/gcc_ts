const db = require('../config/db');

function adminDivisionIds(user) {
  return db.prepare('SELECT division_id FROM admin_divisions WHERE user_id = ?').all(user.id).map(r => r.division_id);
}

function canManageDivision(user, divisionId) {
  return user.role === 'system admin' || (user.role === 'admin' && adminDivisionIds(user).includes(Number(divisionId)));
}

function projectScope(user, alias = 'p') {
  if (user.role !== 'admin') return { sql: '1=1', params: [] };
  return { sql: `${alias}.division_id IN (SELECT division_id FROM admin_divisions WHERE user_id = ?)`, params: [user.id] };
}

module.exports = { adminDivisionIds, canManageDivision, projectScope };
