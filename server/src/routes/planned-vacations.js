const express = require('express');
const db = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { adminDivisionIds } = require('../utils/divisionScope');
const router = express.Router();

router.use(authenticate);

function validDate(value) {
  if (typeof value !== 'string' || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

// Match the existing division-ID scope, including legacy profiles with a division name only.
function teamScope(user) {
  if (user.role === 'system admin') return { sql: '1=1', params: [] };
  const ids = adminDivisionIds(user);
  return {
    sql: ids.length ? `COALESCE(u.division_id, (
      SELECT d.id FROM divisions d WHERE LOWER(TRIM(d.name)) = LOWER(TRIM(u.division)) AND d.active = 1
    )) IN (${ids.map(() => '?').join(',')})` : '0=1',
    params: ids,
  };
}

router.get('/employees', authorize('admin'), (req, res) => {
  const scope = teamScope(req.user);
  const employees = db.prepare(`SELECT u.id, u.name, COALESCE(d.name, u.division) AS division_name
    FROM users u LEFT JOIN divisions d ON d.id = u.division_id
    WHERE ${scope.sql} ORDER BY u.name, u.id`).all(...scope.params);
  res.json({ employees });
});

router.get('/', (req, res) => {
  const { start, end, view = 'mine', employee_id } = req.query;
  if (!validDate(start) || !validDate(end) || start > end ||
      (Date.parse(end) - Date.parse(start)) / 86400000 > 365) {
    return res.status(400).json({ error: 'Choose a valid date range of up to 366 days.' });
  }
  if (!['mine', 'team'].includes(view)) return res.status(400).json({ error: 'Invalid vacation view.' });
  if (view === 'team' && !['admin', 'system admin'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Only admins can view team vacation plans.' });
  }
  const scope = view === 'team' ? teamScope(req.user) : { sql: 'u.id = ?', params: [req.user.id] };
  let employeeFilter = '';
  if (employee_id !== undefined) {
    const id = Number(employee_id);
    if (typeof employee_id !== 'string' || !/^[1-9]\d*$/.test(employee_id) || !Number.isSafeInteger(id)) {
      return res.status(400).json({ error: 'Invalid employee.' });
    }
    employeeFilter = ' AND u.id = ?';
    scope.params.push(id);
  }
  const plans = db.prepare(`SELECT v.id, v.user_id, v.vacation_date, u.name AS employee_name,
      COALESCE(d.name, u.division) AS division_name
    FROM planned_vacations v JOIN users u ON u.id = v.user_id
    LEFT JOIN divisions d ON d.id = u.division_id
    WHERE v.vacation_date BETWEEN ? AND ? AND (${scope.sql}) ${employeeFilter}
    ORDER BY v.vacation_date, u.name, u.id`).all(start, end, ...scope.params);
  res.json({ plans });
});

// Apply only explicit date edits. Never replace a whole week or write timesheet data.
router.patch('/', (req, res) => {
  const { changes } = req.body || {};
  if (!Array.isArray(changes) || changes.length < 1 || changes.length > 366 ||
      changes.some(change => !change || !validDate(change.date) || typeof change.planned !== 'boolean') ||
      new Set(changes.map(change => change.date)).size !== changes.length) {
    return res.status(400).json({ error: 'Provide 1–366 unique valid dates with a planned flag.' });
  }
  const add = db.prepare('INSERT INTO planned_vacations(user_id, vacation_date) VALUES (?, ?) ON CONFLICT(user_id, vacation_date) DO NOTHING');
  const remove = db.prepare('DELETE FROM planned_vacations WHERE user_id = ? AND vacation_date = ?');
  db.transaction(() => {
    for (const change of changes) {
      (change.planned ? add : remove).run(req.user.id, change.date);
    }
  })();
  res.json({ success: true });
});

module.exports = router;
