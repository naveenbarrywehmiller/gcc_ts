const express = require('express');
const db = require('../config/db');
const { authenticate } = require('../middleware/auth');

const { permit, protectCatalogStatus } = require('../middleware/permissions');
const { catalogAudit } = require('../middleware/catalogAudit');
const router = express.Router();

// ===== DIVISIONS =====

// GET /api/divisions
router.get('/', authenticate, (req, res) => {
  const divisions = db.prepare('SELECT d.*, p.name AS platform_name FROM divisions d JOIN platforms p ON p.id=d.platform_id WHERE d.active=1 ORDER BY p.name,d.name').all();
  res.json({ divisions: divisions.filter(d => !req.query.platform_id || d.platform_id === Number(req.query.platform_id)) });
});

// POST /api/divisions
router.post('/', authenticate, permit('catalogEdit'), catalogAudit('divisions', 'division'), (req, res) => {
  const { name, platform_id } = req.body;
  if (!Number.isSafeInteger(Number(platform_id)) || !db.prepare('SELECT 1 FROM platforms WHERE id=? AND active=1').get(Number(platform_id))) return res.status(400).json({ error: 'Platform is required' });
  if (typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'Division name is required' });

  if (db.prepare('SELECT 1 FROM divisions WHERE LOWER(TRIM(name))=LOWER(?)').get(name.trim())) return res.status(409).json({ error:'Division already exists' });
  try {
    const result = db.prepare('INSERT INTO divisions (name,platform_id) VALUES (?,?)').run(name.trim(),Number(platform_id));
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
router.put('/:id', authenticate, permit('catalogEdit'), protectCatalogStatus, catalogAudit('divisions', 'division'), (req, res) => {
  const { name, active, platform_id } = req.body;
  const id = req.params.id;
  if (name !== undefined && (typeof name !== 'string' || !name.trim())) return res.status(400).json({ error:'Division name is required' });

  const existing = db.prepare('SELECT * FROM divisions WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Division not found' });

  if (platform_id !== undefined) {
    if (!Number.isSafeInteger(Number(platform_id)) || !db.prepare('SELECT 1 FROM platforms WHERE id=? AND active=1').get(Number(platform_id))) return res.status(400).json({ error:'Platform is required' });
    if (Number(platform_id) !== existing.platform_id && req.user.role !== 'system admin') return res.status(403).json({ error:'Only a System Admin can reclassify a Division' });
  }
  if (name && db.prepare('SELECT 1 FROM divisions WHERE LOWER(TRIM(name))=LOWER(?) AND id!=?').get(name.trim(),id)) return res.status(409).json({ error:'Division already exists' });
  db.transaction(() => {
  if (platform_id !== undefined) {
    db.prepare('UPDATE divisions SET platform_id=? WHERE id=?').run(Number(platform_id),id);
    db.prepare(`INSERT OR IGNORE INTO user_platforms(user_id,platform_id) SELECT user_id,? FROM admin_divisions WHERE division_id=? UNION SELECT user_id,? FROM employee_divisions WHERE division_id=? UNION SELECT id,? FROM users WHERE division_id=?`).run(Number(platform_id),id,Number(platform_id),id,Number(platform_id),id);
  }
  if (name) db.prepare('UPDATE divisions SET name = ? WHERE id = ?').run(name.trim(), id);
  if (active !== undefined) db.prepare('UPDATE divisions SET active = ? WHERE id = ?').run(active ? 1 : 0, id);

  })();
  const division = db.prepare('SELECT * FROM divisions WHERE id = ?').get(id);
  res.json({ division });
});

// DELETE /api/divisions/:id
router.delete('/:id', authenticate, permit('catalogDelete'), catalogAudit('divisions', 'division'), (req, res) => {
  const id = req.params.id;
  const existing = db.prepare('SELECT * FROM divisions WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Division not found' });

  db.prepare('UPDATE divisions SET active = 0 WHERE id = ?').run(id);
  res.json({ message: 'Division deactivated' });
});

module.exports = router;
