const express = require('express');
const db = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// GET /api/tasks
router.get('/', authenticate, (req, res) => {
  const { search, classification, active } = req.query;
  let query = 'SELECT * FROM tasks WHERE 1=1';
  const params = [];

  if (search) {
    query += ' AND (task_category LIKE ? OR task_description LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }
  if (classification) { query += ' AND classification = ?'; params.push(classification); }
  if (active !== undefined) { query += ' AND active = ?'; params.push(parseInt(active)); }
  else { query += ' AND active = 1'; }

  query += ' ORDER BY classification, task_category ASC';
  const tasks = db.prepare(query).all(...params);
  res.json({ tasks });
});

// POST /api/tasks
router.post('/', authenticate, authorize('admin'), (req, res) => {
  const { classification, task_category, task_description, requires_project } = req.body;
  if (!task_category) return res.status(400).json({ error: 'Task category is required' });

  const result = db.prepare(
    'INSERT INTO tasks (classification, task_category, task_description, requires_project) VALUES (?, ?, ?, ?)'
  ).run(classification || null, task_category.trim(), task_description || null, requires_project !== undefined ? (requires_project ? 1 : 0) : 1);

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ task });
});

// PUT /api/tasks/:id
router.put('/:id', authenticate, authorize('admin'), (req, res) => {
  const { classification, task_category, task_description, active, requires_project } = req.body;
  const taskId = req.params.id;

  const existing = db.prepare('SELECT id FROM tasks WHERE id = ?').get(taskId);
  if (!existing) return res.status(404).json({ error: 'Task not found' });

  let updateFields = [];
  let params = [];

  if (classification !== undefined) { updateFields.push('classification = ?'); params.push(classification); }
  if (task_category !== undefined) { updateFields.push('task_category = ?'); params.push(task_category.trim()); }
  if (task_description !== undefined) { updateFields.push('task_description = ?'); params.push(task_description); }
  if (active !== undefined) { updateFields.push('active = ?'); params.push(active ? 1 : 0); }
  if (requires_project !== undefined) { updateFields.push('requires_project = ?'); params.push(requires_project ? 1 : 0); }

  if (updateFields.length === 0) return res.status(400).json({ error: 'No fields to update' });
  updateFields.push('updated_at = CURRENT_TIMESTAMP');
  params.push(taskId);

  db.prepare(`UPDATE tasks SET ${updateFields.join(', ')} WHERE id = ?`).run(...params);
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
  res.json({ task });
});

// DELETE /api/tasks/:id
router.delete('/:id', authenticate, authorize('admin'), (req, res) => {
  const taskId = req.params.id;
  const existing = db.prepare('SELECT id FROM tasks WHERE id = ?').get(taskId);
  if (!existing) return res.status(404).json({ error: 'Task not found' });

  db.prepare('UPDATE tasks SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(taskId);
  res.json({ message: 'Task deactivated successfully' });
});

module.exports = router;
