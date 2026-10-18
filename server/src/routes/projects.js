const express = require('express');
const ExcelJS = require('exceljs');
const db = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { projectDivisionIds, canManageProjectDivision } = require('../utils/projectPermissions');
const { reportingDivisionIds } = require('../utils/divisionScope');
const { reportScope } = require('../utils/divisionScope');
const { validateProject } = require('../utils/projectFields');
const { projectColumns, createSheet, addDropdowns, addManifest } = require('../utils/catalogWorkbook');
const { permit } = require('../middleware/permissions');
const router = express.Router();
const { validateAssignments, saveAssignments, withTasks } = require('../utils/projectTasks');
const { userAssignments, validateProjectUsers, saveProjectUsers, withProjectUsers, canBookProject, divisionIds } = require('../utils/platformAssignments');
const enrich = project => withProjectUsers(withTasks(project));
const select = `SELECT p.*, d.platform_id, (SELECT name FROM platforms WHERE id=d.platform_id) AS platform_name, d.name AS division_name, s.name AS subdivision_name FROM projects p
  LEFT JOIN divisions d ON d.id = p.division_id LEFT JOIN subdivisions s ON s.id = p.subdivision_id`;
function filter(query) {
  let sql = ' WHERE 1=1';
  const params = [];
  for (const key of ['division_id', 'subdivision_id', 'project_status', 'team_type', 'division']) {
    if (query[key]) { sql += ` AND p.${key} = ?`; params.push(query[key]); }
  }
  if (query.platform_id) { sql += ' AND p.division_id IN (SELECT id FROM divisions WHERE platform_id=?)'; params.push(query.platform_id); }
  if (query.active !== 'all') { sql += ' AND p.active = ?'; params.push(query.active === '0' ? 0 : 1); }
  if (query.search) {
    sql += ' AND (p.project_code LIKE ? OR p.project_name LIKE ? OR p.customer_name LIKE ?)';
    params.push(...Array(3).fill(`%${query.search}%`));
  }
  return { sql, params };
}
router.get('/options', authenticate, permit('reports'), (req, res) => {
  const ids = projectDivisionIds(req.user);
  const filter_divisions = db.prepare('SELECT d.*, p.name AS platform_name FROM divisions d JOIN platforms p ON p.id=d.platform_id WHERE d.active=1 ORDER BY p.name,d.name').all();
  const filter_subdivisions = db.prepare('SELECT * FROM subdivisions WHERE active = 1 ORDER BY name').all();
  const divisions = filter_divisions
    .filter(d => req.user.role === 'system admin' || ids.includes(d.id));
  const subdivisions = filter_subdivisions
    .filter(s => divisions.some(d => d.id === s.division_id));
  const activities = db.prepare('SELECT id, name FROM activities WHERE active = 1 ORDER BY name').all();
  const supporting_categories = db.prepare('SELECT id, name FROM supporting_categories WHERE active = 1 ORDER BY name').all();
  // Monthly division updates use the same effective division assignments.
  const assignedIds = reportingDivisionIds(req.user);
  const division_update_divisions = filter_divisions.filter(d => ['system admin', 'viewer'].includes(req.user.role) || assignedIds.includes(d.id));
  const platforms = db.prepare('SELECT * FROM platforms WHERE active=1 ORDER BY name').all();
  const users = db.prepare("SELECT id,name,role,division_id,division FROM users WHERE active=1 AND role!='viewer' AND name!='[Deleted User]' ORDER BY name").all().map(u => ({ ...u, ...userAssignments(u), assignable_division_ids: divisionIds(u, { legacy:false }) }));
  res.json({ platforms, users, divisions, subdivisions, filter_divisions, filter_subdivisions, division_update_divisions, activities, supporting_categories, tasks: db.prepare('SELECT * FROM tasks ORDER BY classification, task_category').all() });
});
router.get('/export', authenticate, permit('projectsView'), async (req, res, next) => {
  try {
    const workbook = new ExcelJS.Workbook();
    const sheet = createSheet(workbook, 'Projects', projectColumns);
    const { sql, params } = filter(req.query);
    const scope = reportScope(req.user, 'p');
    const projects = db.prepare(select + sql + ` AND ${scope.sql} ORDER BY p.project_code`).all(...params, ...scope.params);
    projects.forEach(p => {
      const enriched = enrich(p);
      sheet.addRow({ ...p, division: p.division_name, location: p.subdivision_name, active: p.active ? 'Yes' : 'No',
        billable_task_ids: enriched.billable_task_ids.join(';'), non_billable_task_ids: enriched.non_billable_task_ids.join(';'), user_ids: enriched.user_ids.join(';') });
    });
    const divisions = db.prepare('SELECT d.*, p.name AS platform_name FROM divisions d JOIN platforms p ON p.id=d.platform_id WHERE d.active=1 AND p.active=1 ORDER BY p.name,d.name').all()
      .filter(d => req.user.role !== 'admin' || canManageProjectDivision(req.user, d.id));
    const locations = db.prepare('SELECT * FROM subdivisions WHERE active=1 ORDER BY name').all().filter(s => divisions.some(d => d.id === s.division_id));
    addDropdowns(workbook, sheet, projectColumns, {
      platform_name: divisions.map(d => d.platform_name), division: divisions.map(d => d.name), location: locations.map(s => s.name),
      project_status: ['Inprogress', 'Hold', 'Completed'], active: ['Yes', 'No'], user_assignment_mode: ['division', 'selected'],
      activity: db.prepare('SELECT name FROM activities WHERE active=1 ORDER BY name').all().map(r => r.name),
      team_type: db.prepare('SELECT name FROM supporting_categories WHERE active=1 ORDER BY name').all().map(r => r.name),
    });
    const taskSheet = workbook.addWorksheet('Task Reference');
    taskSheet.columns = ['ID', 'Classification', 'Task Name/Number', 'Estimated Hours', 'Input Received Date', 'Start Date', 'Target Date', 'Delivered Date', 'Active'].map(header => ({ header, width: 24 }));
    db.prepare('SELECT * FROM tasks ORDER BY classification, task_category').all().forEach(t => taskSheet.addRow([t.id, t.classification, t.task_category, t.estimated_hours, t.input_received_date, t.start_date, t.target_date, t.delivered_date, t.active ? 'Yes' : 'No']));
    const users = createSheet(workbook, 'User Reference', [['id', 'ID'], ['name', 'Name'], ['divisions', 'Division IDs']]);
    db.prepare("SELECT * FROM users WHERE active=1 AND role!='viewer' AND name!='[Deleted User]' ORDER BY name").all().forEach(u => {
      const ids = divisionIds(u, { legacy: false }).filter(id => divisions.some(d => d.id === id));
      if (ids.length) users.addRow({ id: u.id, name: u.name, divisions: ids.join(';') });
    });
    addManifest(workbook, 'projects', projects);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="projects.xlsx"');
    await workbook.xlsx.write(res); res.end();
  } catch (err) { next(err); }
});
router.get('/', authenticate, (req, res) => {
  for (const key of ['page', 'limit']) {
    if (req.query[key] !== undefined && (!Number.isSafeInteger(Number(req.query[key])) || Number(req.query[key]) < 1)) return res.status(400).json({ error: `${key} must be a positive integer` });
  }
  let { sql, params } = filter(req.query);
  if (req.user.role === 'employee') {
    const allowed = divisionIds(req.user);
    sql += ` AND p.division_id IN (${allowed.map(() => '?').join(',') || 'NULL'}) AND (p.user_assignment_mode='division' OR EXISTS(SELECT 1 FROM project_users pu WHERE pu.project_id=p.id AND pu.user_id=?))`;
    params.push(...allowed, req.user.id);
  }
  const total = db.prepare('SELECT COUNT(*) AS n FROM projects p' + sql).get(...params).n;
  // Existing timesheet/report consumers retain their unpaginated response contract.
  const paginated = req.query.page !== undefined;
  const limit = Math.min(100, Math.max(1, Math.floor(Number(req.query.limit) || 25)));
  const page = Math.max(1, Math.floor(Number(req.query.page) || 1));
  const projects = db.prepare(select + sql + ' ORDER BY p.project_code' + (paginated ? ' LIMIT ? OFFSET ?' : ''))
    .all(...params, ...(paginated ? [limit, (page - 1) * limit] : []));
  const editableIds = projectDivisionIds(req.user);
  res.json({ projects: projects.filter(p => req.user.role !== 'employee' || canBookProject(req.user.id,p)).map(project => ({ ...enrich(project), can_edit: req.user.role === 'system admin' || editableIds.includes(project.division_id) })), total, page, limit });
});
function getProject(req) {
  return db.prepare(select + ' WHERE p.id = ?').get(req.params.id);
}
router.get('/:id', authenticate, (req, res) => {
  const project = getProject(req);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  if (req.user.role === 'employee' && !canBookProject(req.user.id,project)) return res.status(403).json({ error:'Project access denied' });
  res.json({ project: { ...enrich(project), can_edit: canManageProjectDivision(req.user, project.division_id) } });
});
function audit(req, action, id) {
  db.prepare('INSERT INTO audit_logs(user_id, action, details, entity_type, entity_id, division_id, ip_address) VALUES (?,?,?,?,?,?,?)')
    .run(req.user.id, action, `Project ${id}`, 'project', id, db.prepare('SELECT division_id FROM projects WHERE id = ?').get(id)?.division_id || null, req.ip);
}
router.post('/', authenticate, permit('projects'), (req, res) => {
  const project = db.transaction(() => {
    const data = validateProject(req.body, req.user);
    const groups = validateAssignments(req.body);
    const members = validateProjectUsers(req.body, data.division_id);
    const keys = Object.keys(data);
    const result = db.prepare(`INSERT INTO projects (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...Object.values(data));
    saveAssignments(Number(result.lastInsertRowid), groups);
    saveProjectUsers(Number(result.lastInsertRowid), members);
    audit(req, 'CREATE_PROJECT', Number(result.lastInsertRowid));
    return db.prepare(select + ' WHERE p.id = ?').get(result.lastInsertRowid);
  })();
  res.status(201).json({ project: enrich(project) });
});
router.put('/:id', authenticate, permit('projects'), (req, res) => {
  const existing = getProject(req);
  if (!existing) return res.status(404).json({ error: 'Project not found' });
  if (!canManageProjectDivision(req.user, existing.division_id)) return res.status(403).json({ error: 'You can only edit projects in your assigned divisions' });
  const project = db.transaction(() => {
    const data = validateProject(req.body, req.user, existing);
    const groups = validateAssignments(req.body, existing.id);
    const members = validateProjectUsers(req.body, data.division_id, existing);
    db.prepare(`UPDATE projects SET ${Object.keys(data).map(k => `${k} = ?`).join(',')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(...Object.values(data), existing.id);
    saveAssignments(existing.id, groups);
    saveProjectUsers(existing.id, members);
    audit(req, 'UPDATE_PROJECT', existing.id);
    return db.prepare(select + ' WHERE p.id = ?').get(existing.id);
  })();
  res.json({ project: enrich(project) });
});
router.delete('/:id/permanent', authenticate, permit('projects'), (req, res) => {
  const existing = getProject(req);
  if (!existing) return res.status(404).json({ error: 'Project not found' });
  if (!canManageProjectDivision(req.user, existing.division_id)) return res.status(403).json({ error: 'You can only delete projects in your assigned divisions' });
  const deleted = db.transaction(() => {
    const timesheet = db.prepare('SELECT id FROM timesheets WHERE project_id = ? LIMIT 1').get(existing.id);
    if (timesheet) return false;
    db.prepare('DELETE FROM projects WHERE id = ?').run(existing.id);
    db.prepare('INSERT INTO audit_logs(user_id, action, details, entity_type, entity_id, division_id, ip_address) VALUES (?,?,?,?,?,?,?)')
      .run(req.user.id, 'PERMANENT_DELETE_PROJECT', `Deleted project ${existing.project_code} (${existing.project_name})`, 'project', existing.id, existing.division_id, req.ip);
    return true;
  })();
  if (!deleted) return res.status(409).json({ error: 'This project has timesheet entries and cannot be permanently deleted. Deactivate it instead.' });
  res.json({ message: 'Project permanently deleted' });
});
router.delete('/:id', authenticate, permit('projects'), (req, res) => {
  const existing = getProject(req);
  if (!existing) return res.status(404).json({ error: 'Project not found' });
  if (!canManageProjectDivision(req.user, existing.division_id)) return res.status(403).json({ error: 'You can only deactivate projects in your assigned divisions' });
  db.transaction(() => {
    db.prepare('UPDATE projects SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(existing.id);
    audit(req, 'DELETE_PROJECT', existing.id);
  })();
  res.json({ message: 'Project deactivated' });
});
module.exports = router;
