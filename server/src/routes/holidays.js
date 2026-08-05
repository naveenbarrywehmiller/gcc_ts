const express = require('express');
const db = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// GET /api/holidays
router.get('/', authenticate, (req, res) => {
  const { year } = req.query;
  let query = 'SELECT * FROM holidays';
  const params = [];

  if (year) {
    query += ' WHERE date LIKE ?';
    params.push(`${year}-%`);
  }

  query += ' ORDER BY date ASC';
  const holidays = db.prepare(query).all(...params);
  res.json({ holidays });
});

// POST /api/holidays
router.post('/', authenticate, authorize('admin'), (req, res) => {
  const { date, name } = req.body;
  if (!date || !name) return res.status(400).json({ error: 'Date and name are required' });

  try {
    const result = db.prepare('INSERT INTO holidays (date, name) VALUES (?, ?)').run(date, name.trim());
    const holiday = db.prepare('SELECT * FROM holidays WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ holiday });
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'Holiday already exists for this date' });
    }
    throw err;
  }
});

// PUT /api/holidays/:id
router.put('/:id', authenticate, authorize('admin'), (req, res) => {
  const { date, name } = req.body;
  const id = req.params.id;

  const existing = db.prepare('SELECT id FROM holidays WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Holiday not found' });

  if (date) db.prepare('UPDATE holidays SET date = ? WHERE id = ?').run(date, id);
  if (name) db.prepare('UPDATE holidays SET name = ? WHERE id = ?').run(name.trim(), id);

  const holiday = db.prepare('SELECT * FROM holidays WHERE id = ?').get(id);
  res.json({ holiday });
});

// DELETE /api/holidays/:id
router.delete('/:id', authenticate, authorize('admin'), (req, res) => {
  const id = req.params.id;
  const existing = db.prepare('SELECT id FROM holidays WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Holiday not found' });

  db.prepare('DELETE FROM holidays WHERE id = ?').run(id);
  res.json({ message: 'Holiday deleted' });
});

module.exports = router;
