const db = require('../config/db');
const { descriptionMaxLength } = require('../../../shared/timesheetLimits.json');
const validId = value => ['number', 'string'].includes(typeof value) && Number.isSafeInteger(Number(value)) && Number(value) > 0;

function validateTimesheetEntry(entry) {
  const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };
  if (!validId(entry.project_id)) fail('Project Code is required');
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(entry.project_id);
  if (!project || !project.active) fail('Select a valid active Project Code');
  if (typeof entry.project_description !== 'string' || !entry.project_description.trim()) fail('Description is required');
  if (entry.project_description.length > descriptionMaxLength) fail(`Description must be text of at most ${descriptionMaxLength} characters`);
  if (!['Billable', 'Non-Billable'].includes(project.billing_type)) fail('An administrator must select the project Billing Type before time can be saved or submitted');
  const task = validId(entry.task_id)
    ? db.prepare('SELECT * FROM tasks WHERE id = ? AND active = 1').get(entry.task_id) : null;
  if (!task || task.classification !== project.billing_type) fail('Select an active Task Name/Number matching the project Billing Type');
  return project;
}

function validateWeekEntries(userId, startDate, endDate, statuses) {
  const entries = db.prepare(`SELECT * FROM timesheets WHERE user_id = ? AND work_date BETWEEN ? AND ?
    AND status IN (${statuses.map(() => '?').join(',')})`).all(userId, startDate, endDate, ...statuses);
  entries.forEach(validateTimesheetEntry);
}

module.exports = { validateTimesheetEntry, validateWeekEntries };
