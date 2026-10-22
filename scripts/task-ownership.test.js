const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
process.env.BOOTSTRAP_ADMIN_EMAIL = '';
process.env.BOOTSTRAP_ADMIN_PASSWORD = '';
process.env.SYSTEM_ERROR_LOG_PATH = path.join(require('node:os').tmpdir(), `task-ownership-errors-${process.pid}.jsonl`);
process.env.MAINTENANCE_FILE = path.join(require('node:os').tmpdir(), `task-ownership-maintenance-${process.pid}`);
const config = require('../server/src/config/env');
config.dbPath = ':memory:'; config.enableSharepointSync = false; config.enablePowerAutomate = false;
const app = require('../server/src/index');
const db = require('../server/src/config/db');
const jwt = require('../server/node_modules/jsonwebtoken');
const ExcelJS = require('../server/node_modules/exceljs');
let server, base, task;
const users = {};
async function request(route, body, method = body === undefined ? 'GET' : 'POST', actor = 'system') {
  const response = await fetch(base + route, { method, headers: {
    Authorization: `Bearer ${jwt.sign({ userId: users[actor] }, config.jwtSecret)}`,
    ...(body instanceof FormData || body === undefined ? {} : { 'Content-Type': 'application/json' }),
  }, ...(body === undefined ? {} : { body: body instanceof FormData ? body : JSON.stringify(body) }) });
  return { status: response.status, body: response.headers.get('content-type')?.includes('spreadsheetml') ? Buffer.from(await response.arrayBuffer()) : await response.json() };
}
async function upload(content) {
  const body = new FormData();
  body.append('file', new Blob([typeof content === 'string' ? content : await content.xlsx.writeBuffer()]), typeof content === 'string' ? 'tasks.csv' : 'tasks.xlsx');
  return request('/import/tasks', body);
}
before(async () => {
  db.exec(`INSERT INTO platforms(id,name) VALUES (1,'Test'); INSERT INTO divisions(id,name) VALUES (1,'Test');
    INSERT INTO departments(id,name,active) VALUES (1,'Mechanical',1),(2,'Electrical',1),(3,'Retired',0);
    INSERT INTO department_ownerships(id,department_id,label,active) VALUES
      (1,1,'Design ownership',1),(2,2,'Design ownership',1),(3,1,'Retired ownership',0),(4,3,'Old department ownership',1)`);
  for (const [key, role] of [['system','system admin'],['admin','admin'],['manager','manager'],['viewer','viewer'],['employee','employee']]) {
    users[key] = Number(db.prepare('INSERT INTO users(name,email,password_hash,role,division_id) VALUES (?,?,?,?,1)').run(key, `${key}@task-ownership.test`, 'unused', role).lastInsertRowid);
  }
  db.prepare('INSERT INTO user_admin_assignments(user_id,admin_id) VALUES (?,?)').run(users.employee, users.system);
  server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); base = `http://127.0.0.1:${server.address().port}/api`;
});
after(() => { server?.close(); db.close(); });

test('migration retains unassigned legacy tasks and all existing timesheet ownership', () => {
  const legacy = db.prepare("INSERT INTO tasks(task_category,classification) VALUES ('Legacy','Productive')").run().lastInsertRowid;
  db.prepare("INSERT INTO timesheets(user_id,task_id,ownership_id,work_date,hours,week_number,week_year) VALUES (?,?,2,'2026-10-01',2,40,2026)").run(users.employee, legacy);
  const saved = db.prepare('SELECT * FROM timesheets').all();
  require('../server/src/config/migrate').migrate({ bootstrap: false });
  require('../server/src/config/migrate').migrate({ bootstrap: false });
  assert.equal(db.prepare('SELECT ownership_id FROM tasks WHERE id=?').get(legacy).ownership_id, null);
  assert.deepEqual(db.prepare('SELECT * FROM timesheets').all(), saved);
  assert.deepEqual(db.pragma('foreign_key_check'), []);
});

