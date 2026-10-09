const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
process.env.BOOTSTRAP_ADMIN_EMAIL = '';
process.env.BOOTSTRAP_ADMIN_PASSWORD = '';
process.env.SYSTEM_ERROR_LOG_PATH = require('node:path').join(require('node:os').tmpdir(), `gcc-rules-${process.pid}.jsonl`);
const config = require('../server/src/config/env');
config.dbPath = ':memory:';
config.enableSharepointSync = false;
config.enablePowerAutomate = false;
const app = require('../server/src/index');
const db = require('../server/src/config/db');
const jwt = require('../server/node_modules/jsonwebtoken');
const repo = require('../server/src/repositories/TimesheetRepository');
const sp = require('../server/src/services/sharepoint');
let server, base, employee, admin, manager, system, division, billable, nonbillable, unclassified, task, nonTask;
const week = { week: 41, year: 2026 };
const entry = (overrides = {}) => ({ project_id: billable, task_id: task, project_description: 'Design work\nReviewed changes', work_date: '2026-10-05', hours: 4, ...overrides });
const assign = reviewer => db.prepare('INSERT OR REPLACE INTO user_admin_assignments(user_id,admin_id,assigned_by) VALUES (?,?,?)').run(employee, reviewer, system);
async function request(actor, route, body, method = 'POST') {
  const response = await fetch(base + route, { method,
    headers: { Authorization: `Bearer ${jwt.sign({ userId: actor }, config.jwtSecret)}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: await response.json() };
}
before(async () => {
  division = Number(db.prepare("INSERT INTO divisions(name) VALUES ('Engineering')").run().lastInsertRowid);
  const user = role => Number(db.prepare('INSERT INTO users(name,email,password_hash,role,division_id) VALUES (?,?,?,?,?)')
    .run(role, `${role}@rules.test`, 'unused', role, division).lastInsertRowid);
  employee = user('employee'); admin = user('admin'); manager = user('manager'); system = user('system admin');
  const project = (code, billing) => Number(db.prepare('INSERT INTO projects(project_code,project_name,billing_type,division_id) VALUES (?,?,?,?)').run(code, code, billing, division).lastInsertRowid);
  billable = project('BILL', 'Billable'); nonbillable = project('INTERNAL', 'Non-Billable'); unclassified = project('LEGACY', null);
  task = Number(db.prepare("INSERT INTO tasks(task_category,classification) VALUES ('Design','Billable')").run().lastInsertRowid);
  nonTask = Number(db.prepare("INSERT INTO tasks(task_category,classification,requires_project) VALUES ('Meeting','Non-Billable',0)").run().lastInsertRowid);
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
beforeEach(() => { db.exec('DELETE FROM timesheets'); assign(admin); });
after(() => { server?.close(); db.close(); });

test('single, batch and self-post reject missing fields, wrong billing tasks and inactive references atomically', async () => {
  for (const invalid of [
    { project_id: null }, { project_id: '' }, { project_id: 99999 }, { project_id: true }, { project_id: [1] },
    { project_description: null }, { project_description: '' }, { project_description: ' \n\t' },
    { project_description: 'x'.repeat(501) }, { project_description: 123 },
    { task_id: null }, { task_id: nonTask }, { project_id: unclassified },
  ]) {
    for (const [actor, route, body] of [
      [employee, '/timesheets', entry(invalid)],
      [employee, '/timesheets/batch', { entries: [entry(), entry({ ...invalid, work_date: '2026-10-06' })] }],
      [admin, '/timesheets/post', { ...week, entries: [entry(), entry({ ...invalid, work_date: '2026-10-06' })] }],
    ]) {
      assert.equal((await request(actor, route, body)).status, 400, `${route}: ${JSON.stringify(invalid)}`);
      assert.equal(db.prepare('SELECT COUNT(*) n FROM timesheets').get().n, 0);
    }
  }
  for (const [table, id] of [['projects', billable], ['tasks', task]]) {
    db.prepare(`UPDATE ${table} SET active = 0 WHERE id = ?`).run(id);
    assert.equal((await request(employee, '/timesheets', entry())).status, 400);
    db.prepare(`UPDATE ${table} SET active = 1 WHERE id = ?`).run(id);
  }
  // An irrelevant entries field must never bypass validation on the single-entry route.
  assert.equal((await request(employee, '/timesheets', entry({ project_id: null, entries: [] }))).status, 400);
  assert.equal((await request(employee, '/timesheets', entry())).status, 201);
  assert.equal((await request(employee, '/timesheets', entry({ project_id: nonbillable, task_id: nonTask }))).status, 201);
  assert.equal((await request(employee, '/timesheets/batch', { entries: [entry({ hours: 0, project_description: undefined })] })).status, 200);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM timesheets').get().n, 1);
});

test('repository checks explicit Admin, Manager and System Admin assignments before submission and sync', async t => {
  const sync = t.mock.method(sp, 'updateTimesheetStatus', async () => {});
  config.enableSharepointSync = true;
  try {
    await request(employee, '/timesheets', entry());
    for (const reviewer of [admin, manager, system]) {
      assign(reviewer);
      db.exec("UPDATE timesheets SET status = 'draft'");
      assert.equal(await repo.submitWeek(employee, week.week, week.year), 1);
      assert.equal(sync.mock.calls.at(-1).arguments[4], db.prepare('SELECT email FROM users WHERE id = ?').get(reviewer).email);
    }
    const calls = sync.mock.callCount();
    for (const invalid of ['missing', 'inactive', 'wrong-role', 'self']) {
      assign(admin);
      db.exec("UPDATE timesheets SET status = 'draft'");
      if (invalid === 'missing') db.prepare('DELETE FROM user_admin_assignments WHERE user_id = ?').run(employee);
      if (invalid === 'inactive') db.prepare('UPDATE users SET active = 0 WHERE id = ?').run(admin);
      if (invalid === 'wrong-role') db.prepare("UPDATE users SET role = 'employee' WHERE id = ?").run(admin);
      if (invalid === 'self') assign(employee);
      await assert.rejects(repo.submitWeek(employee, week.week, week.year), /active assigned/);
      assert.equal(db.prepare('SELECT status FROM timesheets').get().status, 'draft');
      assert.equal(sync.mock.callCount(), calls);
      db.prepare("UPDATE users SET role = 'admin', active = 1 WHERE id = ?").run(admin);
    }
  } finally { config.enableSharepointSync = false; }
});

test('API submission has no fallback recipient and sends only the explicit reviewer', async t => {
  await request(employee, '/timesheets', entry());
  const nativeFetch = global.fetch;
  const payloads = [];
  config.enablePowerAutomate = true; config.powerAutomateWebhookUrl = 'https://webhook.invalid/test';
  t.mock.method(global, 'fetch', (url, options) => {
    if (url === config.powerAutomateWebhookUrl) { payloads.push(JSON.parse(options.body)); return Promise.resolve({ ok: true }); }
    return nativeFetch(url, options);
  });
  try {
    db.prepare('DELETE FROM user_admin_assignments WHERE user_id = ?').run(employee);
    assert.equal((await request(employee, '/timesheets/submit', week)).status, 403);
    assert.equal(payloads.length, 0);
    assert.equal(db.prepare('SELECT status FROM timesheets').get().status, 'draft');
    assign(system);
    assert.equal((await request(employee, '/timesheets/submit', week)).status, 200);
    assert.equal(payloads.length, 1); assert.equal(payloads[0].approverId, system);
    assert.equal(payloads[0].approverEmail, 'system admin@rules.test');
  } finally { config.enablePowerAutomate = false; }
});

test('SharePoint bulk entry and direct status sync cannot replay unassigned submissions', async t => {
  db.prepare('DELETE FROM user_admin_assignments WHERE user_id = ?').run(employee);
  const network = t.mock.method(global, 'fetch', async () => { throw new Error('Unexpected network call'); });
  config.enableSharepointSync = true;
  try {
    await assert.rejects(sp.syncTimesheetEntry({ ...entry(), user_id: employee, status: 'submitted' }), /active assigned/);
    await assert.rejects(sp.updateTimesheetStatus('employee@rules.test', 41, 2026, 'submitted'), /active assigned/);
    assert.equal(network.mock.callCount(), 0);
  } finally { config.enableSharepointSync = false; }
});

test('legacy incomplete rows cannot be submitted or self-posted and remain intact', async () => {
  const insert = actor => db.prepare("INSERT INTO timesheets(user_id,task_id,work_date,hours,status,week_number,week_year) VALUES (?,?,'2026-10-05',3,'draft',41,2026)").run(actor, nonTask);
  insert(employee); insert(admin);
  assert.equal((await request(employee, '/timesheets/submit', week)).status, 400);
  assert.equal((await request(admin, '/timesheets/post', week)).status, 400);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM timesheets WHERE status = 'draft' AND project_id IS NULL").get().n, 2);
  await assert.rejects(repo.upsertEntry(employee, { ...entry(), project_id: null }), /Project Code/);
  const before = db.prepare('SELECT * FROM timesheets').all();
  require('../server/src/config/migrate').migrate();
  assert.deepEqual(db.prepare('SELECT * FROM timesheets').all(), before);
  assert.equal(db.prepare('SELECT billing_type FROM projects WHERE id = ?').get(unclassified).billing_type, null);
});

test('assignment removal excludes legacy submissions from all review queues and rejects approvals', async () => {
  await request(employee, '/timesheets', entry());
  await repo.submitWeek(employee, week.week, week.year);
  db.prepare('DELETE FROM user_admin_assignments WHERE user_id = ?').run(employee);
  for (const actor of [admin, manager, system]) {
    const pending = await request(actor, '/manager/pending-approvals', undefined, 'GET');
    assert.deepEqual(pending.body.weeks, []);
    assert.equal((await request(actor, '/timesheets/approve', { ...week, user_id: employee })).status, 403);
  }
  assert.deepEqual((await request(system, '/timesheets/summary?week=41&year=2026&status=submitted', undefined, 'GET')).body.summaries, []);
  config.powerAutomateCallbackSecret = 'rules-secret';
  const callback = () => fetch(base + '/timesheets/pa-callback', { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'x-callback-secret': 'rules-secret' }, body: JSON.stringify({ employeeEmail: 'employee@rules.test', approverEmail: 'admin@rules.test', status: 'approved', weekNumber: 41, weekYear: 2026 }) });
  assert.equal((await callback()).status, 403);
  assign(system); assert.equal((await callback()).status, 403);
  assign(admin); assert.equal((await callback()).status, 200);
});

test('project billing selection is required and obsolete task flags cannot disable the project rule', async () => {
  assert.equal((await request(system, '/projects', { project_code: 'NEW', project_name: 'New' })).status, 400);
  const created = await request(system, '/projects', { project_code: 'NEW', project_name: 'New', billing_type: 'Non-Billable' });
  assert.equal(created.status, 201); assert.equal(created.body.project.billing_type, 'Non-Billable');
  assert.equal((await request(system, `/projects/${unclassified}`, { billing_type: 'Billable' }, 'PUT')).status, 200);
  const createdTask = await request(system, '/tasks', { task_category: 'Legacy client', classification: 'Non-Billable', requires_project: false });
  assert.equal(createdTask.body.task.requires_project, 1);
  assert.equal((await request(system, `/tasks/${nonTask}`, { task_category: 'Meeting', requires_project: false }, 'PUT')).body.task.requires_project, 1);
});

test('dashboard uses the primary division relation, retains inactive and legacy names, and reconciles genuine unassigned hours', async () => {
  const date = new Date().toISOString().slice(0, 10);
  const user = (name, divisionId, legacy) => Number(db.prepare("INSERT INTO users(name,email,password_hash,division_id,division) VALUES (?,?,'unused',?,?)").run(name, name + '@division.test', divisionId, legacy).lastInsertRowid);
  db.prepare('UPDATE divisions SET active = 0 WHERE id = ?').run(division);
  const legacy = user('legacy', null, 'Legacy Division'), unassigned = user('unassigned', null, '  ');
  db.prepare("UPDATE users SET division = 'Outdated name' WHERE id = ?").run(employee);
  for (const actor of [employee, legacy, unassigned]) db.prepare("INSERT INTO timesheets(user_id,work_date,hours,status) VALUES (?,?,2,'approved')").run(actor, date);
  const dashboard = (await request(system, '/reports/dashboard', undefined, 'GET')).body;
  assert.deepEqual(dashboard.hoursByDivision.map(row => row.division).sort(), ['Engineering', 'Legacy Division', null].sort());
  assert.equal(dashboard.hoursByDivision.reduce((sum, row) => sum + row.total_hours, 0), dashboard.stats.monthlyHours);
  assert.equal(dashboard.stats.monthlyHours, 6);
});

test('billing migration leaves historical rows and legacy project classification untouched', () => {
  db.exec('ALTER TABLE projects DROP COLUMN billing_type');
  db.prepare("INSERT INTO timesheets(user_id,task_id,work_date,hours,status,week_number,week_year) VALUES (?,?,'2026-10-05',2,'approved',41,2026)").run(employee, nonTask);
  const rows = db.prepare('SELECT * FROM timesheets').all();
  const projects = db.prepare('SELECT id, project_code, project_name FROM projects').all();
  const { migrate } = require('../server/src/config/migrate');
  migrate(); migrate();
  assert.deepEqual(db.prepare('SELECT * FROM timesheets').all(), rows);
  assert.deepEqual(db.prepare('SELECT id, project_code, project_name FROM projects').all(), projects);
  assert(db.prepare('SELECT billing_type FROM projects').all().every(project => project.billing_type === null));
});
