const express = require('express');
const db = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// GET /api/subdivisions - List subdivisions (optionally filtered by division_id)
router.get('/', authenticate, (req, res) => {
  const { division_id, active } = req.query;
  let query = `
    SELECT s.*, d.name as division_name 
    FROM subdivisions s 
    LEFT JOIN divisions d ON s.division_id = d.id 
    WHERE 1=1
  `;
  const params = [];

  if (active !== undefined) {
    query += ' AND s.active = ?';
    params.push(parseInt(active));
  } else {
    query += ' AND s.active = 1';
  }

  if (division_id) {
    query += ' AND s.division_id = ?';
    params.push(parseInt(division_id));
  }

  query += ' ORDER BY d.name ASC, s.name ASC';
  const subdivisions = db.prepare(query).all(...params);
  res.json({ subdivisions });
});

// GET /api/subdivisions/:id
router.get('/:id', authenticate, (req, res) => {
  const subdivision = db.prepare(`
    SELECT s.*, d.name as division_name 
    FROM subdivisions s 
    LEFT JOIN divisions d ON s.division_id = d.id 
    WHERE s.id = ?
  `).get(req.params.id);
  if (!subdivision) return res.status(404).json({ error: 'Subdivision not found' });
  res.json({ subdivision });
});

// POST /api/subdivisions
router.post('/', authenticate, authorize('admin'), (req, res) => {
  const { name, division_id } = req.body;
  if (!name || !division_id) {
    return res.status(400).json({ error: 'Name and division are required' });
  }

  // Verify division exists
  const division = db.prepare('SELECT id FROM divisions WHERE id = ? AND active = 1').get(division_id);
  if (!division) return res.status(400).json({ error: 'Invalid division' });

  // Check duplicate within same division
  const existing = db.prepare('SELECT id FROM subdivisions WHERE name = ? AND division_id = ? AND active = 1').get(name.trim(), division_id);
  if (existing) return res.status(409).json({ error: 'Subdivision already exists in this division' });

  try {
    const result = db.prepare('INSERT INTO subdivisions (name, division_id) VALUES (?, ?)').run(name.trim(), division_id);
    const subdivision = db.prepare(`
      SELECT s.*, d.name as division_name 
      FROM subdivisions s 
      LEFT JOIN divisions d ON s.division_id = d.id 
      WHERE s.id = ?
    `).get(result.lastInsertRowid);

    db.prepare('INSERT INTO audit_logs (user_id, action, details, entity_type, entity_id, ip_address) VALUES (?, ?, ?, ?, ?, ?)').run(
      req.user.id, 'CREATE_SUBDIVISION', `Created subdivision: ${name} in division ${division_id}`, 'subdivision', result.lastInsertRowid, req.ip
    );

    res.status(201).json({ subdivision });
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'Subdivision already exists' });
    }
    throw err;
  }
});

// PUT /api/subdivisions/:id
router.put('/:id', authenticate, authorize('admin'), (req, res) => {
  const { name, division_id, active } = req.body;
  const id = req.params.id;

  const existing = db.prepare('SELECT id FROM subdivisions WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Subdivision not found' });

  if (division_id) {
    const division = db.prepare('SELECT id FROM divisions WHERE id = ? AND active = 1').get(division_id);
    if (!division) return res.status(400).json({ error: 'Invalid division' });
  }

  let updateFields = [];
  let params = [];
  if (name !== undefined) { updateFields.push('name = ?'); params.push(name.trim()); }
  if (division_id !== undefined) { updateFields.push('division_id = ?'); params.push(division_id); }
  if (active !== undefined) { updateFields.push('active = ?'); params.push(active ? 1 : 0); }

  if (updateFields.length === 0) return res.status(400).json({ error: 'No fields to update' });

  params.push(id);
  db.prepare(`UPDATE subdivisions SET ${updateFields.join(', ')} WHERE id = ?`).run(...params);

  const subdivision = db.prepare(`
    SELECT s.*, d.name as division_name 
    FROM subdivisions s 
    LEFT JOIN divisions d ON s.division_id = d.id 
    WHERE s.id = ?
  `).get(id);
  res.json({ subdivision });
});

// DELETE /api/subdivisions/:id
router.delete('/:id', authenticate, authorize('admin'), (req, res) => {
  const id = req.params.id;
  const existing = db.prepare('SELECT id FROM subdivisions WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Subdivision not found' });

  db.prepare('UPDATE subdivisions SET active = 0 WHERE id = ?').run(id);
  res.json({ message: 'Subdivision deactivated' });
});

module.exports = router;
