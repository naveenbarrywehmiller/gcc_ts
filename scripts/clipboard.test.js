const { test } = require('node:test');
const assert = require('node:assert/strict');

function mockBrowser(t, clipboard, command = () => true) {
  const events = [];
  const input = {
    style: {},
    focus: () => events.push('focus'),
    select: () => events.push('select'),
    remove: () => events.push('remove'),
  };
  const mocks = {
    navigator: { clipboard },
    document: {
      activeElement: { focus: () => events.push('restore focus') },
      createElement: tag => { assert.equal(tag, 'textarea'); return input; },
      body: { appendChild: () => events.push('append') },
      execCommand: name => { assert.equal(name, 'copy'); return command(input.value); },
    },
  };
  for (const [key, value] of Object.entries(mocks)) {
    const original = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { value, configurable: true });
    t.after(() => {
      if (original) Object.defineProperty(globalThis, key, original);
      else delete globalThis[key];
    });
  }
  return events;
}

test('clipboard copy waits for the native write to finish', async t => {
  const { copyText } = await import('../client/src/utils/clipboard.js');
  let finish;
  const events = mockBrowser(t, { writeText: text => {
    assert.equal(text, 'test-only-token');
    return new Promise(resolve => { finish = resolve; });
  } });
  let copied = false;
  const copying = copyText('test-only-token').then(() => { copied = true; });
  await Promise.resolve();
  assert.equal(copied, false);
  finish();
  await copying;
  assert.equal(copied, true);
  assert.deepEqual(events, []);
});

for (const [scenario, clipboard] of [
  ['unavailable', undefined],
  ['permission denied', { writeText: async () => { throw new Error('Not allowed'); } }],
]) {
  test(`clipboard fallback works when native access is ${scenario}`, async t => {
    const { copyText } = await import('../client/src/utils/clipboard.js');
    const events = mockBrowser(t, clipboard, text => {
      assert.equal(text, 'https://example.test/api/powerbi/export');
      return true;
    });
    await copyText('https://example.test/api/powerbi/export');
    assert.deepEqual(events, ['append', 'focus', 'select', 'remove', 'restore focus']);
  });
}

for (const [scenario, command] of [
  ['returns false', () => false],
  ['throws', () => { throw new Error('Copy blocked'); }],
]) {
  test(`clipboard failure propagates and cleans up when the fallback ${scenario}`, async t => {
    const { copyText } = await import('../client/src/utils/clipboard.js');
    const events = mockBrowser(t, undefined, command);
    await assert.rejects(copyText('test-only-token'), /blocked/);
    assert.deepEqual(events.slice(-2), ['remove', 'restore focus']);
  });
}
