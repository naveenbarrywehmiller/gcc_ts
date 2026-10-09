module.exports = function workbookMigration(db) {
  db.transaction(() => {
    const projectCols = db.prepare('PRAGMA table_info(projects)').all().map(c => c.name);
    const fields = {
      gcc_project_code: 'TEXT', priority: 'TEXT', product: 'TEXT', product_module: 'TEXT',
      requested_by: 'TEXT', responsibility: 'TEXT', input_received_date: 'TEXT',
      start_date: 'TEXT', target_date: 'TEXT', delivered_date: 'TEXT', budget_hours: 'REAL',
      project_status: "TEXT NOT NULL DEFAULT 'Inprogress'", team_type: 'TEXT',
    };
    for (const [key, type] of Object.entries(fields)) {
      if (!projectCols.includes(key)) db.exec(`ALTER TABLE projects ADD COLUMN ${key} ${type}`);
    }
    if (!db.prepare('PRAGMA table_info(timesheets)').all().some(c => c.name === 'details_json')) {
      db.exec("ALTER TABLE timesheets ADD COLUMN details_json TEXT NOT NULL DEFAULT '{}'");
    }
    db.exec(`CREATE TABLE IF NOT EXISTS division_updates (
      id INTEGER PRIMARY KEY, division_id INTEGER NOT NULL REFERENCES divisions(id),
      month TEXT NOT NULL, travel_visa TEXT, open_positions TEXT, new_joiners TEXT,
      updated_by INTEGER REFERENCES users(id), updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(division_id, month)
    );
    CREATE INDEX IF NOT EXISTS idx_projects_division_status ON projects(division_id, project_status);
    CREATE INDEX IF NOT EXISTS idx_projects_normalized_code ON projects(LOWER(TRIM(project_code)));
    CREATE TRIGGER IF NOT EXISTS projects_code_insert BEFORE INSERT ON projects
    WHEN EXISTS (SELECT 1 FROM projects WHERE LOWER(TRIM(project_code)) = LOWER(TRIM(NEW.project_code)))
    BEGIN SELECT RAISE(ABORT, 'Project code already exists'); END;
    CREATE TRIGGER IF NOT EXISTS projects_code_update BEFORE UPDATE OF project_code ON projects
    WHEN NEW.project_code != OLD.project_code AND EXISTS (SELECT 1 FROM projects WHERE id != NEW.id AND LOWER(TRIM(project_code)) = LOWER(TRIM(NEW.project_code)))
    BEGIN SELECT RAISE(ABORT, 'Project code already exists'); END;`);
    const staffingType = db.prepare('PRAGMA table_info(division_updates)').all().find(c => c.name === 'open_positions')?.type;
    if (staffingType !== 'TEXT') {
      db.exec(`CREATE TABLE division_updates_text (
        id INTEGER PRIMARY KEY, division_id INTEGER NOT NULL REFERENCES divisions(id),
        month TEXT NOT NULL, travel_visa TEXT, open_positions TEXT, new_joiners TEXT,
        updated_by INTEGER REFERENCES users(id), updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(division_id, month)
      );
      INSERT INTO division_updates_text(id, division_id, month, travel_visa, open_positions, new_joiners, updated_by, updated_at)
        SELECT id, division_id, month, travel_visa, CAST(open_positions AS TEXT), CAST(new_joiners AS TEXT), updated_by, updated_at
        FROM division_updates;
      DROP TABLE division_updates;
      ALTER TABLE division_updates_text RENAME TO division_updates;`);
    }
  })();
};
