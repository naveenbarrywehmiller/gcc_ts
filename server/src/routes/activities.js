const express = require('express');
const db = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// GET /api/activities
router.get('/', authenticate, (req, res) => {
  const activities = db.prepare('SELECT * FROM activities WHERE active = 1 ORDER BY name ASC').all();
  res.json({ activities });
});

// POST /api/activities
router.post('/', authenticate, authorize('admin'), (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Activity name is required' });

  try {
    const result = db.prepare('INSERT INTO activities (name) VALUES (?)').run(name.trim());
    const activity = db.prepare('SELECT * FROM activities WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ activity });
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'Activity already exists' });
    }
    throw err;
  }
});

// PUT /api/activities/:id
router.put('/:id', authenticate, authorize('admin'), (req, res) => {
  const { name, active } = req.body;
  const id = req.params.id;

  const existing = db.prepare('SELECT id FROM activities WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Activity not found' });

  if (name) db.prepare('UPDATE activities SET name = ? WHERE id = ?').run(name.trim(), id);
  if (active !== undefined) db.prepare('UPDATE activities SET active = ? WHERE id = ?').run(active ? 1 : 0, id);

  const activity = db.prepare('SELECT * FROM activities WHERE id = ?').get(id);
  res.json({ activity });
});

// DELETE /api/activities/:id
router.delete('/:id', authenticate, authorize('admin'), (req, res) => {
  const id = req.params.id;
  const existing = db.prepare('SELECT id FROM activities WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Activity not found' });

  db.prepare('UPDATE activities SET active = 0 WHERE id = ?').run(id);
  res.json({ message: 'Activity deactivated' });
});

module.exports = router;
