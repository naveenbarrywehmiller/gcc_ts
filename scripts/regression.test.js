const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
process.env.BOOTSTRAP_ADMIN_EMAIL = '';
process.env.BOOTSTRAP_ADMIN_PASSWORD = '';
const config = require('../server/src/config/env');
config.dbPath = ':memory:';
config.enableSharepointSync = false;
config.enablePowerAutomate = false;
const app = require('../server/src/index');
const db = require('../server/src/config/db');
const jwt = require('../server/node_modules/jsonwebtoken');
const bcrypt = require('../server/node_modules/bcryptjs');
const { bootstrapAdmin } = require('../server/src/config/bootstrapAdmin');
const sp = require('../server/src/services/sharepoint');
let server, base, admin, employee, manager, outsider, systemAdmin, taskA, taskB;
const date = '2026-09-28';
const week = { week: 40, year: 2026 };

async function request(user, path, body, method = 'POST') {
  const headers = { Authorization: `Bearer ${jwt.sign({ userId: user }, config.jwtSecret)}` };
  const options = { method, headers };
  if (body instanceof FormData) options.body = body;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  const res = await fetch(base + path, options);
  return { status: res.status, body: await res.json() };
}

before(async () => {
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM users').get().n, 0, 'startup must not create a predictable account');
  const division = name => Number(db.prepare('INSERT INTO divisions(name) VALUES (?)').run(name).lastInsertRowid);
  const a = division('Regression A'), b = division('Regression B');
  const user = (name, role, div) => Number(db.prepare('INSERT INTO users(name,email,password_hash,role,division_id) VALUES (?,?,?,?,?)')
    .run(name, name + '@test.invalid', 'unused', role, div).lastInsertRowid);
  admin = user('admin', 'admin', a);
  manager = user('manager', 'manager', a);
  employee = user('employee', 'employee', a);
  outsider = user('outsider', 'employee', b);
  db.prepare('INSERT INTO admin_divisions(user_id,division_id) VALUES (?,?)').run(admin, a);
  bootstrapAdmin(db, { BOOTSTRAP_ADMIN_EMAIL: 'bootstrap@test.invalid', BOOTSTRAP_ADMIN_PASSWORD: 'Unique-review-password-2026' });
  systemAdmin = db.prepare("SELECT id FROM users WHERE role = 'system admin'").get().id;
  taskA = Number(db.prepare('INSERT INTO tasks(task_category, requires_project) VALUES (?,0)').run('Task A').lastInsertRowid);
  taskB = Number(db.prepare('INSERT INTO tasks(task_category, requires_project) VALUES (?,0)').run('Task B').lastInsertRowid);
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(() => { server?.close(); db.close(); });

test('bootstrap is explicit and does not recreate renamed accounts', () => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(systemAdmin);
  assert(bcrypt.compareSync('Unique-review-password-2026', user.password_hash));
  db.prepare('UPDATE users SET email = ? WHERE id = ?').run('renamed@test.invalid', systemAdmin);
  bootstrapAdmin(db, { BOOTSTRAP_ADMIN_EMAIL: 'bootstrap@test.invalid', BOOTSTRAP_ADMIN_PASSWORD: 'Unique-review-password-2026' });
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'system admin'").get().n, 1);
});

test('admin cannot assign system admin through update, creation, or CSV import', async () => {
  assert.equal((await request(admin, `/users/${admin}`, { role: 'system admin' }, 'PUT')).status, 403);
  assert.equal((await request(admin, '/users', { name: 'Escalated', email: 'escalated@test.invalid', password: 'long-password', role: 'system admin' })).status, 403);
  const form = new FormData();
  form.append('file', new Blob(['Name,Email,Role\nEscalated,imported@test.invalid,system admin']), 'roles.csv');
  const imported = await request(admin, '/import/users', form);
  assert.equal(imported.status, 200);
  assert.equal(imported.body.imported, 0);
  assert.equal(imported.body.skipped, 1);
  assert.equal((await request(admin, '/system/maintenance', undefined, 'GET')).status, 403);
  assert.equal((await request(systemAdmin, `/users/${admin}`, { role: 'admin' }, 'PUT')).status, 200);
});

test('batch totals are atomic, include existing hours, and permit balanced redistribution', async () => {
  const entries = hours => hours.map((h, i) => ({ task_id: i ? taskB : taskA, work_date: date, hours: h }));
  assert.equal((await request(employee, '/timesheets/batch', { entries: entries([20, 20]) })).status, 400);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM timesheets WHERE user_id = ?').get(employee).n, 0);
  assert.equal((await request(employee, '/timesheets/batch', { entries: entries([8, 16]) })).status, 200);
  assert.equal((await request(employee, '/timesheets/batch', { entries: entries([16, 8]) })).status, 200);
  assert.equal((await request(employee, '/timesheets/batch', { entries: entries([20]) })).status, 400);
  assert.equal(db.prepare('SELECT SUM(hours) AS n FROM timesheets WHERE user_id = ?').get(employee).n, 24);
  assert.equal((await request(employee, '/timesheets/batch', { entries: entries([0, 8]) })).status, 200);
  assert.equal(db.prepare('SELECT SUM(hours) AS n FROM timesheets WHERE user_id = ?').get(employee).n, 8);
});

test('managers can review their division but cannot review themselves or other divisions', async () => {
  for (const user of [employee, outsider, manager]) {
    await request(user, '/timesheets/batch', { entries: [{ task_id: taskB, work_date: date, hours: 8 }] });
    assert.equal((await request(user, '/timesheets/submit', week)).status, 200);
  }
  assert.equal((await request(manager, '/timesheets/approve', { ...week, user_id: employee })).status, 200);
  assert.equal((await request(manager, '/timesheets/reject', { ...week, user_id: outsider })).status, 403);
  assert.equal((await request(manager, '/timesheets/approve', { ...week, user_id: manager })).status, 403);
  assert.equal((await request(admin, '/timesheets/approve', { ...week, user_id: outsider })).status, 403);
  assert.equal((await request(admin, '/timesheets/reject', { ...week, user_id: outsider })).status, 403);
  await request(admin, '/timesheets/recall', { ...week, user_id: employee });
  await request(employee, '/timesheets/submit', week);
  assert.equal((await request(manager, '/timesheets/reject', { ...week, user_id: employee, comment: 'Please correct' })).status, 200);
  assert.equal((await request(systemAdmin, '/timesheets/approve', { ...week, user_id: outsider })).status, 200);
});

test('SharePoint self-post completes and queues status sync; invalid totals roll back', async () => {
  let call;
  const original = sp.updateTimesheetStatus;
  sp.updateTimesheetStatus = async (...args) => { call = args; };
  config.enableSharepointSync = true;
  try {
    const result = await request(admin, '/timesheets/post', { ...week, entries: [{ task_id: taskA, work_date: date, hours: 8 }] });
    assert.equal(result.status, 200);
    assert.equal(call[3], 'approved');
    assert.equal((await request(admin, '/timesheets/post', { ...week, entries: [{ task_id: taskB, work_date: date, hours: 20 }] })).status, 400);
    assert.equal(db.prepare('SELECT SUM(hours) AS n FROM timesheets WHERE user_id = ?').get(admin).n, 8);
  } finally { config.enableSharepointSync = false; sp.updateTimesheetStatus = original; }
});
