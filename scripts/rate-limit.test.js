const { test } = require('node:test');
const assert = require('node:assert/strict');
process.env.BOOTSTRAP_ADMIN_EMAIL = '';
process.env.BOOTSTRAP_ADMIN_PASSWORD = '';
process.env.SYSTEM_ERROR_LOG_PATH = require('node:path').join(require('node:os').tmpdir(), `gcc-test-errors-${process.pid}.jsonl`);
const config = require('../server/src/config/env');
config.dbPath = ':memory:';
config.rateLimitMax = 2;
const app = require('../server/src/index');
const db = require('../server/src/config/db');
const jwt = require('../server/node_modules/jsonwebtoken');

test('changing an unverified token cookie cannot reset the request limit', async () => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const results = [];
    for (let i = 0; i < 3; i++) {
      const res = await fetch(`http://127.0.0.1:${server.address().port}/api/health`, { headers: { Cookie: `token=arbitrary-${i}` } });
      results.push(res.status);
    }
    assert.deepEqual(results, [200, 200, 429]);
    const signedResults = [];
    for (let i = 0; i < 3; i++) {
      const token = jwt.sign({ userId: 123, jti: String(i) }, config.jwtSecret);
      const res = await fetch(`http://127.0.0.1:${server.address().port}/api/health`, { headers: { Cookie: `token=${token}` } });
      signedResults.push(res.status);
    }
    assert.deepEqual(signedResults, [200, 200, 429], 'rotating signed tokens keeps the same user bucket');
    const login = await fetch(`http://127.0.0.1:${server.address().port}/api/auth/login`, {
      method: 'POST', headers: { Cookie: `token=${jwt.sign({ userId: 456 }, config.jwtSecret)}` },
    });
    assert.equal(login.status, 429, 'login remains IP-limited even with a valid token');
  } finally { server.close(); db.close(); }
});
