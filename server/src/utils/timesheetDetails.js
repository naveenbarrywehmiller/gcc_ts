const fields = require('../config/timesheetFields.json');
const { validDate, fail } = require('./projectFields');

function serializeDetails(details) {
  if (details === undefined) return undefined;
  if (!details || typeof details !== 'object' || Array.isArray(details)) fail('Invalid timesheet details');
  const result = {};
  for (const { key, label, type } of fields) {
    const value = details[key];
    if (value === undefined || value === null || value === '') continue;
    if (type === 'number') {
      if (!Number.isSafeInteger(Number(value)) || Number(value) < 0 || typeof value === 'boolean') fail(`${label} must be a nonnegative whole number`);
      result[key] = Number(value);
    } else {
      if (typeof value !== 'string' || value.length > 4000) fail(`${label} must be text of at most 4000 characters`);
      if (type === 'date' && !validDate(value)) fail(`${label} must be a valid date`);
      result[key] = value.trim();
    }
  }
  return JSON.stringify(result);
}
module.exports = { serializeDetails };
