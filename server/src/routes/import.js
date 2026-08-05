const express = require('express');
const multer = require('multer');
const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// Configure multer for file uploads
const uploadDir = path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.xlsx', '.xls', '.csv'].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel files (.xlsx, .xls, .csv) are allowed'));
    }
  },
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

/**
 * Read an Excel/CSV file and return rows as an array of objects (like XLSX.utils.sheet_to_json).
 * Uses ExcelJS to replace the vulnerable `xlsx` package.
 */
async function readExcelAsJson(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const workbook = new ExcelJS.Workbook();

  if (ext === '.csv') {
    await workbook.csv.readFile(filePath);
  } else {
    await workbook.xlsx.readFile(filePath);
  }

  const worksheet = workbook.worksheets[0];
  if (!worksheet || worksheet.rowCount === 0) return [];

  const rows = [];
  const headers = [];

  worksheet.eachRow((row, rowNumber) => {
    const values = row.values; // ExcelJS row.values is 1-indexed (index 0 is empty)
    if (rowNumber === 1) {
      // First row is headers
      for (let i = 1; i < values.length; i++) {
        headers.push(values[i] != null ? String(values[i]).trim() : `Column${i}`);
      }
    } else {
      // Data rows
      const obj = {};
      for (let i = 0; i < headers.length; i++) {
        const val = values[i + 1]; // 1-indexed offset
        // Handle ExcelJS rich text objects and hyperlinks
        if (val != null && typeof val === 'object' && val.result !== undefined) {
          obj[headers[i]] = val.result; // formula result
        } else if (val != null && typeof val === 'object' && val.text !== undefined) {
          obj[headers[i]] = val.text; // hyperlink or rich text
        } else {
          obj[headers[i]] = val != null ? val : undefined;
        }
      }
      // Only add rows that have at least one non-empty value (skip blank rows)
      if (Object.values(obj).some(v => v !== undefined && v !== null && v !== '')) {
        rows.push(obj);
      }
    }
  });

  return rows;
}

// POST /api/import/projects - Import projects from Excel
router.post('/projects', authenticate, authorize('admin'), upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  try {
    const data = await readExcelAsJson(req.file.path);

    let imported = 0;
    let skipped = 0;
    const errors = [];

    const insertProject = db.prepare(`
      INSERT OR IGNORE INTO projects (project_code, project_name, customer_name, activity, division, team_type)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const importTransaction = db.transaction(() => {
      for (const row of data) {
        const code = row['Project Code'] || row['project_code'] || row['Code'];
        const name = row['Project Name'] || row['project_name'] || row['Name'];

        if (!code || !name) {
          skipped++;
          errors.push(`Row missing project code or name: ${JSON.stringify(row).substring(0, 100)}`);
          continue;
        }

        const result = insertProject.run(
          String(code).trim(),
          String(name).trim(),
          row['Customer Name'] || row['customer_name'] || row['Customer'] || null,
          row['Activity'] || row['activity'] || null,
          row['Division'] || row['division'] || null,
          row['Team Type'] || row['team_type'] || row['Heart'] || null
        );

        if (result.changes > 0) imported++;
        else skipped++;
      }
    });

    importTransaction();

    // Clean up file
    fs.unlinkSync(req.file.path);

    db.prepare('INSERT INTO audit_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)').run(
      req.user.id, 'IMPORT_PROJECTS', `Imported ${imported} projects, skipped ${skipped}`, req.ip
    );

    res.json({ imported, skipped, total: data.length, errors: errors.slice(0, 10) });
  } catch (err) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(400).json({ error: `Import failed: ${err.message}` });
  }
});

// POST /api/import/users - Import users from Excel
router.post('/users', authenticate, authorize('admin'), upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  try {
    const data = await readExcelAsJson(req.file.path);

    let imported = 0;
    let skipped = 0;
    const errors = [];
    const generatedPassword = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-8).toUpperCase() + '1!';
    const defaultPassword = bcrypt.hashSync(generatedPassword, 12);

    const importTransaction = db.transaction(() => {
      for (const row of data) {
        const name = row['Name'] || row['name'] || row['Employee Name'];
        const email = row['Email'] || row['email'] || row['Employee Email'];

        if (!name || !email) {
          skipped++;
          errors.push(`Row missing name or email`);
          continue;
        }

        const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(String(email).toLowerCase().trim());
        if (existing) {
          skipped++;
          continue;
        }

        db.prepare(`
          INSERT INTO users (name, email, password_hash, role, division, core, team_type)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          String(name).trim(),
          String(email).toLowerCase().trim(),
          defaultPassword,
          row['Role'] || row['role'] || 'employee',
          row['Division'] || row['division'] || null,
          row['Core'] || row['core'] || null,
          row['Team Type'] || row['team_type'] || null
        );
        imported++;
      }
    });

    importTransaction();
    fs.unlinkSync(req.file.path);

    db.prepare('INSERT INTO audit_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)').run(
      req.user.id, 'IMPORT_USERS', `Imported ${imported} users, skipped ${skipped}`, req.ip
    );

    res.json({ imported, skipped, total: data.length, errors: errors.slice(0, 10), defaultPassword: generatedPassword });
  } catch (err) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(400).json({ error: `Import failed: ${err.message}` });
  }
});

// POST /api/import/tasks - Import tasks from Excel
router.post('/tasks', authenticate, authorize('admin'), upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  try {
    const data = await readExcelAsJson(req.file.path);

    let imported = 0;
    let skipped = 0;

    const importTransaction = db.transaction(() => {
      for (const row of data) {
        const category = row['Task Category'] || row['task_category'] || row['Category'];
        if (!category) { skipped++; continue; }

        const existing = db.prepare('SELECT id FROM tasks WHERE task_category = ?').get(String(category).trim());
        if (existing) { skipped++; continue; }

        db.prepare('INSERT INTO tasks (classification, task_category, task_description) VALUES (?, ?, ?)').run(
          row['Classification'] || row['classification'] || row['Task Classification'] || null,
          String(category).trim(),
          row['Task Description'] || row['task_description'] || row['Description'] || null
        );
        imported++;
      }
    });

    importTransaction();
    fs.unlinkSync(req.file.path);

    res.json({ imported, skipped, total: data.length });
  } catch (err) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(400).json({ error: `Import failed: ${err.message}` });
  }
});

// POST /api/import/divisions - Import divisions from Excel
router.post('/divisions', authenticate, authorize('admin'), upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  try {
    const data = await readExcelAsJson(req.file.path);

    let imported = 0;
    let skipped = 0;

    const importTransaction = db.transaction(() => {
      for (const row of data) {
        const name = row['Division'] || row['division'] || row['Name'] || row['name'];
        if (!name) { skipped++; continue; }

        try {
          db.prepare('INSERT INTO divisions (name) VALUES (?)').run(String(name).trim());
          imported++;
        } catch (e) {
          skipped++;
        }
      }
    });

    importTransaction();
    fs.unlinkSync(req.file.path);

    res.json({ imported, skipped, total: data.length });
  } catch (err) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(400).json({ error: `Import failed: ${err.message}` });
  }
});

module.exports = router;


