const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const config = require('./env');
const db = require('./db');
const maintenance = require('../middleware/maintenance');

// Offline CLI: stop all application workers first. Browser restores use upload.
async function restoreDatabase(source, confirmed = false) {
  if (!source || !confirmed) throw new Error('Stop the app, then use npm run restore -- /absolute/backup.db --confirm');
  const filename = path.resolve(source);
  if (filename === config.dbPath) throw new Error('Select a backup file, not the active database');
  const candidate = new Database(filename, { readonly: true, fileMustExist: true });
  try {
    if (candidate.pragma('integrity_check', { simple: true }) !== 'ok') throw new Error('Backup integrity check failed');
    if (!candidate.prepare("SELECT 1 FROM users WHERE role='system admin' AND active=1 LIMIT 1").get()) throw new Error('Backup requires an active System Admin to release maintenance');
  } finally { candidate.close(); }
  maintenance.beginOperation();
  const directory = path.resolve(__dirname, '../../backup');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-') + '-' + crypto.randomBytes(3).toString('hex');
  const safety = path.join(directory, `timesheet-pre-restore-${stamp}.db`);
  try {
    fs.mkdirSync(directory, { recursive: true });
    await db.backup(safety);
    console.log(`Safety backup: ${safety}`);
    db._close();
    for (const suffix of ['-wal', '-shm']) fs.rmSync(config.dbPath + suffix, { force: true });
    try {
      fs.copyFileSync(filename, config.dbPath);
      db._reopen();
      require('./migrate').migrate();
    } catch (error) {
      db._close();
      for (const suffix of ['-wal', '-shm']) fs.rmSync(config.dbPath + suffix, { force: true });
      fs.copyFileSync(safety, config.dbPath);
      db._reopen();
      throw error;
    }
    console.log(`Restored: ${filename}\nDatabase: ${config.dbPath}\nMaintenance remains enabled until System Admin web login.`);
    return safety;
  } finally { maintenance.endOperation(); }
}
if (require.main === module) {
  restoreDatabase(process.argv[2], process.argv.includes('--confirm'))
    .catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => db._close());
}
module.exports = { restoreDatabase };
