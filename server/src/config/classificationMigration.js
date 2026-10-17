// Rename stored classifications without changing IDs, assignments or history.
module.exports = function classificationMigration(db) {
  const schema = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='projects'").get().sql;
  const updated = schema.replace(/'Non-Billable'/g, "'Non-Productive'").replace(/'Billable'/g, "'Productive'");
  const foreignKeys = db.pragma('foreign_keys', { simple: true });
  const legacyAlter = db.pragma('legacy_alter_table', { simple: true });
  db.pragma('foreign_keys = OFF');
  db.pragma('legacy_alter_table = ON');
  try {
    db.transaction(() => {
      if (updated !== schema) {
        const objects = db.prepare("SELECT sql FROM sqlite_master WHERE tbl_name='projects' AND type IN ('index','trigger') AND sql IS NOT NULL").all();
        const columns = db.prepare('PRAGMA table_info(projects)').all().map(c => `"${c.name.replaceAll('"', '""')}"`);
        const sequence = db.prepare("SELECT seq FROM sqlite_sequence WHERE name='projects'").get()?.seq || 0;
        db.exec(updated.replace(/^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"projects"|`projects`|\[projects\]|projects)/i, 'CREATE TABLE projects_productivity'));
        const values = columns.map(c => c === '"billing_type"'
          ? "CASE billing_type WHEN 'Billable' THEN 'Productive' WHEN 'Non-Billable' THEN 'Non-Productive' ELSE billing_type END" : c);
        db.exec(`INSERT INTO projects_productivity (${columns}) SELECT ${values} FROM projects`);
        db.exec('DROP TABLE projects; ALTER TABLE projects_productivity RENAME TO projects');
        for (const object of objects) db.exec(object.sql);
        db.prepare("UPDATE sqlite_sequence SET seq=MAX(seq,?) WHERE name='projects'").run(sequence);
      }
      db.exec(`UPDATE tasks SET classification = CASE classification
        WHEN 'Billable' THEN 'Productive' WHEN 'Non-Billable' THEN 'Non-Productive' ELSE classification END
        WHERE classification IN ('Billable','Non-Billable');`);
      if (db.pragma('foreign_key_check').length) throw new Error('Classification migration found invalid references');
    })();
  } finally {
    db.pragma(`legacy_alter_table = ${legacyAlter}`);
    db.pragma(`foreign_keys = ${foreignKeys}`);
  }
};
