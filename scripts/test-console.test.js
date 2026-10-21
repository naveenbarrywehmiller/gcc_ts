const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const preload = path.join(__dirname, 'test-console.js');
const env = { ...process.env };
delete env.NODE_TEST_CONTEXT;

test('test console keeps Unicode logs visible without writing to the result pipe', () => {
  const result = spawnSync(process.execPath, ['--require', preload, '-e', `
    console.log('✅ Exported records');
    console.info('→ Migration complete');
    console.error('Expected diagnostic');
  `], { env, encoding: 'utf8', timeout: 10000 });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '');
  for (const message of ['✅ Exported records', '→ Migration complete', 'Expected diagnostic']) {
    assert(result.stderr.includes(message), result.stderr);
  }
});

test('test console preserves passing results and real assertion failures', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gcc-test-console-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const fixture = path.join(directory, 'fixture.cjs');
  fs.writeFileSync(fixture, `
    const { test } = require('node:test');
    const assert = require('node:assert/strict');
    test('passing fixture', () => { console.log('✅ Exported records'); });
    test('failing fixture', () => { assert.equal(1, 2); });
  `);
  const result = spawnSync(process.execPath, ['--require', preload, '--test', '--test-reporter=tap', fixture],
    { env, encoding: 'utf8', timeout: 10000 });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout, /ok 1 - passing fixture/);
  assert.match(result.stdout, /not ok 2 - failing fixture/);
  assert.match(result.stdout, /ERR_ASSERTION/);
  assert.match(result.stdout, /# tests 2/);
  assert.match(result.stdout, /# pass 1/);
  assert.match(result.stdout, /# fail 1/);
  assert((result.stdout + result.stderr).includes('✅ Exported records'));
});
