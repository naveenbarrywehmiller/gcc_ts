const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
process.env.BOOTSTRAP_ADMIN_EMAIL = '';
process.env.BOOTSTRAP_ADMIN_PASSWORD = '';
process.env.SYSTEM_ERROR_LOG_PATH = require('node:path').join(require('node:os').tmpdir(), `gcc-dashboard-${process.pid}.jsonl`);
const config = require('../server/src/config/env');
config.dbPath = ':memory:';
config.enableSharepointSync = false;
config.enablePowerAutomate = false;
const app = require('../server/src/index');
const db = require('../server/src/config/db');
const jwt = require('../server/node_modules/jsonwebtoken');
const { expectedWeekHours } = require('../server/src/utils/workingHours');
const { getISOWeekNumber, getWeekDateRange } = require('../server/src/utils/dateUtils');
let server, base, admin, system, employee, manager, outsider, unassigned, current;

async function get(actor, route = '/reports/dashboard') {
  const response = await fetch(base + route, { headers: { Authorization: `Bearer ${jwt.sign({ userId: actor }, config.jwtSecret)}` } });
  assert.equal(response.status, 200);
  return response.json();
}

before(async () => {
  const division = name => Number(db.prepare('INSERT INTO divisions(name) VALUES (?)').run(name).lastInsertRowid);
  const a = division('Dashboard A'), b = division('Dashboard B');
  const user = (name, role, div) => Number(db.prepare('INSERT INTO users(name,email,password_hash,role,division_id) VALUES (?,?,?,?,?)').run(name, `${name}@test.invalid`, 'unused', role, div).lastInsertRowid);
  admin = user('Admin', 'admin', a);
  system = user('System', 'system admin', null);
  employee = user('Employee', 'employee', a);
  manager = user('Manager', 'manager', a);
  outsider = user('Outsider', 'employee', b);
  unassigned = user('Unassigned', 'admin', null);
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  current = getISOWeekNumber(today);
  const range = getWeekDateRange(current.week, current.year);
  db.prepare('INSERT INTO holidays(date,name) VALUES (?,?)').run(range.startDate, 'Company holiday');
  const entry = (actor, date, status = 'submitted') => {
    const info = getISOWeekNumber(date);
    db.prepare('INSERT INTO timesheets(user_id,work_date,hours,week_number,week_year,status) VALUES (?,?,8,?,?,?)').run(actor, date, info.week, info.year, status);
  };
  entry(employee, '2020-12-28');
  entry(employee, '2020-12-29'); // Two entries must count as one pending week.
  entry(employee, '2021-01-04'); // A second week from the same employee must count.
  entry(manager, '2021-01-04');
  entry(outsider, '2021-01-04');
  entry(employee, today, 'approved');
  entry(employee, today, 'rejected');
  entry(employee, today, 'draft');
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(() => { server?.close(); db.close(); });

test('pending approvals count employee-weeks across years and respect admin scope', async () => {
  const dashboard = await get(admin);
  assert.equal(dashboard.stats.pendingApprovals, 3);
  assert.equal(dashboard.recentSubmissions.length, 3);
  assert.equal(dashboard.recentSubmissions[0].week_year, 2020);
  assert.equal(dashboard.recentSubmissions[0].total_hours, 16);
  assert(!dashboard.recentSubmissions.some(row => row.user_id === outsider));
  assert.equal((await get(system)).stats.pendingApprovals, 4);
  assert.equal((await get(unassigned)).stats.pendingApprovals, 0);
});

test('manager dashboard agrees with review queue and excludes self and other divisions', async () => {
  const dashboard = await get(manager);
  const queue = await get(manager, '/manager/pending-approvals');
  assert.equal(dashboard.teamPendingApprovals, 2);
  assert.equal(queue.weeks.length, dashboard.teamPendingApprovals);
  assert(queue.weeks.every(row => row.user_id === employee));
});

test('employee dashboard retains mixed statuses, adjusts holidays, and includes non-project hours', async () => {
  const dashboard = await get(employee);
  assert.deepEqual(dashboard.stats.statusBreakdown.map(row => row.status).sort(), ['approved', 'draft', 'rejected']);
  assert.equal(dashboard.stats.expectedWeeklyHours, 32);
  assert.equal(dashboard.stats.monthlyHours, 24);
  assert.equal(dashboard.hoursByProject[0].project_code, 'Non-project');
  assert.equal(dashboard.hoursByProject.reduce((sum, row) => sum + row.total_hours, 0), dashboard.stats.monthlyHours);
  assert.equal(dashboard.teamPendingApprovals, undefined);
  assert.equal(dashboard.stats.currentWeek, current.week);
});

test('working-hour targets handle year boundaries, weekends, and a fully closed week', () => {
  assert.equal(expectedWeekHours('2020-12-28', []), 40);
  assert.equal(expectedWeekHours('2020-12-28', ['2021-01-01', '2021-01-02']), 32);
  assert.equal(expectedWeekHours('2020-12-28', ['2020-12-28', '2020-12-29', '2020-12-30', '2020-12-31', '2021-01-01']), 0);
});

test('week links accept valid ISO boundaries and reject invalid dates', async () => {
  const { weekFromSearch, weekLink } = await import('../client/src/utils/weekLink.js');
  const fallback = { week: 1, year: 2026 };
  assert.deepEqual(weekFromSearch('?week=53&year=2020', fallback), { week: 53, year: 2020 });
  for (const search of ['', '?week=53&year=2021', '?week=0&year=2026', '?week=2.5&year=2026', '?week=2&year=NaN']) assert.equal(weekFromSearch(search, fallback), fallback);
  assert.equal(weekLink('/timesheet', 53, 2020), '/timesheet?week=53&year=2020');
});
