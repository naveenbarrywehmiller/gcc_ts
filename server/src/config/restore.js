/**
 * Database restore script.
 * Usage: node src/config/restore.js <path-to-backup.db>
 * 
 * Replaces the current SQLite database with the backup file.
 * The server SHOULD be stopped before running this.
 */
const path = require('path');
const fs = require('fs');
const config = require('./env');

const backupFile = process.argv[2];

if (!backupFile) {
  console.error('Usage: node src/config/restore.js <backup-file.db>');
  console.error('Example: npm run restore -- ./backup/timesheet-2026-08-01.db');
  process.exit(1);
}

const src = path.resolve(backupFile);

if (!fs.existsSync(src)) {
  console.error(`File not found: ${src}`);
  process.exit(1);
}

const dbPath = config.dbPath;
const dir = path.dirname(dbPath);

// Ensure data directory exists
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

console.log(`Restoring from: ${src}`);
console.log(`Target:         ${dbPath}`);

// Copy the backup over the current DB
fs.copyFileSync(src, dbPath);

// Remove WAL and SHM files (they belong to the old DB)
['-wal', '-shm'].forEach(suffix => {
  try {
    fs.unlinkSync(dbPath + suffix);
    console.log(`Removed: ${dbPath}${suffix}`);
  } catch (e) {
    // file doesn't exist — that's fine
  }
});

console.log('');
console.log('Database restored successfully.');
console.log('Restart the server to apply the restored database.');
