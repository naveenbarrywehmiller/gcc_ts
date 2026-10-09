// Read-only inspection: no application startup, migrations, or data changes.
// Usage: node scripts/audit-timesheet-integrity.js [YYYY-MM]
const Database = require('../server/node_modules/better-sqlite3');
const config = require('../server/src/config/env');
const month = process.argv[2] || new Date().toISOString().slice(0, 7);
if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Use YYYY-MM');
const db = new Database(config.dbPath, { readonly: true, fileMustExist: true });
try {
  const summary = db.prepare(`SELECT COUNT(*) AS entries,
    COALESCE(SUM(project_id IS NULL), 0) AS missing_project,
    COALESCE(SUM(project_description IS NULL OR TRIM(project_description) = ''), 0) AS missing_description
    FROM timesheets`).get();
  const attribution = db.prepare(`SELECT t.id AS entry_id, t.user_id, t.work_date, t.hours, t.status,
    t.project_id, t.division_id AS entry_division_id, u.division AS legacy_division,
    u.division_id AS employee_division_id, d.name AS division_name, d.active AS division_active,
    COALESCE(d.name, NULLIF(TRIM(u.division), '')) AS effective_division,
    CASE WHEN u.id IS NULL THEN 'Missing user (excluded from dashboard)'
      WHEN u.name = '[Deleted User]' THEN 'Deleted user (excluded from dashboard)'
      WHEN d.id IS NOT NULL THEN 'Primary employee division'
      WHEN NULLIF(TRIM(u.division), '') IS NOT NULL THEN 'Legacy employee division text'
      WHEN u.division_id IS NOT NULL THEN 'Broken employee division reference'
      ELSE 'Employee has no primary division or legacy name' END AS reason
    FROM timesheets t LEFT JOIN users u ON u.id = t.user_id LEFT JOIN divisions d ON d.id = u.division_id
    WHERE t.work_date BETWEEN ? AND ?
      AND (u.id IS NULL OR u.name = '[Deleted User]' OR d.id IS NULL OR d.active = 0
        OR NULLIF(TRIM(u.division), '') IS NULL OR u.division != d.name)
    ORDER BY t.user_id, t.work_date, t.id`).all(`${month}-01`, `${month}-31`);
  const invalidRows = db.prepare(`SELECT t.id AS entry_id, t.user_id, t.work_date, t.status,
    t.project_id, t.task_id,
    CASE WHEN p.id IS NULL THEN 'Missing project'
      WHEN t.project_description IS NULL OR TRIM(t.project_description) = '' THEN 'Missing description'
      ELSE 'Inactive project' END AS reason
    FROM timesheets t LEFT JOIN projects p ON p.id = t.project_id
    WHERE p.id IS NULL OR p.active = 0 OR t.project_description IS NULL OR TRIM(t.project_description) = ''
    ORDER BY t.id`).all();
  console.log(JSON.stringify({ database: config.dbPath, month, summary, attribution, invalidRows }, null, 2));
} finally { db.close(); }
