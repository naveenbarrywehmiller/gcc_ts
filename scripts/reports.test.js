const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
process.env.BOOTSTRAP_ADMIN_EMAIL = '';
process.env.BOOTSTRAP_ADMIN_PASSWORD = '';
process.env.SYSTEM_ERROR_LOG_PATH = require('node:path').join(
  require('node:os').tmpdir(),
  `gcc-reports-${process.pid}.jsonl`
);
const config = require('../server/src/config/env');
config.dbPath = ':memory:';
config.enableSharepointSync = false;
config.enablePowerAutomate = false;
const app = require('../server/src/index');
const db = require('../server/src/config/db');
const jwt = require('../server/node_modules/jsonwebtoken');
const ExcelJS = require('../server/node_modules/exceljs');
const { getISOWeekNumber } = require('../server/src/utils/dateUtils');
const { parseReportQuery, analysis } = require('../server/src/services/reporting');
let server, base, north, south, billable, internal, retired, task, support, location, otherLocation;
const people = {};
const spec = (extra) =>
  parseReportQuery({ start_date: '2020-12-28', end_date: '2021-01-10', ...extra });
const actor = (key) => db.prepare('SELECT * FROM users WHERE id = ?').get(people[key]);
const current = (extra) => analysis(actor('manager'), spec(extra), '2021-01-06');

