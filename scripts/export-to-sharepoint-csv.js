/**
 * export-to-sharepoint-csv.js
 *
 * Exports SQLite database tables into CSV formats optimized for
 * SharePoint Online list import.
 *
 * Run from the project root: node scripts/export-to-sharepoint-csv.js
 */

const fs = require('fs');
const path = require('path');
const db = require('../server/src/config/db');
const { userAssignments } = require('../server/src/utils/platformAssignments');
const { createObjectCsvWriter } = require('../server/node_modules/csv-writer');

const EXPORT_DIR = process.env.GCC_CSV_EXPORT_DIR || path.join(__dirname, 'export');

// Ensure export directory exists
if (!fs.existsSync(EXPORT_DIR)) {
  fs.mkdirSync(EXPORT_DIR, { recursive: true });
}

console.log('🔄 Starting SQLite to SharePoint CSV export...');

const boolToSP = (val) => val === 1 || val === true ? 'Yes' : 'No';
const formatSPDate = (val) => val ? val.replace(' ', 'T') : '';
const capitalizeStatus = (val) => val ? val.charAt(0).toUpperCase() + val.slice(1).toLowerCase() : 'Draft';

async function exportTable(filename, query, headers, mapper) {
  const filepath = path.join(EXPORT_DIR, filename);
  const records = db.prepare(query).all();

  if (records.length === 0) {
    console.log(`  ⏭️ Skipping ${filename} (No records found)`);
    return;
  }

  const csvWriter = createObjectCsvWriter({
    path: filepath,
    header: headers.map(id => ({ id, title: id }))
  });

  const mappedRecords = records.map(mapper);
  await csvWriter.writeRecords(mappedRecords);

  console.log(`  ✅ Exported ${mappedRecords.length} records to ${filename}`);
}

