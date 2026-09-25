'use strict';

const db = require('../config/db');
const config = require('../config/env');

/**
 * Service for Power BI Read-Only Reporting.
 * Encapsulates all reporting queries with parameterized SQL to prevent SQL injection.
 * Strips all authentication hashes, secrets, and internal tokens from reporting payloads.
 */
class PowerBiService {
  /**
   * Retrieve reporting timesheet entries with server-side filtering and optional pagination.
   *
   * @param {Object} filters
   * @param {string} [filters.from] - Start date (YYYY-MM-DD)
   * @param {string} [filters.to] - End date (YYYY-MM-DD)
   * @param {string} [filters.employeeId] - Filter by employee identifier
   * @param {string} [filters.division] - Filter by division name
   * @param {string} [filters.department] - Filter by department name
   * @param {string} [filters.project] - Filter by project code or project name
   * @param {string} [filters.status] - Filter by timesheet status
   * @param {Object} [pagination]
   * @param {number} [pagination.page] - Page number (1-based)
   * @param {number} [pagination.limit] - Page size limit
   * @returns {{ data: Array, pagination: Object }}
   */
  getTimesheets(filters = {}, pagination = {}) {
    let whereClause = "WHERE u.name != '[Deleted User]'";
    const params = [];

    if (filters.from) {
      whereClause += ' AND t.work_date >= ?';
      params.push(filters.from);
    }

    if (filters.to) {
      whereClause += ' AND t.work_date <= ?';
      params.push(filters.to);
    }

    if (filters.employeeId) {
      whereClause += ' AND (u.employee_id = ? OR CAST(u.id AS TEXT) = ?)';
      params.push(filters.employeeId, filters.employeeId);
    }

    if (filters.division) {
      whereClause += ' AND (LOWER(d.name) = LOWER(?) OR LOWER(u.division) = LOWER(?))';
      params.push(filters.division, filters.division);
    }

    if (filters.department) {
      whereClause += ' AND LOWER(dept.name) = LOWER(?)';
      params.push(filters.department);
    }

    if (filters.project) {
      whereClause += ' AND (LOWER(p.project_code) = LOWER(?) OR LOWER(p.project_name) LIKE LOWER(?))';
      params.push(filters.project, `%${filters.project}%`);
    }

    if (filters.status) {
      whereClause += ' AND LOWER(t.status) = LOWER(?)';
      params.push(filters.status.toLowerCase());
    }

    // Common FROM and JOIN clauses for both count and data queries
    const fromJoinSql = `
      FROM timesheets t
      JOIN users u ON t.user_id = u.id
      LEFT JOIN projects p ON t.project_id = p.id
      LEFT JOIN tasks tk ON t.task_id = tk.id
      LEFT JOIN divisions d ON COALESCE(t.division_id, p.division_id, u.division_id) = d.id
      LEFT JOIN departments dept ON u.department_id = dept.id
      LEFT JOIN user_admin_assignments uaa ON u.id = uaa.user_id
      LEFT JOIN users admin_u ON uaa.admin_id = admin_u.id
    `;

    // 1. Get total count
    const countSql = `SELECT COUNT(*) as total ${fromJoinSql} ${whereClause}`;
    const totalRow = db.prepare(countSql).get(...params);
    const total = totalRow ? totalRow.total : 0;

    // 2. Determine pagination limits
    const maxRecords = config.powerBiMaxRecords || 50000;
    const isPaginated = Boolean(pagination.page || pagination.limit);
    const page = Math.max(1, parseInt(pagination.page, 10) || 1);
    const limit = Math.min(maxRecords, Math.max(1, parseInt(pagination.limit, 10) || (isPaginated ? 1000 : maxRecords)));
    const offset = (page - 1) * limit;

    // 3. Query records
    const dataSql = `
      SELECT 
        t.id as id,
        COALESCE(u.employee_id, CAST(u.id AS TEXT)) as employeeId,
        u.name as employeeName,
        u.email as email,
        COALESCE(d.name, u.division, '') as division,
        COALESCE(dept.name, '') as department,
        COALESCE(admin_u.name, '') as admin,
        t.work_date as date,
        t.week_number as week,
        t.week_year as weekYear,
        COALESCE(p.project_name, t.project_description, '') as project,
        COALESCE(p.project_code, '') as projectCode,
        COALESCE(tk.task_category, '') as projectCategory,
        COALESCE(tk.classification, '') as taskClassification,
        t.hours as hours,
        t.status as status,
        CASE WHEN t.billable = 1 THEN 1 ELSE 0 END as isBillable,
        t.created_at as createdDate,
        t.updated_at as updatedDate,
        CASE 
          WHEN t.status IN ('submitted', 'approved') THEN
            COALESCE(
              (SELECT MAX(al.created_at) FROM audit_logs al 
               WHERE al.user_id = t.user_id 
                 AND al.action IN ('SUBMIT_TIMESHEET', 'POST_TIMESHEET')
                 AND (al.details LIKE '%Week ' || t.week_number || ', ' || t.week_year || '%' 
                      OR al.details LIKE '%Week ' || t.week_number || ' ' || t.week_year || '%')),
              t.updated_at
            )
          ELSE NULL
        END as submissionDate,
        CASE 
          WHEN t.status = 'approved' THEN
            COALESCE(
              (SELECT MAX(al.created_at) FROM audit_logs al 
               WHERE al.action IN ('APPROVE_TIMESHEET', 'POST_TIMESHEET')
                 AND ((al.details LIKE '%user ' || t.user_id || ', Week ' || t.week_number || ' ' || t.week_year || '%')
                      OR (al.details LIKE '%user ' || t.user_id || ', Week ' || t.week_number || ', ' || t.week_year || '%')
                      OR (al.user_id = t.user_id AND al.action = 'POST_TIMESHEET' AND al.details LIKE '%Week ' || t.week_number || ', ' || t.week_year || '%'))),
              t.updated_at
            )
          ELSE NULL
        END as approvalDate
      ${fromJoinSql}
      ${whereClause}
      ORDER BY t.work_date DESC, t.id DESC
      LIMIT ? OFFSET ?
    `;

    const rows = db.prepare(dataSql).all(...params, limit, offset);

    const formattedData = rows.map((row) => ({
      id: row.id,
      employeeId: row.employeeId,
      employeeName: row.employeeName,
      email: row.email,
      division: row.division,
      department: row.department,
      admin: row.admin,
      date: row.date,
      week: row.week,
      weekYear: row.weekYear,
      project: row.project,
      projectCode: row.projectCode,
      projectCategory: row.projectCategory,
      taskClassification: row.taskClassification,
      hours: row.hours,
      status: row.status,
      isBillable: row.isBillable === 1,
      submissionDate: row.submissionDate || null,
      approvalDate: row.approvalDate || null,
      createdDate: row.createdDate,
      updatedDate: row.updatedDate,
    }));

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      data: formattedData,
      pagination: {
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    };
  }

