const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const config = require('./env');

// Ensure data directory exists
const dataDir = path.dirname(config.dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

let dbInstance = null;

function createInstance(filePath = config.dbPath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const inst = new Database(filePath, {
    verbose: config.nodeEnv === 'development' ? null : null,
  });

  // Enable WAL mode for better concurrent read performance
  inst.pragma('journal_mode = WAL');
  inst.pragma('foreign_keys = ON');
  inst.pragma('busy_timeout = 5000');
  return inst;
}

dbInstance = createInstance();

const db = new Proxy({}, {
  get(target, prop) {
    if (prop === '_reopen') {
      return (filePath) => {
        try {
          if (dbInstance && dbInstance.open) {
            dbInstance.close();
          }
        } catch (err) {
          console.error('[DB] Error closing previous instance on reopen:', err);
        }
        dbInstance = createInstance(filePath);
        return dbInstance;
      };
    }
    if (prop === '_close') {
      return () => {
        if (dbInstance && dbInstance.open) {
          dbInstance.close();
        }
      };
    }
    if (prop === '_instance') {
      return dbInstance;
    }
    const val = dbInstance[prop];
    return typeof val === 'function' ? val.bind(dbInstance) : val;
  }
});

module.exports = db;
