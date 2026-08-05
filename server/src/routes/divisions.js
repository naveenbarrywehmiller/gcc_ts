const express = require('express');
const db = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// ===== DIVISIONS =====

// GET /api/divisions
router.get('/', authenticate, (req, res) => {
  const divisions = db.prepare('SELECT * FROM divisions WHERE active = 1 ORDER BY name ASC').all();
  res.json({ divisions });
});

// POST /api/divisions
router.post('/', authenticate, authorize('admin'), (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Division name is required' });

  try {
    const result = db.prepare('INSERT INTO divisions (name) VALUES (?)').run(name.trim());
    const division = db.prepare('SELECT * FROM divisions WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ division });
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'Division already exists' });
    }
    throw err;
  }
});

// PUT /api/divisions/:id
router.put('/:id', authenticate, authorize('admin'), (req, res) => {
  const { name, active } = req.body;
  const id = req.params.id;

  const existing = db.prepare('SELECT id FROM divisions WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Division not found' });

  if (name) db.prepare('UPDATE divisions SET name = ? WHERE id = ?').run(name.trim(), id);
  if (active !== undefined) db.prepare('UPDATE divisions SET active = ? WHERE id = ?').run(active ? 1 : 0, id);

  const division = db.prepare('SELECT * FROM divisions WHERE id = ?').get(id);
  res.json({ division });
});

// DELETE /api/divisions/:id
router.delete('/:id', authenticate, authorize('admin'), (req, res) => {
  const id = req.params.id;
  const existing = db.prepare('SELECT id FROM divisions WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Division not found' });

  db.prepare('UPDATE divisions SET active = 0 WHERE id = ?').run(id);
  res.json({ message: 'Division deactivated' });
});

module.exports = router;
