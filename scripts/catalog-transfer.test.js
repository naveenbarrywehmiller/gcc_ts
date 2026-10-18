const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
process.env.BOOTSTRAP_ADMIN_EMAIL = '';
process.env.BOOTSTRAP_ADMIN_PASSWORD = '';
process.env.SYSTEM_ERROR_LOG_PATH = path.join(os.tmpdir(), `catalog-transfer-${process.pid}.jsonl`);
process.env.MAINTENANCE_FILE = path.join(os.tmpdir(), `catalog-transfer-maintenance-${process.pid}`);
const config = require('../server/src/config/env');
config.dbPath = ':memory:'; config.enableSharepointSync = false; config.enablePowerAutomate = false;
const app = require('../server/src/index');
const db = require('../server/src/config/db');
const jwt = require('../server/node_modules/jsonwebtoken');
const ExcelJS = require('../server/node_modules/exceljs');
let server, base, admin, system, manager, viewer, employee, divA, divB, platformA, platformB, locationA, locationB, productive, nonProductive;
async function request(route, body, actor = admin, method = body === undefined ? 'GET' : 'POST') {
  const response = await fetch(base + route, { method,
    headers: { Authorization: `Bearer ${jwt.sign({ userId: actor }, config.jwtSecret)}`, ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body) });
  return { status: response.status, body: response.headers.get('content-type')?.includes('spreadsheetml') ? Buffer.from(await response.arrayBuffer()) : await response.json() };
}
async function exported(kind, query = '') {
  const response = await request(`/${kind}/export?${query}`);
  assert.equal(response.status, 200);
  const book = new ExcelJS.Workbook(); await book.xlsx.load(response.body); return book;
}
function cell(book, kind, row, label) {
  const sheet = book.getWorksheet(kind === 'projects' ? 'Projects' : 'Tasks');
  return sheet.getRow(row).getCell(sheet.getRow(1).values.indexOf(label));
}
async function upload(kind, book, actor = admin) {
  const body = new FormData(); body.append('file', new Blob([await book.xlsx.writeBuffer()]), 'catalog.xlsx');
  return request(`/import/${kind}`, body, actor);
}
function csv(kind, content, actor = admin) {
  const body = new FormData(); body.append('file', new Blob([content]), 'catalog.csv');
  return request(`/import/${kind}`, body, actor);
}
async function project(code, extra = {}) {
  const response = await request('/projects', { project_code: code, project_name: code, division_id: divA,
    billable_task_ids: [productive], non_billable_task_ids: [nonProductive], ...extra }, system);
  assert.equal(response.status, 201, JSON.stringify(response.body)); return response.body.project;
}
before(async () => {
  const insertPlatform = db.prepare('INSERT INTO platforms(name) VALUES (?)');
  platformA = Number(insertPlatform.run('Platform A').lastInsertRowid); platformB = Number(insertPlatform.run('Platform B').lastInsertRowid);
  const insertDiv = db.prepare('INSERT INTO divisions(name,platform_id) VALUES (?,?)');
  divA = Number(insertDiv.run('Division A', platformA).lastInsertRowid); divB = Number(insertDiv.run('Division B', platformB).lastInsertRowid);
  const insertLocation = db.prepare('INSERT INTO subdivisions(name,division_id) VALUES (?,?)');
  locationA = Number(insertLocation.run('Location A', divA).lastInsertRowid); locationB = Number(insertLocation.run('Location B', divA).lastInsertRowid);
  const user = role => Number(db.prepare('INSERT INTO users(name,email,password_hash,role,division_id) VALUES (?,?,?,?,?)').run(role, `${role}@catalog.test`, 'unused', role, divA).lastInsertRowid);
  system = user('system admin'); admin = user('admin'); manager = user('manager'); viewer = user('viewer'); employee = user('employee');
  db.prepare('INSERT INTO admin_divisions(user_id,division_id) VALUES (?,?)').run(admin, divA);
  db.prepare('INSERT INTO user_admin_assignments(user_id,admin_id,assigned_by) VALUES (?,?,?)').run(employee, admin, system);
  db.prepare('INSERT INTO activities(name) VALUES (?)').run('Engineering');
  db.prepare('INSERT INTO supporting_categories(name) VALUES (?)').run('Dedicated');
  server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); base = `http://127.0.0.1:${server.address().port}/api`;
});
after(() => { server?.close(); db.close(); });

