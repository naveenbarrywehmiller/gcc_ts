const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
process.env.BOOTSTRAP_ADMIN_EMAIL = '';
process.env.BOOTSTRAP_ADMIN_PASSWORD = '';
process.env.SYSTEM_ERROR_LOG_PATH = path.join(require('node:os').tmpdir(), `gcc-permissions-${process.pid}.jsonl`);
const config = require('../server/src/config/env');
config.dbPath = ':memory:';
config.enableSharepointSync = false;
config.enablePowerAutomate = false;
const app = require('../server/src/index');
const db = require('../server/src/config/db');
const jwt = require('../server/node_modules/jsonwebtoken');
const ExcelJS = require('../server/node_modules/exceljs');
let server, base, a, b, projectA, projectB, location, department, ownership, holiday;
const users = {};

async function request(actor, route, method = 'GET', body) {
  const headers = { 'Content-Type': 'application/json' };
  if (actor) headers.Authorization = `Bearer ${jwt.sign({ userId: users[actor] }, config.jwtSecret)}`;
  const response = await fetch(base + route, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) });
  const bytes = Buffer.from(await response.arrayBuffer());
  return { status: response.status, body: response.headers.get('content-type')?.includes('application/json') ? JSON.parse(bytes) : bytes, headers: response.headers };
}

before(async () => {
  const division = name => Number(db.prepare('INSERT INTO divisions(name) VALUES (?)').run(name).lastInsertRowid);
  a = division('Permissions North'); b = division('Permissions South');
  for (const [name, role, id] of [['system', 'system admin', null], ['manager', 'manager', a], ['otherManager', 'manager', b],
    ['noManagerScope', 'manager', null], ['admin', 'admin', a], ['noAdminScope', 'admin', null], ['employee', 'employee', a], ['outsider', 'employee', b]]) {
    users[name] = Number(db.prepare('INSERT INTO users(name,email,password_hash,role,division_id,division) VALUES (?,?,?,?,?,?)')
      .run(name, `${name}@permissions.test`, 'unused', role, id, id === a ? 'Permissions North' : id === b ? 'Permissions South' : null).lastInsertRowid);
  }
  for (const key of ['employee', 'outsider']) db.prepare('INSERT INTO user_admin_assignments(user_id,admin_id,assigned_by) VALUES (?,?,?)').run(users[key], users.system, users.system);
  const project = (code, division) => Number(db.prepare("INSERT INTO projects(project_code,project_name,division_id,division,billing_type) VALUES (?,?,?,?,'Billable')")
    .run(code, code, division, division === a ? 'Permissions North' : 'Permissions South').lastInsertRowid);
  projectA = project('MATRIX-NORTH', a); projectB = project('MATRIX-SOUTH', b);
  for (const [actor, projectId, hours] of [['employee', projectA, 4], ['outsider', projectB, 17], ['outsider', null, 13], ['outsider', projectA, 11]]) {
    db.prepare("INSERT INTO timesheets(user_id,project_id,work_date,hours,week_number,week_year,status) VALUES (?,?,'2026-10-05',?,41,2026,'submitted')").run(users[actor], projectId, hours);
  }
  department = Number(db.prepare("INSERT INTO departments(name) VALUES ('Matrix Department')").run().lastInsertRowid);
  ownership = Number(db.prepare("INSERT INTO department_ownerships(department_id,label) VALUES (?,'Matrix Ownership')").run(department).lastInsertRowid);
  location = Number(db.prepare("INSERT INTO subdivisions(name,division_id) VALUES ('Matrix Location',?)").run(a).lastInsertRowid);
  holiday = Number(db.prepare("INSERT INTO holidays(date,name) VALUES ('2026-10-14','Matrix Holiday')").run().lastInsertRowid);
  for (const actor of ['employee', 'outsider']) db.prepare("INSERT INTO planned_vacations(user_id,vacation_date) VALUES (?,'2026-10-05')").run(users[actor]);
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(() => { server?.close(); db.close(); });

test('management roles can read the detailed matrix, Employees are blocked, and cells use the enforcement policy', async () => {
  assert.equal((await request(null, '/help/matrix')).status, 401);
  const policy = require('../shared/accessPolicy.json');
  assert.equal((await request('employee', '/help/matrix')).status, 403);
  for (const actor of ['system', 'manager', 'admin']) {
    const response = await request(actor, '/help/matrix');
    assert.equal(response.status, 200);
    assert(response.body.rows.length >= 60);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    for (const row of response.body.rows) for (const role of policy.roles) {
      assert.equal(row.access[role].allowed, policy.permissions[row.permission].includes(role), `${row.area} ${row.action} ${role}`);
      assert.equal(typeof row.access[role].scope, 'string');
    }
  }
});

test('shared catalog writes reject Admins/Employees and allow Managers without deletion or activation bypasses', async () => {
  for (const [endpoint, payload, key] of [['divisions', { name: 'Extra Division' }, 'division'], ['departments', { name: 'Extra Department' }, 'department'],
    ['supporting-categories', { name: 'Extra Category' }, 'supportingCategory'], ['activities', { name: 'Extra Activity' }, 'activity']]) {
    for (const actor of ['admin', 'employee']) assert.equal((await request(actor, `/${endpoint}`, 'POST', payload)).status, 403);
    const created = await request('manager', `/${endpoint}`, 'POST', payload);
    assert.equal(created.status, 201, endpoint);
    const item = created.body[key] || Object.values(created.body)[0];
    assert.equal((await request('manager', `/${endpoint}/${item.id}`, 'PUT', { name: 'Updated ' + endpoint })).status, 200);
    for (const actor of ['manager', 'admin', 'employee']) {
      assert.equal((await request(actor, `/${endpoint}/${item.id}`, 'DELETE')).status, 403);
      assert.equal((await request(actor, `/${endpoint}/${item.id}`, 'PUT', { active: false })).status, 403);
    }
    assert.equal((await request('system', `/${endpoint}/${item.id}`, 'DELETE')).status, 200);
  }
});

test('Locations, ownerships and Holidays follow the same shared-setting rules', async () => {
  for (const [endpoint, id, payload] of [['subdivisions', location, { name: 'Updated Location' }], ['department-ownerships', ownership, { label: 'Updated Ownership' }],
    ['holidays', holiday, { name: 'Updated Holiday', date: '2026-10-14' }]]) {
    assert.equal((await request('admin', `/${endpoint}/${id}`, 'PUT', payload)).status, 403);
    assert.equal((await request('manager', `/${endpoint}/${id}`, 'PUT', payload)).status, 200);
    assert.equal((await request('manager', `/${endpoint}/${id}`, 'DELETE')).status, 403);
    if (endpoint !== 'holidays') assert.equal((await request('manager', `/${endpoint}/${id}`, 'PUT', { active: 0 })).status, 403);
  }
  assert.equal((await request('admin', '/holidays/import', 'POST', {})).status, 403);
  for (const actor of ['system', 'manager', 'admin']) assert.equal((await request(actor, '/holidays/export?year=2026')).status, 200);
  const form = new FormData();
  form.append('year', '2026');
  form.append('file', new Blob(['BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:matrix\r\nDTSTART;VALUE=DATE:20261015\r\nSUMMARY:Imported Holiday\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n']), 'matrix.ics');
  const response = await fetch(base + '/holidays/import', { method: 'POST', body: form, headers: { Authorization: `Bearer ${jwt.sign({ userId: users.manager }, config.jwtSecret)}` } });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).imported, 1);
});