async function runExports() {
  await exportTable('0_platforms.csv', 'SELECT * FROM platforms', ['Title','IsActive'], r => ({ Title:r.name, IsActive:boolToSP(r.active) }));
  // 1. Divisions
  await exportTable('1_divisions.csv',
    'SELECT d.*, p.name AS platform_name FROM divisions d JOIN platforms p ON p.id=d.platform_id',
    ['Title', 'Platform', 'IsActive'],
    (r) => ({ Title: r.name, Platform:r.platform_name, IsActive: boolToSP(r.active) })
  );

  // 2. Departments
  await exportTable('2_departments.csv',
    'SELECT * FROM departments',
    ['Title', 'IsActive'],
    (r) => ({ Title: r.name, IsActive: boolToSP(r.active) })
  );

  // 3. Subdivisions
  await exportTable('3_subdivisions.csv',
    'SELECT s.*, d.name as division_name, p.name AS platform_name FROM subdivisions s JOIN divisions d ON s.division_id = d.id JOIN platforms p ON p.id=d.platform_id',
    ['Title', 'Platform', 'DivisionLookup', 'IsActive'],
    (r) => ({ Title: r.name, Platform: r.platform_name, DivisionLookup: r.division_name, IsActive: boolToSP(r.active) })
  );

  // 4. Department Ownerships
  await exportTable('4_ownerships.csv',
    'SELECT o.*, d.name as dept_name FROM department_ownerships o JOIN departments d ON o.department_id = d.id',
    ['Title', 'DepartmentLookup', 'IsActive'],
    (r) => ({ Title: r.label, DepartmentLookup: r.dept_name, IsActive: boolToSP(r.active) })
  );

  // 5. Employees
  await exportTable('5_employees.csv',
    `SELECT u.*, (SELECT name FROM platforms WHERE id=d.platform_id) AS platform_name, d.name as div_name, dept.name as dept_name, sc.name as sc_name
     FROM users u
     LEFT JOIN divisions d ON u.division_id = d.id
     LEFT JOIN departments dept ON u.department_id = dept.id
     LEFT JOIN supporting_categories sc ON u.supporting_category_id = sc.id
     WHERE u.name != '[Deleted User]'`,
    ['Title', 'Email', 'Department', 'Platform', 'DivisionLookup', 'SupportingCategory', 'Role', 'IsActive', 'LastSeen', 'AssignedPlatforms', 'AssignedDivisions'],
    (r) => ({
      Title: r.name,
      Email: r.email,
      Department: r.dept_name || '',
      Platform: r.platform_name || 'Unmapped',
      AssignedPlatforms: userAssignments(r).platforms.map(p => p.name).join('; '),
      AssignedDivisions: userAssignments(r).divisions.map(d => d.name).join('; '),
      DivisionLookup: r.div_name || '',
      SupportingCategory: r.sc_name || '',
      Role: capitalizeStatus(r.role),
      IsActive: boolToSP(r.active),
      LastSeen: formatSPDate(r.last_seen_at)
    })
  );

  // 6. Tasks
  await exportTable('6_tasks.csv',
    'SELECT * FROM tasks',
    ['Title', 'Classification', 'TaskDescription', 'RequiresProject', 'IsActive'],
    (r) => ({
      Title: r.task_category,
      Classification: r.classification || '',
      TaskDescription: r.task_description || '',
      RequiresProject: boolToSP(r.requires_project),
      IsActive: boolToSP(r.active)
    })
  );

  // 7. Projects
  await exportTable('7_projects.csv',
    `SELECT p.*, (SELECT name FROM platforms WHERE id=d.platform_id) AS platform_name, d.name as div_name, s.name as subdiv_name
     FROM projects p
     LEFT JOIN divisions d ON p.division_id = d.id
     LEFT JOIN subdivisions s ON p.subdivision_id = s.id`,
    ['Title', 'ProjectCode', 'CustomerName', 'Platform', 'DivisionLookup', 'SubdivisionLookup', 'Activity', 'TeamType', 'IsActive'],
    (r) => ({
      Title: r.project_name,
      ProjectCode: r.project_code,
      CustomerName: r.customer_name || '',
      Platform: r.platform_name || 'Unmapped',
      DivisionLookup: r.div_name || '',
      SubdivisionLookup: r.subdiv_name || '',
      Activity: r.activity || '',
      TeamType: r.team_type || '',
      IsActive: boolToSP(r.active)
    })
  );

  // 8. Holidays
  await exportTable('8_holidays.csv',
    'SELECT * FROM holidays',
    ['Title', 'HolidayDate'],
    (r) => ({ Title: r.name, HolidayDate: formatSPDate(r.date) })
  );

  // 9. Timesheets (Approved only for initial sync to save space/time)
  await exportTable('9_timesheets.csv',
    `SELECT t.*, u.name as user_name, u.email as user_email,
            p.project_name, tk.task_category,
            (SELECT name FROM platforms WHERE id=d.platform_id) AS platform_name, d.name as div_name, s.name as subdiv_name, do.label as ownership_label
     FROM timesheets t
     JOIN users u ON t.user_id = u.id
     LEFT JOIN projects p ON t.project_id = p.id
     LEFT JOIN tasks tk ON t.task_id = tk.id
     LEFT JOIN divisions d ON COALESCE(t.division_id,p.division_id,u.division_id) = d.id
     LEFT JOIN subdivisions s ON t.subdivision_id = s.id
     LEFT JOIN department_ownerships do ON t.ownership_id = do.id
     WHERE t.status = 'approved'`,
    [
      'Title', 'EmployeeLookup', 'EmployeeEmail', 'WorkDate', 'WeekNumber', 'WeekYear',
      'ProjectLookup', 'TaskLookup', 'Platform', 'DivisionLookup', 'SubdivisionLookup', 'OwnershipLookup',
      'Hours', 'Description', 'Billable', 'Status', 'SubmittedDate', 'ApprovedDate', 'ApproverComments'
    ],
    (r) => ({
      Title: `${r.user_email}_${r.work_date}_${r.project_code || r.task_category || 'NOTASK'}`,
      EmployeeLookup: r.user_name,
      EmployeeEmail: r.user_email,
      WorkDate: formatSPDate(r.work_date),
      WeekNumber: r.week_number,
      WeekYear: r.week_year,
      ProjectLookup: r.project_name || '',
      TaskLookup: r.task_category || '',
      Platform: r.platform_name || 'Unmapped',
      DivisionLookup: r.div_name || '',
      SubdivisionLookup: r.subdiv_name || '',
      OwnershipLookup: r.ownership_label || '',
      Hours: r.hours,
      Description: r.description || '',
      Billable: boolToSP(r.billable),
      Status: capitalizeStatus(r.status),
      SubmittedDate: formatSPDate(r.submitted_at),
      ApprovedDate: formatSPDate(r.approved_at),
      ApproverComments: r.admin_comment || ''
    })
  );

  console.log('✅ Export complete. CSV files are located in scripts/export/');
}

if (require.main === module) runExports().catch(err => { console.error(err); process.exitCode = 1; });
module.exports = { runExports };
