const express = require('express');
const db = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { getISOWeekNumber, getWeekDateRange } = require('../utils/dateUtils');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit-table');

const router = express.Router();



// GET /api/reports/dashboard - Dashboard stats
router.get('/dashboard', authenticate, (req, res) => {
  const isAdmin = req.user.role === 'admin';
  const userId = req.user.id;
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const monthStartDate = `${currentMonth}-01`;
  const monthEndDate = `${currentMonth}-31`;

  // Get current week info
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const { week: currentWeek, year: currentWeekYear } = getISOWeekNumber(todayStr);
  const { startDate: weekStartDate, endDate: weekEndDate } = getWeekDateRange(currentWeek, currentWeekYear);

  if (isAdmin) {
    const totalRegistered = db.prepare('SELECT COUNT(*) as count FROM users WHERE active = 1').get();
    const totalProjects = db.prepare('SELECT COUNT(*) as count FROM projects WHERE active = 1').get();
    const activeThisMonth = db.prepare(`
      SELECT COUNT(DISTINCT t.user_id) as count FROM timesheets t
      JOIN users u ON t.user_id = u.id
      WHERE u.name != '[Deleted User]' AND u.active = 1 AND t.work_date BETWEEN ? AND ?
    `).get(monthStartDate, monthEndDate);
    const activeThisWeek = db.prepare(`
      SELECT COUNT(DISTINCT t.user_id) as count FROM timesheets t
      JOIN users u ON t.user_id = u.id
      WHERE u.name != '[Deleted User]' AND u.active = 1 AND t.work_date BETWEEN ? AND ?
    `).get(weekStartDate, weekEndDate);
    const onlineNow = db.prepare(`
      SELECT COUNT(*) as count FROM users
      WHERE active = 1 AND last_seen_at > datetime('now', '-5 minutes')
    `).get();
    const pendingApprovals = db.prepare(`
      SELECT COUNT(DISTINCT t.user_id) as count FROM timesheets t
      JOIN users u ON t.user_id = u.id
      WHERE u.name != '[Deleted User]' AND t.status = 'submitted' AND t.work_date BETWEEN ? AND ?
    `).get(weekStartDate, weekEndDate);
    const monthlyHours = db.prepare(`
      SELECT COALESCE(SUM(t.hours), 0) as total FROM timesheets t
      JOIN users u ON t.user_id = u.id
      WHERE u.name != '[Deleted User]' AND t.work_date BETWEEN ? AND ?
    `).get(monthStartDate, monthEndDate);
    const weeklyHours = db.prepare(`
      SELECT COALESCE(SUM(t.hours), 0) as total FROM timesheets t
      JOIN users u ON t.user_id = u.id
      WHERE u.name != '[Deleted User]' AND t.work_date BETWEEN ? AND ?
    `).get(weekStartDate, weekEndDate);

    const recentSubmissions = db.prepare(`
      SELECT u.name, u.division, SUM(t.hours) as total_hours, t.status,
             t.week_number, t.week_year,
             MAX(t.updated_at) as last_updated
      FROM timesheets t
      JOIN users u ON t.user_id = u.id
      WHERE u.name != '[Deleted User]' AND t.status = 'submitted'
      GROUP BY t.user_id, t.week_year, t.week_number
      ORDER BY last_updated DESC
      LIMIT 10
    `).all();

    const hoursByDivision = db.prepare(`
      SELECT u.division, COALESCE(SUM(t.hours), 0) as total_hours
      FROM timesheets t
      JOIN users u ON t.user_id = u.id
      WHERE u.name != '[Deleted User]' AND t.work_date BETWEEN ? AND ?
      GROUP BY u.division
      ORDER BY total_hours DESC
    `).all(monthStartDate, monthEndDate);

    res.json({
      stats: {
        totalRegistered: totalRegistered.count,
        activeThisMonth: activeThisMonth.count,
        activeThisWeek: activeThisWeek.count,
        onlineNow: onlineNow.count,
        totalProjects: totalProjects.count,
        pendingApprovals: pendingApprovals.count,
        monthlyHours: monthlyHours.total,
        weeklyHours: weeklyHours.total,
        currentWeek,
        currentWeekYear,
      },
      recentSubmissions,
      hoursByDivision,
    });
  } else {
    const myMonthlyHours = db.prepare(`
      SELECT COALESCE(SUM(hours), 0) as total FROM timesheets 
      WHERE user_id = ? AND work_date BETWEEN ? AND ?
    `).get(userId, monthStartDate, monthEndDate);
    const myWeeklyHours = db.prepare(`
      SELECT COALESCE(SUM(hours), 0) as total FROM timesheets 
      WHERE user_id = ? AND work_date BETWEEN ? AND ?
    `).get(userId, weekStartDate, weekEndDate);
    const myEntries = db.prepare(`
      SELECT COUNT(*) as count FROM timesheets 
      WHERE user_id = ? AND work_date BETWEEN ? AND ?
    `).get(userId, monthStartDate, monthEndDate);
    const myStatus = db.prepare(`
      SELECT status, COUNT(*) as count FROM timesheets 
      WHERE user_id = ? AND work_date BETWEEN ? AND ?
      GROUP BY status
    `).all(userId, weekStartDate, weekEndDate);

    // Check for recalled timesheets
    const recalledWeeks = db.prepare(`
      SELECT DISTINCT week_number, week_year, admin_comment FROM timesheets 
      WHERE user_id = ? AND status = 'recalled'
      ORDER BY week_year DESC, week_number DESC
    `).all(userId);

    const recentEntries = db.prepare(`
      SELECT t.*, p.project_code, p.project_name, tk.task_category
      FROM timesheets t
      LEFT JOIN projects p ON t.project_id = p.id
      LEFT JOIN tasks tk ON t.task_id = tk.id
      WHERE t.user_id = ?
      ORDER BY t.work_date DESC
      LIMIT 10
    `).all(userId);

    const hoursByProject = db.prepare(`
      SELECT p.project_code, p.project_name, COALESCE(SUM(t.hours), 0) as total_hours
      FROM timesheets t
      JOIN projects p ON t.project_id = p.id
      WHERE t.user_id = ? AND t.work_date BETWEEN ? AND ?
      GROUP BY t.project_id
      ORDER BY total_hours DESC
    `).all(userId, monthStartDate, monthEndDate);

    res.json({
      stats: {
        monthlyHours: myMonthlyHours.total,
        weeklyHours: myWeeklyHours.total,
        totalEntries: myEntries.count,
        statusBreakdown: myStatus,
        currentWeek,
        currentWeekYear,
      },
      recalledWeeks,
      recentEntries,
      hoursByProject,
    });
  }
});

