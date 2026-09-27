const express = require('express');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const jwt = require('jsonwebtoken');
const config = require('../config/env');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// Only system admins can access these routes
router.use(authenticate);
router.use(authorize('system admin'));

const maintenanceFile = path.join(__dirname, '..', '..', '.maintenance');

// --- Maintenance Mode ---
router.get('/maintenance', (req, res) => {
  const enabled = fs.existsSync(maintenanceFile);
  res.json({ enabled });
});

router.post('/maintenance', (req, res) => {
  const { enabled } = req.body;
  if (enabled) {
    if (!fs.existsSync(maintenanceFile)) {
      fs.writeFileSync(maintenanceFile, '');
    }
  } else {
    if (fs.existsSync(maintenanceFile)) {
      fs.unlinkSync(maintenanceFile);
    }
  }
  res.json({ enabled: !!enabled });
});

const os = require('os');
const multer = require('multer');
const Database = require('better-sqlite3');
const db = require('../config/db');
const { migrate } = require('../config/migrate');

const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 250 * 1024 * 1024 }, // 250MB limit
  fileFilter: (req, file, cb) => {
    if (!file.originalname.match(/\.(db|sqlite|sqlite3)$/i)) {
      return cb(new Error('Only SQLite database files (.db, .sqlite, .sqlite3) are allowed!'));
    }
    cb(null, true);
  },
});

// --- Direct Download Database to PC ---
router.get('/database/download', async (req, res) => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `timesheet-backup-${timestamp}.db`;
  const tempFile = path.join(os.tmpdir(), filename);

  try {
    // WAL checkpoint to ensure recent changes are committed
    try {
      db.pragma('wal_checkpoint(PASSIVE)');
    } catch (e) {
      console.warn('[DB Download] WAL checkpoint warning:', e.message);
    }

    // Native online backup creates a safe, uncorrupted snapshot without locking readers/writers
    await db.backup(tempFile);

    // Audit log
    try {
      db.prepare('INSERT INTO audit_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)').run(
        req.user.id, 'DB_DOWNLOAD', `Database downloaded to PC: ${filename}`, req.ip
      );
    } catch (logErr) {
      console.warn('[Audit Log] Failed to log DB download:', logErr.message);
    }

    res.download(tempFile, filename, (err) => {
      try {
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile);
        }
      } catch (cleanupErr) {
        console.error('[DB Download] Cleanup error:', cleanupErr.message);
      }
      if (err && !res.headersSent) {
        res.status(500).json({ error: 'Failed to download database' });
      }
    });
  } catch (error) {
    console.error('[DB Download Error]:', error);
    try {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    } catch {}
    res.status(500).json({ error: 'Failed to generate database backup', details: error.message });
  }
});

// --- Direct Restore Database from PC Upload ---
router.post('/database/restore-upload', (req, res, next) => {
  upload.single('database')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'File upload error' });
    }
    next();
  });
}, async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No database file provided. Please select a .db file to restore.' });
  }

  const uploadedPath = req.file.path;

  try {
    // 1. Validate SQLite magic header (first 16 bytes: "SQLite format 3\0")
    const headerBuffer = Buffer.alloc(16);
    const fd = fs.openSync(uploadedPath, 'r');
    fs.readSync(fd, headerBuffer, 0, 16, 0);
    fs.closeSync(fd);

    const expectedHeader = Buffer.from('SQLite format 3\0', 'utf8');
    if (!headerBuffer.equals(expectedHeader)) {
      throw new Error('The uploaded file is not a valid SQLite 3 database.');
    }

    // 2. Validate DB integrity and structure
    let testDb;
    try {
      testDb = new Database(uploadedPath, { readonly: true });
      const check = testDb.pragma('quick_check');
      if (check[0]?.quick_check !== 'ok') {
        throw new Error('Database integrity check failed: ' + JSON.stringify(check));
      }
      const tables = testDb.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
      if (!tables.includes('users')) {
        throw new Error('Database schema invalid: Missing essential "users" table.');
      }
    } finally {
      if (testDb) testDb.close();
    }

    // 3. Create a safety backup of the current database before overwriting
    const backupDir = path.join(__dirname, '..', '..', 'backup');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    const safetyFile = path.join(backupDir, `timesheet-pre-restore-${Date.now()}.db`);
    try {
      await db.backup(safetyFile);
      console.log(`[DB Restore] Safety backup created at: ${safetyFile}`);
    } catch (safetyErr) {
      console.warn('[DB Restore] Could not create safety backup:', safetyErr.message);
    }

    // 4. Safely checkpoint and close active database connection
    try {
      db.pragma('wal_checkpoint(TRUNCATE)');
    } catch (e) {}
    db._close();

    // 5. Overwrite the database file
    fs.copyFileSync(uploadedPath, config.dbPath);

    // Clean up old WAL and SHM files
    ['-wal', '-shm'].forEach(suffix => {
      try {
        const walPath = config.dbPath + suffix;
        if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
      } catch (e) {}
    });

    // 6. Reopen connection to new database
    db._reopen();

    // 7. Run migrations to ensure restored database has latest schema
    migrate();

    // 8. Log audit trail
    try {
      db.prepare('INSERT INTO audit_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)').run(
        req.user.id, 'DB_RESTORE_UPLOAD', `Database restored from PC upload (${req.file.originalname})`, req.ip
      );
    } catch (logErr) {
      console.warn('[Audit Log] Failed to log restore:', logErr.message);
    }

    // 9. Clean up uploaded temporary file
    try {
      fs.unlinkSync(uploadedPath);
    } catch {}

    res.json({
      success: true,
      message: `Database successfully restored from ${req.file.originalname}`,
      filename: req.file.originalname,
    });
  } catch (err) {
    console.error('[DB Restore Upload Error]:', err);
    try {
      if (fs.existsSync(uploadedPath)) fs.unlinkSync(uploadedPath);
    } catch {}
    res.status(400).json({ error: err.message || 'Database restore failed' });
  }
});

// --- Server-Side Backup Script ---
router.post('/backup', (req, res) => {
  exec('npm run backup', { cwd: path.join(__dirname, '..', '..') }, (error, stdout, stderr) => {
    if (error) {
      console.error(`Backup error: ${error}`);
      return res.status(500).json({ error: 'Backup failed', details: stderr });
    }
    res.json({ success: true, message: stdout });
  });
});

// --- Server-Side Restore Script ---
router.post('/restore', (req, res) => {
  exec('npm run restore', { cwd: path.join(__dirname, '..', '..') }, (error, stdout, stderr) => {
    if (error) {
      console.error(`Restore error: ${error}`);
      return res.status(500).json({ error: 'Restore failed', details: stderr });
    }
    // Reopen DB connection in case file was replaced by restore script
    try {
      db._reopen();
    } catch (e) {}
    res.json({ success: true, message: stdout });
  });
});

// --- Token Generation ---
router.post('/tokens', (req, res) => {
  const { expiresIn, role } = req.body; // e.g. '1h', '30d', or 'never'
  
  const payload = { 
    userId: req.user.id, 
    role: role || req.user.role 
  };
  
  let token;
  if (expiresIn === 'never') {
    // No expiration
    token = jwt.sign(payload, config.jwtSecret);
  } else {
    token = jwt.sign(payload, config.jwtSecret, { expiresIn: expiresIn || '30d' });
  }
  
  res.json({ token });
});

module.exports = router;
