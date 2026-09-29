const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
process.env.BOOTSTRAP_ADMIN_EMAIL = '';
process.env.BOOTSTRAP_ADMIN_PASSWORD = '';
const config = require('../server/src/config/env');
config.dbPath = ':memory:';
const db = require('../server/src/config/db');
const express = require('../server/node_modules/express');
const jwt = require('../server/node_modules/jsonwebtoken');
require('../server/src/config/migrate').migrate();
const app = express();
app.use('/users', require('../server/src/routes/users'));
app.use((err, req, res, next) => res.status(500).json({ error: err.message }));
let server, base, admin, division;
function user(name, role = 'employee') {
  return Number(db.prepare('INSERT INTO users(name,email,password_hash,role,employee_id) VALUES (?,?,?,?,?)')
    .run(name, `${name}@test.invalid`, 'unused', role, `EMP-${name}`).lastInsertRowid);
}
async function request(id, path, method = 'GET') {
  const response = await fetch(base + path, {
    method, headers: { Authorization: `Bearer ${jwt.sign({ userId: id }, config.jwtSecret)}` },
  });
  return { status: response.status, body: await response.json() };
}
before(async () => {
  admin = user('Admin', 'admin');
  division = Number(db.prepare("INSERT INTO divisions(name) VALUES ('Test')").run().lastInsertRowid);
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server?.close(); db.close(); });

for (const withTimesheets of [false, true]) {
  test(`deletion preserves every linked record ${withTimesheets ? 'with' : 'without'} timesheets`, async () => {
    const target = user(`Target-${withTimesheets}`, 'admin');
    const owned = user(`Owned-${withTimesheets}`);
    db.prepare('INSERT INTO admin_divisions(user_id,division_id) VALUES (?,?)').run(target, division);
    db.prepare('INSERT INTO user_admin_assignments(user_id,admin_id,assigned_by) VALUES (?,?,?)').run(target, admin, admin);
    db.prepare('INSERT INTO user_admin_assignments(user_id,admin_id,assigned_by) VALUES (?,?,?)').run(owned, target, target);
    db.prepare("INSERT INTO audit_logs(user_id,action,details) VALUES (?,'LOGIN','Existing history')").run(target);
    db.prepare('INSERT INTO division_updates(division_id,month,updated_by) VALUES (?,?,?)').run(division, withTimesheets ? '2026-09' : '2026-08', target);
    if (withTimesheets) db.prepare("INSERT INTO timesheets(user_id,work_date,hours) VALUES (?,'2026-09-29',8)").run(target);
    const tables = ['timesheets', 'admin_divisions', 'user_admin_assignments', 'division_updates'];
    const snapshot = () => tables.map(table => db.prepare(`SELECT * FROM ${table} ORDER BY id`).all());
    const records = snapshot();
    const logs = db.prepare('SELECT * FROM audit_logs WHERE user_id = ?').all(target);
    const result = await request(admin, `/users/${target}/permanent`, 'DELETE');
    assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.equal(result.body.had_timesheets, withTimesheets);
    assert.equal(result.body.timesheet_count, withTimesheets ? 1 : 0);
    assert.deepEqual(snapshot(), records);
    assert.deepEqual(db.prepare('SELECT * FROM audit_logs WHERE user_id = ?').all(target), logs);
    const deleted = db.prepare('SELECT * FROM users WHERE id = ?').get(target);
    assert.equal(deleted.name, '[Deleted User]');
    assert.equal(deleted.active, 0);
    assert.equal(deleted.password_hash, '');
    assert.equal(deleted.employee_id, null);
    assert.match(deleted.email, /@removed\.local$/);
    assert.equal((await request(target, '/users/active-count')).status, 401);
    assert.equal((await request(admin, '/users/')).body.users.some(u => u.id === target), false);
    assert.deepEqual(db.pragma('foreign_key_check'), []);
  });
}

test('deletion guards still reject self, system admin and missing accounts', async () => {
  assert.equal((await request(admin, `/users/${admin}/permanent`, 'DELETE')).status, 400);
  const system = user('System', 'system admin');
  assert.equal((await request(admin, `/users/${system}/permanent`, 'DELETE')).status, 403);
  assert.equal((await request(admin, '/users/999999/permanent', 'DELETE')).status, 404);
});

test('audit failure rolls back anonymization', async () => {
  const target = user('Rollback');
  const original = db.prepare('SELECT * FROM users WHERE id = ?').get(target);
  db.exec(`CREATE TRIGGER fail_deletion_audit BEFORE INSERT ON audit_logs
    WHEN NEW.action = 'PERMANENT_DELETE_USER'
    BEGIN SELECT RAISE(ABORT, 'Audit unavailable'); END;`);
  try {
    assert.equal((await request(admin, `/users/${target}/permanent`, 'DELETE')).status, 500);
    assert.deepEqual(db.prepare('SELECT * FROM users WHERE id = ?').get(target), original);
  } finally {
    db.exec('DROP TRIGGER fail_deletion_audit');
  }
});
