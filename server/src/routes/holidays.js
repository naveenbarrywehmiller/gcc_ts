const express = require('express');
const db = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const multer = require('multer');
const { calendarYear, parseHolidays, exportHolidays } = require('../utils/holidayCalendar');

const router = express.Router();
const uploadCalendar = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 1 } }).single('file');

router.get('/export', authenticate, authorize('admin'), (req, res) => {
  let year;
  try { year = calendarYear(req.query.year); }
  catch (err) { return res.status(400).json({ error: err.message }); }
  const holidays = db.prepare('SELECT date, name FROM holidays WHERE date LIKE ? ORDER BY date').all(`${year}-%`);
  res.type('text/calendar');
  res.setHeader('Content-Disposition', `attachment; filename="holidays-${year}.ics"`);
  res.send(exportHolidays(holidays));
});

router.post('/import', authenticate, authorize('admin'), (req, res, next) => {
  uploadCalendar(req, res, err => {
    if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Calendar file must be under 2 MB' : 'Upload one .ics file' });
    next();
  });
}, (req, res) => {
  if (!req.file || !/\.ics$/i.test(req.file.originalname)) return res.status(400).json({ error: 'Choose an .ics file' });
  let parsed;
  try { parsed = parseHolidays(req.file.buffer.toString('utf8'), req.body.year); }
  catch (err) { return res.status(400).json({ error: `Unable to import calendar: ${err.message}` }); }
  const result = db.transaction(() => {
    const insert = db.prepare('INSERT INTO holidays(date, name) VALUES (?, ?) ON CONFLICT(date) DO NOTHING');
    let imported = 0;
    for (const holiday of parsed.holidays) imported += insert.run(holiday.date, holiday.name).changes;
    return { imported, duplicates: parsed.holidays.length - imported, skipped: parsed.skipped };
  })();
  res.json(result);
});

// GET /api/holidays
router.get('/', authenticate, (req, res) => {
  const { year } = req.query;
  let query = 'SELECT * FROM holidays';
  const params = [];

  if (year) {
    query += ' WHERE date LIKE ?';
    params.push(`${year}-%`);
  }

  query += ' ORDER BY date ASC';
  const holidays = db.prepare(query).all(...params);
  res.json({ holidays });
});

// POST /api/holidays
router.post('/', authenticate, authorize('admin'), (req, res) => {
  const { date, name } = req.body;
  if (!date || !name) return res.status(400).json({ error: 'Date and name are required' });

  try {
    const result = db.prepare('INSERT INTO holidays (date, name) VALUES (?, ?)').run(date, name.trim());
    const holiday = db.prepare('SELECT * FROM holidays WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ holiday });
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'Holiday already exists for this date' });
    }
    throw err;
  }
});

// PUT /api/holidays/:id
router.put('/:id', authenticate, authorize('admin'), (req, res) => {
  const { date, name } = req.body;
  const id = req.params.id;

  const existing = db.prepare('SELECT id FROM holidays WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Holiday not found' });

  if (date) db.prepare('UPDATE holidays SET date = ? WHERE id = ?').run(date, id);
  if (name) db.prepare('UPDATE holidays SET name = ? WHERE id = ?').run(name.trim(), id);

  const holiday = db.prepare('SELECT * FROM holidays WHERE id = ?').get(id);
  res.json({ holiday });
});

// DELETE /api/holidays/:id
router.delete('/:id', authenticate, authorize('admin'), (req, res) => {
  const id = req.params.id;
  const existing = db.prepare('SELECT id FROM holidays WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Holiday not found' });

  db.prepare('DELETE FROM holidays WHERE id = ?').run(id);
  res.json({ message: 'Holiday deleted' });
});

module.exports = router;