test('task writes require real active ownership and enforce existing task permissions', async () => {
  const input = { task_category: 'Required ownership', classification: 'Productive' };
  for (const ownership_id of [undefined, null, '', ' ', 0, -1, true, [], {}, 1.5, '1 OR 1=1', 999999, 3, 4]) {
    const result = await request('/tasks', { ...input, ownership_id });
    assert.equal(result.status, 400, JSON.stringify({ ownership_id, result }));
  }
  assert.equal(db.prepare("SELECT COUNT(*) n FROM tasks WHERE task_category='Required ownership'").get().n, 0);
  for (const actor of ['manager', 'viewer', 'employee']) {
    assert.equal((await request('/tasks', { ...input, ownership_id: 1 }, 'POST', actor)).status, 403);
  }
  const result = await request('/tasks', { ...input, ownership_id: '1' }, 'POST', 'admin');
  assert.equal(result.status, 201); task = result.body.task.id;
  assert.equal(result.body.task.ownership_id, 1);
  assert.equal(result.body.task.ownership_label, 'Design ownership');
  assert.equal(result.body.task.ownership_department_name, 'Mechanical');
  assert.equal((await request(`/tasks/${task}`, { ownership_id: null }, 'PUT')).status, 400);
  const legacy = db.prepare("SELECT id FROM tasks WHERE task_category='Legacy'").get().id;
  assert.equal((await request(`/tasks/${legacy}`, { task_description: 'Must select first' }, 'PUT')).status, 400);
});

test('ownership changes and renames preserve history and remain visible to read-only roles', async () => {
  db.prepare("INSERT INTO timesheets(user_id,task_id,ownership_id,work_date,hours) VALUES (?,?,1,'2026-10-02',3)").run(users.employee, task);
  const saved = db.prepare('SELECT * FROM timesheets').all();
  const changed = await request(`/tasks/${task}`, { ownership_id: 2 }, 'PUT');
  assert.equal(changed.status, 200); assert.equal(changed.body.task.ownership_department_name, 'Electrical');
  assert.equal((await request(`/tasks/${task}`, { task_description: 'Partial update' }, 'PUT')).body.task.ownership_id, 2);
  assert.equal((await request('/department-ownerships/2', { label: 'Electrical ownership' }, 'PUT')).status, 200);
  for (const actor of Object.keys(users)) {
    const row = (await request('/tasks', undefined, 'GET', actor)).body.tasks.find(row => row.id === task);
    assert.equal(row.ownership_label, 'Electrical ownership');
  }
  assert.deepEqual(db.prepare('SELECT * FROM timesheets').all(), saved);
});

test('Excel offers named ownership choices and imports Productive ownership IDs atomically', async () => {
  db.prepare('UPDATE department_ownerships SET label=? WHERE id=2').run('Electrical\nownership');
  const response = await request('/tasks/export?search=Required');
  assert.equal(response.status, 200);
  const book = new ExcelJS.Workbook(); await book.xlsx.load(response.body);
  const sheet = book.getWorksheet('Tasks');
  const col = sheet.getRow(1).values.indexOf('Ownership Details');
  assert.match(sheet.getRow(2).getCell(col).value, /^2 — Electrical — Electrical\nownership$/);
  const validation = sheet.getRow(2).getCell(col).dataValidation;
  assert.equal(validation.type, 'list'); assert.equal(validation.allowBlank, true);
  assert.equal(sheet.getRow(10000).getCell(col).dataValidation.type, 'list');
  assert.equal((await upload(book)).status, 200, 'display labels containing newlines round-trip');
  sheet.getRow(2).getCell(col).value = '1 — Mechanical — Design ownership';
  assert.equal((await upload(book)).status, 200);
  assert.equal(db.prepare('SELECT ownership_id FROM tasks WHERE id=?').get(task).ownership_id, 1);
  sheet.getRow(2).getCell(col).value = '';
  assert.equal((await upload(book)).status, 400);
  const before = db.prepare('SELECT * FROM tasks ORDER BY id').all();
  const audit = db.prepare('SELECT COUNT(*) n FROM audit_logs').get().n;
  const bad = await upload('Task Name/Number,Classification,Ownership Details\nValid new,Productive,1\nInvalid new,Productive,999999');
  assert.equal(bad.status, 400); assert(bad.body.errors.some(error => error.startsWith('Row 3:')));
  assert.deepEqual(db.prepare('SELECT * FROM tasks ORDER BY id').all(), before);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM audit_logs').get().n, audit);
  const missing = await upload('Task Name/Number,Classification\nMissing ownership,Productive');
  assert.equal(missing.status, 400); assert(missing.body.errors.some(error => error.includes('required for Productive tasks')));
  assert.equal((await upload('Task Name/Number,Classification,Ownership Details\nCSV ownership,Productive,2')).status, 200);
});

