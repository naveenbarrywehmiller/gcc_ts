const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
process.env.BOOTSTRAP_ADMIN_EMAIL = '';
process.env.BOOTSTRAP_ADMIN_PASSWORD = '';
process.env.SYSTEM_ERROR_LOG_PATH = path.join(require('node:os').tmpdir(), `gcc-viewer-${process.pid}.jsonl`);
const config = require('../server/src/config/env');
config.dbPath = ':memory:';
config.enableSharepointSync = false;
config.enablePowerAutomate = false;
config.rateLimitMax = 10000;
const app = require('../server/src/index');
const db = require('../server/src/config/db');
const jwt = require('../server/node_modules/jsonwebtoken');
const bcrypt = require('../server/node_modules/bcryptjs');
const ExcelJS = require('../server/node_modules/exceljs');
let server, base, north, south, projectA, projectB, task;
const users = {};
const range = 'start_date=2026-10-05&end_date=2026-10-11';
async function request(route, method = 'GET', body, actor = 'viewer', extraHeaders = {}) {
  const headers = { 'Content-Type': 'application/json', ...extraHeaders };
  if (actor) headers.Authorization = `Bearer ${jwt.sign({ userId: users[actor] }, config.jwtSecret)}`;
  const response = await fetch(base + route, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) });
  const bytes = Buffer.from(await response.arrayBuffer());
  return { status: response.status, body: response.headers.get('content-type')?.includes('application/json') ? JSON.parse(bytes) : bytes, headers: response.headers };
}
before(async () => {
  north = Number(db.prepare("INSERT INTO divisions(name) VALUES ('Viewer North')").run().lastInsertRowid);
  south = Number(db.prepare("INSERT INTO divisions(name) VALUES ('Viewer South')").run().lastInsertRowid);
  const addUser = (name, role, divisionId, active = 1) => Number(db.prepare('INSERT INTO users(name,email,password_hash,role,division_id,division,active) VALUES (?,?,?,?,?,?,?)')
    .run(name, `${name}@viewer.test`, bcrypt.hashSync('Viewer-test-123', 4), role, divisionId, divisionId === north ? 'Viewer North' : divisionId === south ? 'Viewer South' : null, active).lastInsertRowid);
  for (const [key, role, divisionId, active] of [['system', 'system admin', null, 1], ['admin', 'admin', north, 1], ['manager', 'manager', north, 1],
    ['employee', 'employee', north, 1], ['outsider', 'employee', south, 1], ['inactive', 'employee', south, 0], ['viewer', 'viewer', null, 1]]) {
    users[key] = addUser(key, role, divisionId, active);
  }
  addUser('[Deleted User]', 'employee', south, 0);
  for (const key of ['employee', 'outsider']) db.prepare('INSERT INTO user_admin_assignments(user_id,admin_id,assigned_by) VALUES (?,?,?)').run(users[key], users.system, users.system);
  const project = (code, id) => Number(db.prepare("INSERT INTO projects(project_code,project_name,division_id,division,billing_type,customer_name) VALUES (?,?,?,?,'Billable',?)")
    .run(code, code, id, id === north ? 'Viewer North' : 'Viewer South', id === north ? 'North Customer' : 'South Customer').lastInsertRowid);
  projectA = project('VIEW-NORTH', north); projectB = project('VIEW-SOUTH', south);
  task = Number(db.prepare("INSERT INTO tasks(task_category,classification) VALUES ('Viewer Engineering','Billable')").run().lastInsertRowid);
  db.prepare("INSERT INTO tasks(task_category,active) VALUES ('Viewer Retired',0)").run();
  for (const [person, projectId, divisionId, hours] of [['employee', projectA, north, 4], ['outsider', projectB, south, 8]]) {
    db.prepare("INSERT INTO timesheets(user_id,project_id,division_id,task_id,work_date,hours,week_number,week_year,status,project_description) VALUES (?,?,?,?,'2026-10-05',?,41,2026,'submitted','Viewer readable description')")
      .run(users[person], projectId, divisionId, task, hours);
    db.prepare("INSERT INTO planned_vacations(user_id,vacation_date) VALUES (?,'2026-10-06')").run(users[person]);
  }
  db.prepare("INSERT INTO division_updates(division_id,month,travel_visa,open_positions,new_joiners) VALUES (?,'2026-10','South travel','South vacancies','South joiners')").run(south);
  for (const divisionId of [north, south, null]) db.prepare("INSERT INTO audit_logs(user_id,action,details,division_id) VALUES (?,'VIEWER_FIXTURE','Viewer audit fixture',?)").run(users.system, divisionId);
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(() => { server?.close(); db.close(); });

test('Viewer reads all business catalogs and cross-division filtered directories without management rights', async () => {
  for (const route of ['/divisions', '/subdivisions', '/departments', '/department-ownerships', '/supporting-categories', '/activities', '/holidays?year=2026', '/holidays/export?year=2026']) {
    assert.equal((await request(route)).status, 200, route);
  }
  const directory = await request('/users');
  assert.equal(directory.status, 200);
  assert(directory.body.users.some(user => user.id === users.outsider));
  assert(directory.body.users.every(user => !user.can_manage));
  assert(!JSON.stringify(directory.body).includes('password_hash'));
  assert.deepEqual((await request(`/users?division_id=${south}&search=outsider&role=employee&active=1`)).body.users.map(user => user.id), [users.outsider]);
  assert.equal((await request(`/users/${users.outsider}`)).status, 200);
  const projects = (await request('/projects')).body.projects;
  assert(projects.some(project => project.id === projectA));
  assert(projects.some(project => project.id === projectB));
  assert(projects.every(project => !project.can_edit));
  assert.equal((await request(`/projects/${projectB}`)).body.project.can_edit, false);
  assert.deepEqual((await request(`/projects?division_id=${south}&search=VIEW-SOUTH`)).body.projects.map(project => project.id), [projectB]);
  assert.equal((await request('/tasks?active=0')).body.tasks[0].task_category, 'Viewer Retired');
  const options = (await request('/projects/options')).body;
  assert(options.filter_divisions.some(division => division.id === south));
  assert(options.division_update_divisions.some(division => division.id === south));
  assert.deepEqual(options.divisions, []);
  const projectExport = await request('/projects/export');
  assert.equal(projectExport.status, 200);
  const book = new ExcelJS.Workbook(); await book.xlsx.load(projectExport.body);
  assert(JSON.stringify(book.worksheets[0].getSheetValues()).includes('VIEW-SOUTH'));
});

test('Users registration totals include every role and inactive accounts independently of list filters', async () => {
  const result = (await request('/users')).body;
  assert.deepEqual(result.summary, { total: 7, by_role: { 'system admin': 1, manager: 1, admin: 1, employee: 3, viewer: 1 }, active: 6, inactive: 1 });
  for (const query of [`division_id=${north}`, 'role=viewer', 'active=0', 'search=no-such-user']) {
    const filtered = (await request('/users?' + query)).body;
    assert.deepEqual(filtered.summary, result.summary, query);
  }
  assert.equal((await request('/users?role=viewer')).body.users[0].id, users.viewer);
});

test('Viewer reads global dashboard, approval details, vacation, monthly records and audit with filters', async () => {
  const dashboard = (await request('/reports/dashboard')).body;
  assert.equal(dashboard.stats.monthlyHours, 12);
  assert.equal(dashboard.stats.totalProjects, 2);
  assert.equal(dashboard.stats.pendingApprovals, 2);
  assert(dashboard.hoursByDivision.some(row => row.division === 'Viewer South'));
  const approvals = (await request('/manager/pending-approvals')).body.weeks;
  assert(approvals.some(row => row.user_id === users.outsider));
  const details = await request(`/manager/week-details/${users.outsider}/2026/41`);
  assert.equal(details.status, 200);
  assert.equal(details.body.entries[0].project_description, 'Viewer readable description');
  assert((await request('/planned-vacations/employees')).body.employees.some(row => row.id === users.outsider));
  const plans = (await request('/planned-vacations?start=2026-10-05&end=2026-10-11')).body.plans;
  assert.equal(plans.length, 2);
  const filtered = await request(`/planned-vacations?view=team&start=2026-10-05&end=2026-10-11&employee_id=${users.outsider}`);
  assert.deepEqual(filtered.body.plans.map(row => row.user_id), [users.outsider]);
  assert.equal((await request(`/division-updates?division_id=${south}&month=2026-10`)).body.record.travel_visa, 'South travel');
  const audit = await request('/audit?action=VIEWER_FIXTURE&search=fixture');
  assert.equal(audit.body.pagination.total, 3);
  assert(audit.body.logs.some(row => row.division_id === south));
  assert(audit.body.logs.some(row => row.division_id === null));
  assert((await request('/audit/actions')).body.actions.includes('VIEWER_FIXTURE'));
  assert((await request('/audit/users')).body.users.some(row => row.id === users.system));
});

test('Viewer report filters and Excel/PDF downloads operate across all divisions for every view', async () => {
  const options = (await request('/reports/options')).body;
  assert(options.divisions.some(row => row.id === south));
  assert(options.users.some(row => row.id === users.outsider));
  assert(options.projects.some(row => row.id === projectB));
  const all = (await request(`/reports/analysis?${range}`)).body;
  assert.equal(all.summary.total_hours, 12);
  assert.equal(all.summary.employees, 5);
  assert.equal(all.summary.expected_hours, 200);
  assert(!all.utilization.some(row => row.id === users.viewer));
  assert(!all.missing.some(row => row.id === users.viewer));
  const filters = `${range}&division_id=${south}&user_id=${users.outsider}&project_id=${projectB}&task_id=${task}&customer=South%20Customer&billing_type=Billable&status=submitted`;
  const filtered = (await request('/reports/analysis?' + filters)).body;
  assert.equal(filtered.summary.total_hours, 8);
  const entries = (await request('/reports/entries?' + filters)).body;
  assert.equal(entries.total, 1);
  assert.equal(entries.data[0].user_id, users.outsider);
  for (const view of ['weekly', 'utilization', 'projects', 'missing', 'trends']) {
    const excel = await request(`/reports/export?${filters}&view=${view}&format=excel`);
    assert.equal(excel.status, 200, view);
    const book = new ExcelJS.Workbook(); await book.xlsx.load(excel.body);
    assert(book.getWorksheet('Report Info').getSheetValues().some(row => row?.[1] === 'Total hours' && row[2] === 8));
    assert.equal(book.getWorksheet('Timesheet Entries').rowCount, 2);
    const exported = JSON.stringify(book.getWorksheet('Timesheet Entries').getSheetValues());
    assert(exported.includes('VIEW-SOUTH')); assert(!exported.includes('VIEW-NORTH'));
    const pdf = await request(`/reports/export?${filters}&view=${view}&format=pdf`);
    assert.equal(pdf.status, 200, view);
    assert(pdf.body.subarray(0, 5).equals(Buffer.from('%PDF-')));
  }
});

test('Viewer business writes and personal timesheet access are denied even through direct API calls', async () => {
  const beforeEntries = db.prepare('SELECT * FROM timesheets ORDER BY id').all();
  const beforeVacations = db.prepare('SELECT * FROM planned_vacations ORDER BY id').all();
  for (const [route, method, body] of [
    ['/timesheets', 'GET'], ['/timesheets/all?week=41&year=2026', 'GET'],
    ['/timesheets', 'POST', { project_id: projectB, hours: 8 }], ['/timesheets/batch', 'POST', { entries: [] }],
    ['/timesheets/1', 'DELETE'], ['/timesheets/submit', 'POST', { week: 41, year: 2026 }],
    ['/timesheets/post', 'POST', { week: 41, year: 2026, entries: [] }],
    ['/timesheets/approve', 'POST', { user_id: users.outsider, week: 41, year: 2026 }],
    ['/timesheets/reject', 'POST', { user_id: users.outsider, week: 41, year: 2026, comment: 'Rejected' }],
    ['/timesheets/recall', 'POST', { user_id: users.outsider, week: 41, year: 2026 }],
    ['/users', 'POST', { name: 'Unauthorized', email: 'no@viewer.test', role: 'employee' }],
    [`/users/${users.outsider}`, 'PUT', { name: 'Changed' }], [`/users/${users.outsider}`, 'DELETE'],
    [`/users/${users.outsider}/permanent`, 'DELETE'], [`/users/${users.outsider}/reset-password`, 'POST', {}],
    [`/users/${users.outsider}/toggle-active`, 'POST', {}], [`/users/${users.viewer}/divisions`, 'PUT', { division_ids: [south] }],
    ['/projects', 'POST', { project_code: 'WRITE' }], [`/projects/${projectB}`, 'PUT', { project_name: 'Changed' }],
    [`/projects/${projectB}`, 'DELETE'], ['/import/projects', 'POST', {}],
    ['/tasks', 'POST', { task_category: 'Changed' }], [`/tasks/${task}`, 'PUT', { task_category: 'Changed' }], [`/tasks/${task}`, 'DELETE'],
    ['/divisions', 'POST', { name: 'Changed' }], [`/divisions/${south}`, 'PUT', { name: 'Changed' }], [`/divisions/${south}`, 'DELETE'],
    ['/subdivisions', 'POST', { name: 'Changed' }], ['/departments', 'POST', { name: 'Changed' }],
    ['/department-ownerships', 'POST', { label: 'Changed' }], ['/supporting-categories', 'POST', { name: 'Changed' }], ['/activities', 'POST', { name: 'Changed' }],
    ['/holidays', 'POST', { date: '2026-10-15', name: 'Changed' }], ['/holidays/import', 'POST', {}],
    ['/division-updates', 'PUT', { division_id: south, month: '2026-10', travel_visa: 'Changed' }],
    ['/planned-vacations', 'PATCH', { changes: [{ date: '2026-10-07', planned: true }] }],
    [`/admin-ownership/assign/${users.outsider}`, 'POST', {}],
    ['/system/maintenance', 'POST', { enabled: true }],
  ]) assert.equal((await request(route, method, body)).status, 403, `${method} ${route}`);
  assert.deepEqual(db.prepare('SELECT * FROM timesheets ORDER BY id').all(), beforeEntries);
  assert.deepEqual(db.prepare('SELECT * FROM planned_vacations ORDER BY id').all(), beforeVacations);
  assert.equal(db.prepare('SELECT name FROM users WHERE id = ?').get(users.outsider).name, 'outsider');
});

test('Viewer can authenticate and change their password; only System Admin can grant or manage Viewer accounts', async t => {
  const login = await request('/auth/login', 'POST', { email: 'viewer@viewer.test', password: 'Viewer-test-123' }, null);
  assert.equal(login.status, 200); assert.equal(login.body.user.role, 'viewer');
  assert.equal((await request('/auth/me')).body.user.role, 'viewer');
  assert.equal((await request('/auth/change-password', 'POST', { currentPassword: 'Viewer-test-123', newPassword: 'Viewer-new-123' })).status, 200);
  assert.equal((await request('/auth/login', 'POST', { email: 'viewer@viewer.test', password: 'Viewer-new-123' }, null)).status, 200);
  const refresh = jwt.sign({ userId: users.viewer }, config.jwtRefreshSecret);
  assert.equal((await request('/auth/refresh', 'POST', {}, null, { Cookie: `refreshToken=${refresh}` })).status, 200);
  assert.equal((await request('/auth/logout', 'POST', {})).status, 200);
  assert.equal((await request(`/users/${users.employee}`, 'PUT', { role: 'viewer' }, 'admin')).status, 403);
  assert.equal((await request(`/users/${users.viewer}`, 'PUT', { name: 'Changed' }, 'admin')).status, 403);
  const created = await request('/users', 'POST', { name: 'New Viewer', email: 'new@viewer.test', password: 'Viewer-test-123', role: 'viewer' }, 'system');
  assert.equal(created.status, 201); assert.equal(created.body.user.role, 'viewer');
  assert.equal((await request(`/users/${users.manager}`, 'PUT', { role: 'viewer' }, 'system')).status, 200);
  const enabled = config.enableMsalAuth; config.enableMsalAuth = true;
  const verify = jwt.verify;
  t.mock.method(jwt, 'verify', (token, key, options, callback) => typeof key === 'function'
    ? callback(null, { preferred_username: 'sso-viewer@viewer.test', name: 'SSO Viewer', roles: ['Viewer'] })
    : verify(token, key, options, callback));
  try {
    const sso = await request('/auth/ms-callback', 'POST', { idToken: 'external-viewer-token' }, null);
    assert.equal(sso.status, 200); assert.equal(sso.body.user.role, 'viewer');
  } finally { config.enableMsalAuth = enabled; }
});

test('Viewer permission matrix and help expose only read access and usable guides', async () => {
  const matrix = (await request('/help/matrix')).body;
  assert(matrix.roles.includes('viewer'));
  for (const row of matrix.rows) {
    assert.equal(typeof row.access.viewer.scope, 'string');
    assert.equal(row.access.viewer.allowed, require('../shared/accessPolicy.json').permissions[row.permission].includes('viewer'));
    if (['timesheetEntry', 'vacationEdit', 'approvals', 'users', 'projects', 'tasks', 'catalogEdit', 'catalogDelete', 'divisionUpdateEdit', 'system', 'accessGrants'].includes(row.permission)) assert.equal(row.access.viewer.allowed, false);
  }
  const help = (await request('/help')).body;
  assert.deepEqual(help.groups.map(group => group.id), ['viewer']);
  assert(help.groups[0].guides.every(guide => guide.path !== '/timesheet' && guide.path !== '/admin/system'));
});

test('Existing time remains in reports after a role becomes Viewer without creating capacity targets', async () => {
  const before = (await request('/reports/analysis?' + range)).body;
  db.prepare("INSERT INTO timesheets(user_id,project_id,task_id,work_date,hours,week_number,week_year,status) VALUES (?,?,?,'2026-10-05',3,41,2026,'approved')")
    .run(users.manager, projectA, task);
  assert.equal(db.prepare('SELECT role FROM users WHERE id=?').get(users.manager).role, 'viewer');
  const after = (await request('/reports/analysis?' + range)).body;
  assert.equal(after.summary.total_hours, before.summary.total_hours + 3);
  assert.equal(after.summary.expected_hours, before.summary.expected_hours);
  assert(!after.utilization.some(row => row.id === users.manager));
  assert(!after.missing.some(row => row.id === users.manager));
  const historic = (await request(`/reports/entries?${range}&user_id=${users.manager}`)).body;
  assert.equal(historic.total, 1);
  assert.equal(historic.data[0].hours, 3);
});