// GET /api/reports/utilization
router.get('/utilization', authenticate, authorize('admin'), (req, res) => {
  const { month, year, week, division } = req.query;

  if (!year) {
    return res.status(400).json({ error: 'Year is required' });
  }

  let startDate, endDate, workingDays;

  if (week) {
    const range = getWeekDateRange(parseInt(week), parseInt(year));
    startDate = range.startDate;
    endDate = range.endDate;
    // Calculate working days in the week (5 weekdays max)
    workingDays = 5;
    // Subtract holidays in the week
    const holidayCount = db.prepare(`
      SELECT COUNT(*) as count FROM holidays WHERE date BETWEEN ? AND ?
    `).get(startDate, endDate);
    workingDays -= holidayCount.count;
  } else if (month) {
    startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    endDate = `${year}-${String(month).padStart(2, '0')}-31`;
    const daysInMonth = new Date(year, month, 0).getDate();
    workingDays = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const day = new Date(year, month - 1, d).getDay();
      if (day !== 0 && day !== 6) workingDays++;
    }
    const holidayCount = db.prepare(`
      SELECT COUNT(*) as count FROM holidays WHERE date BETWEEN ? AND ?
    `).get(startDate, endDate);
    workingDays -= holidayCount.count;
  } else {
    return res.status(400).json({ error: 'Month or week is required' });
  }

  const expectedHours = workingDays * 8;

  let query = `
    SELECT u.id, u.name, u.email, u.division, u.team_type,
           COALESCE(SUM(t.hours), 0) as total_hours,
           COUNT(DISTINCT t.work_date) as days_logged
    FROM users u
    LEFT JOIN timesheets t ON u.id = t.user_id AND t.work_date BETWEEN ? AND ?
    WHERE u.active = 1
  `;
  const params = [startDate, endDate];

  if (division) {
    query += ' AND u.division = ?';
    params.push(division);
  }

  query += ' GROUP BY u.id ORDER BY u.name ASC';
  const utilization = db.prepare(query).all(...params);

  const result = utilization.map(u => ({
    ...u,
    expected_hours: expectedHours,
    utilization_pct: expectedHours > 0 ? Math.round((u.total_hours / expectedHours) * 100) : 0,
    working_days: workingDays,
  }));

  res.json({ utilization: result, workingDays, expectedHours });
});

