const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('./db');
const maintenance = require('../middleware/maintenance');

async function backupDatabase() {
  maintenance.beginOperation();
  try {
    const directory = path.resolve(__dirname, '../../backup');
    fs.mkdirSync(directory, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-') + '-' + crypto.randomBytes(3).toString('hex');
    const filename = path.join(directory, `timesheet-${stamp}.db`);
    await db.backup(filename);
    return filename;
  } finally {
    maintenance.endOperation();
  }
}
if (require.main === module) {
  backupDatabase().then(filename => console.log(`Backup: ${filename}\nWeb maintenance remains enabled until System Admin login.`))
    .catch(error => { console.error(error.message); process.exitCode = 1; })
    .finally(() => db._close());
}
module.exports = { backupDatabase };
