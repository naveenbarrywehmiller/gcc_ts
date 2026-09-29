const db = require('../config/db');
const { canManageDivision, adminDivisionIds } = require('./divisionScope');

// These headers are shared by import and export so a downloaded file is reusable.
const columns = [
  ['project_code', 'Project Code'], ['project_name', 'Project Name'],
  ['gcc_project_code', 'GCC - Project Code'], ['priority', 'Priority'],
  ['product', 'Product'], ['product_module', 'Product module'],
  ['requested_by', 'Requested By'], ['responsibility', 'Responsibility'],
  ['input_received_date', 'Input Received Date'], ['start_date', 'Start Date'],
  ['target_date', 'Target Date'], ['delivered_date', 'Delivered Date'],
  ['budget_hours', 'Budget Hours'], ['project_status', 'Status'],
  ['division', 'Division'], ['location', 'Location'],
  ['customer_name', 'Customer Name'], ['activity', 'Work Type'], ['team_type', 'Dedicated/Flex'],
];
const extraFields = columns.slice(2, 14).map(([key]) => key);
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && !isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;

function validateProject(input, user, existing = {}) {
  const data = { ...existing, ...input };
  if (Object.hasOwn(input, 'division_id') && !Object.hasOwn(input, 'division')) data.division = null;
  const result = {};
  for (const key of ['project_code', 'project_name', 'customer_name', 'activity', 'team_type', ...extraFields]) {
    const value = data[key];
    result[key] = value === undefined || value === null || value === '' ? null : (String(value).trim() || null);
    if (result[key]?.length > 1000) fail(`${key} is too long`);
  }
  if (!result.project_code || !result.project_name) fail('Project Code and Project Name are required');
  const duplicate = db.prepare('SELECT id FROM projects WHERE LOWER(TRIM(project_code)) = LOWER(?) AND id != ?').get(result.project_code, existing.id || 0);
  if (duplicate) fail(`Project code already exists: ${result.project_code}`, 409);
  result.project_status ||= 'Inprogress';
  if (!['Inprogress', 'Hold', 'Completed'].includes(result.project_status)) fail('Status must be Inprogress, Hold, or Completed');
  for (const key of ['input_received_date', 'start_date', 'target_date', 'delivered_date']) {
    if (result[key] && !validDate(result[key])) fail(`${key} must be a valid YYYY-MM-DD date`);
  }
  if (result.budget_hours !== null) {
    result.budget_hours = Number(result.budget_hours);
    if (!Number.isFinite(result.budget_hours) || result.budget_hours < 0) fail('Budget Hours must be a nonnegative number');
  }
  let divisionId = data.division_id ? Number(data.division_id) : null;
  if (!divisionId && data.division) {
    divisionId = db.prepare('SELECT id FROM divisions WHERE LOWER(name) = LOWER(?) AND active = 1').get(String(data.division).trim())?.id;
    if (!divisionId) fail(`Unknown division: ${data.division}`);
  }
  if (!divisionId && user.role === 'admin') {
    const ids = adminDivisionIds(user);
    if (ids.length === 1) divisionId = ids[0];
  }
  if (divisionId !== null && (!Number.isSafeInteger(divisionId) || divisionId <= 0)) fail('Invalid division');
  if (!canManageDivision(user, divisionId)) fail('Select a division assigned to you', 403);
  const division = divisionId ? db.prepare('SELECT * FROM divisions WHERE id = ? AND active = 1').get(divisionId) : null;
  if (divisionId && !division) fail('Invalid division');
  result.division_id = divisionId;
  result.division = division?.name || null;
  result.subdivision_id = data.subdivision_id ? Number(data.subdivision_id) : null;
  if (result.subdivision_id !== null && (!Number.isSafeInteger(result.subdivision_id) || result.subdivision_id <= 0)) fail('Invalid location');
  if (data.location && !result.subdivision_id) {
    result.subdivision_id = db.prepare('SELECT id FROM subdivisions WHERE name = ? AND division_id = ? AND active = 1').get(data.location, divisionId)?.id;
    if (!result.subdivision_id) fail(`Unknown location: ${data.location}`);
  }
  if (result.subdivision_id && !db.prepare('SELECT id FROM subdivisions WHERE id = ? AND division_id = ? AND active = 1').get(result.subdivision_id, divisionId)) fail('Location must belong to the selected division');
  result.active = data.active === undefined ? 1 : (data.active ? 1 : 0);
  return result;
}

module.exports = { columns, extraFields, validateProject, validDate, fail };
