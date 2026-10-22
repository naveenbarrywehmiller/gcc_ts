const express = require('express');
const db = require('../config/db');
const { authenticate } = require('../middleware/auth');

const { permit } = require('../middleware/permissions');
const router = express.Router();
const { validateTask, validateTaskHistory } = require('../utils/taskFields');
const ExcelJS = require('exceljs');
const { taskColumns, createSheet, addDropdowns, addManifest, exportFilename } = require('../utils/catalogWorkbook');
const taskSelect = `SELECT t.*, 1 AS requires_project, o.label AS ownership_label,
  d.name AS ownership_department_name FROM tasks t
  LEFT JOIN department_ownerships o ON o.id = t.ownership_id
  LEFT JOIN departments d ON d.id = o.department_id`;
const ownershipChoice = item => `${item.id} — ${item.department_name} — ${item.label}`;

router.get('/export', authenticate, permit('tasksView'), async (req, res, next) => {
  try {
    const workbook = new ExcelJS.Workbook();
    const sheet = createSheet(workbook, 'Tasks', taskColumns);
    const tasks = db.prepare(`${taskSelect} ORDER BY t.classification, t.task_category, t.id`).all().filter(t =>
      (req.query.active === 'all' || t.active === (req.query.active === '0' ? 0 : 1)) &&
      (!req.query.classification || t.classification === req.query.classification) &&
      (!req.query.search || [t.task_category, t.task_description, t.classification].some(value => value?.toLowerCase().includes(String(req.query.search).toLowerCase()))));
    const choices = db.prepare(`SELECT o.id, o.label, d.name AS department_name FROM department_ownerships o
      JOIN departments d ON d.id = o.department_id WHERE o.active = 1 AND d.active = 1 ORDER BY d.name, o.label, o.id`).all().map(ownershipChoice);
    tasks.forEach(t => {
      const ownership = t.ownership_id ? ownershipChoice({ id: t.ownership_id, department_name: t.ownership_department_name, label: t.ownership_label }) : '';
      if (ownership) choices.push(ownership);
      sheet.addRow({ ...t, ownership_id: ownership, active: t.active ? 'Yes' : 'No' });
    });
    addDropdowns(workbook, sheet, taskColumns, { classification: ['Productive', 'Non-Productive'], ownership_id: choices, active: ['Yes', 'No'] });
    addManifest(workbook, 'tasks', tasks);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${exportFilename('tasks', req.query.time_zone)}"`);
    await workbook.xlsx.write(res); res.end();
  } catch (error) { next(error); }
});

// GET /api/tasks
router.get('/', authenticate, (req, res) => {
  const { search, classification, active } = req.query;
  let query = `${taskSelect} WHERE 1=1`;
  const params = [];

  if (search) {
    query += ' AND (t.task_category LIKE ? OR t.task_description LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }
  if (classification) { query += ' AND t.classification = ?'; params.push(classification); }
  if (active !== 'all') {
    if (active !== undefined) { query += ' AND t.active = ?'; params.push(parseInt(active)); }
    else { query += ' AND t.active = 1'; }
  }

  query += ' ORDER BY t.classification, t.task_category ASC';
  const tasks = db.prepare(query).all(...params);
  res.json({ tasks });
});

// POST /api/tasks
router.post('/', authenticate, permit('tasks'), (req, res) => {
  const data = validateTask(req.body);
  const keys = Object.keys(data);
  const result = db.prepare(`INSERT INTO tasks (${keys.join(',')}, requires_project) VALUES (${keys.map(() => '?').join(',')}, 1)`).run(...Object.values(data));

  const task = db.prepare(`${taskSelect} WHERE t.id = ?`).get(result.lastInsertRowid);
  res.status(201).json({ task });
});

// PUT /api/tasks/:id
router.put('/:id', authenticate, permit('tasks'), (req, res) => {
  const taskId = req.params.id;
  const existing = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
  if (!existing) return res.status(404).json({ error: 'Task not found' });
  const data = validateTask(req.body, existing);
  validateTaskHistory(data, existing);
  db.prepare(`UPDATE tasks SET ${Object.keys(data).map(k => `${k} = ?`).join(',')}, requires_project = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(...Object.values(data), taskId);
  const task = db.prepare(`${taskSelect} WHERE t.id = ?`).get(taskId);
  res.json({ task });
});

// DELETE /api/tasks/:id
router.delete('/:id', authenticate, permit('tasks'), (req, res) => {
  const taskId = req.params.id;
  const existing = db.prepare('SELECT id FROM tasks WHERE id = ?').get(taskId);
  if (!existing) return res.status(404).json({ error: 'Task not found' });

  db.prepare('UPDATE tasks SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(taskId);
  res.json({ message: 'Task deactivated successfully' });
});

module.exports = router;
