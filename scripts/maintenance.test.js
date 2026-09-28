const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
process.env.BOOTSTRAP_ADMIN_EMAIL = '';
process.env.BOOTSTRAP_ADMIN_PASSWORD = '';
const config = require('../server/src/config/env');
config.dbPath = ':memory:';
const app = require('../server/src/index');
const db = require('../server/src/config/db');
const bcrypt = require('../server/node_modules/bcryptjs');

test('maintenance login enforces system admin credentials and restores access', async (t) => {
  // Simulate only the maintenance flag; never change a developer's real flag/database.
  const flag = path.resolve(__dirname, '../server/.maintenance');
  const existsSync = fs.existsSync;
  const unlinkSync = fs.unlinkSync;
  let enabled = true;
  let cannotRemove = false;
  t.mock.method(fs, 'existsSync', file => path.resolve(String(file)) === flag ? enabled : existsSync(file));
  t.mock.method(fs, 'unlinkSync', file => {
    if (path.resolve(String(file)) !== flag) return unlinkSync(file);
    if (cannotRemove) throw Object.assign(new Error('Permission denied'), { code: 'EACCES' });
    enabled = false;
  });
  const hash = bcrypt.hashSync('test-password', 4);
  for (const role of ['employee', 'manager', 'admin', 'system admin']) {
    db.prepare('INSERT INTO users(name,email,password_hash,role) VALUES (?,?,?,?)').run(role, role.replace(' ', '') + '@test.invalid', hash, role);
  }
  db.prepare('INSERT INTO users(name,email,password_hash,role,active) VALUES (?,?,?,?,0)').run('Inactive', 'inactive@test.invalid', hash, 'system admin');
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const login = (email, password = 'test-password', endpoint = 'maintenance-login') => fetch(base + '/api/auth/' + endpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }),
  });
  try {
    const page = await fetch(base + '/');
    assert.equal(page.status, 503);
    assert.equal(page.headers.get('cache-control'), 'no-store');
    assert.match(await page.text(), /System admin login/);
    assert.equal((await fetch(base + '/api/health')).status, 503);
    assert.equal((await fetch(base + '/api/auth/ms-callback', { method: 'POST' })).status, 503);
    for (const email of ['employee@test.invalid', 'manager@test.invalid', 'admin@test.invalid']) {
      for (const endpoint of ['login', 'maintenance-login']) {
        const denied = await login(email, 'test-password', endpoint);
        assert.equal(denied.status, 403);
        assert.equal(denied.headers.get('set-cookie'), null);
        assert.equal(enabled, true);
      }
    }
    for (const [email, password] of [['systemadmin@test.invalid', 'wrong'], ['inactive@test.invalid', 'test-password']]) {
      assert.equal((await login(email, password)).status, 401);
      assert.equal(enabled, true);
    }
    cannotRemove = true;
    const failed = await login('systemadmin@test.invalid');
    assert.equal(failed.status, 500);
    assert.equal(failed.headers.get('set-cookie'), null);
    assert.equal(enabled, true);
    cannotRemove = false;
    const success = await login('systemadmin@test.invalid');
    assert.equal(success.status, 200);
    assert.match(success.headers.get('set-cookie'), /HttpOnly/i);
    const session = await success.json();
    assert.equal(session.user.role, 'system admin');
    assert.equal(enabled, false);
    assert.equal((await fetch(base + '/api/health')).status, 200);
    assert.equal((await fetch(base + '/api/auth/me', { headers: { Authorization: `Bearer ${session.token}` } })).status, 200);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE action = 'MAINTENANCE_DISABLED'").get().n, 1);
    assert.equal((await login('employee@test.invalid')).status, 403, 'maintenance form stays admin-only after another admin restores access');
    assert.equal((await login('employee@test.invalid', 'test-password', 'login')).status, 200);
    enabled = true;
    assert.equal((await login('systemadmin@test.invalid', 'test-password', 'login')).status, 200);
    assert.equal(enabled, false);
  } finally {
    server.close();
    db.close();
  }
});
