const { test } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('../server/node_modules/better-sqlite3');
const migrate = require('../server/src/config/viewerRoleMigration');

test('Viewer migration preserves columns, users, links, indexes, triggers, sequences and role constraints', () => {
  const db = new Database(':memory:');
  try {
    db.pragma('foreign_keys = ON');
    db.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
      role TEXT NOT NULL DEFAULT 'employee' CHECK(role IN ('admin','manager','employee','system admin')),
      custom_metadata TEXT, assigned_to INTEGER REFERENCES users(id));
      CREATE TABLE records (id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id));
      CREATE TABLE history (event TEXT);
      CREATE INDEX users_role_idx ON users(role);
      CREATE TRIGGER users_changed AFTER UPDATE ON users BEGIN INSERT INTO history(event) VALUES ('user changed'); END;
      CREATE TRIGGER records_changed AFTER INSERT ON records BEGIN UPDATE users SET custom_metadata = 'linked' WHERE id = NEW.user_id; END;
      INSERT INTO users (id,name,email,role,custom_metadata) VALUES (5,'System','system@test','system admin','system metadata');
      INSERT INTO users (id,name,email,role,custom_metadata,assigned_to) VALUES (12,'Employee','employee@test','employee','employee metadata',5);
      INSERT INTO records VALUES (1,12);
      INSERT INTO users (id,name,email) VALUES (90,'Deleted','deleted@test'); DELETE FROM users WHERE id=90;`);
    const rows = db.prepare('SELECT * FROM users ORDER BY id').all();
    const columns = db.prepare('PRAGMA table_info(users)').all();
    const objects = db.prepare("SELECT name,sql FROM sqlite_master WHERE type IN ('trigger','index') AND sql IS NOT NULL ORDER BY name").all();
    migrate(db);
    assert.deepEqual(db.prepare('SELECT * FROM users ORDER BY id').all(), rows);
    assert.deepEqual(db.prepare('PRAGMA table_info(users)').all(), columns);
    assert.deepEqual(db.prepare("SELECT name,sql FROM sqlite_master WHERE type IN ('trigger','index') AND sql IS NOT NULL ORDER BY name").all(), objects);
    assert.deepEqual(db.pragma('foreign_key_check'), []);
    assert.equal(db.pragma('foreign_keys', { simple: true }), 1);
    assert.equal(db.pragma('legacy_alter_table', { simple: true }), 0);
    const created = db.prepare("INSERT INTO users(name,email,role) VALUES ('Viewer','viewer@test','viewer')").run();
    assert.equal(Number(created.lastInsertRowid), 91);
    db.prepare('INSERT INTO records VALUES (2,?)').run(created.lastInsertRowid);
    assert.equal(db.prepare('SELECT custom_metadata FROM users WHERE id=91').get().custom_metadata, 'linked');
    assert(db.prepare('SELECT event FROM history').all().length >= 2);
    assert.throws(() => db.prepare("INSERT INTO users(name,email,role) VALUES ('Invalid','invalid@test','unknown')").run(), /CHECK constraint failed/);
    assert.throws(() => db.prepare("INSERT INTO users(name,email,role) VALUES ('Duplicate','viewer@test','viewer')").run(), /UNIQUE constraint failed/);
    assert.throws(() => db.prepare('INSERT INTO records VALUES (3,999)').run(), /FOREIGN KEY constraint failed/);
    migrate(db);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM users').get().count, 3);
  } finally { db.close(); }
});
