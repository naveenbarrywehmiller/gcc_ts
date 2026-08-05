const db = require('./db');
const fs = require('fs');
const path = require('path');
const { getISOWeekNumber } = require('../utils/dateUtils');

function migrate() {
  console.log('🔄 Running database migrations...');

  const migrationSQL = `
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'employee' CHECK(role IN ('admin','employee')),
      division TEXT,
      core TEXT,
      team_type TEXT,
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS divisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_code TEXT UNIQUE NOT NULL,
      project_name TEXT NOT NULL,
      customer_name TEXT,
      activity TEXT,
      division TEXT,
      team_type TEXT,
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      classification TEXT,
      task_category TEXT NOT NULL,
      task_description TEXT,
      requires_project INTEGER DEFAULT 1,
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS timesheets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      project_id INTEGER,
      task_id INTEGER,
      work_date TEXT NOT NULL,
      hours REAL NOT NULL CHECK(hours >= 0 AND hours <= 24),
      description TEXT,
      week_number INTEGER,
      week_year INTEGER,
      admin_comment TEXT,
      status TEXT DEFAULT 'draft' CHECK(status IN ('draft','submitted','approved','rejected','recalled')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (project_id) REFERENCES projects(id),
      FOREIGN KEY (task_id) REFERENCES tasks(id)
    );

    CREATE TABLE IF NOT EXISTS holidays (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      action TEXT NOT NULL,
      details TEXT,
      entity_type TEXT,
      entity_id INTEGER,
      old_value TEXT,
      new_value TEXT,
      ip_address TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS admin_divisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      division_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (division_id) REFERENCES divisions(id),
      UNIQUE(user_id, division_id)
    );

    -- New tables for enhanced hierarchy --

    CREATE TABLE IF NOT EXISTS subdivisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      division_id INTEGER NOT NULL,
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (division_id) REFERENCES divisions(id)
    );

    CREATE TABLE IF NOT EXISTS departments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS supporting_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS department_ownerships (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      department_id INTEGER NOT NULL,
      label TEXT NOT NULL,
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (department_id) REFERENCES departments(id)
    );

    -- Indexes for performance
    CREATE UNIQUE INDEX IF NOT EXISTS idx_timesheets_user_project_date ON timesheets(user_id, project_id, work_date);
    CREATE INDEX IF NOT EXISTS idx_timesheets_user_date ON timesheets(user_id, work_date);
    CREATE INDEX IF NOT EXISTS idx_timesheets_project ON timesheets(project_id);
    CREATE INDEX IF NOT EXISTS idx_timesheets_status ON timesheets(status);
    CREATE INDEX IF NOT EXISTS idx_timesheets_work_date ON timesheets(work_date);
    CREATE INDEX IF NOT EXISTS idx_timesheets_week ON timesheets(user_id, week_year, week_number);
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
    CREATE INDEX IF NOT EXISTS idx_projects_code ON projects(project_code);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_holidays_date ON holidays(date);
    CREATE INDEX IF NOT EXISTS idx_admin_divisions_user ON admin_divisions(user_id);
    CREATE INDEX IF NOT EXISTS idx_subdivisions_division ON subdivisions(division_id);
    CREATE INDEX IF NOT EXISTS idx_dept_ownerships_department ON department_ownerships(department_id);
  `;

  db.exec(migrationSQL);

  // --- Schema migration for existing databases ---
  // Add columns if they don't exist (safe for existing databases)
  const timesheetColumns = db.prepare("PRAGMA table_info(timesheets)").all().map(c => c.name);

  if (!timesheetColumns.includes('week_number')) {
    console.log('  → Adding week_number column...');
    db.exec('ALTER TABLE timesheets ADD COLUMN week_number INTEGER');
  }
  if (!timesheetColumns.includes('week_year')) {
    console.log('  → Adding week_year column...');
    db.exec('ALTER TABLE timesheets ADD COLUMN week_year INTEGER');
  }
  if (!timesheetColumns.includes('admin_comment')) {
    console.log('  → Adding admin_comment column...');
    db.exec('ALTER TABLE timesheets ADD COLUMN admin_comment TEXT');
  }
  // New timesheet columns for hierarchy
  if (!timesheetColumns.includes('division_id')) {
    console.log('  → Adding timesheets.division_id column...');
    db.exec('ALTER TABLE timesheets ADD COLUMN division_id INTEGER REFERENCES divisions(id)');
  }
  if (!timesheetColumns.includes('subdivision_id')) {
    console.log('  → Adding timesheets.subdivision_id column...');
    db.exec('ALTER TABLE timesheets ADD COLUMN subdivision_id INTEGER REFERENCES subdivisions(id)');
  }
  if (!timesheetColumns.includes('project_description')) {
    console.log('  → Adding timesheets.project_description column...');
    db.exec('ALTER TABLE timesheets ADD COLUMN project_description TEXT');
  }
  if (!timesheetColumns.includes('ownership_id')) {
    console.log('  → Adding timesheets.ownership_id column...');
    db.exec('ALTER TABLE timesheets ADD COLUMN ownership_id INTEGER REFERENCES department_ownerships(id)');
  }

  const auditColumns = db.prepare("PRAGMA table_info(audit_logs)").all().map(c => c.name);
  if (!auditColumns.includes('entity_type')) {
    console.log('  → Adding audit_logs entity columns...');
    db.exec('ALTER TABLE audit_logs ADD COLUMN entity_type TEXT');
    db.exec('ALTER TABLE audit_logs ADD COLUMN entity_id INTEGER');
    db.exec('ALTER TABLE audit_logs ADD COLUMN old_value TEXT');
    db.exec('ALTER TABLE audit_logs ADD COLUMN new_value TEXT');
  }

  // --- User table: add division_id, department_id, supporting_category_id ---
  const userColumns = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
  if (!userColumns.includes('division_id')) {
    console.log('  → Adding users.division_id column...');
    db.exec('ALTER TABLE users ADD COLUMN division_id INTEGER REFERENCES divisions(id)');
  }
  if (!userColumns.includes('department_id')) {
    console.log('  → Adding users.department_id column...');
    db.exec('ALTER TABLE users ADD COLUMN department_id INTEGER REFERENCES departments(id)');
  }
  if (!userColumns.includes('supporting_category_id')) {
    console.log('  → Adding users.supporting_category_id column...');
    db.exec('ALTER TABLE users ADD COLUMN supporting_category_id INTEGER REFERENCES supporting_categories(id)');
  }
  if (!userColumns.includes('last_seen_at')) {
    console.log('  → Adding users.last_seen_at column...');
    db.exec("ALTER TABLE users ADD COLUMN last_seen_at DATETIME");
  }

  // --- Projects table: add division_id, subdivision_id ---
  const projectColumns = db.prepare("PRAGMA table_info(projects)").all().map(c => c.name);
  if (!projectColumns.includes('division_id')) {
    console.log('  → Adding projects.division_id column...');
    db.exec('ALTER TABLE projects ADD COLUMN division_id INTEGER REFERENCES divisions(id)');
  }
  if (!projectColumns.includes('subdivision_id')) {
    console.log('  → Adding projects.subdivision_id column...');
    db.exec('ALTER TABLE projects ADD COLUMN subdivision_id INTEGER REFERENCES subdivisions(id)');
  }

  // --- Data migration: map existing text division values to division_id FKs ---
  // For users
  const usersNeedingDivMigration = db.prepare(
    "SELECT id, division FROM users WHERE division IS NOT NULL AND division != '' AND division_id IS NULL"
  ).all();
  if (usersNeedingDivMigration.length > 0) {
    console.log(`  → Migrating ${usersNeedingDivMigration.length} users to division_id...`);
    const updateUserDiv = db.prepare('UPDATE users SET division_id = ? WHERE id = ?');
    const findDiv = db.prepare('SELECT id FROM divisions WHERE name = ?');
    const migrateUserDivs = db.transaction(() => {
      for (const u of usersNeedingDivMigration) {
        const div = findDiv.get(u.division);
        if (div) updateUserDiv.run(div.id, u.id);
      }
    });
    migrateUserDivs();
  }

  // For projects
  const projectsNeedingDivMigration = db.prepare(
    "SELECT id, division FROM projects WHERE division IS NOT NULL AND division != '' AND division_id IS NULL"
  ).all();
  if (projectsNeedingDivMigration.length > 0) {
    console.log(`  → Migrating ${projectsNeedingDivMigration.length} projects to division_id...`);
    const updateProjDiv = db.prepare('UPDATE projects SET division_id = ? WHERE id = ?');
    const findDiv2 = db.prepare('SELECT id FROM divisions WHERE name = ?');
    const migrateProjDivs = db.transaction(() => {
      for (const p of projectsNeedingDivMigration) {
        const div = findDiv2.get(p.division);
        if (div) updateProjDiv.run(div.id, p.id);
      }
    });
    migrateProjDivs();
  }

  // --- Data migration: map existing team_type text to supporting_category_id ---
  // First ensure supporting_categories exist
  const scCount = db.prepare('SELECT COUNT(*) as count FROM supporting_categories').get();
  if (scCount.count === 0) {
    // Will be seeded later, but if running migration standalone, create defaults
    try {
      db.exec("INSERT OR IGNORE INTO supporting_categories (name) VALUES ('Dedicated Team')");
      db.exec("INSERT OR IGNORE INTO supporting_categories (name) VALUES ('Flex Team')");
    } catch (e) { /* ignore if already exists */ }
  }

  const usersNeedingSCMigration = db.prepare(
    "SELECT id, team_type FROM users WHERE team_type IS NOT NULL AND team_type != '' AND supporting_category_id IS NULL"
  ).all();
  if (usersNeedingSCMigration.length > 0) {
    console.log(`  → Migrating ${usersNeedingSCMigration.length} users to supporting_category_id...`);
    const updateUserSC = db.prepare('UPDATE users SET supporting_category_id = ? WHERE id = ?');
    const findSC = db.prepare("SELECT id FROM supporting_categories WHERE name LIKE '%' || ? || '%'");
    const migrateUserSCs = db.transaction(() => {
      for (const u of usersNeedingSCMigration) {
        // Map "Dedicated" → "Dedicated Team", "Flex" → "Flex Team"
        const sc = findSC.get(u.team_type);
        if (sc) updateUserSC.run(sc.id, u.id);
      }
    });
    migrateUserSCs();
  }

  // --- Data migration: compute week numbers for existing entries ---
  const needsWeekMigration = db.prepare(
    'SELECT COUNT(*) as count FROM timesheets WHERE week_number IS NULL AND work_date IS NOT NULL'
  ).get();

  if (needsWeekMigration.count > 0) {
    console.log(`  → Migrating ${needsWeekMigration.count} entries to compute week numbers...`);
    const entries = db.prepare('SELECT id, work_date FROM timesheets WHERE week_number IS NULL').all();
    const updateStmt = db.prepare('UPDATE timesheets SET week_number = ?, week_year = ? WHERE id = ?');

    const migrateWeeks = db.transaction(() => {
      for (const entry of entries) {
        const { week, year } = getISOWeekNumber(entry.work_date);
        updateStmt.run(week, year, entry.id);
      }
    });
    migrateWeeks();
    console.log('  → Week number migration complete.');
  }

  // --- Data migration: backfill timesheets.division_id from project's division_id ---
  const tsNeedingDivMigration = db.prepare(
    "SELECT t.id, p.division_id FROM timesheets t JOIN projects p ON t.project_id = p.id WHERE t.division_id IS NULL AND p.division_id IS NOT NULL"
  ).all();
  if (tsNeedingDivMigration.length > 0) {
    console.log(`  → Backfilling ${tsNeedingDivMigration.length} timesheets with division_id...`);
    const updateTsDiv = db.prepare('UPDATE timesheets SET division_id = ? WHERE id = ?');
    const migrateTsDivs = db.transaction(() => {
      for (const ts of tsNeedingDivMigration) {
        updateTsDiv.run(ts.division_id, ts.id);
      }
    });
    migrateTsDivs();
  }

  // --- Tasks table: add requires_project column ---
  const taskColumns = db.prepare("PRAGMA table_info(tasks)").all().map(c => c.name);
  if (!taskColumns.includes('requires_project')) {
    console.log('  → Adding tasks.requires_project column...');
    db.exec('ALTER TABLE tasks ADD COLUMN requires_project INTEGER DEFAULT 1');
    // Auto-set known non-project categories
    const nonProjectCategories = ['Leave', 'Meeting', 'Training', 'Admin'];
    const updateTaskRP = db.prepare('UPDATE tasks SET requires_project = 0 WHERE task_category = ?');
    nonProjectCategories.forEach(cat => {
      updateTaskRP.run(cat);
    });
    console.log('  → Set requires_project=0 for Leave, Meeting, Training, Admin tasks.');
  }

  // --- Make timesheets.project_id nullable (table recreation for existing DBs) ---
  const tsColInfo = db.prepare("PRAGMA table_info(timesheets)").all();
  const projectIdCol = tsColInfo.find(c => c.name === 'project_id');
  if (projectIdCol && projectIdCol.notnull === 1) {
    console.log('  → Migrating timesheets table to make project_id nullable...');
    db.exec(`
      CREATE TABLE IF NOT EXISTS timesheets_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        project_id INTEGER,
        task_id INTEGER,
        work_date TEXT NOT NULL,
        hours REAL NOT NULL CHECK(hours >= 0 AND hours <= 24),
        description TEXT,
        week_number INTEGER,
        week_year INTEGER,
        admin_comment TEXT,
        status TEXT DEFAULT 'draft' CHECK(status IN ('draft','submitted','approved','rejected','recalled')),
        division_id INTEGER,
        subdivision_id INTEGER,
        project_description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (project_id) REFERENCES projects(id),
        FOREIGN KEY (task_id) REFERENCES tasks(id)
      );

      INSERT INTO timesheets_new (id, user_id, project_id, task_id, work_date, hours, description,
        week_number, week_year, admin_comment, status, division_id, subdivision_id, project_description,
        created_at, updated_at)
      SELECT id, user_id, project_id, task_id, work_date, hours, description,
        week_number, week_year, admin_comment, status, division_id, subdivision_id, project_description,
        created_at, updated_at
      FROM timesheets;

      DROP TABLE timesheets;
      ALTER TABLE timesheets_new RENAME TO timesheets;

      -- Recreate all indexes
      CREATE UNIQUE INDEX IF NOT EXISTS idx_timesheets_user_project_date ON timesheets(user_id, project_id, work_date);
      CREATE INDEX IF NOT EXISTS idx_timesheets_user_date ON timesheets(user_id, work_date);
      CREATE INDEX IF NOT EXISTS idx_timesheets_project ON timesheets(project_id);
      CREATE INDEX IF NOT EXISTS idx_timesheets_status ON timesheets(status);
      CREATE INDEX IF NOT EXISTS idx_timesheets_work_date ON timesheets(work_date);
      CREATE INDEX IF NOT EXISTS idx_timesheets_week ON timesheets(user_id, week_year, week_number);
    `);
    console.log('  → Timesheets table migrated (project_id now nullable).');
  }

  // --- Add unique index for non-project timesheet entries ---
  try {
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_timesheets_user_task_date ON timesheets(user_id, task_id, work_date) WHERE project_id IS NULL');
  } catch (e) {
    // Index may already exist or partial indexes not supported in older SQLite builds
    console.log('  → Note: partial index for non-project entries skipped (may already exist).');
  }

  console.log('✅ Database migrations complete.');
}

// Run if called directly
if (require.main === module) {
  migrate();
  process.exit(0);
}

module.exports = { migrate, getISOWeekNumber };
