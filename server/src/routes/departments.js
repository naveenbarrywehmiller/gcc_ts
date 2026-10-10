const express = require('express');
const db = require('../config/db');
const { authenticate } = require('../middleware/auth');

const { permit, protectCatalogStatus } = require('../middleware/permissions');
const { catalogAudit } = require('../middleware/catalogAudit');
const router = express.Router();

// GET /api/departments - List all departments (with ownerships)
router.get('/', authenticate, (req, res) => {
  const { active } = req.query;
  let query = 'SELECT * FROM departments WHERE 1=1';
  const params = [];

  if (active !== undefined) {
    query += ' AND active = ?';
    params.push(parseInt(active));
  } else {
    query += ' AND active = 1';
  }

  query += ' ORDER BY name ASC';
  const departments = db.prepare(query).all(...params);

  // Fetch active ownerships for each department
  const ownershipStmt = db.prepare('SELECT * FROM department_ownerships WHERE department_id = ? AND active = 1 ORDER BY label ASC');
  departments.forEach(dept => {
    dept.ownerships = ownershipStmt.all(dept.id);
  });

  res.json({ departments });
});

// POST /api/departments
router.post('/', authenticate, permit('catalogEdit'), catalogAudit('departments', 'department'), (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Department name is required' });

  try {
    const result = db.prepare('INSERT INTO departments (name) VALUES (?)').run(name.trim());
    const department = db.prepare('SELECT * FROM departments WHERE id = ?').get(result.lastInsertRowid);

    res.status(201).json({ department });
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'Department already exists' });
    }
    throw err;
  }
});

// PUT /api/departments/:id
router.put('/:id', authenticate, permit('catalogEdit'), protectCatalogStatus, catalogAudit('departments', 'department'), (req, res) => {
  const { name, active } = req.body;
  const id = req.params.id;

  const existing = db.prepare('SELECT id FROM departments WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Department not found' });

  if (name) db.prepare('UPDATE departments SET name = ? WHERE id = ?').run(name.trim(), id);
  if (active !== undefined) db.prepare('UPDATE departments SET active = ? WHERE id = ?').run(active ? 1 : 0, id);

  const department = db.prepare('SELECT * FROM departments WHERE id = ?').get(id);
  res.json({ department });
});

// DELETE /api/departments/:id
router.delete('/:id', authenticate, permit('catalogDelete'), catalogAudit('departments', 'department'), (req, res) => {
  const id = req.params.id;
  const existing = db.prepare('SELECT id FROM departments WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Department not found' });

  db.prepare('UPDATE departments SET active = 0 WHERE id = ?').run(id);
  res.json({ message: 'Department deactivated' });
});

module.exports = router;