test('empty exports contain reusable headers and native dropdown rules without dummy data rows', async () => {
  for (const kind of ['projects', 'tasks']) {
    const book = await exported(kind);
    const sheet = book.worksheets[0];
    assert.equal(sheet.rowCount, 1);
    assert.equal(sheet.views[0].ySplit, 1);
    assert.equal(book.getWorksheet('_Import Manifest').state, 'veryHidden');
    assert.equal(book.getWorksheet('_Dropdowns').state, 'veryHidden');
    const labels = kind === 'projects' ? ['Platform', 'Division', 'Location', 'Status', 'Work Type', 'Dedicated/Flex', 'Active', 'User Assignment'] : ['Classification', 'Active'];
    for (const label of labels) {
      const rule = cell(book, kind, 2, label).dataValidation;
      assert.equal(rule.type, 'list'); assert.equal(rule.errorStyle, 'stop'); assert.equal(rule.showErrorMessage, true);
      assert.equal(cell(book, kind, 10000, label).dataValidation.type, 'list');
    }
    if (kind === 'projects') {
      assert(!JSON.stringify(book.getWorksheet('_Dropdowns').getSheetValues()).includes('Platform B'));
      assert(!JSON.stringify(book.getWorksheet('_Dropdowns').getSheetValues()).includes('Division B'));
    }
  }
  productive = (await request('/tasks', { classification: 'Productive', task_category: 'Engineering' })).body.task.id;
  nonProductive = (await request('/tasks', { classification: 'Non-Productive', task_category: 'Meetings' })).body.task.id;
});

test('project exports enforce platform and division scope even when filters request another division', async () => {
  await project('SCOPE-A'); await project('SCOPE-B', { division_id: divB });
  const book = await exported('projects');
  assert(JSON.stringify(book.getWorksheet('Projects').getSheetValues()).includes('SCOPE-A'));
  assert(!JSON.stringify(book.getWorksheet('Projects').getSheetValues()).includes('SCOPE-B'));
  for (const query of [`division_id=${divB}`, `platform_id=${platformB}`]) assert.equal((await exported('projects', query)).getWorksheet('Projects').rowCount, 1);
  db.prepare('DELETE FROM admin_divisions WHERE user_id=?').run(admin);
  db.prepare('UPDATE users SET division_id=NULL,division=NULL WHERE id=?').run(admin);
  assert.equal((await exported('projects')).getWorksheet('Projects').rowCount, 1);
  db.prepare('UPDATE users SET division_id=? WHERE id=?').run(divA, admin);
  db.prepare('INSERT INTO admin_divisions(user_id,division_id) VALUES (?,?)').run(admin, divA);
});

test('editing an exported project preserves stable ID, task/user assignments, inactive tasks and history', async () => {
  const original = await project('EDIT-OLD', { subdivision_id: locationA, user_assignment_mode: 'selected', user_ids: [employee], activity: 'Engineering', team_type: 'Dedicated', target_date: '2026-12-01' });
  const time = db.prepare("INSERT INTO timesheets(user_id,project_id,task_id,work_date,hours) VALUES (?,?,?,'2026-10-01',2)").run(employee, original.id, productive).lastInsertRowid;
  db.prepare('UPDATE tasks SET active=0 WHERE id=?').run(nonProductive);
  const book = await exported('projects', 'search=EDIT-OLD');
  cell(book, 'projects', 2, 'Project Code').value = 'EDIT-NEW';
  cell(book, 'projects', 2, 'Project Name').value = 'Edited from Excel';
  cell(book, 'projects', 2, 'Location').value = 'Location B';
  cell(book, 'projects', 2, 'Target Date').value = '';
  const response = await upload('projects', book);
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal(response.body.created, 0); assert.equal(response.body.updated, 1);
  const changed = (await request(`/projects/${original.id}`)).body.project;
  assert.equal(changed.project_code, 'EDIT-NEW'); assert.equal(changed.subdivision_id, locationB); assert.equal(changed.target_date, null);
  assert.equal(changed.user_assignment_mode, 'selected'); assert.deepEqual(changed.user_ids, [employee]);
  assert.deepEqual(changed.billable_task_ids, [productive]); assert.deepEqual(changed.non_billable_task_ids, [nonProductive]);
  assert.equal(db.prepare('SELECT project_id FROM timesheets WHERE id=?').get(time).project_id, original.id);
  db.prepare('UPDATE tasks SET active=1 WHERE id=?').run(nonProductive);
});

