/**
 * Database backup script.
 * Uses macOS/Linux's built-in sqlite3 CLI for reliable online backup.
 * Also works with sqlite3 installed via brew/apt.
 */
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const config = require('./env');

const dbPath = config.dbPath;

if (!fs.existsSync(dbPath)) {
  console.error(`Database not found at: ${dbPath}`);
  process.exit(1);
}

// Create backup directory
const backupDir = path.join(__dirname, '..', '..', 'backup');
fs.mkdirSync(backupDir, { recursive: true });

const today = new Date().toISOString().slice(0, 10);
const backupFile = path.join(backupDir, `timesheet-${today}.db`);

console.log(`Source:  ${dbPath}`);
console.log(`Backup:  ${backupFile}`);

try {
  // Use SQLite's built-in .backup command via CLI (handles WAL correctly)
  execSync(`sqlite3 "${dbPath}" ".backup '${backupFile}'"`, { stdio: 'inherit' });
} catch {
  // Fallback: copy DB + WAL files (restore will replay WAL)
  console.log('sqlite3 CLI not available, using file copy fallback...');
  fs.copyFileSync(dbPath, backupFile);
  // Also copy WAL if it exists
  const walFile = dbPath + '-wal';
  if (fs.existsSync(walFile)) {
    fs.copyFileSync(walFile, backupFile + '-wal');
  }
  const shmFile = dbPath + '-shm';
  if (fs.existsSync(shmFile)) {
    fs.copyFileSync(shmFile, backupFile + '-shm');
  }
}

const stat = fs.statSync(backupFile);
console.log(`Size:    ${(stat.size / 1024).toFixed(1)} KB`);
console.log(`✅ Backup complete: ${backupFile}`);
