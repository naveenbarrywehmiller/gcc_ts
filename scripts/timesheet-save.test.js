const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Execute the actual page handlers with deterministic renders, timers and transport.
// Each render gets its own rows closure, reproducing React's stale-timer behavior.
const source = fs.readFileSync(path.join(__dirname, '../client/src/pages/Timesheet.jsx'), 'utf8');
const schedule = source.slice(source.indexOf('  const scheduleAutoSave ='), source.indexOf('  // Weekend/holiday warning'));
const update = source.slice(source.indexOf('  const updateHours ='), source.indexOf('  // Calculate totals'));
const save = source.slice(source.indexOf('  const handleSave ='), source.indexOf('  // Admin self-post timesheet'));
const date = '2026-09-28';

function fixture(transport = async () => {}) {
  let rows = [{ task_id: 1, project_id: null, hours: { [date]: 8 }, status: 'draft' }];
  let timer;
  const requests = [];
  const context = vm.createContext({
    saveTimerRef: { current: null }, saveCallbackRef: { current: null }, saveQueueRef: { current: Promise.resolve() },
    dirtyRef: { current: new Set() }, warnedDatesRef: { current: new Set([date]) },
    useCallback: callback => callback, useEffect: callback => callback(),
    setTimeout: callback => { timer = callback; return 1; }, clearTimeout: () => {},
    setRows: updateRows => { rows = updateRows(rows); }, setSaving: () => {},
    toast: { success() {}, error() {}, warning() {} },
    api: { post: async (url, body) => { requests.push(body); await transport(body); } },
  });
  vm.runInContext(`function render(rows) { ${schedule}\n${update}\n${save}\nreturn { updateHours, handleSave }; }`, context);
  let page = context.render(rows);
  return {
    requests, context,
    edit(value) { page.updateHours(0, date, value); page = context.render(rows); },
    save() { return page.handleSave(); },
    async autosave() { timer(); await context.saveQueueRef.current; },
  };
}

test('autosave persists the most recent render instead of the pre-edit value', async () => {
  const f = fixture(); f.edit('9'); await f.autosave();
  assert.equal(f.requests[0].entries[0].hours, 9);
  assert.equal(f.context.dirtyRef.current.size, 0);
});

test('clearing a saved cell sends the zero-hour deletion', async () => {
  const f = fixture(); f.edit(''); await f.save();
  assert.equal(f.requests[0].entries[0].hours, 0);
});

test('edits during a save remain dirty and subsequent writes stay ordered', async () => {
  let resolveFirst;
  const first = new Promise(resolve => { resolveFirst = resolve; });
  let calls = 0;
  const f = fixture(async () => { if (++calls === 1) await first; });
  f.edit('9'); const saving = f.save();
  await new Promise(resolve => setImmediate(resolve));
  f.edit('10');
  assert.equal(f.context.dirtyRef.current.size, 1);
  const nextSave = f.save();
  assert.equal(f.requests.length, 1);
  resolveFirst(); await Promise.all([saving, nextSave]);
  assert.deepEqual(f.requests.map(r => r.entries[0].hours), [9, 10]);
});

test('failed saves preserve edits for retry', async () => {
  const f = fixture(async () => { throw new Error('offline'); });
  f.edit('9'); await assert.rejects(f.save(), /offline/);
  assert.equal(f.context.dirtyRef.current.size, 1);
});
