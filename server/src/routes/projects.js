const express = require('express');
const ExcelJS = require('exceljs');
const db = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { projectScope, adminDivisionIds } = require('../utils/divisionScope');
const { columns, validateProject } = require('../utils/projectFields');
const router = express.Router();
const select = `SELECT p.*, d.name AS division_name, s.name AS subdivision_name FROM projects p
  LEFT JOIN divisions d ON d.id = p.division_id LEFT JOIN subdivisions s ON s.id = p.subdivision_id`;
function filter(user, query) {
  const scope = projectScope(user);
  let sql = ` WHERE ${scope.sql}`;
  const params = [...scope.params];
  for (const key of ['division_id', 'subdivision_id', 'project_status', 'team_type', 'division']) {
    if (query[key]) { sql += ` AND p.${key} = ?`; params.push(query[key]); }
  }
  if (query.active !== 'all') { sql += ' AND p.active = ?'; params.push(query.active === '0' ? 0 : 1); }
  if (query.search) {
    sql += ' AND (p.project_code LIKE ? OR p.project_name LIKE ? OR p.customer_name LIKE ?)';
    params.push(...Array(3).fill(`%${query.search}%`));
  }
  return { sql, params };
}
router.get('/options', authenticate, authorize('admin'), (req, res) => {
  const ids = adminDivisionIds(req.user);
  const divisions = db.prepare('SELECT * FROM divisions WHERE active = 1 ORDER BY name').all()
    .filter(d => req.user.role === 'system admin' || ids.includes(d.id));
  const subdivisions = db.prepare('SELECT * FROM subdivisions WHERE active = 1 ORDER BY name').all()
    .filter(s => divisions.some(d => d.id === s.division_id));
  res.json({ divisions, subdivisions });
});
router.get('/export', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Projects');
    sheet.columns = columns.map(([key, header]) => ({ key, header, width: 24 }));
    if (req.query.template !== 'true') {
      const { sql, params } = filter(req.user, req.query);
      db.prepare(select + sql + ' ORDER BY p.project_code').all(...params)
        .forEach(p => sheet.addRow({ ...p, division: p.division_name, location: p.subdivision_name }));
    }
    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${req.query.template === 'true' ? 'project-template' : 'projects'}.xlsx"`);
    await workbook.xlsx.write(res); res.end();
  } catch (err) { next(err); }
});
router.get('/', authenticate, (req, res) => {
  for (const key of ['page', 'limit']) {
    if (req.query[key] !== undefined && (!Number.isSafeInteger(Number(req.query[key])) || Number(req.query[key]) < 1)) return res.status(400).json({ error: `${key} must be a positive integer` });
  }
  const { sql, params } = filter(req.user, req.query);
  const total = db.prepare('SELECT COUNT(*) AS n FROM projects p' + sql).get(...params).n;
  // Existing timesheet/report consumers retain their unpaginated response contract.
  const paginated = req.query.page !== undefined;
  const limit = Math.min(100, Math.max(1, Math.floor(Number(req.query.limit) || 25)));
  const page = Math.max(1, Math.floor(Number(req.query.page) || 1));
  const projects = db.prepare(select + sql + ' ORDER BY p.project_code' + (paginated ? ' LIMIT ? OFFSET ?' : ''))
    .all(...params, ...(paginated ? [limit, (page - 1) * limit] : []));
  res.json({ projects, total, page, limit });
});
function getProject(req) {
  const { sql, params } = projectScope(req.user);
  return db.prepare(select + ` WHERE p.id = ? AND ${sql}`).get(req.params.id, ...params);
}
router.get('/:id', authenticate, (req, res) => {
  const project = getProject(req);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  res.json({ project });
});
function audit(req, action, id) {
  db.prepare('INSERT INTO audit_logs(user_id, action, details, entity_type, entity_id, ip_address) VALUES (?,?,?,?,?,?)')
    .run(req.user.id, action, `Project ${id}`, 'project', id, req.ip);
}
router.post('/', authenticate, authorize('admin'), (req, res) => {
  const project = db.transaction(() => {
    const data = validateProject(req.body, req.user);
    const keys = Object.keys(data);
    const result = db.prepare(`INSERT INTO projects (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...Object.values(data));
    audit(req, 'CREATE_PROJECT', Number(result.lastInsertRowid));
    return db.prepare(select + ' WHERE p.id = ?').get(result.lastInsertRowid);
  })();
  res.status(201).json({ project });
});
router.put('/:id', authenticate, authorize('admin'), (req, res) => {
  const existing = getProject(req);
  if (!existing) return res.status(404).json({ error: 'Project not found' });
  const project = db.transaction(() => {
    const data = validateProject(req.body, req.user, existing);
    db.prepare(`UPDATE projects SET ${Object.keys(data).map(k => `${k} = ?`).join(',')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(...Object.values(data), existing.id);
    audit(req, 'UPDATE_PROJECT', existing.id);
    return db.prepare(select + ' WHERE p.id = ?').get(existing.id);
  })();
  res.json({ project });
});
router.delete('/:id', authenticate, authorize('admin'), (req, res) => {
  const existing = getProject(req);
  if (!existing) return res.status(404).json({ error: 'Project not found' });
  db.transaction(() => {
    db.prepare('UPDATE projects SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(existing.id);
    audit(req, 'DELETE_PROJECT', existing.id);
  })();
  res.json({ message: 'Project deactivated' });
});
module.exports = router;
