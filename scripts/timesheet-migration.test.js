const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
process.env.BOOTSTRAP_ADMIN_EMAIL = '';
process.env.BOOTSTRAP_ADMIN_PASSWORD = '';

const config = require('../server/src/config/env');
config.dbPath = ':memory:';
const db = require('../server/src/config/db');
const { migrate } = require('../server/src/config/migrate');

let divisionId;
let subdivisionId;
let userId;
let projectId;
let taskId;
let ownershipId;

function createLegacyTimesheets({ hours = 7.25, checkHours = true } = {}) {
  db.exec('DROP TABLE IF EXISTS timesheets');
  db.exec(`
    CREATE TABLE timesheets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      project_id INTEGER NOT NULL,
      task_id INTEGER,
      work_date TEXT NOT NULL,
      hours REAL NOT NULL ${checkHours ? 'CHECK(hours >= 0 AND hours <= 24)' : ''},
      description TEXT,
      week_number INTEGER,
      week_year INTEGER,
      admin_comment TEXT,
      status TEXT DEFAULT 'draft' CHECK(status IN ('draft','submitted','approved','rejected','recalled')),
      division_id INTEGER REFERENCES divisions(id),
      subdivision_id INTEGER REFERENCES subdivisions(id),
      project_description TEXT,
      ownership_id INTEGER REFERENCES department_ownerships(id),
      billable INTEGER DEFAULT 0,
      details_json TEXT NOT NULL DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (project_id) REFERENCES projects(id),
      FOREIGN KEY (task_id) REFERENCES tasks(id)
    );
  `);
  db.prepare(`INSERT INTO timesheets
    (id,user_id,project_id,task_id,work_date,hours,description,week_number,week_year,
     admin_comment,status,division_id,subdivision_id,project_description,ownership_id,
     billable,details_json,created_at,updated_at)
    VALUES (9001,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    userId, projectId, taskId, '2026-10-05', hours, 'legacy description', 41, 2026,
    'legacy admin comment', 'approved', divisionId, subdivisionId, 'legacy project detail',
    ownershipId, 1, '{"custom":"preserve me","entryType":"production"}',
    '2026-10-06 08:15:00', '2026-10-07 09:20:00'
  );
}

before(() => {
  migrate({ bootstrap: false });
  const platformId = Number(db.prepare('INSERT INTO platforms(name) VALUES (?)').run('Migration Test Platform').lastInsertRowid);
  divisionId = Number(db.prepare('INSERT INTO divisions(name,platform_id) VALUES (?,?)').run('Migration Test Division', platformId).lastInsertRowid);
  subdivisionId = Number(db.prepare('INSERT INTO subdivisions(name,division_id) VALUES (?,?)').run('Migration Test Subdivision', divisionId).lastInsertRowid);
  const departmentId = Number(db.prepare('INSERT INTO departments(name) VALUES (?)').run('Migration Test Department').lastInsertRowid);
  ownershipId = Number(db.prepare('INSERT INTO department_ownerships(department_id,label) VALUES (?,?)').run(departmentId, 'Legacy ownership').lastInsertRowid);
  userId = Number(db.prepare(`INSERT INTO users(name,email,password_hash,role,division_id,division)
    VALUES (?,?,?,?,?,?)`).run('Migration Test User', 'migration-test@example.invalid', 'unused', 'employee', divisionId, 'Migration Test Division').lastInsertRowid);
  projectId = Number(db.prepare(`INSERT INTO projects(project_code,project_name,division_id)
    VALUES (?,?,?)`).run('MIGRATION-TEST', 'Migration Test Project', divisionId).lastInsertRowid);
  taskId = Number(db.prepare('INSERT INTO tasks(task_category,classification) VALUES (?,?)').run('Migration Test Task', 'Productive').lastInsertRowid);
});

after(() => db.close());

test('legacy nullable-project rebuild retains all existing timesheet fields and values', () => {
  createLegacyTimesheets();
  migrate({ bootstrap: false });

  const row = db.prepare('SELECT * FROM timesheets WHERE id = 9001').get();
  assert.deepEqual(row, {
    id: 9001,
    user_id: userId,
    project_id: projectId,
    task_id: taskId,
    work_date: '2026-10-05',
    hours: 7.25,
    description: 'legacy description',
    week_number: 41,
    week_year: 2026,
    admin_comment: 'legacy admin comment',
    status: 'approved',
    division_id: divisionId,
    subdivision_id: subdivisionId,
    project_description: 'legacy project detail',
    ownership_id: ownershipId,
    billable: 1,
    details_json: '{"custom":"preserve me","entryType":"production"}',
    created_at: '2026-10-06 08:15:00',
    updated_at: '2026-10-07 09:20:00',
  });
  assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='timesheets_new'").get(), undefined);
  assert.equal(db.prepare('PRAGMA table_info(timesheets)').all().find(column => column.name === 'project_id').notnull, 0);
  assert.deepEqual(db.pragma('foreign_key_check'), []);
});

test('failed legacy rebuild rolls back the replacement table and leaves source data intact', () => {
  createLegacyTimesheets({ hours: 25, checkHours: false });
  assert.throws(() => migrate({ bootstrap: false }), /CHECK constraint failed/);

  const row = db.prepare('SELECT id,hours,project_id,details_json FROM timesheets WHERE id = 9001').get();
  assert.deepEqual(row, {
    id: 9001,
    hours: 25,
    project_id: projectId,
    details_json: '{"custom":"preserve me","entryType":"production"}',
  });
  assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='timesheets_new'").get(), undefined);
  assert.equal(db.prepare('PRAGMA table_info(timesheets)').all().find(column => column.name === 'project_id').notnull, 1);
});
