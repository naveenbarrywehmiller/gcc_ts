const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

process.env.BOOTSTRAP_ADMIN_EMAIL = '';
process.env.BOOTSTRAP_ADMIN_PASSWORD = '';
const config = require('../server/src/config/env');
config.dbPath = ':memory:';
const db = require('../server/src/config/db');
const { migrate } = require('../server/src/config/migrate');
migrate();
const express = require('../server/node_modules/express');
const jwt = require('../server/node_modules/jsonwebtoken');
const app = express();
app.use(express.json());
app.use('/vacations', require('../server/src/routes/planned-vacations'));
let server, base;
const users = {};
before(async () => {
  const division = db.prepare('INSERT INTO divisions(name) VALUES (?)');
  const north = Number(division.run('Vacation North').lastInsertRowid);
  const south = Number(division.run('Vacation South').lastInsertRowid);
  const insert = db.prepare('INSERT INTO users(name,email,password_hash,role,division_id,division) VALUES (?,?,?,?,?,?)');
  for (const [name, role, id, legacy] of [
    ['employee', 'employee', north, null], ['other', 'employee', south, null],
    ['admin', 'admin', south, null], ['system', 'system admin', null, null],
    ['manager', 'manager', north, null], ['unscoped', 'admin', null, null],
    ['legacy', 'employee', null, 'Vacation North'], ['fallback', 'admin', south, null],
  ]) users[name] = Number(insert.run(name, `${name}@vacation.test`, 'unused', role, id, legacy).lastInsertRowid);
  db.prepare('INSERT INTO admin_divisions(user_id,division_id) VALUES (?,?)').run(users.admin, north);
  for (const id of [users.employee, users.other, users.legacy]) db.prepare('INSERT INTO user_admin_assignments(user_id,admin_id,assigned_by) VALUES (?,?,?)').run(id, users.system, users.system);
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}/vacations`;
});
after(() => { server?.close(); db.close(); });

async function request(user, suffix = '', method = 'GET', body) {
  const headers = { 'Content-Type': 'application/json' };
  if (user) headers.Authorization = `Bearer ${jwt.sign({ userId: users[user] }, config.jwtSecret)}`;
  const response = await fetch(base + suffix, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, body: await response.json() };
}
const query = '?start=2026-01-01&end=2026-12-31';
const change = (date, planned = true) => ({ date, planned });

test('personal vacation saves are idempotent, isolated by user, and leave timesheets intact', async () => {
  db.prepare("INSERT INTO timesheets(user_id,work_date,hours,status) VALUES (?, '2026-09-30', 8, 'approved')").run(users.employee);
  const before = db.prepare('SELECT * FROM timesheets').all();
  for (const user of ['employee', 'other', 'manager', 'admin', 'system', 'legacy']) {
    const result = await request(user, '', 'PATCH', { changes: [change('2026-09-30'), change('2026-10-01')], user_id: users.other });
    assert.equal(result.status, 200);
  }
  await request('employee', '', 'PATCH', { changes: [change('2026-09-30')] });
  let result = await request('employee', query);
  assert.equal(result.body.plans.length, 2);
  assert(result.body.plans.every(plan => plan.user_id === users.employee));
  await request('employee', '', 'PATCH', { changes: [change('2026-09-30', false), change('2026-10-02')] });
  result = await request('employee', query);
  assert.deepEqual(result.body.plans.map(plan => plan.vacation_date), ['2026-10-01', '2026-10-02']);
  assert.equal((await request('other', query)).body.plans.length, 2);
  assert.deepEqual(db.prepare('SELECT * FROM timesheets').all(), before);
});

test('admins only see their division scope; system admins see all, and team filters cannot widen access', async () => {
  const scoped = await request('admin', query + '&view=team');
  assert.equal(scoped.status, 200);
  assert.deepEqual([...new Set(scoped.body.plans.map(plan => plan.user_id))].sort(), [users.employee, users.manager, users.legacy].sort());
  assert.equal((await request('admin', query + `&view=team&employee_id=${users.other}`)).body.plans.length, 0);
  assert.equal((await request('employee', query + `&employee_id=${users.other}`)).body.plans.length, 0);
  assert.equal((await request('unscoped', query + '&view=team')).body.plans.length, 0);
  const all = await request('system', query + '&view=team');
  assert.equal(new Set(all.body.plans.map(plan => plan.user_id)).size, 6);
  assert((await request('fallback', query + '&view=team')).body.plans.every(plan => [users.other, users.admin].includes(plan.user_id)));
  const employees = await request('admin', '/employees');
  assert.deepEqual(employees.body.employees.map(person => person.id).sort(), [users.employee, users.manager, users.legacy].sort());
  assert.equal((await request('system', '/employees')).body.employees.length, 8);
});

test('unauthenticated access and employee team access are blocked; Managers have scoped team reads', async () => {
  assert.equal((await request(null, query)).status, 401);
  assert.equal((await request(null, '', 'PATCH', { changes: [change('2026-09-30')] })).status, 401);
  for (const user of ['employee']) {
    assert.equal((await request(user, query + '&view=team')).status, 403);
    assert.equal((await request(user, '/employees')).status, 403);
  }
  assert.equal((await request('manager', query + '&view=team')).status, 200);
  assert.equal((await request('manager', '/employees')).status, 200);
});

test('invalid writes fail atomically; leap days and edits across years work', async () => {
  const before = db.prepare('SELECT * FROM planned_vacations').all();
  for (const changes of [
    [change('2026-12-15'), change('2026-02-29')], [change('2026-02-30')],
    [change('2026-9-01')], [change('2026-10-01', 1)], [change('2026-10-01'), change('2026-10-01', false)],
    [], [null], Array(367).fill(change('2026-10-01')),
  ]) assert.equal((await request('employee', '', 'PATCH', { changes })).status, 400);
  assert.deepEqual(db.prepare('SELECT * FROM planned_vacations').all(), before);
  assert.equal((await request('employee', '', 'PATCH', { changes: [change('2028-02-29'), change('2026-12-31'), change('2027-01-01')] })).status, 200);
  const result = await request('employee', '?start=2026-12-31&end=2027-01-01');
  assert.deepEqual(result.body.plans.map(plan => plan.vacation_date), ['2026-12-31', '2027-01-01']);
  for (const suffix of ['?start=2026-02-30&end=2026-03-01', '?start=2026-03-02&end=2026-03-01', '?start=2025-01-01&end=2026-12-31', query + '&view=invalid', query + '&employee_id=1.5']) {
    assert.equal((await request('employee', suffix)).status, 400);
  }
});

test('calendar dates use ISO weeks through year and daylight-saving boundaries', async () => {
  const dates = await import('../client/src/lib/vacationDates.js');
  assert.deepEqual(dates.weekInfo('2021-01-01'), { week: 53, year: 2020 });
  assert.deepEqual(dates.weekInfo('2025-12-29'), { week: 1, year: 2026 });
  assert.equal(dates.weekStart('2026-09-30'), '2026-09-28');
  assert.equal(dates.weekStart('2026-10-04'), '2026-09-28');
  assert.equal(dates.addDays('2026-03-08', 1), '2026-03-09');
  assert.equal(dates.addDays('2026-11-01', 1), '2026-11-02');
  assert.equal(dates.shiftPeriod('2026-01-31', 'month', 1), '2026-02-01');
  assert.equal(dates.shiftPeriod('2026-12-31', 'month', 1), '2027-01-01');
  const month = dates.calendarDays('2026-03-15', 'month');
  assert.equal(month.length, 42);
  assert.equal(month[0], '2026-02-23');
  assert.equal(month.at(-1), '2026-04-05');
  assert.deepEqual(dates.calendarDays('2026-12-31', 'week'), ['2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03']);
});

test('migration can run again without losing saved plans', () => {
  const before = db.prepare('SELECT * FROM planned_vacations ORDER BY id').all();
  migrate();
  assert.deepEqual(db.prepare('SELECT * FROM planned_vacations ORDER BY id').all(), before);
});