  /**
   * Retrieve read-only user reporting data.
   * Excludes password hashes, secrets, and auth tokens.
   */
  getUsers(filters = {}) {
    let sql = `
      SELECT 
        u.id as id,
        COALESCE(u.employee_id, CAST(u.id AS TEXT)) as employeeId,
        u.name as employeeName,
        u.email as email,
        u.role as role,
        COALESCE(d.name, u.division, '') as division,
        COALESCE(dept.name, '') as department,
        COALESCE(sc.name, u.team_type, '') as supportingCategory,
        COALESCE(admin_u.name, '') as admin,
        CASE WHEN u.active = 1 THEN 'Active' ELSE 'Inactive' END as status,
        u.active as active,
        u.created_at as createdDate,
        u.updated_at as updatedDate
      FROM users u
      LEFT JOIN divisions d ON u.division_id = d.id
      LEFT JOIN departments dept ON u.department_id = dept.id
      LEFT JOIN supporting_categories sc ON u.supporting_category_id = sc.id
      LEFT JOIN user_admin_assignments uaa ON uaa.user_id = u.id
      LEFT JOIN users admin_u ON uaa.admin_id = admin_u.id
      WHERE u.name != '[Deleted User]'
    `;
    const params = [];

    if (filters.employeeId) {
      sql += ' AND (u.employee_id = ? OR CAST(u.id AS TEXT) = ?)';
      params.push(filters.employeeId, filters.employeeId);
    }
    if (filters.division) {
      sql += ' AND (LOWER(d.name) = LOWER(?) OR LOWER(u.division) = LOWER(?))';
      params.push(filters.division, filters.division);
    }
    if (filters.department) {
      sql += ' AND LOWER(dept.name) = LOWER(?)';
      params.push(filters.department);
    }
    if (filters.status) {
      const isActive = filters.status.toLowerCase() === 'active' ? 1 : 0;
      sql += ' AND u.active = ?';
      params.push(isActive);
    } else if (filters.active !== undefined) {
      sql += ' AND u.active = ?';
      params.push(parseInt(filters.active, 10));
    }
    if (filters.role) {
      sql += ' AND LOWER(u.role) = LOWER(?)';
      params.push(filters.role);
    }

    sql += ' ORDER BY u.name ASC';

    const rows = db.prepare(sql).all(...params);
    return {
      data: rows.map((u) => ({
        id: u.id,
        employeeId: u.employeeId,
        employeeName: u.employeeName,
        email: u.email,
        role: u.role,
        division: u.division,
        department: u.department,
        supportingCategory: u.supportingCategory,
        admin: u.admin,
        status: u.status,
        isActive: u.active === 1,
        createdDate: u.createdDate,
        updatedDate: u.updatedDate,
      })),
    };
  }

