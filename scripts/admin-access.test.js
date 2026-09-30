const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
process.env.BOOTSTRAP_ADMIN_EMAIL = '';
process.env.BOOTSTRAP_ADMIN_PASSWORD = '';
process.env.SYSTEM_ERROR_LOG_PATH = require('node:path').join(require('node:os').tmpdir(), `gcc-access-${process.pid}.jsonl`);
const config = require('../server/src/config/env');
config.dbPath = ':memory:';
config.enableSharepointSync = false;
config.enablePowerAutomate = false;
const app = require('../server/src/index');
const db = require('../server/src/config/db');
const jwt = require('../server/node_modules/jsonwebtoken');
let server, base, a, b, system, admin, peer, manager, employee, foreign, unassigned, legacy;
async function request(actor, route, body, method = 'GET') {
  const headers = { Authorization: `Bearer ${jwt.sign({ userId: actor }, config.jwtSecret)}` };
  const options = { method, headers };
  if (body instanceof FormData) options.body = body;
  else if (body !== undefined) { options.body = JSON.stringify(body); headers['Content-Type'] = 'application/json'; }
  const response = await fetch(base + route, options);
  return { status: response.status, body: await response.json() };
}
before(async () => {
  a = Number(db.prepare("INSERT INTO divisions(name) VALUES ('Audit A')").run().lastInsertRowid);
  b = Number(db.prepare("INSERT INTO divisions(name) VALUES ('Audit B')").run().lastInsertRowid);
  const user = (name, role, division) => Number(db.prepare('INSERT INTO users(name,email,password_hash,role,division_id) VALUES (?,?,?,?,?)').run(name, `${name}@test.invalid`, 'unused', role, division).lastInsertRowid);
  system = user('System', 'system admin', null);
  admin = user('Admin', 'admin', a);
  peer = user('Peer', 'admin', b);
  manager = user('Manager', 'manager', a);
  employee = user('Employee', 'employee', a);
  foreign = user('Foreign', 'employee', b);
  unassigned = user('Unassigned', 'admin', null);
  legacy = user('Legacy', 'admin', null);
  db.prepare('UPDATE users SET division = ? WHERE id = ?').run('Audit A', legacy);
  for (const id of [manager, employee, foreign]) db.prepare("INSERT INTO timesheets(user_id,work_date,hours,week_number,week_year,status) VALUES (?,'2026-09-28',8,40,2026,'submitted')").run(id);
  db.prepare("INSERT INTO projects(project_code,project_name,division_id) VALUES ('AUDIT-A','A',?),('AUDIT-B','B',?)").run(a, b);
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(() => { server?.close(); db.close(); });

test('profile and legacy division fallback works across monthly updates, history, reporting and approvals', async () => {
  for (const actor of [admin, legacy]) {
    const opts = await request(actor, '/projects/options');
    assert.deepEqual(opts.body.divisions.map(d => d.id), [a]);
    assert.deepEqual(opts.body.division_update_divisions.map(d => d.id), [a]);
    assert.equal((await request(actor, '/division-updates', { division_id: a, month: '2026-09', new_joiners: 1 }, 'PUT')).status, 200);
    assert.equal((await request(actor, '/division-updates', { division_id: b, month: '2026-09', new_joiners: 1 }, 'PUT')).status, 403);
    const users = (await request(actor, '/admin-ownership/authorized-users')).body.users;
    assert(users.some(u => u.id === employee));
    assert(!users.some(u => u.id === foreign));
    assert.equal((await request(actor, `/admin-ownership/timesheet-history?user_id=${employee}`)).body.entries.length, 1);
    assert.equal((await request(actor, `/admin-ownership/timesheet-history?user_id=${foreign}`)).status, 403);
    const projects = (await request(actor, '/powerbi/projects')).body.data;
    assert(projects.some(p => p.projectCode === 'AUDIT-A'));
    assert(!projects.some(p => p.projectCode === 'AUDIT-B'));
  }
  assert.equal((await request(unassigned, '/admin-ownership/authorized-users')).body.users.length, 0);
  assert.equal((await request(unassigned, '/timesheets/summary?week=40&year=2026')).body.summaries.length, 0);
});

test('system admin history and ownership work without separate division grants', async () => {
  const users = (await request(system, '/admin-ownership/authorized-users')).body.users;
  assert(users.some(u => u.id === employee)); assert(users.some(u => u.id === foreign));
  assert((await request(system, '/admin-ownership/my-users')).body.users.some(u => u.id === foreign));
  assert.equal((await request(system, `/admin-ownership/timesheet-history?user_id=${foreign}`)).body.entries.length, 1);
  assert.equal((await request(system, `/admin-ownership/assign/${foreign}`, {}, 'POST')).status, 200);
  assert.equal((await request(admin, `/admin-ownership/release/${foreign}`, {}, 'POST')).status, 403);
  assert.equal((await request(system, `/admin-ownership/release/${foreign}`, {}, 'POST')).status, 200);
});

test('approval reads, detail endpoints and draft deletion enforce division permissions', async () => {
  const summaries = (await request(admin, '/timesheets/summary?week=40&year=2026')).body.summaries;
  assert(summaries.some(s => s.user_id === employee && s.can_review));
  assert(!summaries.some(s => s.user_id === foreign));
  assert.equal((await request(admin, `/timesheets/all?week=40&year=2026&user_id=${foreign}`)).body.entries.length, 0);
  const pending = (await request(manager, '/manager/pending-approvals')).body.weeks;
  assert(pending.some(w => w.user_id === employee));
  assert(!pending.some(w => [manager, foreign].includes(w.user_id)));
  for (const actor of [admin, manager, unassigned]) assert.equal((await request(actor, `/manager/week-details/${foreign}/2026/40`)).status, 403);
  assert.equal((await request(system, `/manager/week-details/${foreign}/2026/40`)).status, 200);
  const draft = Number(db.prepare("INSERT INTO timesheets(user_id,work_date,hours,status) VALUES (?,'2026-09-29',1,'draft')").run(foreign).lastInsertRowid);
  assert.equal((await request(admin, `/timesheets/${draft}`, undefined, 'DELETE')).status, 403);
  assert(db.prepare('SELECT id FROM timesheets WHERE id = ?').get(draft));
  assert.equal((await request(system, `/timesheets/${draft}`, undefined, 'DELETE')).status, 200);
  assert.equal((await request(admin, '/timesheets/approve', { user_id: employee, week: 40, year: 2026 }, 'POST')).status, 200);
  assert.equal((await request(admin, '/timesheets/recall', { user_id: employee, week: 40, year: 2026 }, 'POST')).status, 200);
});

test('admins cannot expand project permissions through profile edits, grants or other admin credentials', async () => {
  for (const body of [{ division_id: b }, { division: 'Audit B' }, { role: 'system admin' }]) {
    assert.equal((await request(admin, `/users/${admin}`, body, 'PUT')).status, 403);
  }
  assert.equal((await request(admin, `/users/${admin}/divisions`, { division_ids: [b] }, 'PUT')).status, 403);
  assert.equal((await request(admin, `/users/${peer}`, { email: 'takeover@test.invalid', password: 'password123' }, 'PUT')).status, 403);
  assert.equal((await request(admin, `/users/${peer}/reset-password`, { password: 'password123' }, 'POST')).status, 403);
  assert.equal((await request(admin, `/users/${peer}/permanent`, undefined, 'DELETE')).status, 403);
  assert.equal((await request(admin, `/users/${employee}`, { role: 'admin' }, 'PUT')).status, 403);
  assert.equal((await request(admin, '/users', { name: 'Escalate', email: 'escalate@test.invalid', password: 'password123', role: 'admin', division_id: b }, 'POST')).status, 403);
  assert.equal((await request(admin, `/users/${admin}`, { name: 'Updated Admin', role: 'admin', division_id: String(a) }, 'PUT')).status, 200);
  assert.equal((await request(admin, `/users/${admin}`, { active: false }, 'PUT')).status, 400);
  assert.equal((await request(system, `/users/${peer}/divisions`, { division_ids: [a, a, b] }, 'PUT')).status, 200);
  const original = db.prepare('SELECT division_id FROM admin_divisions WHERE user_id = ? ORDER BY division_id').all(peer);
  assert.equal((await request(system, `/users/${peer}/divisions`, { division_ids: [999999] }, 'PUT')).status, 400);
  assert.deepEqual(db.prepare('SELECT division_id FROM admin_divisions WHERE user_id = ? ORDER BY division_id').all(peer), original);
});

test('user management checks both the original and destination division on every mutation', async () => {
  const list = (await request(admin, '/users')).body.users;
  assert.equal(list.find(u => u.id === employee).can_manage, true);
  assert.equal(list.find(u => u.id === foreign).can_manage, false);
  assert.equal(list.find(u => u.id === peer).can_manage, false);
  for (const [route, body, method] of [
    [`/users/${foreign}`, { division_id: a, password: 'takeover123' }, 'PUT'],
    [`/users/${foreign}/reset-password`, { password: 'takeover123' }, 'POST'],
    [`/users/${foreign}/toggle-active`, {}, 'POST'],
    [`/users/${foreign}`, undefined, 'DELETE'],
    [`/users/${foreign}/permanent`, undefined, 'DELETE'],
    [`/users/${employee}`, { division_id: b }, 'PUT'],
    [`/users/${employee}`, { division: 'Audit B' }, 'PUT'],
  ]) assert.equal((await request(admin, route, body, method)).status, 403, route);
  assert.equal((await request(admin, `/users/${employee}`, { name: 'Updated employee' }, 'PUT')).status, 200);
  assert.equal((await request(unassigned, `/users/${employee}`, { name: 'Denied' }, 'PUT')).status, 403);
  for (const [division, status] of [[a, 201], [b, 403]]) {
    assert.equal((await request(admin, '/users', { name: 'New Employee', email: `new-${division}@test.invalid`, password: 'password123', division_id: division }, 'POST')).status, status);
  }
  const form = new FormData();
  form.append('file', new Blob(['Name,Email,Role,Division\nForeign Import,foreign-import@test.invalid,employee,Audit B']), 'users.csv');
  assert.equal((await request(admin, '/import/users', form, 'POST')).body.imported, 0);
  assert.equal(db.prepare('SELECT active FROM users WHERE id = ?').get(foreign).active, 1);
});

test('user import links master IDs and rejects unknown sidebar values and unauthorized roles', async () => {
  const team = db.prepare("SELECT id FROM supporting_categories WHERE name = 'Dedicated Team'").get().id;
  const upload = (actor, text) => {
    const body = new FormData(); body.append('file', new Blob([text]), 'users.csv');
    return request(actor, '/import/users', body, 'POST');
  };
  const result = await upload(system, 'Name,Email,Role,Division,Team Type\nImported,imported@test.invalid,admin, audit a , dedicated team \nUnknown,unknown@test.invalid,employee,Missing,');
  assert.equal(result.status, 200); assert.equal(result.body.imported, 1); assert.equal(result.body.skipped, 1);
  const imported = db.prepare("SELECT * FROM users WHERE email = 'imported@test.invalid'").get();
  assert.equal(imported.division_id, a); assert.equal(imported.division, 'Audit A');
  assert.equal(imported.supporting_category_id, team);
  assert.deepEqual((await request(imported.id, '/projects/options')).body.divisions.map(d => d.id), [a]);
  const denied = await upload(admin, 'Name,Email,Role,Division\nEscalate,import-escalate@test.invalid,admin,Audit B');
  assert.equal(denied.body.imported, 0);
  assert.equal((await request(system, `/users/${employee}`, { division_id: 999999 }, 'PUT')).status, 400);
  assert.equal((await request(system, `/users/${employee}`, { division: 'Audit B' }, 'PUT')).status, 200);
  assert.equal(db.prepare('SELECT division_id FROM users WHERE id = ?').get(employee).division_id, b);
});
