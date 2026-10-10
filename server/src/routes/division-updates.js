const express = require('express');
const db = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { reportingDivisionIds, canEditDivisionUpdate } = require('../utils/divisionScope');
const { permit } = require('../middleware/permissions');
const router = express.Router();
router.use(authenticate, permit('divisionUpdateView'));
router.use((req, res, next) => req.method === 'GET' ? next() : permit('divisionUpdateEdit')(req, res, next));
router.use((req, res, next) => {
  const data = req.method === 'GET' ? req.query : req.body;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(data.month || '') || !Number.isSafeInteger(Number(data.division_id)) || Number(data.division_id) <= 0) {
    return res.status(400).json({ error: 'Select a division and month' });
  }
  if (req.user.role !== 'system admin' && !reportingDivisionIds(req.user).includes(Number(data.division_id))) return res.status(403).json({ error: 'Division access denied' });
  if (!db.prepare('SELECT id FROM divisions WHERE id = ? AND active = 1').get(data.division_id)) return res.status(400).json({ error: 'Invalid division' });
  next();
});
router.get('/', (req, res) => {
  const record = db.prepare('SELECT * FROM division_updates WHERE division_id = ? AND month = ?').get(req.query.division_id, req.query.month);
  res.json({ record: record || null });
});
router.put('/', (req, res) => {
  if (!canEditDivisionUpdate(req.user, req.body.division_id)) return res.status(403).json({ error: 'Division access denied' });
  const { division_id, month } = req.body;
  const data = {};
  for (const key of ['travel_visa', 'open_positions', 'new_joiners']) {
    if (req.body[key] === undefined) continue;
    const value = req.body[key];
    if (typeof value !== 'string' || value.length > 10000) return res.status(400).json({ error: `${key.replaceAll('_', ' ')} must be text up to 10000 characters` });
    data[key] = value.trim();
  }
  if (!Object.keys(data).length) return res.status(400).json({ error: 'No fields supplied' });
  const record = db.transaction(() => {
    db.prepare('INSERT OR IGNORE INTO division_updates(division_id, month) VALUES (?,?)').run(division_id, month);
    db.prepare(`UPDATE division_updates SET ${Object.keys(data).map(k => `${k} = ?`).join(',')}, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE division_id = ? AND month = ?`)
      .run(...Object.values(data), req.user.id, division_id, month);
    db.prepare('INSERT INTO audit_logs(user_id, action, details, division_id, ip_address) VALUES (?,?,?,?,?)')
      .run(req.user.id, 'UPDATE_DIVISION_RECORD', `Division ${division_id}, ${month}: ${Object.keys(data).join(', ')}`, Number(division_id), req.ip);
    return db.prepare('SELECT * FROM division_updates WHERE division_id = ? AND month = ?').get(division_id, month);
  })();
  res.json({ record });
});
module.exports = router;
