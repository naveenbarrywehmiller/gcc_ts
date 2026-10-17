// Offline operation: stop all application workers before invoking this command.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('./env');
const db = require('./db');
const { migrate } = require('./migrate');
const { bootstrapAdmin, FACTORY_EMAIL, FACTORY_PASSWORD } = require('./bootstrapAdmin');
const maintenance = require('../middleware/maintenance');

async function factoryReset(confirmed = false) {
  if (!confirmed) throw new Error('Factory reset deletes all application data. Stop the app, then use --confirm. A database backup is required and created automatically.');
  maintenance.enable();
  const backupDir = path.resolve(__dirname, '../../backup');
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-') + '-' + crypto.randomBytes(3).toString('hex');
  const backup = path.join(backupDir, `timesheet-pre-factory-reset-${stamp}.db`);
  // Abort before replacing anything if the safety backup cannot be written.
  await db.backup(backup);
  console.log(`Safety database backup: ${backup}`);
  // Never reuse a former user's ID: old JWTs must not authenticate as the new
  // factory admin or as users subsequently created after a reset.
  const highWater = Math.max(db.prepare('SELECT MAX(id) AS id FROM users').get()?.id || 0,
    db.prepare("SELECT seq FROM sqlite_sequence WHERE name='users'").get()?.seq || 0);
  const fresh = config.dbPath + `.factory-${stamp}`;
  try {
    db._reopen(fresh);
    migrate({ bootstrap: false });
    db.prepare("INSERT INTO sqlite_sequence(name,seq) VALUES ('users',?)").run(highWater);
    bootstrapAdmin(db, { BOOTSTRAP_ADMIN_EMAIL: FACTORY_EMAIL, BOOTSTRAP_ADMIN_PASSWORD: FACTORY_PASSWORD });
    if (db.pragma('integrity_check', { simple: true }) !== 'ok') throw new Error('Fresh database integrity check failed');
    db._close();
    for (const suffix of ['-wal', '-shm']) fs.rmSync(config.dbPath + suffix, { force: true });
    fs.renameSync(fresh, config.dbPath);
  } finally {
    db._close();
    for (const suffix of ['', '-wal', '-shm']) fs.rmSync(fresh + suffix, { force: true });
    db._reopen(config.dbPath);
  }
  console.log(`Factory reset complete. Only ${FACTORY_EMAIL} remains. Maintenance must be released by System Admin login in the web browser.`);
  return backup;
}

if (require.main === module) {
  factoryReset(process.argv.includes('--confirm')).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  }).finally(() => db._close());
}
module.exports = { factoryReset };
