/**
 * powerbi.js — Export endpoint for Power BI
 *
 * Provides a flat, denormalized JSON array of all timesheet data
 * suitable for Power BI direct import.
 * Authenticated via a static API key passed in the query string.
 */

const express = require('express');
const db = require('../config/db');
const config = require('../config/env');

const router = express.Router();

router.get('/export', (req, res) => {
  const { apiKey } = req.query;

  if (!config.powerBiApiKey || config.powerBiApiKey === '') {
    return res.status(503).json({ error: 'Power BI export is not configured' });
  }

  if (apiKey !== config.powerBiApiKey) {
    return res.status(401).json({ error: 'Invalid API Key' });
  }

  // Denormalized query for Power BI
  // We return all data in a single wide table (star schema fact table)
  const query = `
    SELECT 
      t.id as TimesheetId,
      t.work_date as WorkDate,
      t.hours as Hours,
      t.billable as IsBillable,
      t.status as Status,
      t.week_number as WeekNumber,
      t.week_year as WeekYear,
      u.email as EmployeeEmail,
      u.name as EmployeeName,
      u.role as EmployeeRole,
      u.team_type as EmployeeTeamType,
      p.project_code as ProjectCode,
      p.project_name as ProjectName,
      p.customer_name as CustomerName,
      tk.task_category as TaskCategory,
      tk.classification as TaskClassification,
      d.name as DivisionName,
      s.name as SubdivisionName,
      do_.label as OwnershipLabel
    FROM timesheets t
    JOIN users u ON t.user_id = u.id
    LEFT JOIN projects p ON t.project_id = p.id
    LEFT JOIN tasks tk ON t.task_id = tk.id
    LEFT JOIN divisions d ON t.division_id = d.id
    LEFT JOIN subdivisions s ON t.subdivision_id = s.id
    LEFT JOIN department_ownerships do_ ON t.ownership_id = do_.id
    WHERE u.name != '[Deleted User]'
    ORDER BY t.work_date DESC
  `;

  try {
    const data = db.prepare(query).all();
    
    // Map SQLite 1/0 to true/false for boolean columns
    const formattedData = data.map(row => ({
      ...row,
      IsBillable: row.IsBillable === 1
    }));

    res.json(formattedData);
  } catch (err) {
    console.error('[PowerBI Export] Error generating export:', err);
    res.status(500).json({ error: 'Failed to generate export' });
  }
});

module.exports = router;
