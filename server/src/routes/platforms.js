const express = require('express');
const db = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { permit } = require('../middleware/permissions');
const { catalogAudit } = require('../middleware/catalogAudit');
const { adminDivisionIds } = require('../utils/divisionScope');
const { userAssignments } = require('../utils/platformAssignments');
const router = express.Router();
router.use(authenticate);
router.get('/', (req, res) => {
  let platforms = db.prepare('SELECT * FROM platforms WHERE active=1 ORDER BY name').all();
  if (req.user.role === 'admin') {
    const divisions = adminDivisionIds(req.user);
    const allowed = db.prepare(`SELECT DISTINCT platform_id FROM divisions WHERE id IN (${divisions.map(() => '?').join(',') || 'NULL'})`).all(...divisions).map(d => d.platform_id);
    platforms = platforms.filter(p => allowed.includes(p.id));
  } else if (req.user.role === 'employee') {
    const allowed = userAssignments(req.user).platform_ids;
    platforms = platforms.filter(p => allowed.includes(p.id));
  }
  res.json({ platforms });
});
function name(value) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 200) throw Object.assign(new Error('Platform name is required (maximum 200 characters)'), { status: 400 });
  return value.trim();
}
router.post('/', permit('accessGrants'), catalogAudit('platforms','platform'), (req,res) => {
  try {
    const result = db.prepare('INSERT INTO platforms(name) VALUES (?)').run(name(req.body.name));
    res.status(201).json({ platform: db.prepare('SELECT * FROM platforms WHERE id=?').get(result.lastInsertRowid) });
  } catch (err) { if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error:'Platform already exists' }); throw err; }
});
router.put('/:id', permit('accessGrants'), catalogAudit('platforms','platform'), (req,res) => {
  if (!db.prepare('SELECT 1 FROM platforms WHERE id=?').get(req.params.id)) return res.status(404).json({ error:'Platform not found' });
  try {
    db.prepare('UPDATE platforms SET name=? WHERE id=?').run(name(req.body.name),req.params.id);
    res.json({ platform:db.prepare('SELECT * FROM platforms WHERE id=?').get(req.params.id) });
  } catch (err) { if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error:'Platform already exists' }); throw err; }
});
router.delete('/:id', permit('accessGrants'), catalogAudit('platforms','platform'), (req,res) => {
  if (db.prepare('SELECT 1 FROM divisions WHERE platform_id=? LIMIT 1').get(req.params.id) || db.prepare('SELECT 1 FROM user_platforms WHERE platform_id=? LIMIT 1').get(req.params.id)) return res.status(409).json({ error:'Reassign divisions and users before deactivating this Platform' });
  if (!db.prepare('UPDATE platforms SET active=0 WHERE id=?').run(req.params.id).changes) return res.status(404).json({ error:'Platform not found' });
  res.json({ message:'Platform deactivated' });
});
module.exports = router;
