const db = require('../config/db');
const { adminDivisionIds, canManageDivision, userDivisionId } = require('./divisionScope');
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
function ids(value, label) {
  if (!Array.isArray(value) || value.some(id => !['number', 'string'].includes(typeof id) || !/^[1-9]\d*$/.test(String(id)) || !Number.isSafeInteger(Number(id)))) fail(`${label} must be an array of positive IDs`);
  return [...new Set(value.map(Number))];
}
function divisionIds(user, { legacy = true } = {}) {
  if (user.role === 'admin') return adminDivisionIds(user);
  const assigned = db.prepare('SELECT division_id FROM employee_divisions WHERE user_id = ?').all(user.id).map(r => r.division_id);
  if (assigned.length) return assigned;
  if (legacy && user.role === 'employee' && !db.prepare('SELECT platform_assignments_explicit FROM users WHERE id=?').get(user.id)?.platform_assignments_explicit) {
    const category = db.prepare(`SELECT COALESCE(sc.name,u.team_type,'') AS name FROM users u
      LEFT JOIN supporting_categories sc ON sc.id=u.supporting_category_id WHERE u.id=?`).get(user.id)?.name || '';
    if (!category.toLowerCase().includes('dedicated')) return db.prepare('SELECT id FROM divisions WHERE active=1').all().map(d => d.id);
  }
  return [userDivisionId(user)].filter(Boolean);
}
function userAssignments(user) {
  const assigned = divisionIds(user);
  const divisions = db.prepare(`SELECT d.*, p.name AS platform_name FROM divisions d
    JOIN platforms p ON p.id=d.platform_id WHERE d.id IN (${assigned.map(() => '?').join(',') || 'NULL'}) ORDER BY p.name,d.name`).all(...assigned);
  const platforms = db.prepare(`SELECT DISTINCT p.* FROM platforms p WHERE p.id IN
    (SELECT platform_id FROM user_platforms WHERE user_id=?) OR p.id IN
    (${divisions.map(() => '?').join(',') || 'NULL'}) ORDER BY p.name`).all(user.id, ...divisions.map(d => d.platform_id));
  return { divisions, division_ids: divisions.map(d => d.id), platforms, platform_ids: platforms.map(p => p.id) };
}
function validatePlatforms(actor, platformIds, selectedDivisions, target) {
  const divisions = ids(selectedDivisions, 'division_ids');
  const selected = platformIds === undefined
    ? [...new Set(divisions.map(id => db.prepare('SELECT platform_id FROM divisions WHERE id=?').get(id)?.platform_id).filter(Boolean))]
    : ids(platformIds, 'platform_ids');
  for (const id of selected) if (!db.prepare('SELECT 1 FROM platforms WHERE id=? AND active=1').get(id)) fail('Select valid active Platforms');
  for (const id of divisions) {
    const d = db.prepare('SELECT * FROM divisions WHERE id=? AND active=1').get(id);
    if (!d || !selected.includes(d.platform_id)) fail('Every selected Division must belong to a selected Platform');
  }
  if (actor.role !== 'system admin') {
    const previous = target ? userAssignments(target) : { platform_ids: [], division_ids: [] };
    const permitted = db.prepare(`SELECT DISTINCT platform_id FROM divisions WHERE id IN
      (${adminDivisionIds(actor).map(() => '?').join(',') || 'NULL'})`).all(...adminDivisionIds(actor)).map(d => d.platform_id);
    if (selected.some(id => !permitted.includes(id) && !previous.platform_ids.includes(id))) fail('Platform is outside your assigned divisions', 403);
    if (previous.division_ids.some(id => !canManageDivision(actor, id) && !divisions.includes(id))) fail('Only a System Admin can remove assignments outside your scope', 403);
    if (target?.role === 'admin' && (selected.length !== previous.platform_ids.length || selected.some(id => !previous.platform_ids.includes(id)))) fail('Only a System Admin can change administrator Platforms', 403);
  }
  return selected;
}
function savePlatforms(userId, platformIds) {
  db.prepare('UPDATE users SET platform_assignments_explicit=1 WHERE id=?').run(userId);
  db.prepare('DELETE FROM user_platforms WHERE user_id=?').run(userId);
  const insert = db.prepare('INSERT INTO user_platforms(user_id,platform_id) VALUES (?,?)');
  platformIds.forEach(id => insert.run(userId, id));
  // Revoke project memberships whose division is no longer explicitly authorized.
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(userId);
  const assigned = divisionIds(user, { legacy: false });
  db.prepare(`DELETE FROM project_users WHERE user_id=? AND project_id IN
    (SELECT id FROM projects WHERE ${assigned.length ? `division_id IS NULL OR division_id NOT IN (${assigned.map(() => '?').join(',')})` : '1=1'} )`).run(userId, ...assigned);
}
function validateProjectUsers(body, divisionId, existing) {
  const mode = body.user_assignment_mode ?? existing?.user_assignment_mode ?? 'division';
  if (!['division', 'selected'].includes(mode)) fail('Invalid user assignment mode');
  const selected = body.user_ids === undefined
    ? (existing ? db.prepare('SELECT user_id FROM project_users WHERE project_id=?').all(existing.id).map(r => r.user_id) : [])
    : ids(body.user_ids, 'user_ids');
  for (const id of selected) {
    const user = db.prepare('SELECT * FROM users WHERE id=? AND active=1 AND role!=?').get(id, 'viewer');
    if (!user || !divisionIds(user, { legacy: false }).includes(Number(divisionId))) fail('Project users must be assigned to the selected Division; Platform access alone is insufficient', 403);
  }
  return { mode, selected };
}
function saveProjectUsers(projectId, { mode, selected }) {
  db.prepare('UPDATE projects SET user_assignment_mode=? WHERE id=?').run(mode, projectId);
  db.prepare('DELETE FROM project_users WHERE project_id=?').run(projectId);
  for (const id of selected) db.prepare('INSERT INTO project_users(project_id,user_id) VALUES (?,?)').run(projectId,id);
}
function withProjectUsers(project) {
  const users = db.prepare(`SELECT u.id,u.name,u.role,u.division_id,u.division FROM users u
    JOIN project_users pu ON pu.user_id=u.id WHERE pu.project_id=? ORDER BY u.name`).all(project.id)
    .map(u => ({ ...u, ...userAssignments(u) }));
  return { ...project, users, user_ids: users.map(u => u.id) };
}
function canBookProject(userId, project) {
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(userId);
  if (!user) return false;
  if (project.user_assignment_mode === 'selected') return !!db.prepare('SELECT 1 FROM project_users WHERE project_id=? AND user_id=?').get(project.id,userId)
    && divisionIds(user, { legacy: false }).includes(project.division_id);
  return user.role === 'system admin' || divisionIds(user).includes(project.division_id) || (user.role === 'manager' && !project.division_id);
}
module.exports = { ids, divisionIds, userAssignments, validatePlatforms, savePlatforms, validateProjectUsers, saveProjectUsers, withProjectUsers, canBookProject };
