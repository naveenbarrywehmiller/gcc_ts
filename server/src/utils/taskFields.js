const { validDate, fail } = require('./projectFields');
const planningFields = ['estimated_hours', 'input_received_date', 'start_date', 'target_date', 'delivered_date'];
function validateTask(input, existing = {}) {
  const data = { ...existing, ...input };
  if (typeof data.task_category !== 'string' || !data.task_category.trim()) fail('Task Name/Number is required');
  if (!['Billable', 'Non-Billable'].includes(data.classification)) fail('Select Billable or Non-Billable classification');
  const result = { task_category: data.task_category.trim(), classification: data.classification, task_description: data.task_description || null };
  if (result.task_category.length > 1000 || (result.task_description !== null && typeof result.task_description !== 'string')) fail('Invalid task name or description');
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
module.exports = { planningFields, validateTask };