test('removed project rows deactivate only this filtered export and preserve projects added after export', async () => {
  const first = await project('REMOVE-ONE'); const second = await project('REMOVE-TWO');
  const book = await exported('projects', 'search=REMOVE-');
  const later = await project('REMOVE-LATER');
  book.getWorksheet('Projects').spliceRows(2, 1);
  const response = await upload('projects', book);
  assert.equal(response.status, 200, JSON.stringify(response.body)); assert.equal(response.body.deactivated, 1);
  assert.equal(db.prepare('SELECT active FROM projects WHERE id=?').get(first.id).active, 0);
  assert.equal(db.prepare('SELECT active FROM projects WHERE id=?').get(second.id).active, 1);
  assert.equal(db.prepare('SELECT active FROM projects WHERE id=?').get(later.id).active, 1);
  assert.equal(db.prepare("SELECT active FROM projects WHERE project_code='SCOPE-A'").get().active, 1);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM audit_logs WHERE action='IMPORT_DEACTIVATE_PROJECT' AND entity_id=?").get(first.id).n, 1);
});

test('removing every exported project row is a valid deactivation and does not delete history', async () => {
  const original = await project('REMOVE-ALL');
  db.prepare("INSERT INTO timesheets(user_id,project_id,task_id,work_date,hours) VALUES (?,?,?,'2026-10-02',1)").run(employee, original.id, productive);
  const book = await exported('projects', 'search=REMOVE-ALL'); book.getWorksheet('Projects').spliceRows(2, 1);
  const response = await upload('projects', book);
  assert.equal(response.status, 200, JSON.stringify(response.body)); assert.equal(response.body.deactivated, 1);
  assert.equal(db.prepare('SELECT active FROM projects WHERE id=?').get(original.id).active, 0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM timesheets WHERE project_id=?').get(original.id).n, 1);
});

test('multiple invalid project rows roll back good updates, new rows, assignments, omissions and audit writes', async () => {
  await project('ATOMIC-ONE'); await project('ATOMIC-TWO'); await project('ATOMIC-THREE'); await project('ATOMIC-FOUR');
  const book = await exported('projects', 'search=ATOMIC-');
  const sheet = book.getWorksheet('Projects');
  cell(book, 'projects', 2, 'Project Name').value = 'Good update that must not save';
  cell(book, 'projects', 3, 'Status').value = 'Typo';
  cell(book, 'projects', 4, 'Work Type').value = 'Unknown';
  sheet.spliceRows(5, 1);
  const before = db.prepare("SELECT * FROM projects WHERE project_code LIKE 'ATOMIC-%'").all();
  const auditBefore = db.prepare('SELECT COUNT(*) n FROM audit_logs').get().n;
  const response = await upload('projects', book);
  assert.equal(response.status, 400); assert(response.body.errors.some(e => e.includes('Row 3:') && e.includes('Status')));
  assert(response.body.errors.some(e => e.includes('Row 4:') && e.includes('Work Type')));
  assert.deepEqual(db.prepare("SELECT * FROM projects WHERE project_code LIKE 'ATOMIC-%'").all(), before);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM audit_logs').get().n, auditBefore);
});

test('out-of-scope source, destination and removed-row records reject the entire project import', async () => {
  const book = await exported('projects', 'search=SCOPE-A');
  cell(book, 'projects', 2, 'Platform').value = 'Platform B';
  cell(book, 'projects', 2, 'Division').value = 'Division B';
  assert.equal((await upload('projects', book)).status, 400);
  const foreign = new ExcelJS.Workbook();
  const response = await request('/projects/export?search=SCOPE-B', undefined, system); await foreign.xlsx.load(response.body);
  assert.equal((await upload('projects', foreign)).status, 400);
  foreign.getWorksheet('Projects').spliceRows(2, 1);
  assert.equal((await upload('projects', foreign)).status, 400);
  assert.equal(db.prepare("SELECT active FROM projects WHERE project_code='SCOPE-B'").get().active, 1);
});

test('duplicate or unknown IDs, missing identity headers and tampered export metadata reject imports', async () => {
  for (const mutate of [
    book => { book.getWorksheet('Projects').addRow(book.getWorksheet('Projects').getRow(2).values); },
    book => { cell(book, 'projects', 2, 'Project ID').value = 999999; },
    book => { cell(book, 'projects', 1, 'Project ID').value = 'Removed'; },
    book => { book.getWorksheet('_Import Manifest').getCell('A2').value = 999999; },
  ]) {
    const book = await exported('projects', 'search=SCOPE-A'); mutate(book);
    assert.equal((await upload('projects', book)).status, 400);
  }
  const book = await exported('projects', 'search=SCOPE-A');
  cell(book, 'projects', 2, 'Platform').value = 'Platform B';
  assert.equal((await upload('projects', book)).status, 400, 'Platform must agree with Division');
});

test('legacy CSV updates by project code and never deactivates omitted projects', async () => {
  const rejected = await csv('projects', 'Project Code,Project Name\nSCOPE-A,Must roll back\nCSV-NEW,Created by CSV');
  assert.equal(rejected.status, 400);
  assert.equal(db.prepare("SELECT project_name FROM projects WHERE project_code='SCOPE-A'").get().project_name, 'SCOPE-A');
  const response = await csv('projects', `Project Code,Project Name,Productive Task IDs\nSCOPE-A,Updated by CSV,${productive}\nCSV-NEW,Created by CSV,${productive}`);
  assert.equal(response.status, 200, JSON.stringify(response.body)); assert.equal(response.body.updated, 1);
  assert.equal(response.body.created, 1); assert.equal(response.body.deactivated, 0);
  assert.equal(db.prepare("SELECT active FROM projects WHERE project_code='SCOPE-B'").get().active, 1);
});

test('task workbook edits preserve IDs/planning and removed rows deactivate only the exported tasks', async () => {
  const one = (await request('/tasks', { classification: 'Productive', task_category: 'TASK-ONE', estimated_hours: 2, target_date: '2026-11-01' })).body.task;
  const two = (await request('/tasks', { classification: 'Productive', task_category: 'TASK-TWO' })).body.task;
  const book = await exported('tasks', 'search=TASK-');
  cell(book, 'tasks', 2, 'Task Name/Number').value = 'TASK-EDITED';
  cell(book, 'tasks', 2, 'Estimated Hours').value = 0;
  cell(book, 'tasks', 2, 'Target Date').value = '';
  book.getWorksheet('Tasks').spliceRows(3, 1);
  const response = await upload('tasks', book);
  assert.equal(response.status, 200, JSON.stringify(response.body)); assert.equal(response.body.updated, 1); assert.equal(response.body.deactivated, 1);
  const changed = db.prepare('SELECT * FROM tasks WHERE id=?').get(one.id);
  assert.equal(changed.task_category, 'TASK-EDITED'); assert.equal(changed.estimated_hours, 0); assert.equal(changed.target_date, null);
  assert.equal(db.prepare('SELECT active FROM tasks WHERE id=?').get(two.id).active, 0);
  assert.equal(db.prepare('SELECT active FROM tasks WHERE id=?').get(productive).active, 1);
});

test('task imports reject all rows for invalid dates, estimates, classifications and duplicates', async () => {
  for (const invalid of [
    'Bad,Productive,-2,2026-10-01', 'Bad,Productive,2,2026-02-30', 'Bad,Typo,2,2026-10-01', 'Good,Productive,2,2026-10-01',
  ]) {
    const response = await csv('tasks', `Task Name/Number,Classification,Estimated Hours,Start Date\nGood,Productive,1,2026-10-01\n${invalid}`);
    assert.equal(response.status, 400); assert(response.body.errors.some(e => e.startsWith('Row 3:')));
    assert.equal(db.prepare("SELECT COUNT(*) n FROM tasks WHERE task_category='Good'").get().n, 0);
  }
});

test('task classification history guards apply equally to workbook imports', async () => {
  const book = await exported('tasks', 'search=Engineering');
  cell(book, 'tasks', 2, 'Classification').value = 'Non-Productive';
  const response = await upload('tasks', book);
  assert.equal(response.status, 400); assert(response.body.errors.some(e => e.includes('Classification cannot change')));
  assert.equal(db.prepare('SELECT classification FROM tasks WHERE id=?').get(productive).classification, 'Productive');
});

test('new task rows and explicit reactivation work, with shared catalog permissions enforced', async () => {
  const response = await csv('tasks', 'Task Name/Number,Classification,Active\nCSV-TASK,Productive,Yes');
  assert.equal(response.status, 200, JSON.stringify(response.body)); assert.equal(response.body.created, 1);
  const inactive = db.prepare("SELECT id FROM tasks WHERE task_category='TASK-TWO'").get().id;
  const book = await exported('tasks', 'search=TASK-TWO&active=0'); cell(book, 'tasks', 2, 'Active').value = 'Yes';
  assert.equal((await upload('tasks', book)).status, 200);
  assert.equal(db.prepare('SELECT active FROM tasks WHERE id=?').get(inactive).active, 1);
  for (const actor of [manager, viewer, employee]) {
    assert.equal((await csv('tasks', 'Task Name/Number,Classification\nDenied,Productive', actor)).status, 403);
    assert.equal((await csv('projects', 'Project Code,Project Name\nDenied,Denied', actor)).status, 403);
  }
  for (const actor of [manager, viewer]) assert.equal((await request('/tasks/export', undefined, actor)).status, 200);
  assert.equal((await request('/tasks/export', undefined, employee)).status, 403);
});
