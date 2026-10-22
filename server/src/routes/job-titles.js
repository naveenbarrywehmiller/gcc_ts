const express = require('express');
const db = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { permit } = require('../middleware/permissions');
const { catalogAudit } = require('../middleware/catalogAudit');
const router = express.Router();

router.get('/', authenticate, (req, res) => {
  res.json({ jobTitles: db.prepare('SELECT * FROM job_titles WHERE active = 1 ORDER BY name').all() });
});

function saveTitle(req, res) {
  const { name } = req.body || {};
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 100) {
    return res.status(400).json({ error: 'Job title must be between 1 and 100 characters' });
  }
  if (req.params.id && !db.prepare('SELECT id FROM job_titles WHERE id = ? AND active = 1').get(req.params.id)) {
    return res.status(404).json({ error: 'Job title not found' });
  }
  try {
    const id = req.params.id || db.prepare('INSERT INTO job_titles(name) VALUES (?)').run(name.trim()).lastInsertRowid;
    if (req.params.id) db.prepare('UPDATE job_titles SET name = ? WHERE id = ?').run(name.trim(), id);
    res.status(req.params.id ? 200 : 201).json({ jobTitle: db.prepare('SELECT * FROM job_titles WHERE id = ?').get(id) });
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: 'Job title already exists' });
    throw error;
  }
}

router.post('/', authenticate, permit('catalogEdit'), catalogAudit('job_titles', 'job_title'), saveTitle);
router.put('/:id', authenticate, permit('catalogEdit'), catalogAudit('job_titles', 'job_title'), saveTitle);
router.delete('/:id', authenticate, permit('catalogDelete'), catalogAudit('job_titles', 'job_title'), (req, res) => {
  const result = db.prepare('UPDATE job_titles SET active = 0 WHERE id = ? AND active = 1').run(req.params.id);
  if (!result.changes) return res.status(404).json({ error: 'Job title not found' });
  res.json({ message: 'Job title deactivated' });
});

module.exports = router;
