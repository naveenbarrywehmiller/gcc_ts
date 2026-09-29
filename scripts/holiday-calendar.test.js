const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { parseHolidays, exportHolidays } = require('../server/src/utils/holidayCalendar');
const calendar = events => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${events}\r\nEND:VCALENDAR\r\n`;
const event = (properties, uid = 'test') => `BEGIN:VEVENT\r\nUID:${uid}\r\n${properties}\r\nEND:VEVENT`;

test('calendar round trip preserves escaped, Unicode and folded names and all-day dates', () => {
  const holidays = [{ date: '2026-12-31', name: 'Holiday, semi; slash\\ newline\n' + 'Celebration é '.repeat(15).trim() }];
  const output = exportHolidays(holidays);
  assert.match(output, /DTEND;VALUE=DATE:20270101/);
  assert.deepEqual(parseHolidays(output, 2026).holidays, holidays);
});

test('recurring holidays respect exceptions and multi-day events clip to selected year', () => {
  const source = calendar([
    event('DTSTART;VALUE=DATE:20200101\r\nRRULE:FREQ=YEARLY\r\nSUMMARY:New Year'),
    event('DTSTART;VALUE=DATE:20261220\r\nRRULE:FREQ=DAILY;COUNT=3\r\nEXDATE;VALUE=DATE:20261221\r\nSUMMARY:Break', 'daily'),
    event('DTSTART;VALUE=DATE:20251231\r\nDTEND;VALUE=DATE:20260103\r\nSUMMARY:Long holiday', 'multi'),
    event('DTSTART:20260201T090000Z\r\nSUMMARY:Meeting', 'timed'),
  ].join('\r\n'));
  const result = parseHolidays(source, 2026);
  assert.deepEqual(result.holidays.map(h => h.date), ['2026-01-01', '2026-12-20', '2026-12-22', '2026-01-01', '2026-01-02']);
  assert.equal(result.skipped, 1);
});

test('recurrence overrides use their replacement date and name', () => {
  const source = calendar([
    event('DTSTART;VALUE=DATE:20250101\r\nRRULE:FREQ=YEARLY\r\nSUMMARY:Original'),
    event('RECURRENCE-ID;VALUE=DATE:20260101\r\nDTSTART;VALUE=DATE:20260102\r\nSUMMARY:Observed'),
  ].join('\r\n'));
  assert.deepEqual(parseHolidays(source, 2026).holidays, [{ date: '2026-01-02', name: 'Observed' }]);
});

test('impossible dates and incomplete calendars are rejected', () => {
  assert.throws(() => parseHolidays(calendar(event('DTSTART;VALUE=DATE:20260231\r\nSUMMARY:Invalid')), 2026), /Invalid holiday date/);
  assert.throws(() => parseHolidays(calendar(event('DTSTART;VALUE=DATE:20260201\r\nSUMMARY:Invalid')).replace('END:VCALENDAR', ''), 2026), /complete/);
});

process.env.BOOTSTRAP_ADMIN_EMAIL = '';
process.env.BOOTSTRAP_ADMIN_PASSWORD = '';
const config = require('../server/src/config/env'); config.dbPath = ':memory:';
const db = require('../server/src/config/db');
require('../server/src/config/migrate').migrate();
const express = require('../server/node_modules/express');
const jwt = require('../server/node_modules/jsonwebtoken');
const app = express();
app.use('/holidays', require('../server/src/routes/holidays'));
app.use('/projects', require('../server/src/routes/projects'));
let server, base, admin, employee;
before(async () => {
  const insert = db.prepare('INSERT INTO users(name,email,password_hash,role) VALUES (?,?,?,?)');
  admin = Number(insert.run('Admin', 'admin@test.invalid', 'unused', 'admin').lastInsertRowid);
  employee = Number(insert.run('Employee', 'employee@test.invalid', 'unused', 'employee').lastInsertRowid);
  server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server?.close(); db.close(); });
const headers = id => ({ Authorization: `Bearer ${jwt.sign({ userId: id }, config.jwtSecret)}` });
function upload(source, id = admin, year = 2026, filename = 'holidays.ics') {
  const body = new FormData(); body.append('year', year); body.append('file', new Blob([source]), filename);
  return fetch(base + '/holidays/import', { method: 'POST', headers: headers(id), body });
}

test('holiday endpoints preserve duplicates, export the selected year and reject invalid imports atomically', async () => {
  const source = exportHolidays([{ date: '2026-07-04', name: 'Holiday' }, { date: '2027-07-04', name: 'Next Year' }]);
  let response = await upload(source);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { imported: 1, duplicates: 0, skipped: 0 });
  response = await upload(source.replace('SUMMARY:Holiday', 'SUMMARY:Changed'));
  assert.deepEqual(await response.json(), { imported: 0, duplicates: 1, skipped: 0 });
  response = await fetch(base + '/holidays/export?year=2026', { headers: headers(admin) });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/calendar/);
  assert.match(response.headers.get('content-disposition'), /holidays-2026\.ics/);
  assert.deepEqual(parseHolidays(await response.text(), 2026).holidays, [{ date: '2026-07-04', name: 'Holiday' }]);
  for (const invalid of ['not a calendar', calendar(event('DTSTART;VALUE=DATE:20260801\r\nSUMMARY:Valid') + '\r\n' + event('SUMMARY:Missing date', 'invalid'))]) {
    assert.equal((await upload(invalid)).status, 400);
  }
  assert.equal(db.prepare('SELECT COUNT(*) n FROM holidays').get().n, 1);
  assert.equal((await upload(source, admin, 'bad')).status, 400);
  assert.equal((await upload(source, admin, 2026, 'file.txt')).status, 400);
  assert.equal((await upload(source, employee)).status, 403);
  assert.equal((await fetch(base + '/holidays/export?year=2026', { headers: headers(employee) })).status, 403);
  assert.equal((await fetch(base + '/holidays/export?year=bad', { headers: headers(admin) })).status, 400);
});

test('project dropdown options use active sidebar master data', async () => {
  db.exec("INSERT INTO activities(name,active) VALUES ('Design',1),('Retired Work',0)");
  db.exec("INSERT INTO supporting_categories(name,active) VALUES ('Custom Team',1),('Retired Team',0)");
  const response = await fetch(base + '/projects/options', { headers: headers(admin) });
  assert.equal(response.status, 200);
  const options = await response.json();
  assert(options.activities.some(item => item.name === 'Design'));
  assert(options.supporting_categories.some(item => item.name === 'Custom Team'));
  assert(!options.activities.some(item => item.name === 'Retired Work'));
  assert(!options.supporting_categories.some(item => item.name === 'Retired Team'));
});
