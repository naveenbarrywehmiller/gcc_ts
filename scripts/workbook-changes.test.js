const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'gcc-changes-'));
process.env.SYSTEM_ERROR_LOG_PATH = path.join(temp, 'errors.jsonl');
process.env.BOOTSTRAP_ADMIN_EMAIL = '';
process.env.BOOTSTRAP_ADMIN_PASSWORD = '';
const config = require('../server/src/config/env');
config.dbPath = ':memory:'; config.enableSharepointSync = false; config.enablePowerAutomate = false;
const app = require('../server/src/index');
const db = require('../server/src/config/db');
const jwt = require('../server/node_modules/jsonwebtoken');
const ExcelJS = require('../server/node_modules/exceljs');
let server, base, admin, system, employee, divA, divB, task, projectB;
async function request(user, route, body, method = 'POST') {
  const headers = { Authorization: `Bearer ${jwt.sign({ userId: user }, config.jwtSecret)}` };
  const opts = { method, headers };
  if (body instanceof FormData) opts.body = body;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  const response = await fetch(base + route, opts);
  if (response.headers.get('content-type')?.includes('spreadsheetml')) return { status: response.status, bytes: Buffer.from(await response.arrayBuffer()) };
  return { status: response.status, body: await response.json() };
}
function csv(text, division = divA) {
  const form = new FormData(); form.append('file', new Blob([text]), 'projects.csv');
  if (division) form.append('division_id', division);
  return form;
}
before(async () => {
  const insertDiv = db.prepare('INSERT INTO divisions(name) VALUES (?)');
  divA = Number(insertDiv.run('Division A').lastInsertRowid); divB = Number(insertDiv.run('Division B').lastInsertRowid);
  const user = (name, role) => Number(db.prepare('INSERT INTO users(name,email,password_hash,role,division_id) VALUES (?,?,?,?,?)').run(name, name+'@test.invalid', 'unused', role, divA).lastInsertRowid);
  admin = user('Admin', 'admin'); system = user('System', 'system admin'); employee = user('Employee', 'employee');
  db.prepare('INSERT INTO admin_divisions(user_id,division_id) VALUES (?,?)').run(admin, divA);
  task = Number(db.prepare('INSERT INTO tasks(task_category,requires_project) VALUES (?,0)').run('Task').lastInsertRowid);
  projectB = Number(db.prepare('INSERT INTO projects(project_code,project_name,division_id) VALUES (?,?,?)').run('B-SECRET','Other Division',divB).lastInsertRowid);
  server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}/api`;
});
after(() => { server?.close(); db.close(); fs.rmSync(temp, { recursive: true }); });

test('migration preserves legacy data and is repeatable', () => {
  const migrate = require('../server/src/config/workbookMigration');
  migrate(db); migrate(db);
  assert.equal(db.prepare('SELECT project_name FROM projects WHERE id = ?').get(projectB).project_name, 'Other Division');
  assert.equal(db.prepare('SELECT project_status FROM projects WHERE id = ?').get(projectB).project_status, 'Inprogress');
});
test('admins read and export all projects but only modify their own divisions', async () => {
  const foreign = await request(admin, `/projects/${projectB}`, undefined, 'GET');
  assert.equal(foreign.status, 200);
  assert.equal(foreign.body.project.can_edit, false);
  assert.equal((await request(admin, `/projects/${projectB}`, { project_name: 'Overwrite' }, 'PUT')).status, 403);
  assert.equal((await request(admin, `/projects/${projectB}`, { division_id: divA, project_name: 'Take over' }, 'PUT')).status, 403);
  assert.equal((await request(admin, `/projects/${projectB}`, undefined, 'DELETE')).status, 403);
  const list = await request(admin, `/projects?division_id=${divB}&page=1&limit=1`, undefined, 'GET');
  assert.equal(list.body.projects.length, 1);
  assert.equal(list.body.total, 1);
  assert.equal(list.body.projects[0].can_edit, false);
  assert.equal((await request(system, `/projects/${projectB}`, undefined, 'GET')).status, 200);
  const result = await request(admin, '/projects', { project_code: 'A-ONE', project_name: 'Own', budget_hours: 0, project_status: 'Hold' });
  assert.equal(result.status, 201); assert.equal(result.body.project.division_id, divA); assert.equal(result.body.project.budget_hours, 0);
  assert.equal((await request(admin, `/projects/${result.body.project.id}`, { project_name: 'Updated own project' }, 'PUT')).status, 200);
  assert.equal((await request(admin, `/projects/${result.body.project.id}`, undefined, 'GET')).body.project.can_edit, true);
  assert.equal((await request(admin, '/projects', { project_code: 'FORBIDDEN', project_name: 'Other', division_id: divB })).status, 403);
  assert.equal((await request(admin, `/projects/${result.body.project.id}`, { division_id: divB }, 'PUT')).status, 403);
  assert.equal((await request(employee, '/projects', { project_code:'NO', project_name:'No' })).status, 403);
  const exported = await request(admin, '/projects/export', undefined, 'GET');
  const book = new ExcelJS.Workbook(); await book.xlsx.load(exported.bytes);
  assert.equal(book.worksheets[0].rowCount, 3); assert.equal(book.worksheets[0].getCell('A2').value, 'A-ONE');
  assert.equal(book.worksheets[0].getCell('A3').value, 'B-SECRET');
  const filtered = await request(admin, `/projects/export?division_id=${divB}`, undefined, 'GET');
  const filteredBook = new ExcelJS.Workbook(); await filteredBook.xlsx.load(filtered.bytes);
  assert.equal(filteredBook.worksheets[0].rowCount, 2);
  assert.equal(filteredBook.worksheets[0].getCell('A2').value, 'B-SECRET');
  assert.deepEqual(db.prepare('SELECT project_name, division_id, active FROM projects WHERE id = ?').get(projectB), {
    project_name: 'Other Division', division_id: divB, active: 1,
  });
});
test('project import rejects whole file on duplicate, missing fields, invalid date or foreign division', async () => {
  for (const text of ['Project Code,Project Name\nNEW,New\na-one,Duplicate', 'Project Code,Project Name\nNEW,New\nnew,Again', 'Project Code,Project Name\nNEW,New\nMISSING,', 'Project Code,Project Name,Start Date\nNEW,New,2026-02-31', 'Project Code,Project Name,Division\nNEW,New,Division B']) {
    const result = await request(admin, '/import/projects', csv(text));
    assert.equal(result.status, 400); assert(result.body.errors.length > 0);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM projects WHERE project_code = 'NEW'").get().n, 0);
  }
  const good = await request(admin, '/import/projects', csv('Project Code,Project Name,Status,Budget Hours\nIMPORT,Imported,Completed,12.5'));
  assert.equal(good.status, 200); assert.equal(good.body.imported, 1);
  assert.equal(db.prepare("SELECT budget_hours FROM projects WHERE project_code = 'IMPORT'").get().budget_hours, 12.5);
});
test('template headers round-trip with native Excel dates and project pagination', async () => {
  const result = await request(admin, '/projects/export?template=true', undefined, 'GET');
  const book = new ExcelJS.Workbook(); await book.xlsx.load(result.bytes);
  const sheet = book.worksheets[0]; assert.equal(sheet.rowCount, 1); assert.equal(sheet.getCell('N1').value, 'Status');
  sheet.addRow(['EXCEL', 'Excel Project', 'AX001', '', '', '', '', '', new Date('2026-09-28T00:00:00Z')]);
  sheet.getCell('I2').numFmt = 'yyyy-mm-dd';
  const form = new FormData(); form.append('file', new Blob([await book.xlsx.writeBuffer()]), 'native.xlsx');
  assert.equal((await request(admin, '/import/projects', form)).status, 200);
  assert.equal(db.prepare("SELECT input_received_date FROM projects WHERE project_code = 'EXCEL'").get().input_received_date, '2026-09-28');
  const page = await request(admin, '/projects?page=2&limit=1', undefined, 'GET');
  assert.equal(page.body.projects.length, 1); assert.equal(page.body.total, 4);
});
test('optional details survive batch, legacy saves and self-post; invalid values roll back', async () => {
  const entry = { task_id: task, work_date: '2026-09-28', hours: 8, details: { fundamental_error_count: 0, review_by: 'Reviewer', review_date: '2026-09-29', remarks: 'Keep me' } };
  assert.equal((await request(employee, '/timesheets/batch', { entries: [entry] })).status, 200);
  assert.equal((await request(employee, '/timesheets/batch', { entries: [{ ...entry, hours: 9, details: undefined }] })).status, 200);
  let saved = (await request(employee, '/timesheets?week=40&year=2026', undefined, 'GET')).body.entries[0];
  assert.equal(JSON.parse(saved.details_json).remarks, 'Keep me'); assert.equal(JSON.parse(saved.details_json).fundamental_error_count, 0);
  assert.equal((await request(employee, '/timesheets/batch', { entries: [{ ...entry, hours: 10, details: { fundamental_error_count: -1 } }] })).status, 400);
  assert.equal(db.prepare('SELECT hours FROM timesheets WHERE id = ?').get(saved.id).hours, 9);
  assert.equal((await request(employee, '/timesheets', { ...entry, details: { review_date: '2026-02-31' } })).status, 400);
  assert.equal((await request(admin, '/timesheets/post', { week: 40, year: 2026, entries: [entry] })).status, 200);
  saved = db.prepare('SELECT * FROM timesheets WHERE user_id = ?').get(admin);
  assert.equal(saved.status, 'approved'); assert.equal(JSON.parse(saved.details_json).remarks, 'Keep me');
  assert.equal((await request(admin, '/timesheets/batch', { entries: [entry] })).status, 400);
});
test('monthly records isolate divisions and retain travel when updating staffing', async () => {
  const body = { division_id: divA, month: '2026-09', travel_visa: 'Visa in progress' };
  assert.equal((await request(admin, '/division-updates', body, 'PUT')).status, 200);
  const updated = await request(admin, '/division-updates', { division_id: divA, month: '2026-09', open_positions: 0, new_joiners: 2 }, 'PUT');
  assert.equal(updated.body.record.travel_visa, 'Visa in progress'); assert.equal(updated.body.record.open_positions, 0);
  assert.equal((await request(admin, '/division-updates', { ...body, new_joiners: 1.5 }, 'PUT')).status, 400);
  assert.equal((await request(admin, `/division-updates?division_id=${divB}&month=2026-09`, undefined, 'GET')).status, 403);
  assert.equal((await request(employee, `/division-updates?division_id=${divA}&month=2026-09`, undefined, 'GET')).status, 403);
  assert.equal((await request(admin, `/division-updates?division_id=${divA}&month=2026-08`, undefined, 'GET')).body.record, null);
});
test('error logs restrict access, remove sensitive messages, rotate and retain newest event', async () => {
  const { recordSystemError, readSystemErrors, MAX_BYTES } = require('../server/src/utils/systemLog');
  for (let i = 0; i < 300; i++) await recordSystemError(new Error('password=secret-token-do-not-store'), `test-${i}`);
  await Promise.all(Array.from({ length: 10 }, (_, i) => recordSystemError(new Error('secret-token'), `parallel-${i}`)));
  const log = readSystemErrors(); assert(log.bytes <= MAX_BYTES); assert(log.entries.length < 310);
  assert.equal(log.entries.filter(e => e.source.startsWith('parallel')).length, 10);
  assert(!fs.readFileSync(process.env.SYSTEM_ERROR_LOG_PATH, 'utf8').includes('secret-token'));
  assert.equal((await request(admin, '/error-logs', undefined, 'GET')).status, 403);
  assert.equal((await request(system, '/error-logs', undefined, 'GET')).status, 200);
});


test('weekly export deduplicates daily details and Power BI respects admin project scope', async () => {
  const entry = { task_id: task, work_date: '2026-09-29', hours: 8, details: { fundamental_error_count: 0, review_by: 'Reviewer', review_date: '2026-09-29', remarks: 'Keep me' } };
  assert.equal((await request(employee, '/timesheets/batch', { entries: [entry] })).status, 200);
  const result = await request(system, '/reports/export?week=40&year=2026&format=excel', undefined, 'GET');
  assert.equal(result.status, 200);
  const book = new ExcelJS.Workbook(); await book.xlsx.load(result.bytes);
  assert.equal(book.getWorksheet('Timesheet Report').rowCount, 4);
  assert.equal(book.getWorksheet('Weekly Details').rowCount, 3);
  const restricted = await request(admin, '/powerbi/projects', undefined, 'GET');
  assert.equal(restricted.status, 200);
  assert(!restricted.body.data.some(p => p.projectCode === 'B-SECRET'));
  const global = await request(system, '/powerbi/projects', undefined, 'GET');
  assert.equal(global.status, 200);
  assert(global.body.data.some(p => p.projectCode === 'B-SECRET'));
  assert.equal(global.body.data.find(p => p.projectCode === 'IMPORT').projectStatus, 'Completed');
});
test('Power Automate callback still authenticates with its callback secret', async () => {
  config.powerAutomateCallbackSecret = 'test-callback-secret';
  const result = await fetch(base + '/timesheets/pa-callback', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', 'x-callback-secret': 'test-callback-secret' },
    body: JSON.stringify({ status: 'approved', employeeEmail: 'Employee@test.invalid', weekNumber: 40, weekYear: 2026 })
  });
  assert.equal(result.status, 200);
});

test('Excel project import validates active sidebar values with row errors and no partial inserts', async () => {
  db.exec("INSERT INTO activities(name,active) VALUES ('Import Work',1),('Inactive Work',0)");
  db.exec("INSERT INTO supporting_categories(name,active) VALUES ('Import Team',1),('Inactive Team',0)");
  async function upload(rows) {
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet('Projects');
    sheet.addRow(['Project Code', 'Project Name', 'Work Type', 'Dedicated/Flex']);
    rows.forEach(row => sheet.addRow(row));
    const form = new FormData();
    form.append('file', new Blob([await book.xlsx.writeBuffer()]), 'projects.xlsx');
    return request(admin, '/import/projects', form);
  }
  for (const [work, team, label] of [
    ['Unknown Work', 'Import Team', 'Work Type'],
    ['Inactive Work', 'Import Team', 'Work Type'],
    ['Import Work', 'Unknown Team', 'Dedicated/Flex'],
    ['Import Work', 'Inactive Team', 'Dedicated/Flex'],
  ]) {
    const result = await upload([
      ['SIDEBAR-VALID', 'Valid row', 'Import Work', 'Import Team'],
      ['SIDEBAR-INVALID', 'Invalid row', work, team],
    ]);
    assert.equal(result.status, 400);
    assert(result.body.errors.some(error => error.startsWith(`Row 3: ${label}`)), JSON.stringify(result.body));
    assert.equal(db.prepare("SELECT COUNT(*) n FROM projects WHERE project_code LIKE 'SIDEBAR-%'").get().n, 0);
  }
  const good = await upload([
    ['SIDEBAR-VALID', 'Normalized', ' import work ', ' IMPORT TEAM '],
    ['SIDEBAR-BLANK', 'Optional fields', '', ''],
  ]);
  assert.equal(good.status, 200);
  assert.equal(good.body.imported, 2);
  assert.deepEqual(db.prepare("SELECT activity, team_type FROM projects WHERE project_code = 'SIDEBAR-VALID'").get(), {
    activity: 'Import Work', team_type: 'Import Team',
  });
  assert.deepEqual(db.prepare("SELECT activity, team_type FROM projects WHERE project_code = 'SIDEBAR-BLANK'").get(), {
    activity: null, team_type: null,
  });
});

test('project options use profile division as fallback and distinguish view filters from editable master data', async () => {
  const user = (name, divisionId) => Number(db.prepare('INSERT INTO users(name,email,password_hash,role,division_id) VALUES (?,?,?,\'admin\',?)')
    .run(name, name + '@test.invalid', 'unused', divisionId).lastInsertRowid);
  const profileAdmin = user('ProfileAdmin', divA);
  const unassignedAdmin = user('UnassignedAdmin', null);
  const delegatedAdmin = user('DelegatedAdmin', divA);
  db.prepare('INSERT INTO admin_divisions(user_id,division_id) VALUES (?,?)').run(delegatedAdmin, divB);
  const location = (name, divisionId, active = 1) => Number(db.prepare('INSERT INTO subdivisions(name,division_id,active) VALUES (?,?,?)')
    .run(name, divisionId, active).lastInsertRowid);
  const locationA = location('Location A', divA), locationB = location('Location B', divB);
  const inactiveLocation = location('Retired location', divA, 0);
  const inactiveDivision = Number(db.prepare('INSERT INTO divisions(name,active) VALUES (?,0)').run('Retired division').lastInsertRowid);
  for (const actor of [admin, profileAdmin]) {
    const options = (await request(actor, '/projects/options', undefined, 'GET')).body;
    assert.deepEqual(options.divisions.map(d => d.id), [divA]);
    assert.deepEqual(options.subdivisions.map(s => s.id), [locationA]);
    assert.deepEqual(options.filter_divisions.map(d => d.id), [divA, divB]);
    assert.deepEqual(options.filter_subdivisions.map(s => s.id), [locationA, locationB]);
    assert(!options.divisions.some(d => d.id === inactiveDivision));
    assert(!options.subdivisions.some(s => s.id === inactiveLocation));
  }
  const options = (await request(profileAdmin, '/projects/options', undefined, 'GET')).body;
  assert.deepEqual(options.division_update_divisions.map(d => d.id), [divA], 'monthly updates use the same profile fallback');
  const created = await request(profileAdmin, '/projects', { project_code: 'PROFILE', project_name: 'Profile division', subdivision_id: locationA });
  assert.equal(created.status, 201);
  assert.equal(created.body.project.division_id, divA);
  assert.equal(created.body.project.subdivision_id, locationA);
  assert.equal((await request(profileAdmin, `/projects/${created.body.project.id}`, { project_name: 'Updated' }, 'PUT')).status, 200);
  assert.equal((await request(profileAdmin, `/projects/${created.body.project.id}`, { subdivision_id: locationB }, 'PUT')).status, 400);
  assert.equal((await request(profileAdmin, `/projects/${created.body.project.id}`, { division_id: divB }, 'PUT')).status, 403);
  assert.equal((await request(profileAdmin, `/projects/${projectB}`, { division_id: divA }, 'PUT')).status, 403);
  assert.equal((await request(profileAdmin, `/projects/${projectB}`, undefined, 'DELETE')).status, 403);
  assert.equal((await request(profileAdmin, '/import/projects', csv('Project Code,Project Name\nPROFILE-IMPORT,Imported', null))).status, 200);
  assert.equal((await request(profileAdmin, '/import/projects', csv('Project Code,Project Name,Division\nPROFILE-FOREIGN,Other,Division B', null))).status, 400);
  assert.equal((await request(profileAdmin, `/projects/${created.body.project.id}`, undefined, 'DELETE')).status, 200);

  const noOptions = (await request(unassignedAdmin, '/projects/options', undefined, 'GET')).body;
  assert.deepEqual(noOptions.divisions, []);
  assert.deepEqual(noOptions.subdivisions, []);
  assert.equal(noOptions.filter_divisions.length, 2);
  assert.equal((await request(unassignedAdmin, `/projects/${projectB}`, undefined, 'GET')).body.project.can_edit, false);
  assert.equal((await request(unassignedAdmin, '/projects', { project_code: 'UNASSIGNED', project_name: 'No access', division_id: divA })).status, 403);
  assert.equal((await request(unassignedAdmin, `/projects/${projectB}`, { project_name: 'No access' }, 'PUT')).status, 403);
  assert.equal((await request(unassignedAdmin, `/projects/${projectB}`, undefined, 'DELETE')).status, 403);

  const assignedOptions = (await request(delegatedAdmin, '/projects/options', undefined, 'GET')).body;
  assert.deepEqual(assignedOptions.divisions.map(d => d.id), [divB], 'explicit management assignments take precedence');
  assert.equal((await request(delegatedAdmin, `/projects/${projectB}`, undefined, 'GET')).body.project.can_edit, true);
  assert.equal((await request(delegatedAdmin, `/projects/${created.body.project.id}`, undefined, 'GET')).body.project.can_edit, false);
  db.prepare('INSERT INTO admin_divisions(user_id,division_id) VALUES (?,?)').run(delegatedAdmin, divA);
  assert.equal((await request(delegatedAdmin, `/projects/${created.body.project.id}`, undefined, 'GET')).body.project.can_edit, true);

  const systemOptions = (await request(system, '/projects/options', undefined, 'GET')).body;
  assert.deepEqual(systemOptions.divisions.map(d => d.id), [divA, divB]);
  assert.deepEqual(systemOptions.subdivisions.map(s => s.id), [locationA, locationB]);
  assert.equal((await request(system, `/projects/${projectB}`, undefined, 'GET')).body.project.can_edit, true);
  assert.equal((await request(system, `/projects/${projectB}`, { project_name: 'System update' }, 'PUT')).status, 200);
  assert.equal((await request(system, `/projects/${projectB}`, undefined, 'DELETE')).status, 200);
});
