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
const { createObjectCsvWriter } = require('csv-writer');

const EXPORT_DIR = path.join(__dirname, 'export');

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
  // 1. Divisions
  await exportTable('1_divisions.csv', 
    'SELECT * FROM divisions',
    ['Title', 'IsActive'],
    (r) => ({ Title: r.name, IsActive: boolToSP(r.active) })
  );

  // 2. Departments
  await exportTable('2_departments.csv',
    'SELECT * FROM departments',
    ['Title', 'IsActive'],
    (r) => ({ Title: r.name, IsActive: boolToSP(r.active) })
  );

  // 3. Subdivisions
  await exportTable('3_subdivisions.csv',
    'SELECT s.*, d.name as division_name FROM subdivisions s JOIN divisions d ON s.division_id = d.id',
    ['Title', 'DivisionLookup', 'IsActive'],
    (r) => ({ Title: r.name, DivisionLookup: r.division_name, IsActive: boolToSP(r.active) })
  );

  // 4. Department Ownerships
  await exportTable('4_ownerships.csv',
    'SELECT o.*, d.name as dept_name FROM department_ownerships o JOIN departments d ON o.department_id = d.id',
    ['Title', 'DepartmentLookup', 'IsActive'],
    (r) => ({ Title: r.label, DepartmentLookup: r.dept_name, IsActive: boolToSP(r.active) })
  );

  // 5. Employees
  await exportTable('5_employees.csv',
    `SELECT u.*, d.name as div_name, dept.name as dept_name, sc.name as sc_name 
     FROM users u 
     LEFT JOIN divisions d ON u.division_id = d.id
     LEFT JOIN departments dept ON u.department_id = dept.id
     LEFT JOIN supporting_categories sc ON u.supporting_category_id = sc.id
     WHERE u.name != '[Deleted User]'`,
    ['Title', 'Email', 'Department', 'DivisionLookup', 'SupportingCategory', 'Role', 'IsActive', 'LastSeen'],
    (r) => ({
      Title: r.name,
      Email: r.email,
      Department: r.dept_name || '',
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
    `SELECT p.*, d.name as div_name, s.name as subdiv_name 
     FROM projects p 
     LEFT JOIN divisions d ON p.division_id = d.id
     LEFT JOIN subdivisions s ON p.subdivision_id = s.id`,
    ['Title', 'ProjectCode', 'CustomerName', 'DivisionLookup', 'SubdivisionLookup', 'Activity', 'TeamType', 'IsActive'],
    (r) => ({
      Title: r.project_name,
      ProjectCode: r.project_code,
      CustomerName: r.customer_name || '',
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
            d.name as div_name, s.name as subdiv_name, do.label as ownership_label
     FROM timesheets t
     JOIN users u ON t.user_id = u.id
     LEFT JOIN projects p ON t.project_id = p.id
     LEFT JOIN tasks tk ON t.task_id = tk.id
     LEFT JOIN divisions d ON t.division_id = d.id
     LEFT JOIN subdivisions s ON t.subdivision_id = s.id
     LEFT JOIN department_ownerships do ON t.ownership_id = do.id
     WHERE t.status = 'approved'`,
    [
      'Title', 'EmployeeLookup', 'EmployeeEmail', 'WorkDate', 'WeekNumber', 'WeekYear',
      'ProjectLookup', 'TaskLookup', 'DivisionLookup', 'SubdivisionLookup', 'OwnershipLookup',
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

runExports().catch(console.error);
