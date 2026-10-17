const db = require('../config/db');
const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };

function assignments(projectId) {
  return db.prepare(`SELECT t.* FROM project_tasks pt JOIN tasks t ON t.id = pt.task_id
    WHERE pt.project_id = ? ORDER BY t.classification, t.task_category, t.id`).all(projectId);
}

function validateAssignments(input, projectId) {
  const previous = projectId ? assignments(projectId) : [];
  const groups = {};
  for (const [key, classification] of [['billable_task_ids', 'Productive'], ['non_billable_task_ids', 'Non-Productive']]) {
    let ids = input[key] === undefined ? previous.filter(t => t.classification === classification).map(t => t.id) : input[key];
    // Spreadsheet lists use semicolon-separated stable task IDs.
    if (typeof ids === 'string') ids = ids.trim() ? ids.split(';').map(id => id.trim()) : [];
    if (!Array.isArray(ids) || ids.some(id => !['number', 'string'].includes(typeof id) || !Number.isSafeInteger(Number(id)) || Number(id) <= 0)) fail(`${classification} tasks must be a list of task IDs`);
    groups[key] = [...new Set(ids.map(Number))];
    for (const id of groups[key]) {
      const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
      if (!task || task.classification !== classification || (!task.active && !previous.some(t => t.id === id))) fail(`Select a valid active ${classification} task (ID ${id})`);
    }
  }
  if (!groups.billable_task_ids.length && !groups.non_billable_task_ids.length) fail('Assign at least one Productive or Non-Productive task');
  return groups;
}

function saveAssignments(projectId, groups) {
  db.prepare('DELETE FROM project_tasks WHERE project_id = ?').run(projectId);
  const insert = db.prepare('INSERT INTO project_tasks(project_id, task_id) VALUES (?, ?)');
  for (const id of [...groups.billable_task_ids, ...groups.non_billable_task_ids]) insert.run(projectId, id);
}

function withTasks(project) {
  const tasks = assignments(project.id);
  const estimated = tasks.filter(t => t.estimated_hours !== null);
  return { ...project, tasks, billable_task_ids: tasks.filter(t => t.classification === 'Productive').map(t => t.id),
    non_billable_task_ids: tasks.filter(t => t.classification === 'Non-Productive').map(t => t.id),
    task_estimated_hours: estimated.length ? estimated.reduce((sum, t) => sum + t.estimated_hours, 0) : null,
    estimated_task_count: estimated.length, assigned_task_count: tasks.length };
}
module.exports = { assignments, validateAssignments, saveAssignments, withTasks };
