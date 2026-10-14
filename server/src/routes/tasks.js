const express = require('express');
const db = require('../config/db');
const { authenticate } = require('../middleware/auth');

const { permit } = require('../middleware/permissions');
const router = express.Router();
const { validateTask } = require('../utils/taskFields');

// GET /api/tasks
router.get('/', authenticate, (req, res) => {
  const { search, classification, active } = req.query;
  let query = 'SELECT *, 1 AS requires_project FROM tasks WHERE 1=1';
  const params = [];

  if (search) {
    query += ' AND (task_category LIKE ? OR task_description LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }
  if (classification) { query += ' AND classification = ?'; params.push(classification); }
  if (active !== 'all') {
    if (active !== undefined) { query += ' AND active = ?'; params.push(parseInt(active)); }
    else { query += ' AND active = 1'; }
  }

  query += ' ORDER BY classification, task_category ASC';
  const tasks = db.prepare(query).all(...params);
  res.json({ tasks });
});

// POST /api/tasks
router.post('/', authenticate, permit('tasks'), (req, res) => {
  const data = validateTask(req.body);
  const keys = Object.keys(data);
  const result = db.prepare(`INSERT INTO tasks (${keys.join(',')}, requires_project) VALUES (${keys.map(() => '?').join(',')}, 1)`).run(...Object.values(data));

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ task });
});

// PUT /api/tasks/:id
router.put('/:id', authenticate, permit('tasks'), (req, res) => {
  const taskId = req.params.id;
  const existing = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
  if (!existing) return res.status(404).json({ error: 'Task not found' });
  const data = validateTask(req.body, existing);
  if (data.classification !== existing.classification &&
      (db.prepare('SELECT 1 FROM project_tasks WHERE task_id = ? LIMIT 1').get(taskId) || db.prepare('SELECT 1 FROM timesheets WHERE task_id = ? LIMIT 1').get(taskId))) {
    return res.status(409).json({ error: 'Classification cannot change for an assigned or logged task. Create a new task to preserve billing history.' });
  }
  db.prepare(`UPDATE tasks SET ${Object.keys(data).map(k => `${k} = ?`).join(',')}, requires_project = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(...Object.values(data), taskId);
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
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