// GET /api/reports/project-hours
router.get('/project-hours', authenticate, authorize('admin'), (req, res) => {
  const { month, year, week, division } = req.query;

  let startDate, endDate;
  if (week && year) {
    const range = getWeekDateRange(parseInt(week), parseInt(year));
    startDate = range.startDate;
    endDate = range.endDate;
  } else if (month && year) {
    startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    endDate = `${year}-${String(month).padStart(2, '0')}-31`;
  }

  // Fixed: WHERE clause now comes before GROUP BY, and date filter is in LEFT JOIN condition
  let query = `
    SELECT p.project_code, p.project_name, p.customer_name, p.division,
           COALESCE(SUM(t.hours), 0) as total_hours,
           COUNT(DISTINCT t.user_id) as contributors
    FROM projects p
    LEFT JOIN timesheets t ON p.id = t.project_id
  `;
  const params = [];

  if (startDate && endDate) {
    query += ' AND t.work_date BETWEEN ? AND ?';
    params.push(startDate, endDate);
  }

  // WHERE clause must come after all JOINs and before GROUP BY
  query += ' WHERE p.active = 1';
  if (division) {
    query += ' AND p.division = ?';
    params.push(division);
  }

  query += ' GROUP BY p.id ORDER BY total_hours DESC';
  const projects = db.prepare(query).all(...params);
  res.json({ projects });
});

