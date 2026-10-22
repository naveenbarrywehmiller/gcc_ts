const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
process.env.BOOTSTRAP_ADMIN_EMAIL = '';
process.env.BOOTSTRAP_ADMIN_PASSWORD = '';
process.env.SYSTEM_ERROR_LOG_PATH = require('node:path').join(require('node:os').tmpdir(), `task-planning-${process.pid}.jsonl`);
process.env.MAINTENANCE_FILE = require('node:path').join(require('node:os').tmpdir(), `gcc-test-maintenance-${process.pid}`);
const config = require('../server/src/config/env');
config.dbPath = ':memory:'; config.enableSharepointSync = false; config.enablePowerAutomate = false;
const app = require('../server/src/index');
const db = require('../server/src/config/db');
// Explicit test catalog; production setup creates no Platform records.
db.prepare("INSERT OR IGNORE INTO platforms(id,name) VALUES (1,'Test Platform')").run();
const jwt = require('../server/node_modules/jsonwebtoken');
const ExcelJS = require('../server/node_modules/exceljs');
let server, base, system, admin, manager, employee, division, bill, nonbill, unassigned, project;
async function request(route, body, method = 'POST', actor = system) {
  const response = await fetch(base + route, { method, headers: { Authorization: `Bearer ${jwt.sign({ userId: actor }, config.jwtSecret)}`, ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body) });
  return { status: response.status, body: response.headers.get('content-type')?.includes('spreadsheetml') ? Buffer.from(await response.arrayBuffer()) : await response.json() };
}
before(async () => {
  division = Number(db.prepare("INSERT INTO divisions(name) VALUES ('Planning')").run().lastInsertRowid);
  const user = role => Number(db.prepare('INSERT INTO users(name,email,password_hash,role,division_id) VALUES (?,?,?,?,?)').run(role, role+'@planning.test', 'unused', role, division).lastInsertRowid);
  system = user('system admin'); admin = user('admin'); manager = user('manager'); employee = user('employee');
  db.exec("INSERT INTO departments(id,name) VALUES (1,'Planning'); INSERT INTO department_ownerships(id,department_id,label) VALUES (1,1,'Engineering ownership')");
  db.prepare('INSERT INTO user_admin_assignments(user_id,admin_id,assigned_by) VALUES (?,?,?)').run(employee, admin, system);
  server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}/api`;
});
after(() => { server?.close(); db.close(); });

test('task planning fields validate, preserve omitted values and explicitly clear to null', async () => {
  const created = await request('/tasks', { ownership_id: 1, classification: 'Productive', task_category: 'Engineering', estimated_hours: 12.5, input_received_date: '2026-10-01', start_date: '2026-10-02', target_date: '2026-10-15', delivered_date: '2026-10-14' });
  assert.equal(created.status, 201); bill = created.body.task.id;
  const changed = await request(`/tasks/${bill}`, { task_description: 'Updated' }, 'PUT');
  assert.equal(changed.body.task.estimated_hours, 12.5); assert.equal(changed.body.task.delivered_date, '2026-10-14');
  for (const patch of [{ estimated_hours: -1 }, { estimated_hours: 'NaN' }, { estimated_hours: true }, { estimated_hours: [] }, { start_date: '2026-02-30' }, { target_date: '10/12/2026' }]) {
    assert.equal((await request(`/tasks/${bill}`, patch, 'PUT')).status, 400);
  }
  const cleared = await request(`/tasks/${bill}`, { delivered_date: '', estimated_hours: 0 }, 'PUT');
  assert.equal(cleared.body.task.delivered_date, null); assert.equal(cleared.body.task.estimated_hours, 0);
  await request(`/tasks/${bill}`, { estimated_hours: 12.5 }, 'PUT');
  nonbill = (await request('/tasks', { ownership_id: 1, classification: 'Non-Productive', task_category: 'Coordination' })).body.task.id;
  unassigned = (await request('/tasks', { ownership_id: 1, classification: 'Productive', task_category: 'Other project' })).body.task.id;
  const tasks = (await request('/tasks', undefined, 'GET')).body.tasks;
  assert.equal(tasks.find(t => t.id === nonbill).estimated_hours, null);
  assert.equal((await request('/tasks', { ownership_id: 1, classification: 'Productive', task_category: 'Denied' }, 'POST', manager)).status, 403);
});

test('project assignments require at least one task, validate categories and save atomically', async () => {
  const data = { project_code: 'MIXED', project_name: 'Mixed billing', division_id: division, budget_hours: 50 };
  for (const bad of [{}, { billable_task_ids: [] }, { billable_task_ids: [nonbill] }, { non_billable_task_ids: [bill] }, { billable_task_ids: [9999] }, { billable_task_ids: [true] }]) {
    assert.equal((await request('/projects', { ...data, ...bad })).status, 400);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM projects WHERE project_code = 'MIXED'").get().n, 0);
  }
  const created = await request('/projects', { ...data, billable_task_ids: [bill, bill], non_billable_task_ids: [nonbill] }, 'POST', admin);
  assert.equal(created.status, 201); project = created.body.project.id;
  assert.deepEqual(created.body.project.billable_task_ids, [bill]); assert.deepEqual(created.body.project.non_billable_task_ids, [nonbill]);
  assert.equal(created.body.project.task_estimated_hours, 12.5); assert.equal(created.body.project.estimated_task_count, 1); assert.equal(created.body.project.budget_hours, 50);
  const rejected = await request(`/projects/${project}`, { project_name: 'Must roll back', billable_task_ids: [], non_billable_task_ids: [] }, 'PUT');
  assert.equal(rejected.status, 400); assert.equal(db.prepare('SELECT project_name FROM projects WHERE id=?').get(project).project_name, data.project_name);
  assert.equal((await request(`/projects/${project}`, { project_name: 'Manager denied' }, 'PUT', manager)).status, 403);
  assert.equal((await request(`/tasks/${bill}`, { classification: 'Non-Productive' }, 'PUT')).status, 409);
});

test('mixed project time is accepted only for assigned active tasks and billing totals reconcile', async () => {
  const date = new Date().toLocaleDateString('en-CA');
  const entry = task_id => ({ project_id: project, task_id, project_description: 'Planning validation', work_date: date, hours: 2 });
  assert.equal((await request('/timesheets/batch', { entries: [entry(bill), entry(unassigned)] }, 'POST', employee)).status, 400);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM timesheets').get().n, 0);
  assert.equal((await request('/timesheets/batch', { entries: [entry(bill), entry(nonbill)] }, 'POST', employee)).status, 200);
  const dashboard = (await request('/reports/dashboard', undefined, 'GET')).body;
  assert.equal(dashboard.stats.monthlyHours, 4);
  assert.deepEqual(dashboard.billingHours, [{ classification: 'Non-Productive', hours: 2 }, { classification: 'Productive', hours: 2 }]);
  assert.equal(dashboard.planning.estimated_hours, 12.5); assert.equal(dashboard.planning.assigned_tasks, 2);
  const report = (await request(`/reports/analysis?start_date=${date}&end_date=${date}`, undefined, 'GET')).body;
  assert.equal(report.summary.total_hours, 4); assert.equal(report.summary.billable_hours, 2); assert.equal(report.summary.non_billable_hours, 2);
  assert.equal(report.projects[0].planning.task_estimated_hours, 12.5);
  const exported = await request(`/reports/export?start_date=${date}&end_date=${date}&format=excel&view=projects`, undefined, 'GET');
  const book = new ExcelJS.Workbook(); await book.xlsx.load(exported.body);
  assert.equal(book.getWorksheet('Task Planning').rowCount, 3);
  const powerTasks = (await request('/powerbi/tasks', undefined, 'GET')).body.data;
  assert.equal(powerTasks.find(t => t.id === bill).estimatedHours, 12.5);
  const powerProject = (await request('/powerbi/projects', undefined, 'GET')).body.data.find(p => p.id === project);
  assert.deepEqual(powerProject.nonBillableTaskIds, [nonbill]); assert.equal(powerProject.taskEstimatedHours, 12.5);
});

test('assignment removal and deactivation preserve history but prevent new time', async () => {
  const saved = db.prepare('SELECT * FROM timesheets').all();
  await request(`/projects/${project}`, { non_billable_task_ids: [] }, 'PUT');
  assert.deepEqual(db.prepare('SELECT * FROM timesheets').all(), saved);
  const entry = { project_id: project, task_id: nonbill, project_description: 'Denied', work_date: '2026-10-01', hours: 1 };
  assert.equal((await request('/timesheets', entry, 'POST', employee)).status, 400);
  await request(`/tasks/${bill}`, undefined, 'DELETE');
  assert.equal((await request('/timesheets', { ...entry, task_id: bill }, 'POST', employee)).status, 400);
  assert.equal((await request(`/projects/${project}`, { project_name: 'Keep inactive assignment' }, 'PUT')).status, 200);
  assert.equal((await request('/projects', { project_code: 'INACTIVE', project_name: 'Invalid', billable_task_ids: [bill] })).status, 400);
  await request(`/tasks/${bill}`, { active: true }, 'PUT');
  await request(`/projects/${project}`, { non_billable_task_ids: [nonbill] }, 'PUT');
});

test('Excel assignment columns and task reference round-trip with atomic failures', async () => {
  const response = await request('/projects/export', undefined, 'GET');
  const book = new ExcelJS.Workbook(); await book.xlsx.load(response.body);
  // Legacy workbooks have no export manifest or stable project IDs; add new rows without synchronizing omissions.
  book.removeWorksheet('_Import Manifest');
  assert.equal(book.getWorksheet('Task Reference').rowCount, 4);
  const sheet = book.getWorksheet('Projects'); sheet.getCell('A2').value = 'ROUNDTRIP';
  sheet.getRow(2).getCell(sheet.getRow(1).values.indexOf('Project ID')).value = null;
  const upload = async () => { const body = new FormData(); body.append('file', new Blob([await book.xlsx.writeBuffer()]), 'assignments.xlsx'); return request('/import/projects', body); };
  assert.equal((await upload()).status, 200);
  const imported = (await request('/projects?search=ROUNDTRIP', undefined, 'GET')).body.projects[0];
  assert.deepEqual(imported.billable_task_ids, [bill]); assert.deepEqual(imported.non_billable_task_ids, [nonbill]);
  sheet.getCell('A2').value = 'LEGACY-HEADERS';
  const productiveColumn = sheet.getRow(1).values.indexOf('Productive Task IDs');
  const nonProductiveColumn = sheet.getRow(1).values.indexOf('Non-Productive Task IDs');
  sheet.getRow(1).getCell(productiveColumn).value = 'Billable Task IDs';
  sheet.getRow(1).getCell(nonProductiveColumn).value = 'Non-Billable Task IDs';
  assert.equal((await upload()).status, 200, 'older templates remain importable');
  sheet.getRow(1).getCell(productiveColumn).value = 'Productive Task IDs';
  sheet.getRow(1).getCell(nonProductiveColumn).value = 'Non-Productive Task IDs';
  sheet.getCell('A2').value = 'BAD-IMPORT';
  const column = sheet.getRow(1).values.indexOf('Productive Task IDs'); sheet.getRow(2).getCell(column).value = String(nonbill);
  assert.equal((await upload()).status, 400);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM projects WHERE project_code = 'BAD-IMPORT'").get().n, 0);
});

test('one-time migration preserves historical rows and never restores removed assignments', () => {
  const Database = require('../server/node_modules/better-sqlite3'); const legacy = new Database(':memory:');
  legacy.exec(`PRAGMA foreign_keys=ON; CREATE TABLE projects(id INTEGER PRIMARY KEY, billing_type TEXT);
    CREATE TABLE tasks(id INTEGER PRIMARY KEY, classification TEXT, active INTEGER);
    CREATE TABLE timesheets(id INTEGER PRIMARY KEY, project_id INTEGER, task_id INTEGER, hours REAL);
    INSERT INTO projects VALUES (1,'Productive'),(2,NULL); INSERT INTO tasks VALUES (1,'Productive',1),(2,'Non-Productive',0);
    INSERT INTO timesheets VALUES (1,1,2,3),(2,2,2,4);`);
  const migrate = require('../server/src/config/taskPlanningMigration');
  const history = legacy.prepare('SELECT * FROM timesheets').all(); migrate(legacy);
  assert.equal(legacy.prepare('SELECT COUNT(*) n FROM project_tasks').get().n, 3);
  legacy.exec('DELETE FROM project_tasks WHERE project_id=1 AND task_id=1'); migrate(legacy);
  assert.equal(legacy.prepare('SELECT COUNT(*) n FROM project_tasks').get().n, 2);
  assert.deepEqual(legacy.prepare('SELECT * FROM timesheets').all(), history);
  assert(legacy.prepare('SELECT estimated_hours FROM tasks').all().every(t => t.estimated_hours === null));
  assert.deepEqual(legacy.pragma('foreign_key_check'), []); legacy.close();
});