async function get(key, path) {
  const response = await fetch(`${base}/reports${path}`, {
    headers: { Authorization: `Bearer ${jwt.sign({ userId: people[key] }, config.jwtSecret)}` },
  });
  const bytes = Buffer.from(await response.arrayBuffer());
  return {
    status: response.status,
    headers: response.headers,
    body: response.headers.get('content-type').includes('json') ? JSON.parse(bytes) : bytes,
  };
}
before(async () => {
  const division = (name) =>
    Number(db.prepare('INSERT INTO divisions(name) VALUES (?)').run(name).lastInsertRowid);
  north = division('North & Engineering');
  south = division('Private South');
  for (const [name, role, division, active] of [
    ['system', 'system admin', null, 1],
    ['manager', 'manager', north, 1],
    ['admin', 'admin', north, 1],
    ['emptyManager', 'manager', null, 1],
    ['employee', 'employee', north, 1],
    ['missing', 'employee', north, 1],
    ['inactive', 'employee', north, 0],
    ['outsider', 'employee', south, 1],
  ]) {
    people[name] = Number(
      db
        .prepare(
          'INSERT INTO users(name,email,password_hash,role,division_id,division,active) VALUES (?,?,?,?,?,?,?)'
        )
        .run(name, `${name}@reports.test`, 'unused', role, division, 'stale text', active)
        .lastInsertRowid
    );
  }
  for (const name of ['employee', 'missing', 'outsider'])
    db.prepare(
      'INSERT INTO user_admin_assignments(user_id,admin_id,assigned_by) VALUES (?,?,?)'
    ).run(people[name], people.system, people.system);
  location = Number(
    db.prepare("INSERT INTO subdivisions(name,division_id) VALUES ('North Lab',?)").run(north)
      .lastInsertRowid
  );
  otherLocation = Number(
    db.prepare("INSERT INTO subdivisions(name,division_id) VALUES ('Private Lab',?)").run(south)
      .lastInsertRowid
  );
  const project = (code, division, billingType, active = 1) =>
    Number(
      db
        .prepare(
          'INSERT INTO projects(project_code,project_name,customer_name,division_id,division,billing_type,active) VALUES (?,?,?,?,?,?,?)'
        )
        .run(
          code,
          code + ' name',
          division === north ? 'ACME & Sons' : 'Private Customer',
          division,
          'stale project division',
          billingType,
          active
        ).lastInsertRowid
    );
  billable = project('NORTH-BILL', north, 'Billable');
  internal = project('NORTH-INT', north, 'Non-Billable');
  retired = project('RETIRED', north, null, 0);
  const privateProject = project('PRIVATE-PROJECT', south, 'Billable');
  task = Number(
    db
      .prepare("INSERT INTO tasks(task_category,classification) VALUES ('Engineering','Billable')")
      .run().lastInsertRowid
  );
  support = Number(
    db
      .prepare("INSERT INTO tasks(task_category,classification) VALUES ('Training','Non-Billable')")
      .run().lastInsertRowid
  );
  const entry = (person, project, taskId, date, hours, status, loc = location) => {
    const week = getISOWeekNumber(date);
    db.prepare(
      'INSERT INTO timesheets(user_id,project_id,task_id,subdivision_id,work_date,hours,status,week_number,week_year,project_description,description,details_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)'
    ).run(
      people[person],
      project,
      taskId,
      loc,
      date,
      hours,
      status,
      week.week,
      week.year,
      'Project description',
      'Daily note',
      '{"designed":2}'
    );
  };
  entry('employee', billable, task, '2020-12-28', 8, 'approved');
  entry('employee', internal, support, '2020-12-29', 4, 'submitted');
  entry('employee', retired, null, '2020-12-30', 4, 'draft');
  entry('employee', billable, task, '2020-12-31', 12, 'approved');
  entry('employee', billable, task, '2021-01-04', 4, 'submitted');
  entry('employee', billable, task, '2021-01-05', 4, 'rejected');
  entry('employee', internal, support, '2021-01-05', 4, 'recalled');
  entry('employee', billable, task, '2021-01-08', 8, 'draft'); // Must not enter Jan 6 capacity.
  entry('inactive', retired, null, '2020-12-28', 3, 'approved');
  entry('employee', null, null, '2020-12-30', 1, 'approved');
  entry('employee', billable, task, '2020-12-14', 8, 'approved'); // Previous equal-length period.
  entry('inactive', privateProject, task, '2020-12-28', 7, 'approved', otherLocation); // Foreign project cannot leak.
  entry('outsider', billable, task, '2020-12-28', 11, 'approved', otherLocation); // Foreign contributor cannot leak.
  entry('outsider', null, null, '2020-12-28', 13, 'draft', otherLocation);
  db.prepare(
    "INSERT INTO holidays(date,name) VALUES ('2021-01-01','New Year'), ('2021-01-02','Weekend holiday')"
  ).run();
  db.prepare("INSERT INTO planned_vacations(user_id,vacation_date) VALUES (?,'2021-01-06')").run(
    people.employee
  );
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(() => {
  server?.close();
  db.close();
});

test('custom ranges include both endpoints and correctly separate ISO years and mixed statuses', () => {
  const report = current();
  assert.equal(report.summary.total_hours, 52);
  assert.equal(report.summary.approved_hours, 24);
  assert.equal(report.summary.pending_hours, 8);
  assert.deepEqual(
    report.weekly.weeks.map((w) => w.key),
    ['2020-W53', '2021-W01']
  );
  const week = report.weekly.rows.find((u) => u.user_id === people.employee).weeks['2020-W53'];
  assert.equal(week.total_hours, 29);
  assert.deepEqual(week.status_hours, {
    draft: 4,
    submitted: 4,
    approved: 21,
    rejected: 0,
    recalled: 0,
  });
  assert.equal(
    current({ start_date: '2020-12-29', end_date: '2020-12-30' }).summary.total_hours,
    9
  );
});
test('billing categories reconcile without inventing classifications for historical hours', () => {
  const totals = current().summary;
  assert.equal(totals.billable_hours, 36);
  assert.equal(totals.non_billable_hours, 8);
  assert.equal(totals.unclassified_hours, 8);
  assert.equal(
    totals.total_hours,
    totals.billable_hours + totals.non_billable_hours + totals.unclassified_hours
  );
  assert.equal(current({ billing_type: 'Unclassified' }).summary.total_hours, 8);
});
test('capacity stops today, excludes weekend holidays and inactive users, and planned vacation does not remove a target', () => {
  const report = current();
  assert.equal(report.capacity.working_days, 7);
  assert.equal(report.capacity.expected_hours_per_person, 56);
  assert.equal(report.summary.expected_hours, 56 * 4);
  const user = report.utilization.find((u) => u.id === people.employee);
  assert.equal(user.total_hours, 41);
  assert.equal(user.expected_hours, 56);
  assert.equal(user.utilization_pct, 73.2);
  assert.equal(user.billable_utilization_pct, 50);
  assert.equal(report.summary.no_entries, 3);
  assert(!report.utilization.some((u) => u.id === people.inactive));
  assert(report.weekly.rows.some((u) => u.user_id === people.inactive));
});
test('missing hours use daily shortfalls and flag unsubmitted completed weeks', () => {
  const missing = current().missing.find((u) => u.user_id === people.employee);
  assert.equal(missing.missing_hours, 19); // Overtime on Thursday does not erase daily gaps.
  assert.deepEqual(missing.missing_dates, ['2021-01-06']);
  assert.deepEqual(missing.short_dates, ['2020-12-29', '2020-12-30', '2021-01-04']);
  assert.equal(missing.unsubmitted_hours, 12);
  assert.deepEqual(missing.awaiting_submission_weeks, ['2020-W53']);
  const absent = current().missing.find((u) => u.user_id === people.missing);
  assert.equal(absent.missing_hours, 56);
  assert.deepEqual(absent.awaiting_submission_weeks, ['2020-W53']);
  assert.deepEqual(
    current({ start_date: '2020-12-29', end_date: '2020-12-30' }).missing.find(
      (u) => u.user_id === people.employee
    ).awaiting_submission_weeks,
    []
  );
});
test('future periods have no elapsed target, gap or false utilization percentage', () => {
  const report = analysis(
    actor('manager'),
    spec({ start_date: '2021-02-01', end_date: '2021-02-28' }),
    '2021-01-06'
  );
  assert.equal(report.period.expected_through, null);
  assert.equal(report.summary.expected_hours, 0);
  assert.equal(report.summary.coverage_pct, null);
  assert.equal(report.summary.no_entries, 0);
  assert.equal(report.missing.length, 0);
});
test('fractional-hour sums do not create a microscopic false daily shortfall', () => {
  const tasks = [];
  try {
    for (let i = 0; i < 10; i++) {
      const id = Number(
        db
          .prepare("INSERT INTO tasks(task_category,classification) VALUES (?,'Billable')")
          .run(`Fractional task ${i}`).lastInsertRowid
      );
      tasks.push(id);
      db.prepare(
        "INSERT INTO timesheets(user_id,project_id,task_id,work_date,hours,status,week_number,week_year) VALUES (?,?,?,'2021-01-06',0.8,'approved',1,2021)"
      ).run(people.employee, billable, id);
    }
    const report = current({
      start_date: '2021-01-06',
      end_date: '2021-01-06',
      user_id: String(people.employee),
    });
    assert.equal(report.summary.coverage_pct, 100);
    assert.deepEqual(report.missing, []);
  } finally {
    for (const id of tasks) {
      db.prepare('DELETE FROM timesheets WHERE task_id = ?').run(id);
      db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
    }
  }
});
test('all activity filters apply and capacity is explicitly unavailable for partial selections', () => {
  for (const extra of [
    { project_id: String(internal) },
    { customer: 'ACME & Sons' },
    { task_id: String(support) },
    { location_id: String(location) },
    { status: 'submitted' },
    { billing_type: 'Billable' },
  ]) {
    const report = current(extra);
    assert.equal(report.capacity.available, false);
    assert.equal(report.summary.expected_hours, null);
    assert.equal(report.summary.coverage_pct, null);
    assert.equal(report.missing.length, 0);
  }
  assert.equal(
    current({ division_id: String(north), user_id: String(people.employee) }).summary.total_hours,
    49
  );
  assert.equal(
    current({ division: 'North & Engineering', user_id: String(people.employee) }).summary
      .total_hours,
    49
  );
  assert.equal(
    current({
      project_id: String(internal),
      task_id: String(support),
      location_id: String(location),
      status: 'submitted',
    }).summary.total_hours,
    4
  );
});
test('projects reconcile including inactive projects and projectless historical records', () => {
  const report = current();
  assert(report.projects.some((p) => p.project_id === retired));
  assert.equal(report.projects.find((p) => p.project_id === null).total_hours, 1);
  assert.equal(
    report.projects.reduce((s, p) => s + p.total_hours, 0),
    report.summary.total_hours
  );
  assert.equal(current({ projectless: '1' }).summary.total_hours, 1);
});
test('capacity cannot invent shortfalls when an active employee books outside the report project scope', () => {
  const privateProject = db
    .prepare("SELECT id FROM projects WHERE project_code = 'PRIVATE-PROJECT'")
    .get().id;
  const result = db
    .prepare(
      "INSERT INTO timesheets(user_id,project_id,work_date,hours,status,week_number,week_year) VALUES (?,?,'2021-01-06',8,'approved',1,2021)"
    )
    .run(people.employee, privateProject);
  try {
    const report = current();
    assert.equal(report.capacity.available, false);
    assert(report.capacity.reason.includes('outside your report scope'));
    assert.equal(report.summary.coverage_pct, null);
    assert.deepEqual(report.missing, []);
    assert(!JSON.stringify(report).includes('PRIVATE-PROJECT'));
  } finally {
    db.prepare('DELETE FROM timesheets WHERE id = ?').run(result.lastInsertRowid);
  }
});
test('an incomplete previous capacity record does not suppress complete current capacity', () => {
  const privateProject = db
    .prepare("SELECT id FROM projects WHERE project_code = 'PRIVATE-PROJECT'")
    .get().id;
  const result = db
    .prepare(
      "INSERT INTO timesheets(user_id,project_id,work_date,hours,status,week_number,week_year) VALUES (?,?,'2020-12-21',8,'approved',52,2020)"
    )
    .run(people.employee, privateProject);
  try {
    const report = current();
    assert.equal(report.capacity.available, true);
    assert.equal(report.summary.expected_hours, 224);
    assert(report.missing.length > 0);
    assert.equal(report.comparison.summary.coverage_pct, null);
    assert(report.comparison.note.includes('Previous capacity is unavailable'));
  } finally {
    db.prepare('DELETE FROM timesheets WHERE id = ?').run(result.lastInsertRowid);
  }
});
test('trends include empty buckets and compare the previous equal-length period', () => {
  const report = current();
  assert.deepEqual(report.comparison.period, { start_date: '2020-12-14', end_date: '2020-12-27' });
  assert.equal(report.comparison.summary.total_hours, 8);
  assert.equal(report.comparison.hours_change_pct, 550);
  assert.equal(
    report.trends.reduce((s, t) => s + t.total_hours, 0),
    52
  );
  assert.deepEqual(
    current({ grain: 'month' }).trends.map((t) => [t.key, t.total_hours]),
    [
      ['2020-12', 32],
      ['2021-01', 20],
    ]
  );
  assert.deepEqual(
    current({ start_date: '2021-03-01', end_date: '2021-03-31' }).comparison.period,
    { start_date: '2021-02-01', end_date: '2021-02-28' }
  );
  assert.deepEqual(
    current({ start_date: '2021-01-01', end_date: '2021-03-31' }).comparison.period,
    { start_date: '2020-10-01', end_date: '2020-12-31' }
  );
});
test('invalid dates, ranges, IDs, formats and filters fail with useful 400 responses', async () => {
  for (const query of [
    'start_date=2021-02-30&end_date=2021-03-01',
    'start_date=2021-02-01',
    'start_date=2021-03-01&end_date=2021-02-01',
    'start_date=2020-01-01&end_date=2021-01-01',
    'month=13&year=2021',
    'week=53&year=2021',
    'month=1&year=2021&user_id=1.5',
    'month=1&year=2021&status=unknown',
    'month=1&year=2021&grain=day',
    'month=1&year=2021&view=unknown',
    'month=1&year=2021&billing_type=anything',
    'start_date=9999-01-01&end_date=9999-12-31',
  ])
    assert.equal((await get('manager', '/analysis?' + query)).status, 400, query);
  assert.equal((await get('manager', '/entries?month=1&year=2021&page=0')).status, 400);
  assert.equal((await get('manager', '/entries?month=1&year=2021&page_size=101')).status, 400);
  assert.equal((await get('manager', '/export?month=1&year=2021&format=csv')).status, 400);
  assert.equal(parseReportQuery({ month: '2', year: '2020' }).end, '2020-02-29');
});
test('new endpoints and downloads fail closed across employee and project division scopes', async () => {
  for (const endpoint of ['/analysis', '/entries', '/export']) {
    const route = `${endpoint}?start_date=2020-12-28&end_date=2021-01-10`;
    for (const key of ['manager', 'admin', 'emptyManager']) {
      const result = await get(key, route);
      assert.equal(result.status, 200);
      assert(!JSON.stringify(result.body).includes('outsider'));
      assert(!JSON.stringify(result.body).includes('PRIVATE-PROJECT'));
      if (key === 'emptyManager')
        assert.equal(
          endpoint === '/analysis' ? result.body.summary.total_hours : result.body.total,
          0
        );
      assert.equal(result.headers.get('cache-control'), 'private, no-store');
    }
    assert.equal((await get('employee', route)).status, 403);
    const foreign = (await get('manager', route + `&user_id=${people.outsider}`)).body;
    assert.equal(endpoint === '/analysis' ? foreign.summary.total_hours : foreign.total, 0);
  }
  assert(
    (await get('system', '/analysis?start_date=2020-12-28&end_date=2021-01-10')).body.projects.some(
      (p) => p.project_code === 'PRIVATE-PROJECT'
    )
  );
});
test('filter options include active state, normalized divisions and historical options without leaking foreign catalogs', async () => {
  const options = (await get('manager', '/options')).body;
  assert.equal(options.users.find((u) => u.id === people.employee).active, 1);
  assert.equal(options.users.find((u) => u.id === people.employee).division, 'North & Engineering');
  assert.equal(options.users.find((u) => u.id === people.inactive).active, 0);
  assert(options.projects.some((p) => p.id === retired));
  assert.deepEqual(options.customers, ['ACME & Sons']);
  assert(!JSON.stringify(options).includes('Private'));
});
test('drilldown pagination, descriptions and filters match the selected totals', async () => {
  const query = `start_date=2020-12-28&end_date=2021-01-10&user_id=${people.employee}`;
  const page1 = (await get('manager', '/entries?' + query + '&page_size=3')).body;
  const page2 = (await get('manager', '/entries?' + query + '&page_size=3&page=2')).body;
  assert.equal(page1.total, 9);
  assert.equal(page1.data.length, 3);
  assert.equal(page2.data.length, 3);
  assert(!page1.data.some((a) => page2.data.some((b) => a.id === b.id)));
  assert.equal(page1.data[0].project_description, 'Project description');
  const filtered = (
    await get('manager', '/entries?' + query + `&project_id=${internal}&status=submitted`)
  ).body;
  assert.equal(filtered.total, 1);
  assert.equal(filtered.data[0].hours, 4);
});
test('each Excel download contains its actual view, matching totals, filters, entries and deduplicated weekly details', async () => {
  for (const [view, title] of [
    ['weekly', 'Weekly Summary'],
    ['utilization', 'Utilization'],
    ['projects', 'Project Hours'],
    ['missing', 'Missing Hours'],
    ['trends', 'Trends'],
  ]) {
    const result = await get(
      'manager',
      `/export?view=${view}&start_date=2020-12-28&end_date=2021-01-10&user_id=${people.employee}&format=excel`
    );
    assert.equal(result.status, 200);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(result.body);
    assert(book.getWorksheet(title));
    const info = book.getWorksheet('Report Info').getSheetValues();
    assert(info.some((row) => row?.[1] === 'Total hours' && row[2] === 49));
    assert(info.some((row) => row?.[1] === 'Filters' && row[2].includes('Employee: employee')));
    assert.equal(book.getWorksheet('Timesheet Entries').rowCount, 10);
    assert(book.getWorksheet('Weekly Details').rowCount < 10);
    assert(
      !JSON.stringify(book.worksheets.map((s) => s.getSheetValues())).includes('PRIVATE-PROJECT')
    );
  }
});
test('PDF downloads render every view and use the requested period and filename', async () => {
  for (const view of ['weekly', 'utilization', 'projects', 'missing', 'trends', 'details']) {
    const result = await get(
      'manager',
      `/export?view=${view}&start_date=2020-12-28&end_date=2021-01-10&user_id=${people.employee}&format=pdf`
    );
    assert.equal(result.status, 200, view);
    assert.equal(result.body.subarray(0, 4).toString(), '%PDF');
    if (view === 'weekly')
      assert.match(
        result.body.toString('latin1'),
        /\/Count 1\s/,
        'A footer must not add an extra PDF page'
      );
    assert(
      result.headers.get('content-disposition').includes(`${view}_2020-12-28_to_2021-01-10.pdf`)
    );
  }
});
test('client presets and date formatting preserve local days across month and year boundaries', async () => {
  const helpers = await import('../client/src/utils/reportDates.js');
  assert.deepEqual(helpers.presetDates('this-week', new Date(2021, 0, 1)), {
    start_date: '2020-12-28',
    end_date: '2021-01-03',
  });
  assert.deepEqual(helpers.presetDates('last-3-months', new Date(2021, 0, 10)), {
    start_date: '2020-10-01',
    end_date: '2020-12-31',
  });
  assert(helpers.displayDate('2021-01-01').includes('Jan 1, 2021'));
  assert.equal(helpers.rangeError('2021-02-30', '2021-03-01'), 'Choose valid start and end dates.');
  assert.equal(
    helpers.rangeError('2021-03-01', '2021-02-01'),
    'Choose a date range of 1–366 days.'
  );
});