// GET /api/reports/project-hours-detail - Project totals with per-user breakdown + flexible dates
router.get('/project-hours-detail', authenticate, authorize('admin'), (req, res) => {
  const { start_date, end_date, month, year, week, division, user_id, status } = req.query;

  let startDate, endDate;
  if (start_date && end_date) {
    startDate = start_date;
    endDate = end_date;
  } else if (week && year) {
    const range = getWeekDateRange(parseInt(week), parseInt(year));
    startDate = range.startDate;
    endDate = range.endDate;
  } else if (month && year) {
    startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    endDate = `${year}-${String(month).padStart(2, '0')}-31`;
  } else {
    return res.status(400).json({ error: 'Provide start_date+end_date, month+year, or week+year' });
  }

  // Single query: project + user aggregation, then group in JS
  const rows = db.prepare(`
    SELECT p.id as project_id, p.project_code, p.project_name, p.customer_name, p.division,
           u.id as user_id, u.name as user_name, u.email as user_email,
           SUM(t.hours) as user_hours
    FROM timesheets t
    JOIN projects p ON t.project_id = p.id
    JOIN users u ON t.user_id = u.id
    WHERE p.active = 1
      AND u.name != '[Deleted User]'
      AND t.work_date BETWEEN ? AND ?
      ${division ? 'AND u.division = ?' : ''}
      ${user_id ? 'AND t.user_id = ?' : ''}
      ${status ? 'AND t.status = ?' : ''}
    GROUP BY p.id, u.id
    ORDER BY p.project_code, user_hours DESC
  `);

  const params = [startDate, endDate];
  if (division) params.push(division);
  if (user_id) params.push(parseInt(user_id));
  if (status) params.push(status);

  const rowsData = rows.all(...params);

  // Group by project
  const projectMap = {};
  for (const row of rowsData) {
    if (!projectMap[row.project_id]) {
      projectMap[row.project_id] = {
        project_code: row.project_code,
        project_name: row.project_name,
        customer_name: row.customer_name,
        division: row.division,
        total_hours: 0,
        contributors: [],
      };
    }
    projectMap[row.project_id].total_hours += row.user_hours;
    projectMap[row.project_id].contributors.push({
      user_id: row.user_id,
      name: row.user_name,
      email: row.user_email,
      hours: row.user_hours,
    });
  }

  const projects = Object.values(projectMap).sort((a, b) => b.total_hours - a.total_hours);
  const grand_total_hours = projects.reduce((s, p) => s + p.total_hours, 0);

  const format = req.query.format;
  
  if (format === 'excel') {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Project Hours Detail');
    worksheet.columns = [
      { header: 'Project', key: 'project', width: 15 },
      { header: 'ProjectName', key: 'projectName', width: 30 },
      { header: 'Customer', key: 'customer', width: 20 },
      { header: 'Division', key: 'division', width: 20 },
      { header: 'Employee', key: 'employee', width: 25 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'Hours', key: 'hours', width: 10 }
    ];
    
    projects.forEach(p => {
      p.contributors.forEach(c => {
        worksheet.addRow({
          project: p.project_code,
          projectName: p.project_name,
          customer: p.customer_name || '',
          division: p.division || '',
          employee: c.name,
          email: c.email,
          hours: c.hours
        });
      });
    });
    
    worksheet.addRow({
      project: 'GRAND TOTAL',
      hours: grand_total_hours
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=project_hours_${startDate}_to_${endDate}.xlsx`);
    return workbook.xlsx.write(res).then(() => res.end());
  }
  
  if (format === 'pdf') {
    const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=project_hours_${startDate}_to_${endDate}.pdf`);
    doc.pipe(res);

    doc.fontSize(14).text(`Project Hours — ${startDate} to ${endDate}`, { align: 'left' });
    doc.fontSize(9).text(`Generated: ${new Date().toLocaleString()}`, { align: 'left' });
    doc.moveDown();

    const rows = [];
    projects.forEach(p => {
      p.contributors.forEach(c => {
        rows.push([p.project_code, p.project_name, p.customer_name || '', p.division || '', c.name, c.hours.toFixed(1)]);
      });
    });
    rows.push(['', '', '', '', 'GRAND TOTAL', grand_total_hours.toFixed(1)]);

    const table = {
      headers: ['Code', 'Project', 'Customer', 'Division', 'Employee', 'Hours'],
      rows: rows
    };
    doc.table(table, {
      prepareHeader: () => doc.font('Helvetica-Bold').fontSize(8),
      prepareRow: (row, i) => doc.font('Helvetica').fontSize(8)
    });
    
    doc.end();
    return;
  }

  res.json({ projects, grand_total_hours, period: { start_date: startDate, end_date: endDate } });
});

// GET /api/reports/weekly-summary - Weekly hours summary for a month
router.get('/weekly-summary', authenticate, authorize('admin'), (req, res) => {
  const { month, year, division, user_id, status } = req.query;

  if (!month || !year) {
    return res.status(400).json({ error: 'Month and year are required' });
  }

  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = `${year}-${String(month).padStart(2, '0')}-31`;

  let query = `
    SELECT u.id as user_id, u.name as user_name, u.email, u.division,
           t.week_number, t.week_year, t.status,
           SUM(t.hours) as total_hours,
           COUNT(DISTINCT t.work_date) as days_worked,
           t.admin_comment
    FROM timesheets t
    JOIN users u ON t.user_id = u.id
    WHERE u.name != '[Deleted User]' AND t.work_date BETWEEN ? AND ?
  `;
  const params = [startDate, endDate];

  if (division) {
    query += ' AND u.division = ?';
    params.push(division);
  }
  if (user_id) {
    query += ' AND t.user_id = ?';
    params.push(parseInt(user_id));
  }
  if (status) {
    query += ' AND t.status = ?';
    params.push(status);
  }

  query += ' GROUP BY u.id, t.week_number, t.week_year, t.status ORDER BY u.name, t.week_number';
  const summary = db.prepare(query).all(...params);
  res.json({ summary });
});

// GET /api/reports/export - Export data to JSON (frontend converts to Excel/PDF)
// Now respects all active filters from the Reports page
router.get('/export', authenticate, authorize('admin'), (req, res) => {
  const { month, year, week, division, user_id, status, subdivision } = req.query;

  let startDate, endDate;
  if (week && year) {
    const range = getWeekDateRange(parseInt(week), parseInt(year));
    startDate = range.startDate;
    endDate = range.endDate;
  } else if (month && year) {
    startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    endDate = `${year}-${String(month).padStart(2, '0')}-31`;
  } else {
    return res.status(400).json({ error: 'Month/year or week/year are required' });
  }

  let query = `
    SELECT t.work_date, t.hours, t.description, t.status,
           t.week_number, t.week_year, t.project_description,
           u.name as employee_name, u.email as employee_email, u.division as employee_division,
           p.project_code, p.project_name, p.customer_name,
           tk.classification, tk.task_category, tk.task_description,
           d.name as division_name, s.name as subdivision_name
    FROM timesheets t
    JOIN users u ON t.user_id = u.id
    LEFT JOIN projects p ON t.project_id = p.id
    LEFT JOIN tasks tk ON t.task_id = tk.id
    LEFT JOIN divisions d ON t.division_id = d.id
    LEFT JOIN subdivisions s ON t.subdivision_id = s.id
    WHERE u.name != '[Deleted User]' AND t.work_date BETWEEN ? AND ?
  `;
  const params = [startDate, endDate];

  // Apply all active filters
  if (division) {
    query += ' AND u.division = ?';
    params.push(division);
  }
  if (user_id) {
    query += ' AND t.user_id = ?';
    params.push(parseInt(user_id));
  }
  if (status) {
    query += ' AND t.status = ?';
    params.push(status);
  }
  if (subdivision) {
    query += ' AND s.name = ?';
    params.push(subdivision);
  }

  query += ' ORDER BY u.name, t.week_number, t.work_date, p.project_code';
  const data = db.prepare(query).all(...params);

  const format = req.query.format;

  if (format === 'excel') {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Timesheet Report');
    worksheet.columns = [
      { header: 'Employee', key: 'employee_name', width: 25 },
      { header: 'Division', key: 'employee_division', width: 20 },
      { header: 'Date', key: 'work_date', width: 15 },
      { header: 'Week', key: 'week_number', width: 10 },
      { header: 'Project', key: 'project_code', width: 15 },
      { header: 'Task', key: 'task_category', width: 20 },
      { header: 'Hours', key: 'hours', width: 10 },
      { header: 'Status', key: 'status', width: 15 }
    ];
    
    data.forEach(r => {
      worksheet.addRow({
        employee_name: r.employee_name,
        employee_division: r.employee_division || '',
        work_date: r.work_date,
        week_number: `W${r.week_number}`,
        project_code: r.project_code,
        task_category: r.task_category || '',
        hours: r.hours,
        status: r.status
      });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=timesheet_report_${year}_${month || week}.xlsx`);
    return workbook.xlsx.write(res).then(() => res.end());
  }

  if (format === 'pdf') {
    const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=timesheet_report_${year}_${month || week}.pdf`);
    doc.pipe(res);

    doc.fontSize(14).text(`Timesheet Report — ${startDate} to ${endDate}`, { align: 'left' });
    doc.fontSize(9).text(`Generated: ${new Date().toLocaleString()}`, { align: 'left' });
    doc.moveDown();

    const rows = data.map(r => [
      r.employee_name, 
      r.employee_division || '', 
      r.work_date, 
      `W${r.week_number}`, 
      r.project_code || '', 
      r.task_category || '', 
      r.hours.toString(), 
      r.status
    ]);

    const table = {
      headers: ['Employee', 'Division', 'Date', 'Week', 'Project', 'Task', 'Hours', 'Status'],
      rows: rows
    };
    
    doc.table(table, {
      prepareHeader: () => doc.font('Helvetica-Bold').fontSize(8),
      prepareRow: (row, i) => doc.font('Helvetica').fontSize(8)
    });
    
    doc.end();
    return;
  }

  res.json({ data, month, year, week, filters: { division, user_id, status, subdivision } });
});

module.exports = router;
