const express = require('express');
const db = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// GET /api/departments - List all departments
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
  res.json({ departments });
});

// POST /api/departments
router.post('/', authenticate, authorize('admin'), (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Department name is required' });

  try {
    const result = db.prepare('INSERT INTO departments (name) VALUES (?)').run(name.trim());
    const department = db.prepare('SELECT * FROM departments WHERE id = ?').get(result.lastInsertRowid);

    db.prepare('INSERT INTO audit_logs (user_id, action, details, entity_type, entity_id, ip_address) VALUES (?, ?, ?, ?, ?, ?)').run(
      req.user.id, 'CREATE_DEPARTMENT', `Created department: ${name}`, 'department', result.lastInsertRowid, req.ip
    );

    res.status(201).json({ department });
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'Department already exists' });
    }
    throw err;
  }
});

// PUT /api/departments/:id
router.put('/:id', authenticate, authorize('admin'), (req, res) => {
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
router.delete('/:id', authenticate, authorize('admin'), (req, res) => {
  const id = req.params.id;
  const existing = db.prepare('SELECT id FROM departments WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Department not found' });

  db.prepare('UPDATE departments SET active = 0 WHERE id = ?').run(id);
  res.json({ message: 'Department deactivated' });
});

module.exports = router;
