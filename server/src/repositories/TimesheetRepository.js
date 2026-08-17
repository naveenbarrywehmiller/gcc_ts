/**
 * TimesheetRepository.js — Repository abstraction for timesheets
 *
 * This layer abstracts the storage backend so the route handlers don't need
 * to know whether they are writing to SQLite, SharePoint, or both.
 */

const db = require('../config/db');
const sp = require('../services/sharepoint');
const config = require('../config/env');

class TimesheetRepository {
  /**
   * Get entries for a user in a specific week.
   * Reads always come from SQLite as it is the primary transactional store.
   */
  async getWeekEntries(userId, week, year) {
    const { getWeekDateRange } = require('../utils/dateUtils');
    const { startDate, endDate } = getWeekDateRange(week, year);

    return db.prepare(`
      SELECT t.*, 
             p.project_code, p.project_name,
             tk.task_category, tk.classification,
             d.name as division_name,
             s.name as subdivision_name
      FROM timesheets t
      LEFT JOIN projects p ON t.project_id = p.id
      LEFT JOIN tasks tk ON t.task_id = tk.id
      LEFT JOIN divisions d ON t.division_id = d.id
      LEFT JOIN subdivisions s ON t.subdivision_id = s.id
      WHERE t.user_id = ? AND t.work_date BETWEEN ? AND ?
    `).all(userId, startDate, endDate);
  }

  /**
   * Insert or update a single timesheet entry.
   * Handles SQLite upsert and optional SharePoint dual-write.
   */
  async upsertEntry(userId, entry) {
    const { id, project_id, task_id, work_date, hours, description, week_number, week_year, status, division_id, subdivision_id, project_description, ownership_id, billable } = entry;

    let timesheetId = id;
    let result;

    if (id) {
      result = db.prepare(`
        UPDATE timesheets 
        SET project_id = ?, task_id = ?, hours = ?, description = ?, 
            status = ?, division_id = ?, subdivision_id = ?, 
            project_description = ?, ownership_id = ?, billable = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND user_id = ?
      `).run(project_id || null, task_id || null, hours, description, status, division_id || null, subdivision_id || null, project_description || null, ownership_id || null, billable ? 1 : 0, id, userId);

      if (result.changes === 0) throw new Error('Timesheet entry not found or access denied');
    } else {
      result = db.prepare(`
        INSERT INTO timesheets 
        (user_id, project_id, task_id, work_date, hours, description, week_number, week_year, status, division_id, subdivision_id, project_description, ownership_id, billable)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(userId, project_id || null, task_id || null, work_date, hours, description, week_number, week_year, status, division_id || null, subdivision_id || null, project_description || null, ownership_id || null, billable ? 1 : 0);
      timesheetId = result.lastInsertRowid;
    }

    // Get the full joined row for SharePoint sync
    if (config.enableSharepointSync) {
      const fullEntry = db.prepare(`
        SELECT t.*, u.email as user_email, p.project_code, tk.task_category
        FROM timesheets t
        JOIN users u ON t.user_id = u.id
        LEFT JOIN projects p ON t.project_id = p.id
        LEFT JOIN tasks tk ON t.task_id = tk.id
        WHERE t.id = ?
      `).get(timesheetId);
      
      // Async fire-and-forget to not block the response
      sp.syncTimesheetEntry(fullEntry).catch(err => {
        console.error(`[SharePoint] Failed to sync timesheet ${timesheetId}:`, err.message);
      });
    }

    return timesheetId;
  }

  /**
   * Delete a draft timesheet entry.
   */
  async deleteEntry(id, userId) {
    const result = db.prepare('DELETE FROM timesheets WHERE id = ? AND user_id = ? AND status = ?').run(id, userId, 'draft');
    if (result.changes === 0) {
      const existing = db.prepare('SELECT status FROM timesheets WHERE id = ? AND user_id = ?').get(id, userId);
      if (existing) throw new Error(`Cannot delete entry in '${existing.status}' status`);
      throw new Error('Entry not found');
    }
  }

  /**
   * Submit an entire week for approval.
   */
  async submitWeek(userId, week, year) {
    const { getWeekDateRange } = require('../utils/dateUtils');
    const { startDate, endDate } = getWeekDateRange(week, year);

    const result = db.prepare(`
      UPDATE timesheets 
      SET status = 'submitted', submitted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ? AND work_date BETWEEN ? AND ?
      AND status IN ('draft', 'recalled', 'rejected')
    `).run(userId, startDate, endDate);

    if (result.changes === 0) return 0;

    if (config.enableSharepointSync) {
      const user = db.prepare('SELECT email FROM users WHERE id = ?').get(userId);
      sp.updateTimesheetStatus(user.email, week, year, 'submitted').catch(err => {
        console.error(`[SharePoint] Failed to sync submit status for ${user.email} W${week}/${year}:`, err.message);
      });
    }

    return result.changes;
  }

  /**
   * Recall a submitted or approved week.
   */
  async recallWeek(userId, week, year, adminId = null) {
    const { getWeekDateRange } = require('../utils/dateUtils');
    const { startDate, endDate } = getWeekDateRange(week, year);

    // If an admin is recalling, they can recall ANY user's week
    const targetUserId = adminId ? userId : userId;
    // But if a regular user is recalling, they can only recall their own
    
    // Check if there are actually items to recall
    const itemsCount = db.prepare(`
      SELECT COUNT(*) as count FROM timesheets 
      WHERE user_id = ? AND work_date BETWEEN ? AND ? 
      AND status IN ('submitted', 'approved')
    `).get(targetUserId, startDate, endDate).count;

    if (itemsCount === 0) return 0;

    const result = db.prepare(`
      UPDATE timesheets 
      SET status = 'recalled', updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ? AND work_date BETWEEN ? AND ?
      AND status IN ('submitted', 'approved')
    `).run(targetUserId, startDate, endDate);

    if (config.enableSharepointSync && result.changes > 0) {
      const user = db.prepare('SELECT email FROM users WHERE id = ?').get(targetUserId);
      sp.updateTimesheetStatus(user.email, week, year, 'recalled').catch(err => {
         console.error(`[SharePoint] Failed to sync recall status for ${user.email} W${week}/${year}:`, err.message);
      });
    }

    return result.changes;
  }
}

module.exports = new TimesheetRepository();