test('monthly records permit manager division writes, Admin reads and System Admin access', async () => {
  const body = { division_id: a, month: '2026-10', travel_visa: 'North travel', open_positions: 'One position', new_joiners: 'New engineer' };
  assert.equal((await request('manager', '/division-updates', 'PUT', body)).status, 200);
  assert.equal((await request('admin', '/division-updates', 'PUT', body)).status, 403);
  assert.equal((await request('manager', '/division-updates', 'PUT', { ...body, division_id: b })).status, 403);
  assert.equal((await request('manager', `/division-updates?division_id=${b}&month=2026-10`)).status, 403);
  assert.equal((await request('admin', `/division-updates?division_id=${a}&month=2026-10`)).body.record.travel_visa, 'North travel');
  assert.equal((await request('system', '/division-updates', 'PUT', { ...body, division_id: b })).status, 200);
  assert.deepEqual((await request('manager', '/projects/options')).body.division_update_divisions.map(d => d.id), [a]);
});

test('every report query and JSON export fails closed and excludes foreign contributors and projectless rows', async () => {
  for (const actor of ['manager', 'admin', 'noManagerScope', 'noAdminScope']) {
    const empty = actor.startsWith('no');
    const options = (await request(actor, '/reports/options')).body;
    assert.equal(options.divisions.length, empty ? 0 : 1);
    assert(!options.users.some(user => user.id === users.outsider));
    for (const [route, key] of [['utilization?month=10&year=2026', 'utilization'], ['weekly-summary?month=10&year=2026', 'summary'],
      ['export?month=10&year=2026', 'data'], ['project-hours?month=10&year=2026', 'projects'],
      ['project-hours-detail?start_date=2026-10-01&end_date=2026-10-31', 'projects']]) {
      const response = await request(actor, '/reports/' + route);
      assert.equal(response.status, 200, route);
      const rows = response.body[key] || response.body.entries;
      assert(Array.isArray(rows), route);
      if (empty) assert.equal(rows.length, 0, route);
      assert(!JSON.stringify(response.body).includes('outsider'), route);
      assert(!JSON.stringify(response.body).includes('MATRIX-SOUTH'), route);
      if (route.startsWith('project-hours') && !empty) assert.equal(rows.find(p => p.project_code === 'MATRIX-NORTH').total_hours, 4);
    }
    for (const route of ['/reports/export?month=10&year=2026', '/reports/weekly-summary?month=10&year=2026', '/reports/project-hours-detail?start_date=2026-10-01&end_date=2026-10-31']) {
      const response = await request(actor, route + `&user_id=${users.outsider}`);
      assert(!JSON.stringify(response.body).includes('outsider'));
    }
  }
  assert.equal((await request('employee', '/reports/options')).status, 403);
  assert(JSON.stringify((await request('system', '/reports/export?month=10&year=2026')).body).includes('outsider'));
});

