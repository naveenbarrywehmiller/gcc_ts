const express = require('express');
const db = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// GET /api/department-ownerships - List ownerships, optionally filtered by department_id
router.get('/', authenticate, (req, res) => {
  const { department_id, active } = req.query;
  let query = 'SELECT do_.*, d.name as department_name FROM department_ownerships do_ JOIN departments d ON do_.department_id = d.id WHERE 1=1';
  const params = [];

  if (department_id) {
    query += ' AND do_.department_id = ?';
    params.push(parseInt(department_id));
  }

  if (active !== undefined) {
    query += ' AND do_.active = ?';
    params.push(parseInt(active));
  } else {
    query += ' AND do_.active = 1';
  }

  query += ' ORDER BY d.name ASC, do_.label ASC';
  const ownerships = db.prepare(query).all(...params);
  res.json({ ownerships });
});

// POST /api/department-ownerships - Create a new ownership entry
router.post('/', authenticate, authorize('admin'), (req, res) => {
  const { department_id, label } = req.body;
  if (!department_id) return res.status(400).json({ error: 'Department is required' });
  if (!label || !label.trim()) return res.status(400).json({ error: 'Ownership label is required' });

  // Verify department exists
  const dept = db.prepare('SELECT id FROM departments WHERE id = ?').get(department_id);
  if (!dept) return res.status(404).json({ error: 'Department not found' });

  try {
    const result = db.prepare('INSERT INTO department_ownerships (department_id, label) VALUES (?, ?)').run(department_id, label.trim());
    const ownership = db.prepare('SELECT do_.*, d.name as department_name FROM department_ownerships do_ JOIN departments d ON do_.department_id = d.id WHERE do_.id = ?').get(result.lastInsertRowid);

    db.prepare('INSERT INTO audit_logs (user_id, action, details, entity_type, entity_id, ip_address) VALUES (?, ?, ?, ?, ?, ?)').run(
      req.user.id, 'CREATE_OWNERSHIP', `Created ownership "${label}" for department ID ${department_id}`, 'department_ownership', result.lastInsertRowid, req.ip
    );

    res.status(201).json({ ownership });
  } catch (err) {
    throw err;
  }
});

// PUT /api/department-ownerships/:id - Update an ownership entry
router.put('/:id', authenticate, authorize('admin'), (req, res) => {
  const { label, active } = req.body;
  const id = req.params.id;

  const existing = db.prepare('SELECT id FROM department_ownerships WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Ownership entry not found' });

  if (label) db.prepare('UPDATE department_ownerships SET label = ? WHERE id = ?').run(label.trim(), id);
  if (active !== undefined) db.prepare('UPDATE department_ownerships SET active = ? WHERE id = ?').run(active ? 1 : 0, id);

  const ownership = db.prepare('SELECT do_.*, d.name as department_name FROM department_ownerships do_ JOIN departments d ON do_.department_id = d.id WHERE do_.id = ?').get(id);

  db.prepare('INSERT INTO audit_logs (user_id, action, details, entity_type, entity_id, ip_address) VALUES (?, ?, ?, ?, ?, ?)').run(
    req.user.id, 'UPDATE_OWNERSHIP', `Updated ownership ID ${id}`, 'department_ownership', id, req.ip
  );

  res.json({ ownership });
});

// DELETE /api/department-ownerships/:id - Soft-delete (deactivate)
router.delete('/:id', authenticate, authorize('admin'), (req, res) => {
  const id = req.params.id;
  const existing = db.prepare('SELECT id FROM department_ownerships WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Ownership entry not found' });

  db.prepare('UPDATE department_ownerships SET active = 0 WHERE id = ?').run(id);

  db.prepare('INSERT INTO audit_logs (user_id, action, details, entity_type, entity_id, ip_address) VALUES (?, ?, ?, ?, ?, ?)').run(
    req.user.id, 'DELETE_OWNERSHIP', `Deactivated ownership ID ${id}`, 'department_ownership', id, req.ip
  );

  res.json({ message: 'Ownership entry deactivated' });
});

module.exports = router;
