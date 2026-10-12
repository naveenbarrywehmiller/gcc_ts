const db = require('../config/db');

function userDivisionId(user) {
  return user.division_id || (user.division && db.prepare('SELECT id FROM divisions WHERE LOWER(TRIM(name)) = LOWER(?) AND active = 1').get(String(user.division).trim())?.id) || null;
}

function adminDivisionIds(user) {
  if (user.role !== 'admin') return [];
  const assigned = db.prepare('SELECT division_id FROM admin_divisions WHERE user_id = ?').all(user.id).map(r => r.division_id);
  if (assigned.length) return assigned;
  const profileId = userDivisionId(user);
  return profileId ? [Number(profileId)] : [];
}

function canManageDivision(user, divisionId) {
  return user.role === 'system admin' || (user.role === 'admin' && adminDivisionIds(user).includes(Number(divisionId)));
}

function projectScope(user, alias = 'p') {
  if (user.role !== 'admin') return { sql: '1=1', params: [] };
  const ids = adminDivisionIds(user);
  return { sql: ids.length ? `${alias}.division_id IN (${ids.map(() => '?').join(',')})` : '0=1', params: ids };
}

function canManageUser(actor, target) {
  return actor.role === 'system admin' || (actor.role === 'admin' &&
    (actor.id === target.id || (!['admin', 'system admin', 'viewer'].includes(target.role) && canManageDivision(actor, userDivisionId(target)))));
}

// Assigned-division scope also governs team vacation and monthly records.
function reportingDivisionIds(user) {
  if (user.role === 'admin') return adminDivisionIds(user);
  if (user.role === 'manager') {
    const id = userDivisionId(user);
    return id ? [Number(id)] : [];
  }
  return [];
}

function reportingScope(user, alias = 'u') {
  if (['system admin', 'viewer'].includes(user.role)) return { sql: '1=1', params: [] };
  const ids = reportingDivisionIds(user);
  const field = `COALESCE(${alias}.division_id, (SELECT id FROM divisions WHERE LOWER(TRIM(name)) = LOWER(TRIM(${alias}.division)) AND active = 1))`;
  return { sql: ids.length ? `${field} IN (${ids.map(() => '?').join(',')})` : '0=1', params: ids };
}

function hasCompanywideReportAccess(user) {
  return ['system admin', 'manager', 'viewer'].includes(user.role);
}

function reportScope(user, alias = 'u') {
  return hasCompanywideReportAccess(user) ? { sql: '1=1', params: [] } : reportingScope(user, alias);
}

function canEditDivisionUpdate(user, divisionId) {
  return user.role === 'system admin' ||
    (user.role === 'manager' && reportingDivisionIds(user).includes(Number(divisionId)));
}

module.exports = { adminDivisionIds, canManageDivision, projectScope, userDivisionId, canManageUser,
  reportingDivisionIds, reportingScope, reportScope, hasCompanywideReportAccess, canEditDivisionUpdate };
