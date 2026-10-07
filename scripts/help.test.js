const { test } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');

process.env.BOOTSTRAP_ADMIN_EMAIL = '';
process.env.BOOTSTRAP_ADMIN_PASSWORD = '';
process.env.SYSTEM_ERROR_LOG_PATH = path.join(os.tmpdir(), `gcc-help-${process.pid}.jsonl`);
const config = require('../server/src/config/env');
config.dbPath = ':memory:';
const app = require('../server/src/index');
const db = require('../server/src/config/db');
const jwt = require('../server/node_modules/jsonwebtoken');

test('help endpoint returns only guides allowed for the authenticated role', async () => {
  const users = {};
  for (const role of ['employee', 'manager', 'admin', 'system admin']) {
    users[role] = Number(db.prepare('INSERT INTO users(name,email,password_hash,role) VALUES (?,?,?,?)')
      .run(role, `${role.replace(' ', '')}@test.invalid`, 'unused', role).lastInsertRowid);
  }
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}/api/help?role=system%20admin`;

  try {
    assert.equal((await fetch(url)).status, 401);
    const expected = {
      employee: ['everyday'],
      manager: ['everyday', 'manager'],
      admin: ['everyday', 'admin'],
      'system admin': ['everyday', 'admin', 'system-admin'],
    };
    for (const [role, groupIds] of Object.entries(expected)) {
      const token = jwt.sign({ userId: users[role] }, config.jwtSecret);
      const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      assert.equal(response.status, 200, role);
      assert.equal(response.headers.get('cache-control'), 'private, no-store');
      const body = await response.json();
      assert.deepEqual(body.groups.map(group => group.id), groupIds, role);
      assert(body.groups.every(group => group.guides.length > 0), role);
      assert(body.groups.every(group => group.guides.every(guide => guide.path && guide.steps.length > 0)), role);
    }
  } finally {
    server.close();
    db.close();
  }
});
