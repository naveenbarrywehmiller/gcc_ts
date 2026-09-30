const db = require('../config/db');

// Keep legacy text fields and sidebar IDs synchronized for all user writes.
function normalizeUserReferences(input) {
  const result = { ...input };
  for (const [idKey, nameKey, table, label] of [
    ['division_id', 'division', 'divisions', 'Division'],
    ['supporting_category_id', 'team_type', 'supporting_categories', 'Dedicated/Flex'],
    ['department_id', null, 'departments', 'Department'],
  ]) {
    if (!Object.hasOwn(input, idKey) && (!nameKey || !Object.hasOwn(input, nameKey))) continue;
    let row;
    if (Object.hasOwn(input, idKey)) {
      const value = input[idKey];
      if (value !== '' && value !== null && value !== undefined) {
        const id = Number(value);
        if (Number.isSafeInteger(id) && id > 0) row = db.prepare(`SELECT id, name FROM ${table} WHERE id = ?`).get(id);
        if (!row) throw Object.assign(new Error(`Invalid ${label}`), { status: 400 });
      }
    } else if (input[nameKey] != null && String(input[nameKey]).trim()) {
      row = db.prepare(`SELECT id, name FROM ${table} WHERE LOWER(TRIM(name)) = LOWER(?) AND active = 1`).get(String(input[nameKey]).trim());
      if (!row) throw Object.assign(new Error(`Unknown ${label}: ${input[nameKey]}`), { status: 400 });
    }
    result[idKey] = row?.id || null;
    if (nameKey) result[nameKey] = row?.name || null;
  }
  return result;
}

module.exports = { normalizeUserReferences };
