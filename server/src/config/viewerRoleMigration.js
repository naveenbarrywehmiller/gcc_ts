// Rebuild only the role constraint, retaining every existing column and linked user ID.
module.exports = function viewerRoleMigration(db) {
  const schema = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'").get().sql;
  if (schema.includes("'viewer'")) return;
  const updated = schema.replace(/CHECK\s*\(\s*role\s+IN\s*\([^)]+\)\s*\)/i,
    "CHECK(role IN ('admin','manager','employee','system admin','viewer'))");
  if (updated === schema) throw new Error('Unable to locate the users role constraint');
  const create = updated.replace(/^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"users"|`users`|\[users\]|users)/i,
    'CREATE TABLE users_with_viewer');
  const columns = db.prepare('PRAGMA table_info(users)').all().map(column => `"${column.name.replaceAll('"', '""')}"`).join(',');
  const objects = db.prepare("SELECT sql FROM sqlite_master WHERE tbl_name = 'users' AND type IN ('index','trigger') AND sql IS NOT NULL").all();
  const sequence = db.prepare("SELECT seq FROM sqlite_sequence WHERE name = 'users'").get()?.seq || 0;
  const foreignKeys = db.pragma('foreign_keys', { simple: true });
  const legacyAlter = db.pragma('legacy_alter_table', { simple: true });
  db.pragma('foreign_keys = OFF');
  db.pragma('legacy_alter_table = ON');
  try {
    db.transaction(() => {
      db.exec(create);
      db.exec(`INSERT INTO users_with_viewer (${columns}) SELECT ${columns} FROM users`);
      db.exec('DROP TABLE users; ALTER TABLE users_with_viewer RENAME TO users');
      for (const object of objects) db.exec(object.sql);
      db.prepare("UPDATE sqlite_sequence SET seq = MAX(seq, ?) WHERE name = 'users'").run(sequence);
    })();
  } finally {
    db.pragma(`legacy_alter_table = ${legacyAlter}`);
    db.pragma(`foreign_keys = ${foreignKeys}`);
  }
};
