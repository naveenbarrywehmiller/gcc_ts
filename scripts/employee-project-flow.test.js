const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
process.env.BOOTSTRAP_ADMIN_EMAIL = '';
process.env.BOOTSTRAP_ADMIN_PASSWORD = '';
process.env.SYSTEM_ERROR_LOG_PATH = path.join(os.tmpdir(), `gcc-employee-flow-${process.pid}.jsonl`);
const config = require('../server/src/config/env');
config.dbPath = ':memory:';
config.enableSharepointSync = false;
config.enablePowerAutomate = false;
const app = require('../server/src/index');
const db = require('../server/src/config/db');
const jwt = require('../server/node_modules/jsonwebtoken');
const bcrypt = require('../server/node_modules/bcryptjs');
const { descriptionMaxLength } = require('../shared/timesheetLimits.json');
let server, base, employee, admin, system, manager, division, location, project, task;
const password = 'flow-test-password';
const date = '2026-10-05';
const description = 'Reviewed design changes.\n' + 'a'.repeat(descriptionMaxLength - 25);

async function request(actor, route, body, method = 'POST', extraHeaders = {}) {
  const response = await fetch(base + route, {
    method,
    headers: {
      ...(actor ? { Authorization: `Bearer ${jwt.sign({ userId: actor }, config.jwtSecret)}` } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...extraHeaders,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, body: await response.json(), cookies: response.headers.get('set-cookie') };
}
function assign() {
  db.prepare('INSERT OR REPLACE INTO user_admin_assignments(user_id,admin_id,assigned_by) VALUES (?,?,?)').run(employee, admin, system);
}
function unassign() { db.prepare('DELETE FROM user_admin_assignments WHERE user_id = ?').run(employee); }
const login = (email, suppliedPassword = password) => request(null, '/auth/login', { email, password: suppliedPassword });
const entry = (overrides = {}) => ({ project_id: project, task_id: task, work_date: date, hours: 4, project_description: description, ...overrides });

before(async () => {
  division = Number(db.prepare("INSERT INTO divisions(name) VALUES ('Flow Division')").run().lastInsertRowid);
  location = Number(db.prepare("INSERT INTO subdivisions(name,division_id) VALUES ('Flow Location',?)").run(division).lastInsertRowid);
  const hash = bcrypt.hashSync(password, 4);
  const user = role => Number(db.prepare('INSERT INTO users(name,email,password_hash,role,division_id) VALUES (?,?,?,?,?)')
    .run(role, `${role.replace(' ', '')}@flow.test`, hash, role, division).lastInsertRowid);
  employee = user('employee'); admin = user('admin'); system = user('system admin'); manager = user('manager');
  project = Number(db.prepare("INSERT INTO projects(project_code,project_name,division_id,subdivision_id) VALUES ('FLOW','Flow Project',?,?)").run(division, location).lastInsertRowid);
  db.prepare("UPDATE projects SET billing_type = 'Billable' WHERE id = ?").run(project);
  task = Number(db.prepare("INSERT INTO tasks(task_category,classification,requires_project) VALUES ('Design','Billable',1)").run().lastInsertRowid);
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(() => { server?.close(); db.close(); });

test('only employees require an active admin assignment to log in, after credentials are verified', async () => {
  const denied = await login('employee@flow.test');
  assert.equal(denied.status, 403);
  assert.equal(denied.body.code, 'ADMIN_ASSIGNMENT_REQUIRED');
  assert.match(denied.body.error, /contact your administrator/i);
  assert.equal(denied.cookies, null);
  assert.equal((await login('employee@flow.test', 'wrong')).status, 401);
  for (const email of ['admin@flow.test', 'systemadmin@flow.test', 'manager@flow.test']) {
    assert.equal((await login(email)).status, 200);
  }
  assign();
  assert.equal((await login('employee@flow.test')).status, 200);
  db.prepare('UPDATE users SET active = 0 WHERE id = ?').run(admin);
  assert.equal((await login('employee@flow.test')).status, 403);
  db.prepare("UPDATE users SET active = 1, role = 'manager' WHERE id = ?").run(admin);
  assert.equal((await login('employee@flow.test')).status, 403);
  db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(admin);
  db.prepare('UPDATE user_admin_assignments SET admin_id = ? WHERE user_id = ?').run(system, employee);
  assert.equal((await login('employee@flow.test')).status, 200);
});

test('removing an assignment revokes existing access and refresh tokens and blocks time entry', async () => {
  unassign();
  for (const [route, body, method] of [
    ['/auth/me', undefined, 'GET'], ['/timesheets', entry(), 'POST'],
    ['/timesheets/batch', { entries: [entry()] }, 'POST'],
    ['/timesheets/submit', { week: 41, year: 2026 }, 'POST'],
  ]) {
    const result = await request(employee, route, body, method);
    assert.equal(result.status, 403, route);
    assert.equal(result.body.code, 'ADMIN_ASSIGNMENT_REQUIRED');
  }
  const refresh = () => request(null, '/auth/refresh', {}, 'POST', {
    Cookie: `refreshToken=${jwt.sign({ userId: employee }, config.jwtRefreshSecret)}`,
  });
  assert.equal((await refresh()).status, 403);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM timesheets').get().count, 0);
  assign();
  assert.equal((await refresh()).status, 200);
  assert.equal((await request(employee, '/auth/me', undefined, 'GET')).status, 200);
});

test('Microsoft callback applies the same employee gate after identity verification, including provisioning', async t => {
  const previousEnabled = config.enableMsalAuth;
  config.enableMsalAuth = true;
  const originalVerify = jwt.verify;
  // Stub only the external identity verification; local JWT validation remains real.
  t.mock.method(jwt, 'verify', (token, key, options, callback) => {
    if (typeof key === 'function') return callback(null, { preferred_username: token, name: 'SSO Employee' });
    return originalVerify(token, key, options, callback);
  });
  try {
    unassign();
    const blocked = await request(null, '/auth/ms-callback', { idToken: 'employee@flow.test' });
    assert.equal(blocked.status, 403); assert.equal(blocked.cookies, null);
    assign();
    assert.equal((await request(null, '/auth/ms-callback', { idToken: 'employee@flow.test' })).status, 200);
    assert.equal((await request(null, '/auth/ms-callback', { idToken: 'admin@flow.test' })).status, 200);
    const provisioned = await request(null, '/auth/ms-callback', { idToken: 'new-sso@flow.test' });
    assert.equal(provisioned.status, 403);
    assert.equal(provisioned.body.code, 'ADMIN_ASSIGNMENT_REQUIRED');
    assert(db.prepare('SELECT id FROM users WHERE email = ?').get('new-sso@flow.test'));
  } finally { config.enableMsalAuth = previousEnabled; }
});

test('project division and location are inherited by single, batch and admin self-post writes', async () => {
  assign();
  assert.equal((await request(employee, '/timesheets', entry())).status, 201);
  assert.equal((await request(employee, '/timesheets/batch', { entries: [entry({ work_date: '2026-10-06' })] })).status, 200);
  assert.equal((await request(admin, '/timesheets/post', { week: 41, year: 2026, entries: [entry()] })).status, 200);
  const saved = db.prepare('SELECT division_id,subdivision_id,project_description FROM timesheets WHERE project_id = ?').all(project);
  assert.equal(saved.length, 3);
  for (const row of saved) assert.deepEqual(row, { division_id: division, subdivision_id: location, project_description: description });
  assert.equal((await request(employee, '/timesheets', entry({ division_id: 9999 }))).status, 400);
  assert.equal((await request(employee, '/timesheets/batch', { entries: [entry({ subdivision_id: 9999 })] })).status, 400);
  assert.equal((await request(admin, '/timesheets/post', { week: 41, year: 2026, entries: [entry({ subdivision_id: 9999 })] })).status, 400);
});

test('description length validation is atomic on every write path and preserves line breaks', async () => {
  const maxDescription = 'a'.repeat(descriptionMaxLength - 1) + '\n';
  assert.equal((await request(employee, '/timesheets', entry({ project_description: maxDescription }))).status, 200);
  assert.equal(db.prepare('SELECT project_description FROM timesheets WHERE user_id = ? AND work_date = ?').get(employee, date).project_description, maxDescription);
  for (const invalid of ['x'.repeat(descriptionMaxLength + 1), 123, { text: 'bad' }]) {
    for (const [actor, route, body] of [
      [employee, '/timesheets', entry({ project_description: invalid })],
      [employee, '/timesheets/batch', { entries: [entry({ hours: 3 }), entry({ project_description: invalid, work_date: '2026-10-07' })] }],
      [admin, '/timesheets/post', { week: 41, year: 2026, entries: [entry({ project_description: invalid })] }],
    ]) assert.equal((await request(actor, route, body)).status, 400, route);
  }
  assert.equal(db.prepare('SELECT hours FROM timesheets WHERE user_id = ? AND work_date = ?').get(employee, date).hours, 4);
  assert.equal((await request(employee, '/timesheets', entry({ project_description: null }))).status, 400);
  assert.equal((await request(employee, '/timesheets', entry())).status, 200);
});

test('submitted and approved descriptions are returned to admin expansions, managers and history', async () => {
  assert.equal((await request(employee, '/timesheets/submit', { week: 41, year: 2026 })).status, 200);
  const routes = [
    [admin, `/timesheets/all?week=41&year=2026&user_id=${employee}`],
    [admin, `/admin-ownership/timesheet-history?user_id=${employee}`],
    [manager, `/manager/week-details/${employee}/2026/41`],
  ];
  for (const [actor, route] of routes) {
    const response = await request(actor, route, undefined, 'GET');
    assert.equal(response.status, 200);
    assert(response.body.entries.every(row => row.project_description === description));
  }
  assert.equal((await request(admin, '/timesheets/approve', { user_id: employee, week: 41, year: 2026 })).status, 200);
  const approved = await request(admin, routes[0][1], undefined, 'GET');
  assert(approved.body.entries.every(row => row.status === 'approved' && row.project_description === description));
});
