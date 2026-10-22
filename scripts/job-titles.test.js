const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
process.env.BOOTSTRAP_ADMIN_EMAIL = '';
process.env.BOOTSTRAP_ADMIN_PASSWORD = '';
process.env.SYSTEM_ERROR_LOG_PATH = path.join(require('node:os').tmpdir(), `gcc-titles-errors-${process.pid}.jsonl`);
process.env.MAINTENANCE_FILE = path.join(require('node:os').tmpdir(), `gcc-titles-maintenance-${process.pid}`);
const config = require('../server/src/config/env');
config.dbPath = ':memory:';
config.enableSharepointSync = false;
config.enablePowerAutomate = false;
const app = require('../server/src/index');
const db = require('../server/src/config/db');
const jwt = require('../server/node_modules/jsonwebtoken');
const bcrypt = require('../server/node_modules/bcryptjs');
let server, base, division, otherDivision, senior, lead, target;
const users = {};
async function request(actor, route, method = 'GET', body) {
  const headers = { 'Content-Type': 'application/json' };
  if (actor) headers.Authorization = `Bearer ${jwt.sign({ userId: users[actor] }, config.jwtSecret)}`;
  const res = await fetch(base + route, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: res.status, body: await res.json() };
}
before(async () => {
  db.exec("INSERT INTO platforms(id,name) VALUES (1,'Test Platform')");
  division = Number(db.prepare("INSERT INTO divisions(name) VALUES ('Title Engineering')").run().lastInsertRowid);
  otherDivision = Number(db.prepare("INSERT INTO divisions(name) VALUES ('Other Engineering')").run().lastInsertRowid);
  for (const [key, role] of [['system', 'system admin'], ['admin', 'admin'], ['manager', 'manager'], ['employee', 'employee'], ['viewer', 'viewer']]) {
    users[key] = Number(db.prepare('INSERT INTO users(name,email,password_hash,role,division_id) VALUES (?,?,?,?,?)')
      .run(key, `${key}@titles.test`, bcrypt.hashSync('Title-test-123', 4), role, division).lastInsertRowid);
  }
  db.prepare('INSERT INTO user_admin_assignments(user_id,admin_id) VALUES (?,?)').run(users.employee, users.system);
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(() => { server?.close(); db.close(); });

test('migration preserves existing users, assignments and titles across repeated startup', () => {
  assert.equal(db.prepare('SELECT job_title_id FROM users WHERE id = ?').get(users.employee).job_title_id, null);
  const before = db.prepare('SELECT * FROM users ORDER BY id').all();
  require('../server/src/config/migrate').migrate({ bootstrap: false });
  assert.deepEqual(db.prepare('SELECT * FROM users ORDER BY id').all(), before);
  assert.deepEqual(db.pragma('foreign_key_check'), []);
});

test('catalog applies existing permissions, validates names and rejects duplicate titles', async () => {
  assert.equal((await request(null, '/job-titles')).status, 401);
  for (const role of Object.keys(users)) assert.equal((await request(role, '/job-titles')).status, 200);
  for (const role of ['admin', 'employee', 'viewer']) {
    assert.equal((await request(role, '/job-titles', 'POST', { name: 'Denied' })).status, 403);
  }
  for (const name of [null, '', '  ', {}, 5, 'x'.repeat(101)]) {
    assert.equal((await request('system', '/job-titles', 'POST', { name })).status, 400);
  }
  const created = await request('manager', '/job-titles', 'POST', { name: ' Senior engineer ' });
  assert.equal(created.status, 201);
  assert.equal(created.body.jobTitle.name, 'Senior engineer');
  senior = created.body.jobTitle.id;
  lead = (await request('system', '/job-titles', 'POST', { name: 'Lead engineer' })).body.jobTitle.id;
  assert.equal((await request('system', '/job-titles', 'POST', { name: 'senior ENGINEER' })).status, 409);
  assert.equal((await request('system', `/job-titles/${lead}`, 'PUT', { name: 'Senior engineer' })).status, 409);
  assert.equal((await request('system', '/job-titles/999999', 'PUT', { name: 'Missing' })).status, 404);
  assert(db.prepare("SELECT id FROM audit_logs WHERE action = 'CREATE_JOB_TITLE' AND entity_id = ?").get(senior));
});

test('user creation and legacy profile edits require a real job title without changing records on failure', async () => {
  const payload = { name: 'Engineer', email: 'engineer@titles.test', password: 'Title-test-123', division_id: division };
  const before = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  for (const job_title_id of [undefined, null, '', ' ', true, [], {}, 0, -1, 1.5, '1 OR 1=1', 999999]) {
    const result = await request('system', '/users', 'POST', { ...payload, job_title_id });
    assert.equal(result.status, 400, JSON.stringify({ job_title_id, ...result }));
  }
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM users').get().n, before);
  assert.equal((await request('system', `/users/${users.employee}`, 'PUT', { name: 'Unassigned edit' })).status, 400);
  assert.equal(db.prepare('SELECT name FROM users WHERE id = ?').get(users.employee).name, 'employee');
  const created = await request('admin', '/users', 'POST', { ...payload, job_title_id: String(senior) });
  assert.equal(created.status, 201, JSON.stringify(created));
  target = created.body.user.id;
  assert.equal(created.body.user.job_title_name, 'Senior engineer');
  assert.equal(created.body.user.job_title_id, senior);
  assert.equal((await request('admin', '/users', 'POST', { ...payload, email: 'foreign@titles.test', division_id: otherDivision, job_title_id: senior })).status, 403);
});

test('promotion persists through directory, profile and login without changing access roles', async () => {
  assert.equal((await request('employee', `/users/${target}`, 'PUT', { job_title_id: lead })).status, 403);
  const result = await request('admin', `/users/${target}`, 'PUT', { job_title_id: lead });
  assert.equal(result.status, 200);
  assert.equal(result.body.user.job_title_name, 'Lead engineer');
  assert.equal(result.body.user.role, 'employee');
  db.prepare('INSERT INTO user_admin_assignments(user_id,admin_id) VALUES (?,?)').run(target, users.system);
  users.target = target;
  assert.equal((await request('system', `/users/${target}`)).body.user.job_title_name, 'Lead engineer');
  assert.equal((await request('viewer', '/users')).body.users.find(u => u.id === target).job_title_name, 'Lead engineer');
  const login = await request(null, '/auth/login', 'POST', { email: 'engineer@titles.test', password: 'Title-test-123' });
  assert.equal(login.status, 200);
  assert.equal(login.body.user.job_title_name, 'Lead engineer');
  assert.equal((await request('target', '/auth/me')).body.user.job_title_name, 'Lead engineer');
  assert.equal((await request('system', `/job-titles/${lead}`, 'PUT', { name: 'Lead Engineer II' })).status, 200);
  assert.equal((await request('target', '/auth/me')).body.user.job_title_name, 'Lead Engineer II');
  for (const value of ['', null, [], true, '999999']) {
    assert.equal((await request('system', `/users/${target}`, 'PUT', { job_title_id: value })).status, 400);
  }
  assert.equal((await request('system', `/users/${target}`, 'PUT', { employee_id: 'EMP-1' })).status, 200);
  assert.equal(db.prepare('SELECT job_title_id FROM users WHERE id = ?').get(target).job_title_id, lead);
});

test('deactivation preserves existing assignments but prevents new assignments, and deletion clears the title', async () => {
  assert.equal((await request('manager', `/job-titles/${lead}`, 'DELETE')).status, 403);
  assert.equal((await request('system', `/job-titles/${lead}`, 'DELETE')).status, 200);
  assert(!(await request('system', '/job-titles')).body.jobTitles.some(title => title.id === lead));
  assert.equal((await request('target', '/auth/me')).body.user.job_title_name, 'Lead Engineer II');
  assert.equal((await request('system', `/users/${target}`, 'PUT', { job_title_id: lead, name: 'Retained' })).status, 200);
  assert.equal((await request('system', `/users/${users.employee}`, 'PUT', { job_title_id: lead })).status, 400);
  assert.equal((await request('system', `/users/${target}`, 'PUT', { job_title_id: senior })).status, 200);
  require('../server/src/config/migrate').migrate({ bootstrap: false });
  assert.equal(db.prepare('SELECT job_title_id FROM users WHERE id = ?').get(target).job_title_id, senior);
  assert.equal((await request('system', `/users/${target}/permanent`, 'DELETE')).status, 200);
  assert.equal(db.prepare('SELECT job_title_id FROM users WHERE id = ?').get(target).job_title_id, null);
  assert.deepEqual(db.pragma('foreign_key_check'), []);
});