  /**
   * Retrieve read-only division reporting data.
   */
  getDivisions(filters = {}) {
    let sql = `
      SELECT 
        d.id as id,
        d.name as divisionName,
        CASE WHEN d.active = 1 THEN 'Active' ELSE 'Inactive' END as status,
        d.active as active,
        d.created_at as createdDate
      FROM divisions d
      WHERE 1=1
    `;
    const params = [];

    if (filters.active !== undefined) {
      sql += ' AND d.active = ?';
      params.push(parseInt(filters.active, 10));
    }

    sql += ' ORDER BY d.name ASC';
    const rows = db.prepare(sql).all(...params);

    return {
      data: rows.map((d) => ({
        id: d.id,
        divisionName: d.divisionName,
        status: d.status,
        isActive: d.active === 1,
        createdDate: d.createdDate,
      })),
    };
  }

  /**
   * Retrieve read-only department reporting data.
   */
  getDepartments(filters = {}) {
    let sql = `
      SELECT 
        dept.id as id,
        dept.name as departmentName,
        CASE WHEN dept.active = 1 THEN 'Active' ELSE 'Inactive' END as status,
        dept.active as active,
        dept.created_at as createdDate
      FROM departments dept
      WHERE 1=1
    `;
    const params = [];

    if (filters.active !== undefined) {
      sql += ' AND dept.active = ?';
      params.push(parseInt(filters.active, 10));
    }

    sql += ' ORDER BY dept.name ASC';
    const rows = db.prepare(sql).all(...params);

    return {
      data: rows.map((d) => ({
        id: d.id,
        departmentName: d.departmentName,
        status: d.status,
        isActive: d.active === 1,
        createdDate: d.createdDate,
      })),
    };
  }

  /**
   * Retrieve read-only project reporting data.
   */
  getProjects(filters = {}) {
    let sql = `
      SELECT 
        p.id as id,
        p.project_code as projectCode,
        p.project_name as projectName,
        COALESCE(p.customer_name, '') as customerName,
        COALESCE(p.activity, '') as activity,
        COALESCE(d.name, p.division, '') as division,
        COALESCE(s.name, '') as subdivision,
        COALESCE(p.team_type, '') as teamType,
        CASE WHEN p.active = 1 THEN 'Active' ELSE 'Inactive' END as status,
        p.active as active,
        p.created_at as createdDate,
        p.updated_at as updatedDate
      FROM projects p
      LEFT JOIN divisions d ON p.division_id = d.id
      LEFT JOIN subdivisions s ON p.subdivision_id = s.id
      WHERE 1=1
    `;
    const params = [];

    if (filters.division) {
      sql += ' AND (LOWER(d.name) = LOWER(?) OR LOWER(p.division) = LOWER(?))';
      params.push(filters.division, filters.division);
    }

    if (filters.active !== undefined) {
      sql += ' AND p.active = ?';
      params.push(parseInt(filters.active, 10));
    }

    sql += ' ORDER BY p.project_code ASC';
    const rows = db.prepare(sql).all(...params);

    return {
      data: rows.map((p) => ({
        id: p.id,
        projectCode: p.projectCode,
        projectName: p.projectName,
        customerName: p.customerName,
        activity: p.activity,
        division: p.division,
        subdivision: p.subdivision,
        teamType: p.teamType,
        status: p.status,
        isActive: p.active === 1,
        createdDate: p.createdDate,
        updatedDate: p.updatedDate,
      })),
    };
  }

  /**
   * Retrieve read-only holiday reporting data.
   */
  getHolidays(filters = {}) {
    let sql = `
      SELECT 
        h.id as id,
        h.date as date,
        h.name as holidayName,
        h.created_at as createdDate
      FROM holidays h
      WHERE 1=1
    `;
    const params = [];

    if (filters.year) {
      sql += ' AND h.date LIKE ?';
      params.push(`${filters.year}-%`);
    }

    if (filters.from) {
      sql += ' AND h.date >= ?';
      params.push(filters.from);
    }

    if (filters.to) {
      sql += ' AND h.date <= ?';
      params.push(filters.to);
    }

    sql += ' ORDER BY h.date ASC';
    const rows = db.prepare(sql).all(...params);

    return {
      data: rows.map((h) => ({
        id: h.id,
        date: h.date,
        holidayName: h.holidayName,
        createdDate: h.createdDate,
      })),
    };
  }

  /**
   * Legacy flat export endpoint for backward compatibility with existing Power BI setups.
   */
  getLegacyExport() {
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

    const data = db.prepare(query).all();
    return data.map((row) => ({
      ...row,
      IsBillable: row.IsBillable === 1,
    }));
  }
}

module.exports = new PowerBiService();
