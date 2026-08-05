const express = require('express');
const db = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// GET /api/projects
router.get('/', authenticate, (req, res) => {
  const { search, division, division_id, subdivision_id, team_type, active } = req.query;
  let query = `
    SELECT p.*, 
           d.name as division_name, 
           s.name as subdivision_name
    FROM projects p
    LEFT JOIN divisions d ON p.division_id = d.id
    LEFT JOIN subdivisions s ON p.subdivision_id = s.id
    WHERE 1=1
  `;
  const params = [];

  if (search) {
    query += ' AND (p.project_code LIKE ? OR p.project_name LIKE ? OR p.customer_name LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (division) { query += ' AND p.division = ?'; params.push(division); }
  if (division_id) { query += ' AND p.division_id = ?'; params.push(parseInt(division_id)); }
  if (subdivision_id) { query += ' AND p.subdivision_id = ?'; params.push(parseInt(subdivision_id)); }
  if (team_type) { query += ' AND p.team_type = ?'; params.push(team_type); }
  if (active !== undefined) { query += ' AND p.active = ?'; params.push(parseInt(active)); }
  else { query += ' AND p.active = 1'; }

  query += ' ORDER BY p.project_code ASC';
  const projects = db.prepare(query).all(...params);
  res.json({ projects });
});

// GET /api/projects/:id
router.get('/:id', authenticate, (req, res) => {
  const project = db.prepare(`
    SELECT p.*, 
           d.name as division_name, 
           s.name as subdivision_name
    FROM projects p
    LEFT JOIN divisions d ON p.division_id = d.id
    LEFT JOIN subdivisions s ON p.subdivision_id = s.id
    WHERE p.id = ?
  `).get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  res.json({ project });
});

// POST /api/projects
router.post('/', authenticate, authorize('admin'), (req, res) => {
  const { project_code, project_name, customer_name, activity, division, division_id, subdivision_id, team_type } = req.body;

  if (!project_code || !project_name) {
    return res.status(400).json({ error: 'Project code and name are required' });
  }

  const existing = db.prepare('SELECT id FROM projects WHERE project_code = ?').get(project_code.trim());
  if (existing) return res.status(409).json({ error: 'Project code already exists' });

  // Resolve division name from division_id if not provided
  let divisionName = division || null;
  if (division_id && !divisionName) {
    const div = db.prepare('SELECT name FROM divisions WHERE id = ?').get(division_id);
    if (div) divisionName = div.name;
  }

  const result = db.prepare(`
    INSERT INTO projects (project_code, project_name, customer_name, activity, division, division_id, subdivision_id, team_type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(project_code.trim(), project_name.trim(), customer_name || null, activity || null, divisionName, division_id || null, subdivision_id || null, team_type || null);

  db.prepare('INSERT INTO audit_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)').run(
    req.user.id, 'CREATE_PROJECT', `Created project: ${project_code}`, req.ip
  );

  const project = db.prepare(`
    SELECT p.*, d.name as division_name, s.name as subdivision_name
    FROM projects p
    LEFT JOIN divisions d ON p.division_id = d.id
    LEFT JOIN subdivisions s ON p.subdivision_id = s.id
    WHERE p.id = ?
  `).get(result.lastInsertRowid);
  res.status(201).json({ project });
});

// PUT /api/projects/:id
router.put('/:id', authenticate, authorize('admin'), (req, res) => {
  const { project_code, project_name, customer_name, activity, division, division_id, subdivision_id, team_type, active } = req.body;
  const projectId = req.params.id;

  const existing = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
  if (!existing) return res.status(404).json({ error: 'Project not found' });

  if (project_code) {
    const codeExists = db.prepare('SELECT id FROM projects WHERE project_code = ? AND id != ?').get(project_code.trim(), projectId);
    if (codeExists) return res.status(409).json({ error: 'Project code already in use' });
  }

  let updateFields = [];
  let params = [];

  if (project_code !== undefined) { updateFields.push('project_code = ?'); params.push(project_code.trim()); }
  if (project_name !== undefined) { updateFields.push('project_name = ?'); params.push(project_name.trim()); }
  if (customer_name !== undefined) { updateFields.push('customer_name = ?'); params.push(customer_name); }
  if (activity !== undefined) { updateFields.push('activity = ?'); params.push(activity); }
  if (team_type !== undefined) { updateFields.push('team_type = ?'); params.push(team_type); }
  if (active !== undefined) { updateFields.push('active = ?'); params.push(active ? 1 : 0); }

  // Handle division_id — also sync text division field
  if (division_id !== undefined) {
    updateFields.push('division_id = ?'); params.push(division_id || null);
    if (division_id) {
      const div = db.prepare('SELECT name FROM divisions WHERE id = ?').get(division_id);
      if (div) { updateFields.push('division = ?'); params.push(div.name); }
    } else {
      updateFields.push('division = ?'); params.push(null);
    }
  } else if (division !== undefined) {
    updateFields.push('division = ?'); params.push(division);
  }

  if (subdivision_id !== undefined) {
    updateFields.push('subdivision_id = ?'); params.push(subdivision_id || null);
  }

  if (updateFields.length === 0) return res.status(400).json({ error: 'No fields to update' });

  updateFields.push('updated_at = CURRENT_TIMESTAMP');
  params.push(projectId);

  db.prepare(`UPDATE projects SET ${updateFields.join(', ')} WHERE id = ?`).run(...params);

  db.prepare('INSERT INTO audit_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)').run(
    req.user.id, 'UPDATE_PROJECT', `Updated project ID: ${projectId}`, req.ip
  );

  const project = db.prepare(`
    SELECT p.*, d.name as division_name, s.name as subdivision_name
    FROM projects p
    LEFT JOIN divisions d ON p.division_id = d.id
    LEFT JOIN subdivisions s ON p.subdivision_id = s.id
    WHERE p.id = ?
  `).get(projectId);
  res.json({ project });
});

// DELETE /api/projects/:id
router.delete('/:id', authenticate, authorize('admin'), (req, res) => {
  const projectId = req.params.id;
  const existing = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
  if (!existing) return res.status(404).json({ error: 'Project not found' });

  db.prepare('UPDATE projects SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(projectId);

  db.prepare('INSERT INTO audit_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)').run(
    req.user.id, 'DELETE_PROJECT', `Deactivated project ID: ${projectId}`, req.ip
  );

  res.json({ message: 'Project deactivated successfully' });
});

module.exports = router;
