// Additive migration: preserve division IDs and every historical foreign key.
module.exports = function platformMigration(db) {
  db.transaction(() => {
    db.exec(`CREATE TABLE IF NOT EXISTS platforms (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL COLLATE NOCASE UNIQUE,
      active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );`);
    if (!db.prepare('PRAGMA table_info(divisions)').all().some(c => c.name === 'platform_id')) {
      db.prepare('INSERT OR IGNORE INTO platforms(name) VALUES (?)').run('Legacy / Unmapped');
      const legacy = db.prepare('SELECT id FROM platforms WHERE name = ?').get('Legacy / Unmapped').id;
      // SQLite cannot add a non-null REFERENCES column with a non-null default when
      // FK checks are enabled. Triggers enforce the reference without rebuilding IDs.
      db.exec(`ALTER TABLE divisions ADD COLUMN platform_id INTEGER NOT NULL DEFAULT ${legacy};`);
    }
    db.exec(`CREATE INDEX IF NOT EXISTS idx_divisions_platform ON divisions(platform_id);
      CREATE TRIGGER IF NOT EXISTS division_platform_insert BEFORE INSERT ON divisions
        WHEN NOT EXISTS(SELECT 1 FROM platforms WHERE id = NEW.platform_id)
        BEGIN SELECT RAISE(ABORT, 'Valid Platform is required'); END;
      CREATE TRIGGER IF NOT EXISTS division_platform_update BEFORE UPDATE OF platform_id ON divisions
        WHEN NOT EXISTS(SELECT 1 FROM platforms WHERE id = NEW.platform_id)
        BEGIN SELECT RAISE(ABORT, 'Valid Platform is required'); END;
      CREATE TRIGGER IF NOT EXISTS platform_delete_restrict BEFORE DELETE ON platforms
        WHEN EXISTS(SELECT 1 FROM divisions WHERE platform_id = OLD.id)
        BEGIN SELECT RAISE(ABORT, 'Platform has divisions'); END;
      CREATE TRIGGER IF NOT EXISTS platform_id_update_restrict BEFORE UPDATE OF id ON platforms
        WHEN NEW.id != OLD.id AND EXISTS(SELECT 1 FROM divisions WHERE platform_id = OLD.id)
        BEGIN SELECT RAISE(ABORT, 'Platform has divisions'); END;
      CREATE TABLE IF NOT EXISTS user_platforms (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        platform_id INTEGER NOT NULL REFERENCES platforms(id), PRIMARY KEY(user_id, platform_id)
      );
      CREATE INDEX IF NOT EXISTS idx_user_platforms_platform ON user_platforms(platform_id);
      CREATE TABLE IF NOT EXISTS project_users (
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        PRIMARY KEY(project_id, user_id)
      );
      CREATE INDEX IF NOT EXISTS idx_project_users_user ON project_users(user_id);`);
    if (!db.prepare('PRAGMA table_info(projects)').all().some(c => c.name === 'user_assignment_mode')) {
      db.exec("ALTER TABLE projects ADD COLUMN user_assignment_mode TEXT NOT NULL DEFAULT 'division' CHECK(user_assignment_mode IN ('division','selected'))");
    }
    if (!db.prepare('PRAGMA table_info(users)').all().some(c => c.name === 'platform_assignments_explicit')) db.exec('ALTER TABLE users ADD COLUMN platform_assignments_explicit INTEGER NOT NULL DEFAULT 0');
    // Run this backfill once. Re-running migrations must not restore revoked grants.
    db.exec('CREATE TABLE IF NOT EXISTS platform_migrations (version INTEGER PRIMARY KEY)');
    if (!db.prepare('SELECT 1 FROM platform_migrations WHERE version = 1').get()) {
      db.exec(`INSERT OR IGNORE INTO user_platforms(user_id, platform_id)
        SELECT u.id, d.platform_id FROM users u JOIN divisions d ON d.id = u.division_id
        UNION SELECT ad.user_id, d.platform_id FROM admin_divisions ad JOIN divisions d ON d.id = ad.division_id
        UNION SELECT ed.user_id, d.platform_id FROM employee_divisions ed JOIN divisions d ON d.id = ed.division_id;
        INSERT INTO platform_migrations(version) VALUES(1);`);
    }
  })();
};
