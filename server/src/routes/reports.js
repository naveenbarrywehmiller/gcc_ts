const express = require('express');
const db = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { getISOWeekNumber, getWeekDateRange } = require('../utils/dateUtils');

const { reportingScope } = require('../utils/divisionScope');
const { getPendingApprovals } = require('../utils/pendingApprovals');
const { expectedWeekHours } = require('../utils/workingHours');
const router = express.Router();



// GET /api/reports/dashboard - Dashboard stats
router.get('/dashboard', authenticate, (req, res) => {
  const isAdmin = req.user.role === 'admin' || req.user.role === 'system admin';
  const userId = req.user.id;
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const monthStartDate = `${currentMonth}-01`;
  const monthEndDate = `${currentMonth}-31`;

  // Get current week info
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const { week: currentWeek, year: currentWeekYear } = getISOWeekNumber(todayStr);
  const { startDate: weekStartDate, endDate: weekEndDate } = getWeekDateRange(currentWeek, currentWeekYear);
  const pendingWeeks = getPendingApprovals(req.user);
  const period = { month: currentMonth, weekStartDate, weekEndDate };

  const userScope = reportingScope(req.user, 'u');
  const projectScope = reportingScope(req.user, 'p');
  let teamSummary;
  if (['admin', 'manager', 'system admin'].includes(req.user.role)) {
    const countUsers = extra => db.prepare(`SELECT COUNT(*) AS count FROM users u WHERE u.active = 1 AND ${userScope.sql} ${extra}`).get(...userScope.params).count;
    const hours = (start, end) => db.prepare(`SELECT COALESCE(SUM(t.hours), 0) AS total FROM timesheets t JOIN users u ON u.id = t.user_id
      WHERE u.name != '[Deleted User]' AND t.work_date BETWEEN ? AND ? AND ${userScope.sql}`).get(start, end, ...userScope.params).total;
    const activeUsers = (start, end) => db.prepare(`SELECT COUNT(DISTINCT u.id) AS count FROM timesheets t JOIN users u ON u.id = t.user_id
      WHERE u.active = 1 AND u.name != '[Deleted User]' AND t.work_date BETWEEN ? AND ? AND ${userScope.sql}`).get(start, end, ...userScope.params).count;
    teamSummary = {
      totalRegistered: countUsers(''),
      totalProjects: db.prepare(`SELECT COUNT(*) AS count FROM projects p WHERE p.active = 1 AND ${projectScope.sql}`).get(...projectScope.params).count,
      activeThisMonth: activeUsers(monthStartDate, monthEndDate), activeThisWeek: activeUsers(weekStartDate, weekEndDate),
      onlineNow: countUsers("AND u.last_seen_at > datetime('now', '-5 minutes')"),
      monthlyHours: hours(monthStartDate, monthEndDate), weeklyHours: hours(weekStartDate, weekEndDate),
      pendingApprovals: pendingWeeks.length, currentWeek, currentWeekYear,
    };
  }
  if (isAdmin) {
    const hoursByDivision = db.prepare(`SELECT COALESCE(d.name, NULLIF(TRIM(u.division), '')) AS division, COALESCE(SUM(t.hours), 0) AS total_hours
      FROM timesheets t JOIN users u ON u.id = t.user_id LEFT JOIN divisions d ON d.id = u.division_id
      WHERE u.name != '[Deleted User]' AND t.work_date BETWEEN ? AND ? AND ${userScope.sql}
      GROUP BY COALESCE(d.name, NULLIF(TRIM(u.division), '')) ORDER BY total_hours DESC`).all(monthStartDate, monthEndDate, ...userScope.params);
    res.json({ stats: teamSummary, recentSubmissions: pendingWeeks.slice(0, 10).map(row => ({ ...row, name: row.user_name })), hoursByDivision, period });
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
      SELECT COALESCE(p.project_code, 'Non-project') AS project_code,
             COALESCE(p.project_name, 'Leave, meetings, training and other tasks') AS project_name,
             COALESCE(SUM(t.hours), 0) as total_hours
      FROM timesheets t
      LEFT JOIN projects p ON t.project_id = p.id
      WHERE t.user_id = ? AND t.work_date BETWEEN ? AND ?
      GROUP BY t.project_id
      ORDER BY total_hours DESC
    `).all(userId, monthStartDate, monthEndDate);
    const holidays = db.prepare('SELECT date FROM holidays WHERE date BETWEEN ? AND ?').all(weekStartDate, weekEndDate);

    res.json({
      stats: {
        monthlyHours: myMonthlyHours.total,
        weeklyHours: myWeeklyHours.total,
        totalEntries: myEntries.count,
        statusBreakdown: myStatus,
        currentWeek,
        currentWeekYear,
        expectedWeeklyHours: expectedWeekHours(weekStartDate, holidays.map(h => h.date)),
      },
      recalledWeeks,
      recentEntries,
      hoursByProject,
      period,
      ...(req.user.role === 'manager' ? { teamPendingApprovals: pendingWeeks.length, teamSummary } : {}),
    });
  }
});

router.use(require('./reportAnalytics'));

module.exports = router;
