// Backfill once: keep the task choices existing projects previously allowed.
module.exports = function taskPlanningMigration(db) {
  db.transaction(() => {
    const columns = db.prepare('PRAGMA table_info(tasks)').all().map(c => c.name);
    for (const [name, type] of Object.entries({ estimated_hours: 'REAL CHECK(estimated_hours >= 0)', input_received_date: 'TEXT', start_date: 'TEXT', target_date: 'TEXT', delivered_date: 'TEXT' })) {
      if (!columns.includes(name)) db.exec(`ALTER TABLE tasks ADD COLUMN ${name} ${type}`);
    }
    if (!db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'project_tasks'").get()) {
      db.exec(`CREATE TABLE project_tasks (
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        task_id INTEGER NOT NULL REFERENCES tasks(id),
        PRIMARY KEY(project_id, task_id)
      );
      CREATE INDEX idx_project_tasks_task ON project_tasks(task_id);
      INSERT INTO project_tasks(project_id, task_id)
        SELECT p.id, t.id FROM projects p JOIN tasks t ON t.classification = p.billing_type WHERE t.active = 1;
      INSERT OR IGNORE INTO project_tasks(project_id, task_id)
        SELECT DISTINCT ts.project_id, ts.task_id FROM timesheets ts
        JOIN projects p ON p.id = ts.project_id JOIN tasks t ON t.id = ts.task_id;`);
    }
  })();
};