test('Excel report and project downloads obey the same assigned division scope', async () => {
  for (const [actor, route] of [['manager', '/reports/export?month=10&year=2026&format=excel'],
    ['manager', '/reports/project-hours-detail?start_date=2026-10-01&end_date=2026-10-31&format=excel'], ['admin', '/projects/export']]) {
    const response = await request(actor, route);
    assert.equal(response.status, 200);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(response.body);
    const text = JSON.stringify(workbook.worksheets.map(sheet => sheet.getSheetValues()));
    assert(!text.includes('outsider'));
    assert(!text.includes('MATRIX-SOUTH'));
  }
});

test('Manager vacation team reads are scoped and saving never modifies another person’s plan', async () => {
  const route = '/planned-vacations?start=2026-10-01&end=2026-10-31&view=team';
  assert.deepEqual((await request('manager', route)).body.plans.map(plan => plan.user_id), [users.employee]);
  assert.equal((await request('manager', route + `&employee_id=${users.outsider}`)).body.plans.length, 0);
  assert.equal((await request('noManagerScope', route)).body.plans.length, 0);
  assert(!((await request('manager', '/planned-vacations/employees')).body.employees).some(user => user.id === users.outsider));
  assert.equal((await request('manager', '/planned-vacations', 'PATCH', { user_id: users.outsider, changes: [{ date: '2026-10-05', planned: false }] })).status, 200);
  assert(db.prepare('SELECT id FROM planned_vacations WHERE user_id = ?').get(users.outsider));
});

test('dashboard aggregate totals and Manager team summaries use assigned division scope', async () => {
  const scoped = (await request('admin', '/reports/dashboard')).body;
  const none = (await request('noAdminScope', '/reports/dashboard')).body;
  const manager = (await request('manager', '/reports/dashboard')).body;
  assert.equal(scoped.stats.totalProjects, 1);
  assert.equal(none.stats.totalRegistered, 0);
  assert.equal(none.stats.totalProjects, 0);
  assert.equal(manager.teamSummary.totalRegistered, scoped.stats.totalRegistered);
  assert.equal(manager.teamSummary.monthlyHours, scoped.stats.monthlyHours);
  assert(scoped.hoursByDivision.every(row => row.division === 'Permissions North'));
});

test('audit visibility follows immutable event scope; global and legacy events stay System Admin only', async () => {
  db.prepare('INSERT INTO audit_logs(user_id,action,details,entity_type,entity_id) VALUES (?,?,?,?,?)').run(users.system, 'MATRIX_USER_EVENT', 'Scoped target', 'user', users.employee);
  const log = db.prepare("SELECT * FROM audit_logs WHERE action = 'MATRIX_USER_EVENT'").get();
  assert.equal(log.division_id, a);
  db.prepare('UPDATE users SET division_id = ? WHERE id = ?').run(b, users.employee);
  const admin = (await request('admin', '/audit?action=MATRIX_USER_EVENT')).body;
  assert.equal(admin.logs.length, 1);
  assert.equal(admin.pagination.total, 1);
  assert.equal((await request('noAdminScope', '/audit')).body.logs.length, 0);
  assert((await request('admin', '/audit/actions')).body.actions.includes('MATRIX_USER_EVENT'));
  assert((await request('admin', '/audit/users')).body.users.some(user => user.id === users.system));
  assert.equal((await request('manager', '/audit')).status, 403);
  assert.equal((await request('admin', '/audit?entity_type=department')).body.logs.length, 0);
  assert((await request('system', '/audit?entity_type=department')).body.logs.length > 0);
  db.prepare('UPDATE users SET division_id = ? WHERE id = ?').run(a, users.employee);
});

test('only System Admin can grant privileged roles or expand administrator access', async () => {
  for (const role of ['manager', 'admin', 'system admin']) {
    assert.equal((await request('admin', `/users/${users.admin}`, 'PUT', { role })).status, role === 'admin' ? 200 : 403);
    assert.equal((await request('admin', `/users/${users.employee}`, 'PUT', { role })).status, 403);
  }
  assert.equal((await request('admin', `/users/${users.admin}`, 'PUT', { division_id: a, division_ids: [a, b] })).status, 403);
  assert.equal((await request('admin', `/users/${users.admin}`, 'PUT', { name: 'Updated Admin', division_id: a, division_ids: [a] })).status, 200);
  assert.equal((await request('admin', '/users', 'POST', { name: 'Escalation', email: 'new@permissions.test', password: 'password123', role: 'manager', division_id: a })).status, 403);
  assert.equal((await request('system', `/users/${users.admin}/divisions`, 'PUT', { division_ids: [a, b] })).status, 200);
  assert.equal((await request('manager', '/users')).status, 403);
  for (const actor of ['manager', 'admin', 'employee']) {
    assert.equal((await request(actor, '/system/maintenance')).status, 403);
    assert.equal((await request(actor, '/error-logs')).status, 403);
  }
});