test('Non-Productive ownership is optional in forms, partial edits, classification changes and imports', async () => {
  const created = await request('/tasks', { task_category: 'Optional ownership', classification: 'Non-Productive' });
  assert.equal(created.status, 201); const id = created.body.task.id;
  assert.equal(created.body.task.ownership_id, null);
  assert.equal((await request(`/tasks/${id}`, { task_description: 'No ownership needed' }, 'PUT')).status, 200);
  assert.equal((await request(`/tasks/${id}`, { ownership_id: 1 }, 'PUT')).body.task.ownership_id, 1);
  assert.equal((await request(`/tasks/${id}`, { ownership_id: '' }, 'PUT')).body.task.ownership_id, null);
  assert.equal((await request(`/tasks/${id}`, { classification: 'Productive' }, 'PUT')).status, 400);
  assert.equal((await request(`/tasks/${id}`, { classification: 'Productive', ownership_id: 1 }, 'PUT')).status, 200);
  assert.equal((await request(`/tasks/${id}`, { classification: 'Non-Productive', ownership_id: null }, 'PUT')).status, 200);
  assert.equal((await request(`/tasks/${id}`, { ownership_id: 999999 }, 'PUT')).status, 400);
  assert.equal((await upload('Task Name/Number,Classification\nOptional CSV,Non-Productive')).status, 200);
  assert.equal((await upload('Task Name/Number,Classification,Ownership Details\nBlank CSV,Non-Productive,')).status, 200);
  const before = db.prepare('SELECT * FROM tasks ORDER BY id').all();
  const mixed = await upload('Task Name/Number,Classification\nOptional mixed,Non-Productive\nRequired mixed,Productive');
  assert.equal(mixed.status, 400); assert(mixed.body.errors.some(error => error.startsWith('Row 3:')));
  assert.deepEqual(db.prepare('SELECT * FROM tasks ORDER BY id').all(), before);
});

test('inactive ownership or Department can be retained but cannot be assigned to another task', async () => {
  assert.equal((await request('/department-ownerships/1', undefined, 'DELETE')).status, 200);
  assert.equal((await request(`/tasks/${task}`, { ownership_id: 1, task_description: 'Retained inactive' }, 'PUT')).status, 200);
  assert.equal((await request('/tasks', { task_category: 'Inactive denied', classification: 'Productive', ownership_id: 1 })).status, 400);
  assert.equal((await request(`/tasks/${task}`, { ownership_id: 2 }, 'PUT')).status, 200);
  db.prepare('UPDATE departments SET active=0 WHERE id=2').run();
  assert.equal((await request(`/tasks/${task}`, { task_description: 'Retained Department' }, 'PUT')).status, 200);
  assert.equal((await request('/tasks', { task_category: 'Department denied', classification: 'Productive', ownership_id: 2 })).status, 400);
  assert.equal((await request('/department-ownerships')).body.ownerships.find(item => item.id === 2).department_active, 0);
  assert.deepEqual(db.pragma('foreign_key_check'), []);
});
