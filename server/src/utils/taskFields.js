const { validDate, fail } = require('./projectFields');
const planningFields = ['estimated_hours', 'input_received_date', 'start_date', 'target_date', 'delivered_date'];
function validateTask(input, existing = {}) {
  const data = { ...existing, ...input };
  if (typeof data.task_category !== 'string' || !data.task_category.trim()) fail('Task Name/Number is required');
  if (!['Productive', 'Non-Productive'].includes(data.classification)) fail('Select Productive or Non-Productive classification');
  const result = { task_category: data.task_category.trim(), classification: data.classification, task_description: data.task_description || null };
  if (result.task_category.length > 1000 || (result.task_description !== null && typeof result.task_description !== 'string')) fail('Invalid task name or description');
  const ownershipId = data.ownership_id;
  if (ownershipId === '' || ownershipId === null || ownershipId === undefined) {
    if (data.classification === 'Productive') fail('Select Ownership Details (required for Productive tasks)');
    result.ownership_id = null;
  } else {
    if (!['string', 'number'].includes(typeof ownershipId) || !/^[1-9]\d*$/.test(String(ownershipId)) || !Number.isSafeInteger(Number(ownershipId))) {
      fail('Select valid Ownership Details');
    }
    const ownership = require('../config/db').prepare(`SELECT o.id FROM department_ownerships o
      JOIN departments d ON d.id = o.department_id
      WHERE o.id = ? AND ((o.active = 1 AND d.active = 1) OR o.id = ?)`).get(Number(ownershipId), existing.ownership_id || null);
    if (!ownership) fail('Select active Ownership Details from an active Department');
    result.ownership_id = ownership.id;
  }
  for (const key of planningFields) {
    const value = data[key];
    result[key] = value === '' || value === undefined || value === null ? null : value;
    if (result[key] === null) continue;
    if (key === 'estimated_hours') {
      if (!['string', 'number'].includes(typeof value) || String(value).trim() === '' || !Number.isFinite(Number(value)) || Number(value) < 0) fail('Estimated hours must be a nonnegative number');
      result[key] = Number(value);
    } else if (typeof value !== 'string' || !validDate(value)) fail(`${key} must be a valid YYYY-MM-DD date`);
  }
  if (input.active !== undefined) result.active = input.active ? 1 : 0;
  return result;
}
function validateTaskHistory(data, existing) {
  const db = require('../config/db');
  if (existing && data.classification !== existing.classification &&
      (db.prepare('SELECT 1 FROM project_tasks WHERE task_id = ? LIMIT 1').get(existing.id) || db.prepare('SELECT 1 FROM timesheets WHERE task_id = ? LIMIT 1').get(existing.id))) {
    fail('Classification cannot change for an assigned or logged task. Create a new task to preserve classification history.', 409);
  }
}
module.exports = { planningFields, validateTask, validateTaskHistory };
