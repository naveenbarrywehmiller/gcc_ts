const express = require('express');
const db = require('../config/db');
const { authenticate } = require('../middleware/auth');

const { permit, protectCatalogStatus } = require('../middleware/permissions');
const { catalogAudit } = require('../middleware/catalogAudit');
const router = express.Router();

// GET /api/supporting-categories - List all supporting categories
router.get('/', authenticate, (req, res) => {
  const { active } = req.query;
  let query = 'SELECT * FROM supporting_categories WHERE 1=1';
  const params = [];

  if (active !== undefined) {
    query += ' AND active = ?';
    params.push(parseInt(active));
  } else {
    query += ' AND active = 1';
  }

  query += ' ORDER BY name ASC';
  const categories = db.prepare(query).all(...params);
  res.json({ categories });
});

// POST /api/supporting-categories
router.post('/', authenticate, permit('catalogEdit'), catalogAudit('supporting_categories', 'supporting_category'), (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Category name is required' });

  try {
    const result = db.prepare('INSERT INTO supporting_categories (name) VALUES (?)').run(name.trim());
    const category = db.prepare('SELECT * FROM supporting_categories WHERE id = ?').get(result.lastInsertRowid);

    res.status(201).json({ category });
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'Supporting category already exists' });
    }
    throw err;
  }
});

// PUT /api/supporting-categories/:id
router.put('/:id', authenticate, permit('catalogEdit'), protectCatalogStatus, catalogAudit('supporting_categories', 'supporting_category'), (req, res) => {
  const { name, active } = req.body;
  const id = req.params.id;

  const existing = db.prepare('SELECT id FROM supporting_categories WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Supporting category not found' });

  if (name) db.prepare('UPDATE supporting_categories SET name = ? WHERE id = ?').run(name.trim(), id);
  if (active !== undefined) db.prepare('UPDATE supporting_categories SET active = ? WHERE id = ?').run(active ? 1 : 0, id);

  const category = db.prepare('SELECT * FROM supporting_categories WHERE id = ?').get(id);
  res.json({ category });
});

// DELETE /api/supporting-categories/:id
router.delete('/:id', authenticate, permit('catalogDelete'), catalogAudit('supporting_categories', 'supporting_category'), (req, res) => {
  const id = req.params.id;
  const existing = db.prepare('SELECT id FROM supporting_categories WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Supporting category not found' });

  db.prepare('UPDATE supporting_categories SET active = 0 WHERE id = ?').run(id);
  res.json({ message: 'Supporting category deactivated' });
});

module.exports = router;
