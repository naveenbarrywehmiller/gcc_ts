const db = require('../config/db');
const { descriptionMaxLength } = require('../../../shared/timesheetLimits.json');
const validId = value => ['number', 'string'].includes(typeof value) && Number.isSafeInteger(Number(value)) && Number(value) > 0;

function validateTimesheetEntry(entry, userId = entry.user_id) {
  const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };
  if (!validId(entry.project_id)) fail('Project Code is required');
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(entry.project_id);
  if (!project || !project.active) fail('Select a valid active Project Code');
  if (userId && project.user_assignment_mode === 'selected' && !require('./platformAssignments').canBookProject(userId,project)) throw Object.assign(new Error('Project is not assigned to this user and Division'), { status:403 });
  if (typeof entry.project_description !== 'string' || !entry.project_description.trim()) fail('Description is required');
  if (entry.project_description.length > descriptionMaxLength) fail(`Description must be text of at most ${descriptionMaxLength} characters`);
  const task = validId(entry.task_id)
    ? db.prepare('SELECT * FROM tasks WHERE id = ? AND active = 1').get(entry.task_id) : null;
  if (!task || !['Productive', 'Non-Productive'].includes(task.classification) || !db.prepare('SELECT 1 FROM project_tasks WHERE project_id = ? AND task_id = ?').get(project.id, task.id)) fail('Select an active Task Name/Number assigned to this project');
  return project;
}

function validateWeekEntries(userId, startDate, endDate, statuses) {
  const entries = db.prepare(`SELECT * FROM timesheets WHERE user_id = ? AND work_date BETWEEN ? AND ?
    AND status IN (${statuses.map(() => '?').join(',')})`).all(userId, startDate, endDate, ...statuses);
  entries.forEach(entry => validateTimesheetEntry(entry, userId));
}

module.exports = { validateTimesheetEntry, validateWeekEntries };
